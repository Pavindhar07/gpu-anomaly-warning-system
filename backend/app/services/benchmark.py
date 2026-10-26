"""Real CPU vs GPU benchmarking. Only measured values are returned; GPU fields are None if unavailable."""
from __future__ import annotations

import statistics
import uuid

import numpy as np

from app.services import store
from app.services.analysis import now_iso
from app.services.datasets import generate_values
from app.services.detection import compare_results, detect_cpu


def summarize(times: list[float]) -> dict:
    return {"median_ms": statistics.median(times), "min_ms": min(times), "max_ms": max(times),
            "stdev_ms": statistics.pstdev(times) if len(times) > 1 else 0.0, "runs": len(times)}


def run_benchmark(sizes: list[int], repeats: int, seed: int, threshold: float, backend) -> dict:
    gpu_status = backend.status()
    gpu_ok = bool(gpu_status["available"])
    if gpu_ok:
        backend.warmup()
    records = []
    for n in sizes:
        x, _ = generate_values(n, baseline=50.0, noise_std=2.0, anomaly_count=max(1, n // 1000), seed=seed)
        detect_cpu(x, threshold)                                  # untimed warm-up
        cpu_runs, cpu_last = [], None
        for _ in range(repeats):
            cpu_last = detect_cpu(x, threshold)
            cpu_runs.append(cpu_last.elapsed_ms)
        rec = {"n": n, "anomalies_cpu": int(cpu_last.flags.sum()), "cpu": summarize(cpu_runs), "gpu": None,
               "speedup_end_to_end": None, "speedup_kernel_only": None, "agreement": None}
        if gpu_ok:
            gruns = {k: [] for k in ("alloc_ms", "h2d_ms", "kernel_ms", "d2h_ms", "total_ms")}
            last = None
            for _ in range(repeats):
                last = backend.analyze(x, threshold)
                for k in gruns:
                    gruns[k].append(last.timing[k])
            rec["gpu"] = {
                "source": last.source, "device_name": last.device_name, **last.launch,
                "alloc": summarize(gruns["alloc_ms"]), "h2d": summarize(gruns["h2d_ms"]),
                "kernel": summarize(gruns["kernel_ms"]), "d2h": summarize(gruns["d2h_ms"]),
                "total": summarize(gruns["total_ms"]),
            }
            rec["agreement"] = compare_results(cpu_last, last.z, last.flags, last.mean, last.std, threshold)
            tot, ker = rec["gpu"]["total"]["median_ms"], rec["gpu"]["kernel"]["median_ms"]
            rec["speedup_end_to_end"] = rec["cpu"]["median_ms"] / tot if tot > 0 else None
            rec["speedup_kernel_only"] = rec["cpu"]["median_ms"] / ker if ker > 0 else None
        records.append(rec)
    result = {
        "benchmark_id": uuid.uuid4().hex[:12], "created_at": now_iso(), "repeats": repeats, "seed": seed,
        "threshold": threshold, "gpu_status": gpu_status, "records": records,
        "notes": [
            "CPU baseline is vectorised NumPy (float64), not a naive Python loop; speedups are relative to that baseline.",
            "CPU time covers statistics + Z-scores + classification on in-memory data.",
            "GPU end-to-end = allocation + host-to-device copy + kernels + device-to-host copy (wall clock). "
            "GPU kernel-only excludes allocation and transfers. Both use CUDA events/synchronisation.",
            "Speedup = CPU median / GPU median, reported only when the GPU time is positive.",
        ] + ([] if gpu_ok else ["GPU unavailable: " + str(gpu_status.get("reason")) + " GPU columns are empty; "
                                "no GPU numbers were simulated."])
        + (["GPU work ran on a remote server; HTTP transfer is not included in GPU times."]
           if gpu_ok and gpu_status["source"] == "remote-cuda" else []),
    }
    store.benchmarks.put(result["benchmark_id"], result)
    return result


def benchmark_csv_rows(result: dict) -> list[dict]:
    rows = []
    for r in result["records"]:
        g = r["gpu"]
        a = r["agreement"]
        rows.append({
            "benchmark_id": result["benchmark_id"], "n": r["n"], "repeats": result["repeats"],
            "cpu_median_ms": r["cpu"]["median_ms"], "cpu_stdev_ms": r["cpu"]["stdev_ms"],
            "gpu_available": g is not None,
            "gpu_kernel_median_ms": g["kernel"]["median_ms"] if g else None,
            "gpu_h2d_median_ms": g["h2d"]["median_ms"] if g else None,
            "gpu_d2h_median_ms": g["d2h"]["median_ms"] if g else None,
            "gpu_total_median_ms": g["total"]["median_ms"] if g else None,
            "gpu_total_stdev_ms": g["total"]["stdev_ms"] if g else None,
            "speedup_end_to_end": r["speedup_end_to_end"], "speedup_kernel_only": r["speedup_kernel_only"],
            "threads_per_block": g["threads_per_block"] if g else None,
            "blocks_reduce": g["blocks_reduce"] if g else None,
            "agreement_passed": a["passed"] if a else None,
            "flag_mismatches": a["mismatches"] if a else None,
            "max_abs_z_diff": a["max_abs_z_diff"] if a else None,
        })
    return rows
