"""Analysis orchestration: prepare data -> run CPU or real GPU -> summarise. No web-framework imports."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from app.services import store
from app.services.datasets import LABEL_COLUMN
from app.services.detection import (VARIANCE_CONVENTION, compare_results, detect_cpu, evaluate_labels,
                                    prepare_values, severity_of)
from app.services.gpu_backend import GpuUnavailable

METHOD = "Z-score (population standard deviation)"
LIMITATIONS = ("Z-score detection assumes roughly bell-shaped, stationary data. It can miss anomalies in "
               "skewed, multi-modal or drifting sensor streams, and extreme values inflate the standard "
               "deviation they are measured against. A flagged reading is a statistical outlier, not a "
               "confirmed fault or physical danger.")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def resolve_execution(mode: str, backend) -> str:
    """Return 'cpu' or 'gpu'. An explicit GPU request never silently falls back to the CPU."""
    available = backend.status()["available"]
    if mode == "gpu":
        if not available:
            raise GpuUnavailable(backend.status().get("reason") or "No CUDA GPU backend is available.")
        return "gpu"
    if mode == "auto":
        return "gpu" if available else "cpu"
    return "cpu"


def run_analysis(ds: dict, *, sensor_column: str, timestamp_column, threshold: float, mode: str,
                 missing_policy: str, moderate_z: float, high_z: float, backend) -> dict:
    df: pd.DataFrame = ds["df"]
    if sensor_column not in df.columns:
        raise KeyError(f"Sensor column '{sensor_column}' does not exist.")
    if timestamp_column and timestamp_column not in df.columns:
        raise KeyError(f"Timestamp column '{timestamp_column}' does not exist.")
    where = resolve_execution(mode, backend)
    prepared = prepare_values(df[sensor_column], missing_policy)
    values = prepared.values

    gpu_info, cpu_ms = None, None
    wall0 = datetime.now()
    if where == "gpu":
        res = backend.analyze(values, threshold)
        z, flags, mean, var, std = res.z, res.flags, res.mean, res.variance, res.std
        gpu_info = {**res.timing, **res.launch, "device_name": res.device_name, "source": res.source}
        degenerate = bool(std <= 1e-12 * max(1.0, abs(mean)))
        source = res.source
    else:
        res = detect_cpu(values, threshold)
        z, flags, mean, var, std = res.z, res.flags, res.mean, res.variance, res.std
        cpu_ms, degenerate, source = res.elapsed_ms, res.degenerate, "cpu-numpy"
    wall_ms = (datetime.now() - wall0).total_seconds() * 1000.0

    abs_z = np.abs(z)
    sev_all = severity_of(abs_z, moderate_z, high_z)
    sev_counts = {s: int(np.sum(flags & (sev_all == s))) for s in ("high", "moderate", "low")}
    n, n_anom = int(values.size), int(flags.sum())

    ts = None
    if timestamp_column:
        ts = df[timestamp_column].astype(str).to_numpy()[prepared.row_index]

    labels_eval = None
    if LABEL_COLUMN in df.columns and LABEL_COLUMN != sensor_column:
        truth = pd.to_numeric(df[LABEL_COLUMN], errors="coerce").fillna(0).to_numpy()[prepared.row_index] > 0
        labels_eval = evaluate_labels(flags, truth)

    notes = [LIMITATIONS]
    if degenerate:
        notes.insert(0, "The readings have (near) zero variance, so Z-scores are undefined and no anomalies "
                        "were flagged.")
    q = prepared.quality
    if q["dropped"]:
        notes.append(f"{q['dropped']} invalid reading(s) were dropped before analysis (policy: drop).")
    if q["imputed"]:
        notes.append(f"{q['imputed']} invalid reading(s) were replaced with the {q['policy']} "
                     f"({q['imputed_with']:.6g}); this affects the statistics.")

    aid = uuid.uuid4().hex[:12]
    summary = {
        "analysis_id": aid, "created_at": now_iso(), "dataset_id": ds["id"], "dataset_name": ds["name"],
        "sensor_column": sensor_column, "timestamp_column": timestamp_column,
        "method": METHOD, "variance_convention": VARIANCE_CONVENTION,
        "threshold": threshold, "moderate_z": moderate_z, "high_z": high_z,
        "requested_mode": mode, "executed_on": where, "result_source": source,
        "rows_in_file": int(len(df)), "readings_analyzed": n, "quality": q,
        "stats": {"mean": mean, "variance": var, "std": std},
        "anomaly_count": n_anom, "anomaly_pct": (100.0 * n_anom / n) if n else 0.0,
        "severity_counts": sev_counts,
        "timing": {"cpu_ms": cpu_ms, "gpu": gpu_info, "pipeline_wall_ms": wall_ms},
        "labels_eval": labels_eval, "notes": notes, "data_available": True,
    }
    store.analysis_data.put(aid, {"values": values, "z": z, "flags": flags, "index": prepared.row_index, "ts": ts,
                                  "sev": sev_all})
    store.analysis_meta.put(aid, summary)
    return summary


def mark_expired():
    live = {k for k in [m["analysis_id"] for m in store.analysis_meta.values()] if store.analysis_data.get(k)}
    for m in store.analysis_meta.values():
        m["data_available"] = m["analysis_id"] in live


def anomaly_frame(aid: str) -> pd.DataFrame | None:
    d = store.analysis_data.get(aid)
    meta = store.analysis_meta.get(aid)
    if d is None or meta is None:
        return None
    idx = np.flatnonzero(d["flags"])
    return pd.DataFrame({
        "row_index": d["index"][idx],
        "timestamp": d["ts"][idx] if d["ts"] is not None else None,
        "value": d["values"][idx],
        "z_score": d["z"][idx],
        "severity": d["sev"][idx],
    })


def series_for_chart(aid: str, max_points: int) -> dict | None:
    d = store.analysis_data.get(aid)
    meta = store.analysis_meta.get(aid)
    if d is None or meta is None:
        return None
    n = d["values"].size
    anom = np.flatnonzero(d["flags"])
    if n <= max_points:
        sel = np.arange(n)
    else:
        step = int(np.ceil(n / max_points))
        base = np.arange(0, n, step)
        extra = anom if anom.size <= max_points else anom[np.argsort(-np.abs(d["z"][anom]))[:max_points]]
        sel = np.unique(np.concatenate([base, extra]))
    lim = max(float(np.max(np.abs(d["z"]))), meta["threshold"]) if n else 1.0
    counts, edges = np.histogram(d["z"], bins=40, range=(-lim, lim))
    return {
        "downsampled": bool(sel.size < n), "total_points": int(n), "returned_points": int(sel.size),
        "index": d["index"][sel].tolist(), "value": d["values"][sel].tolist(), "z": d["z"][sel].tolist(),
        "is_anomaly": d["flags"][sel].tolist(),
        "timestamp": d["ts"][sel].tolist() if d["ts"] is not None else None,
        "histogram": {"edges": edges.tolist(), "counts": counts.tolist()},
    }
