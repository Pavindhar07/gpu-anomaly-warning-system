import io
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, Query
from fastapi.responses import Response

from app.core.config import settings
from app.schemas.models import AnalyzeRequest, BenchmarkRequest
from app.services import analysis as svc
from app.services import benchmark as bench
from app.services import store
from app.services.detection import DataQualityError
from app.services.gpu_backend import GpuUnavailable, get_backend
from app.state import err

router = APIRouter(prefix="/api")


def _csv(df: pd.DataFrame, filename: str) -> Response:
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    return Response(buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.post("/analyze")
def analyze(req: AnalyzeRequest):
    ds = store.datasets.get(req.dataset_id)
    if not ds:
        raise err(404, "dataset_not_found", "Dataset not found. Upload or generate it again.")
    try:
        return svc.run_analysis(ds, sensor_column=req.sensor_column, timestamp_column=req.timestamp_column,
                                threshold=req.threshold, mode=req.mode, missing_policy=req.missing_policy,
                                moderate_z=req.moderate_z, high_z=req.high_z, backend=get_backend())
    except GpuUnavailable as exc:
        raise err(409, "gpu_unavailable", f"GPU mode was requested but no CUDA GPU is available: {exc}")
    except KeyError as exc:
        raise err(422, "unknown_column", exc.args[0])
    except DataQualityError as exc:
        raise err(422, "data_quality", str(exc))
    except ValueError as exc:
        raise err(422, "invalid_data", str(exc))
    except RuntimeError as exc:
        raise err(500, "cuda_error", str(exc))


@router.get("/analyses")
def history():
    svc.mark_expired()
    return {"analyses": list(reversed(store.analysis_meta.values()))}


@router.get("/analysis/{analysis_id}")
def get_analysis(analysis_id: str):
    svc.mark_expired()
    meta = store.analysis_meta.get(analysis_id)
    if not meta:
        raise err(404, "analysis_not_found", "Analysis not found.")
    return meta


@router.get("/analysis/{analysis_id}/series")
def series(analysis_id: str, max_points: int = Query(2000, ge=100, le=20000)):
    out = svc.series_for_chart(analysis_id, max_points)
    if out is None:
        raise err(404, "analysis_data_expired", "Full-resolution data for this analysis is no longer in memory.")
    return out


@router.get("/analysis/{analysis_id}/anomalies")
def anomalies(analysis_id: str, severity: Optional[str] = Query(None, pattern="^(low|moderate|high)$"),
              search: Optional[str] = None, sort_by: str = Query("row_index", pattern="^(row_index|value|z_score|timestamp)$"),
              order: str = Query("asc", pattern="^(asc|desc)$"), page: int = Query(1, ge=1),
              page_size: int = Query(25, ge=1, le=200)):
    df = svc.anomaly_frame(analysis_id)
    meta = store.analysis_meta.get(analysis_id)
    if df is None or meta is None:
        raise err(404, "analysis_data_expired", "Anomaly data for this analysis is not available.")
    if severity:
        df = df[df["severity"] == severity]
    if search:
        s = search.strip().lower()
        hay = (df["row_index"].astype(str) + " " + df["value"].astype(str) + " " + df["timestamp"].astype(str)
               if df["timestamp"].notna().any() else df["row_index"].astype(str) + " " + df["value"].astype(str))
        df = df[hay.str.lower().str.contains(s, regex=False)]
    if sort_by == "z_score":
        df = df.assign(_k=df["z_score"].abs()).sort_values("_k", ascending=(order == "asc")).drop(columns="_k")
    else:
        key = "timestamp" if sort_by == "timestamp" and df["timestamp"].notna().any() else (
            "row_index" if sort_by == "timestamp" else sort_by)
        df = df.sort_values(key, ascending=(order == "asc"))
    total = int(len(df))
    part = df.iloc[(page - 1) * page_size: page * page_size]
    items = [{"row_index": int(r.row_index), "timestamp": None if r.timestamp is None or pd.isna(r.timestamp) else str(r.timestamp),
              "value": float(r.value), "z_score": float(r.z_score), "severity": r.severity,
              "threshold": meta["threshold"], "method": meta["method"], "analysis_id": analysis_id}
             for r in part.itertuples()]
    return {"total": total, "page": page, "page_size": page_size, "items": items}


@router.get("/reports/{analysis_id}/anomalies")
def anomalies_csv(analysis_id: str):
    df = svc.anomaly_frame(analysis_id)
    meta = store.analysis_meta.get(analysis_id)
    if df is None or meta is None:
        raise err(404, "analysis_data_expired", "Anomaly data for this analysis is not available.")
    df = df.assign(threshold=meta["threshold"], method=meta["method"], analysis_id=analysis_id,
                   executed_on=meta["executed_on"])
    return _csv(df, f"anomalies_{analysis_id}.csv")


@router.post("/benchmark")
def run_benchmark(req: BenchmarkRequest):
    if max(req.sizes) > settings.max_benchmark_size:
        raise err(422, "size_too_large", f"Largest benchmark size is {settings.max_benchmark_size:,} readings.")
    try:
        return bench.run_benchmark(req.sizes, req.repeats, req.seed, req.threshold, get_backend())
    except (GpuUnavailable, RuntimeError) as exc:
        raise err(500, "benchmark_failed", str(exc))
    except ValueError as exc:
        raise err(422, "invalid_benchmark", str(exc))


@router.get("/benchmark/{benchmark_id}")
def get_benchmark(benchmark_id: str):
    b = store.benchmarks.get(benchmark_id)
    if not b:
        raise err(404, "benchmark_not_found", "Benchmark not found.")
    return b


@router.get("/reports/{benchmark_id}/benchmark")
def benchmark_csv(benchmark_id: str):
    b = store.benchmarks.get(benchmark_id)
    if not b:
        raise err(404, "benchmark_not_found", "Benchmark not found.")
    return _csv(pd.DataFrame(bench.benchmark_csv_rows(b)), f"benchmark_{benchmark_id}.csv")
