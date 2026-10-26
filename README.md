# GPU-Powered Warning System for Hidden Data Anomalies

Z-score anomaly detection for sensor data with a CPU reference (NumPy) and CUDA C++ kernels, behind a FastAPI backend and a React dashboard.
Team: Pavindhar P (23MID0246), Athiyamaan S (23MID0245), Mohan Raj I (23MID0121).

**Honesty rules built into the code:** GPU results exist only when a real CUDA backend produced them. Without a GPU the app runs fully in **CPU-only mode**, GPU fields show "unavailable", and `mode=gpu` returns an explicit error instead of falling back silently.

## Verification status (read this first)

| Item | Status |
|---|---|
| CPU detection, data prep, synthetic generator, analysis + benchmark services | **Run and tested** (32 unit tests pass) |
| CPU-only benchmark script | **Run** (CPU timings only, see `results/`) |
| FastAPI routes + API tests | Written; **not run** (FastAPI not installable offline where this was authored). Run `pytest` on your machine |
| React frontend | Written; **not built or type-checked with real dependencies** (no npm access). Expect to fix small type or runtime issues on first `npm run build` |
| CUDA kernels, `selftest.cu`, Makefile | Written; **not compiled or run** (no nvcc/GPU where authored). First real test is your Colab T4 |
| GPU tests / GPU benchmark / remote adapter / Colab notebook | Written; **not executed** |
No GPU speedup figure has been measured by the authors yet.

## 1. Run locally (CPU-only, no GPU needed)

```bash
# Backend (Python 3.10+)
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
python -m pytest tests -v                                # or: python -m unittest discover -s tests
uvicorn app.main:app --reload --port 8000

# Frontend (Node 18+), second terminal
cd frontend
cp .env.example .env
npm install
npm run dev                                              # http://localhost:5173
```
Demo: Dataset Explorer → Generate (10,000 readings, 20 anomalies) → Anomaly Detection → Run → Warning Center → Benchmark (CPU rows only) → Reports.
Optional CLI benchmark: `cd backend && python -m scripts.run_benchmark --repeats 7` (writes `results/`).

## 2. Run the real CUDA computation in Google Colab (T4)

1. Colab → Runtime → Change runtime type → **T4 GPU**.
2. Zip this folder, open `notebooks/colab_cuda_backend.ipynb` in Colab and run the cells in order: check GPU → upload zip → `make ARCH=sm_75` → `selftest` (PASS/FAIL) → pytest (GPU agreement tests no longer skip) → benchmark → download `results/benchmark_gpu_*.csv`.
3. Manual equivalent: `cd backend/cuda && make ARCH=sm_75 && ./build/selftest 1000000`, then `cd .. && python -m scripts.run_benchmark`.
CUDA 13 supports Turing (sm_75) and newer; for other GPUs pass `ARCH=sm_86`, `sm_89`, etc.

## 3. Connect the website to the GPU (API integration)

The same FastAPI app serves GPU analysis when the CUDA library is present. Two topologies:

* **A - Frontend → Colab directly (simplest).** Run notebook section 7 (starts uvicorn + a Cloudflare quick tunnel). Paste the printed URL into **Settings → API base URL**. The GPU badge turns green only if `/api/gpu/status` reports a real device.
* **B - Local backend → Colab GPU (adapter).** In the shell that starts your local backend:
  `export GPU_MODE=remote GPU_BACKEND_URL=https://<tunnel>.trycloudflare.com GPU_BACKEND_TOKEN=<token printed by the notebook>`
  Analyses in `gpu`/`auto` mode are forwarded to `POST /api/gpu/analyze` (binary float64 in, `.npz` out). Remote times are the GPU server's own measurements; HTTP round-trip is reported separately as `network_roundtrip_ms` and is never counted as GPU time.

`GPU_MODE`: `auto` (local lib → remote URL → CPU-only), `local`, `remote`, `off`. All variables are in `.env.example`.
Security: the tunnel URL is public while it runs; only `/api/gpu/analyze` is token-protected. Do not upload sensitive data to a Colab-hosted instance, and set `CORS_ORIGINS` to your site's origin.

## 4. Deployment

* **Frontend:** `npm run build` → deploy `frontend/dist` to Vercel/Netlify; set `VITE_API_URL` at build time (or use Settings at runtime).
* **Backend:** needs Python, and for GPU an NVIDIA machine (cloud VM, university server). Standard Vercel cannot run CUDA, so keep the backend separate, e.g. `uvicorn app.main:app --host 0.0.0.0 --port 8000` behind HTTPS, with `CORS_ORIGINS` set to the frontend URL.

## 5. Project layout
`frontend/` React app · `backend/app/` API, services (`detection.py` CPU reference, `gpu_backend.py` adapter) · `backend/cuda/` kernels, selftest, Makefile · `backend/tests/` · `backend/scripts/run_benchmark.py` · `notebooks/` Colab · `data/sample_sensor_data.csv` · `results/` real CPU-only benchmark output · `docs/API.md`, `docs/ARCHITECTURE.md`.

## 6. Method and limitations
`z = (x − μ)/σ`, population variance (÷ n) on CPU and GPU, flag when `|z| > threshold` (strict). σ ≈ 0 → nothing flagged. Missing/non-numeric/infinite values follow an explicit policy (drop, mean, median, or error) and are always counted in the result.
Z-scores assume roughly normal, stationary data; outliers inflate σ; with threshold 3 about 0.27% of perfectly normal readings are flagged (false positives), which the injected-label metrics show. Severity (low/moderate/high by |z| ranges) is statistical, not physical danger. The CPU baseline is vectorised NumPy, so speedups are against a strong baseline. Kernels use float64 (the T4's FP64 rate is low; the reduction is memory-bound). No external alerts are sent.

## 7. Troubleshooting
| Symptom | Fix |
|---|---|
| UI says "API offline" | Start `uvicorn` on port 8000; check Settings → API base URL and `CORS_ORIGINS` |
| "GPU unavailable: CUDA library not built" | Run `make` in `backend/cuda` on a GPU machine, or set `CUDA_LIB_PATH` |
| `libanomaly.so` found but unusable | Driver/runtime mismatch: check `nvidia-smi` and `nvcc --version`; rebuild with the right `ARCH` |
| `nvcc fatal: Unsupported gpu architecture` | Use an `ARCH` your CUDA version supports (CUDA 13 needs ≥ sm_75) |
| GPU mode returns 409 | Intentional: no real GPU. Use CPU/Automatic, or connect a GPU backend |
| 413 / "file too large" | Raise `MAX_UPLOAD_MB` (server) and Settings → max upload (client) |
| Remote GPU "unreachable" | Colab session ended or tunnel URL changed; rerun notebook section 7 and update the URL/token |
| Slow first GPU call | CUDA context creation; the benchmark warms up before timing |
| Data "expired" in history | Server keeps arrays for the last 5 analyses only; rerun the analysis |
| Frontend build/type errors | First build was not run by the authors; run `npm run typecheck` and fix reported lines |
