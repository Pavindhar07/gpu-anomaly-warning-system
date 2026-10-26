# API contract

Base URL: `http://localhost:8000`. Errors: `{"detail": {"code": "...", "message": "..."}}` (validation errors from FastAPI use the standard list form).

| Method & path | Purpose | Notes |
|---|---|---|
| `GET /api/health` | Liveness, limits, variance convention | |
| `GET /api/gpu/status?refresh=` | Real GPU backend status | `available`, `executes_cuda`, `source` (`local-cuda` / `remote-cuda` / null), device info, `reason` when unavailable |
| `POST /api/gpu/analyze?threshold=` | Binary GPU endpoint used by the remote adapter | Body: little-endian float64 array. Reply: uncompressed `.npz` (`z`, `flags`, `meta`). 503 unless this server has a real local CUDA library. `Authorization: Bearer $GPU_API_TOKEN` if configured |
| `POST /api/datasets/upload` | Upload CSV (multipart `file`) | 400 invalid CSV, 413 too large, 415 wrong type |
| `POST /api/datasets/generate` | Seeded synthetic dataset | body = `GenerateRequest` (`n, baseline, noise_std, anomaly_count, positive_fraction, magnitude_min/max, drift_total, seed`); adds a `is_injected_anomaly` label column |
| `GET /api/datasets/{id}` | Dataset profile | 404 if evicted (server keeps the last 5) |
| `GET /api/sample.csv` | Downloadable sample (500 rows, seed 42) | |
| `POST /api/analyze` | Run detection | `dataset_id, sensor_column, timestamp_column?, threshold, mode (cpu/gpu/auto), missing_policy (drop/mean/median/error), moderate_z, high_z`. **409 `gpu_unavailable`** if `mode=gpu` and no CUDA GPU - never a silent CPU fallback |
| `GET /api/analyses` | Analysis history (metadata) | `data_available=false` once arrays are evicted (last 5 kept) |
| `GET /api/analysis/{id}` | One analysis summary | `executed_on` is `cpu` or `gpu`; `timing.gpu` is null for CPU runs |
| `GET /api/analysis/{id}/series?max_points=` | Downsampled chart data + Z histogram | Anomalies are always retained |
| `GET /api/analysis/{id}/anomalies` | Paginated warnings | `severity, search, sort_by (row_index/value/z_score/timestamp), order, page, page_size` |
| `GET /api/reports/{id}/anomalies` | CSV export | |
| `POST /api/benchmark` | CPU (and GPU if real) benchmark | `sizes, repeats, seed, threshold`; GPU fields are `null` when unavailable |
| `GET /api/benchmark/{id}` | Stored benchmark | |
| `GET /api/reports/{benchmark_id}/benchmark` | CSV export | |

Conventions (identical on CPU and GPU): population variance (÷ n), anomaly iff `|z| > threshold`, degenerate (σ ≤ 1e-12·max(1,|μ|)) → all z = 0, no flags.
