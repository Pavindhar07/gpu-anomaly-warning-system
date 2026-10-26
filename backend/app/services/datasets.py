"""CSV parsing, profiling and synthetic data generation."""
from __future__ import annotations

import io
import warnings

import numpy as np
import pandas as pd

LABEL_COLUMN = "is_injected_anomaly"


class DatasetError(ValueError):
    """Invalid or unreadable dataset."""


def parse_csv(content: bytes, max_rows: int) -> pd.DataFrame:
    if not content or not content.strip():
        raise DatasetError("The file is empty.")
    try:
        df = pd.read_csv(io.BytesIO(content), nrows=max_rows + 1, skipinitialspace=True)
    except pd.errors.EmptyDataError:
        raise DatasetError("The file has no readable data.")
    except (pd.errors.ParserError, UnicodeDecodeError) as exc:
        raise DatasetError(f"Could not parse the file as CSV: {exc}")
    if df.shape[1] == 0:
        raise DatasetError("The CSV has no columns.")
    if len(df) == 0:
        raise DatasetError("The CSV has a header but no data rows.")
    if len(df) > max_rows:
        raise DatasetError(f"The CSV has more than the allowed {max_rows:,} rows.")
    df.columns = [str(c).strip() for c in df.columns]
    return df


def _kind(s: pd.Series) -> str:
    if pd.api.types.is_bool_dtype(s):
        return "boolean"
    if pd.api.types.is_numeric_dtype(s):
        return "numeric"
    non_null = s.dropna()
    if non_null.empty:
        return "text"
    sample = non_null.iloc[:2000]
    if pd.to_numeric(sample, errors="coerce").notna().mean() > 0.5:
        return "numeric_text"
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        parsed = pd.to_datetime(sample, errors="coerce")
    return "datetime" if parsed.notna().mean() > 0.9 else "text"


def _json_safe(v):
    if v is None or (isinstance(v, float) and not np.isfinite(v)):
        return None
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        f = float(v)
        return f if np.isfinite(f) else None
    if isinstance(v, (np.bool_,)):
        return bool(v)
    if pd.isna(v):
        return None
    return v


def profile(df: pd.DataFrame, preview_rows: int = 20) -> dict:
    cols = []
    for name in df.columns:
        s = df[name]
        kind = _kind(s)
        numeric = pd.to_numeric(s, errors="coerce") if kind in ("numeric", "numeric_text") else None
        cols.append({
            "name": name,
            "dtype": str(s.dtype),
            "kind": kind,
            "missing": int(s.isna().sum()),
            "invalid_numeric": int(numeric.isna().sum() - s.isna().sum()) if numeric is not None else 0,
            "infinite": int(np.isinf(numeric.to_numpy(dtype=float, na_value=np.nan)).sum()) if numeric is not None else 0,
            "unique": int(s.nunique(dropna=True)),
        })
    head = df.head(preview_rows)
    rows = [{k: _json_safe(v) for k, v in rec.items()} for rec in head.to_dict(orient="records")]
    return {
        "rows": int(len(df)),
        "columns": int(df.shape[1]),
        "column_info": cols,
        "duplicate_rows": int(df.duplicated().sum()),
        "preview": rows,
        "suggested_sensor_column": next((c["name"] for c in cols if c["kind"] in ("numeric", "numeric_text")
                                         and c["name"] != LABEL_COLUMN), None),
        "suggested_timestamp_column": next((c["name"] for c in cols if c["kind"] == "datetime"), None),
        "has_labels": LABEL_COLUMN in df.columns,
    }


def generate_values(n: int, baseline: float, noise_std: float, anomaly_count: int, seed: int,
                    positive_fraction: float = 0.5, magnitude_min: float = 5.0, magnitude_max: float = 8.0,
                    drift_total: float = 0.0):
    """Seeded synthetic readings. Returns (values, labels). Anomalies are offsets of
    magnitude_min..magnitude_max noise standard deviations, positive or negative."""
    if n < 1:
        raise DatasetError("n must be at least 1.")
    if anomaly_count > n:
        raise DatasetError("anomaly_count cannot exceed the number of readings.")
    if magnitude_max < magnitude_min:
        raise DatasetError("magnitude_max must be >= magnitude_min.")
    rng = np.random.default_rng(seed)
    x = baseline + noise_std * rng.standard_normal(n)
    if drift_total:
        x += np.linspace(0.0, drift_total, n)
    labels = np.zeros(n, dtype=bool)
    if anomaly_count:
        idx = rng.choice(n, size=anomaly_count, replace=False)
        sign = np.where(rng.random(anomaly_count) < positive_fraction, 1.0, -1.0)
        mag = rng.uniform(magnitude_min, magnitude_max, anomaly_count)
        x[idx] += sign * mag * noise_std
        labels[idx] = True
    return x, labels


def generate_dataframe(n: int, **kwargs) -> pd.DataFrame:
    x, labels = generate_values(n, **kwargs)
    ts = (np.datetime64("2024-01-01T00:00:00") + np.arange(n).astype("timedelta64[s]")).astype(str)
    return pd.DataFrame({"timestamp": ts, "sensor_value": np.round(x, 6), LABEL_COLUMN: labels.astype(int)})
