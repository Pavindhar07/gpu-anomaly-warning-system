"""CPU reference implementation of Z-score anomaly detection.

Conventions (shared with the CUDA implementation so results are comparable):
  * mean      = sum(x) / n
  * variance  = sum((x - mean)^2) / n        (POPULATION variance, ddof = 0)
  * std       = sqrt(variance)
  * z_i       = (x_i - mean) / std
  * anomaly_i = |z_i| > threshold  (strictly greater)
  * Degenerate case: if std <= 1e-12 * max(1, |mean|) all z are 0 and nothing is flagged.
"""
from __future__ import annotations

import time
from dataclasses import dataclass

import numpy as np
import pandas as pd

DEGENERATE_REL_EPS = 1e-12
VARIANCE_CONVENTION = "population (divide by n, ddof=0)"
MISSING_POLICIES = ("drop", "mean", "median", "error")


class DataQualityError(ValueError):
    """Raised when invalid values are present and the policy is 'error'."""


@dataclass
class DetectionResult:
    mean: float
    variance: float
    std: float
    z: np.ndarray
    flags: np.ndarray       # bool array
    elapsed_ms: float
    degenerate: bool


def is_degenerate(mean: float, std: float) -> bool:
    return not (std > DEGENERATE_REL_EPS * max(1.0, abs(mean)))


def detect_cpu(values: np.ndarray, threshold: float) -> DetectionResult:
    """Run the full statistics + classification pipeline on the CPU (NumPy, float64)."""
    x = np.ascontiguousarray(values, dtype=np.float64)
    if x.size == 0:
        raise ValueError("Cannot analyze an empty dataset.")
    if not np.all(np.isfinite(x)):
        raise ValueError("detect_cpu requires finite values; clean the data first.")
    t0 = time.perf_counter()
    mean = float(x.sum() / x.size)
    with np.errstate(over="ignore", invalid="ignore"):
        d = x - mean
        variance = float(np.dot(d, d) / x.size)
    if not np.isfinite(variance):
        raise ValueError("Numerical overflow while computing variance (readings are too large).")
    std = float(np.sqrt(variance))
    degenerate = is_degenerate(mean, std)
    if degenerate:
        z = np.zeros_like(x)
        flags = np.zeros(x.size, dtype=bool)
    else:
        z = d / std
        flags = np.abs(z) > threshold
    elapsed = (time.perf_counter() - t0) * 1000.0
    return DetectionResult(mean, variance, std, z, flags, elapsed, degenerate)


def severity_of(abs_z: np.ndarray, moderate_z: float, high_z: float) -> np.ndarray:
    """Severity labels from |z|. Applied only to rows already flagged as anomalies."""
    out = np.full(abs_z.shape, "low", dtype=object)
    out[abs_z >= moderate_z] = "moderate"
    out[abs_z >= high_z] = "high"
    return out


@dataclass
class PreparedData:
    values: np.ndarray       # finite float64 values to analyze
    row_index: np.ndarray    # original 0-based data-row index for each value
    quality: dict


def prepare_values(raw: pd.Series, policy: str = "drop") -> PreparedData:
    """Convert a column to finite floats, applying an explicit, reported missing-value policy."""
    if policy not in MISSING_POLICIES:
        raise ValueError(f"Unknown missing-value policy '{policy}'.")
    n_total = len(raw)
    if n_total == 0:
        raise ValueError("The dataset has no rows.")
    numeric = pd.to_numeric(raw, errors="coerce")
    vals = numeric.to_numpy(dtype=np.float64, na_value=np.nan)
    missing = raw.isna().to_numpy()
    infinite = np.isinf(vals)
    non_numeric = numeric.isna().to_numpy() & ~missing
    bad = ~np.isfinite(vals)
    n_bad = int(bad.sum())
    quality = {
        "rows_total": n_total,
        "missing": int(missing.sum()),
        "non_numeric": int(non_numeric.sum()),
        "infinite": int(infinite.sum()),
        "invalid_total": n_bad,
        "policy": policy,
        "dropped": 0,
        "imputed": 0,
        "imputed_with": None,
    }
    idx = np.arange(n_total)
    if n_bad:
        if policy == "error":
            raise DataQualityError(
                f"{n_bad} invalid value(s) found (missing={quality['missing']}, "
                f"non-numeric={quality['non_numeric']}, infinite={quality['infinite']}). "
                "Choose 'drop', 'mean' or 'median' handling, or fix the file."
            )
        good = ~bad
        if policy == "drop":
            vals, idx = vals[good], idx[good]
            quality["dropped"] = n_bad
        else:
            if not good.any():
                raise ValueError("No valid numeric values to impute from.")
            fill = float(np.mean(vals[good]) if policy == "mean" else np.median(vals[good]))
            vals = vals.copy()
            vals[bad] = fill
            quality["imputed"] = n_bad
            quality["imputed_with"] = fill
    if vals.size == 0:
        raise ValueError("No valid numeric readings remain after applying the missing-value policy.")
    return PreparedData(vals, idx, quality)


def evaluate_labels(flags: np.ndarray, truth: np.ndarray) -> dict:
    """Precision / recall / F1 against known injected anomalies (zero-division safe)."""
    flags, truth = flags.astype(bool), truth.astype(bool)
    tp = int(np.sum(flags & truth))
    fp = int(np.sum(flags & ~truth))
    fn = int(np.sum(~flags & truth))
    precision = tp / (tp + fp) if (tp + fp) else None
    recall = tp / (tp + fn) if (tp + fn) else None
    f1 = (2 * precision * recall / (precision + recall)) if precision and recall else (0.0 if (tp + fp + fn) else None)
    return {"true_positives": tp, "false_positives": fp, "false_negatives": fn,
            "precision": precision, "recall": recall, "f1": f1}


def compare_results(cpu: DetectionResult, gpu_z, gpu_flags, gpu_mean, gpu_std, threshold, tol: float = 1e-9) -> dict:
    """Validate CPU vs GPU output. Flag differences are tolerated only when |z| lies within
    `tol` of the threshold (floating-point summation order can differ between CPU and GPU)."""
    gpu_flags = np.asarray(gpu_flags).astype(bool)
    diff = cpu.flags != gpu_flags
    mismatches = int(diff.sum())
    near = np.abs(np.abs(cpu.z[diff]) - threshold) <= tol if mismatches else np.array([], dtype=bool)
    unexplained = int((~near).sum()) if mismatches else 0
    return {
        "flags_identical": mismatches == 0,
        "mismatches": mismatches,
        "mismatches_unexplained": unexplained,
        "max_abs_z_diff": float(np.max(np.abs(cpu.z - gpu_z))) if cpu.z.size else 0.0,
        "mean_abs_diff": abs(cpu.mean - float(gpu_mean)),
        "std_abs_diff": abs(cpu.std - float(gpu_std)),
        "tolerance": tol,
        "passed": unexplained == 0,
    }
