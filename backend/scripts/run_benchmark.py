"""Command-line benchmark. Writes JSON + CSV to ../results. Uses a real GPU only if one is detected.

    python -m scripts.run_benchmark --sizes 1000 10000 100000 1000000 --repeats 7
"""
import argparse
import json
from datetime import datetime
from pathlib import Path

import pandas as pd

from app.services.benchmark import benchmark_csv_rows, run_benchmark
from app.services.gpu_backend import get_backend


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sizes", type=int, nargs="+", default=[1_000, 10_000, 100_000, 1_000_000])
    ap.add_argument("--repeats", type=int, default=5)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--threshold", type=float, default=3.0)
    ap.add_argument("--out", default=str(Path(__file__).resolve().parents[2] / "results"))
    a = ap.parse_args()

    backend = get_backend()
    st = backend.status()
    print("GPU available:", st["available"], "|", st["device_name"] or st["reason"])
    res = run_benchmark(a.sizes, a.repeats, a.seed, a.threshold, backend)
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    tag = ("gpu" if st["available"] else "cpu_only") + "_" + datetime.now().strftime("%Y%m%d_%H%M%S")
    (out / f"benchmark_{tag}.json").write_text(json.dumps(res, indent=2, default=str))
    df = pd.DataFrame(benchmark_csv_rows(res))
    df.to_csv(out / f"benchmark_{tag}.csv", index=False)
    cols = ["n", "cpu_median_ms", "gpu_kernel_median_ms", "gpu_total_median_ms", "speedup_end_to_end",
            "speedup_kernel_only", "agreement_passed"]
    print(df[cols].to_string(index=False))
    for n in res["notes"]:
        print("-", n)
    print("wrote", out / f"benchmark_{tag}.csv")


if __name__ == "__main__":
    main()
