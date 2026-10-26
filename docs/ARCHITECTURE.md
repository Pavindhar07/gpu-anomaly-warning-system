# Architecture

```
React (Vite, TS, Tailwind, Recharts)  --HTTP/JSON-->  FastAPI (backend/app)
                                                         |-- services/detection.py   CPU reference (NumPy)
                                                         |-- services/analysis.py    orchestration, severity, labels
                                                         |-- services/benchmark.py   repeated timed runs, agreement checks
                                                         `-- services/gpu_backend.py adapter
                                                                |-- LocalCudaBackend   ctypes -> libanomaly.so (backend/cuda)
                                                                |-- RemoteGpuBackend   HTTP -> another instance running LocalCudaBackend (Colab)
                                                                `-- UnavailableBackend explicit reason; never simulates
```
**Honesty rule:** `executed_on` is `gpu` only when a real CUDA backend returned the numbers. `mode=gpu` without a GPU is an error (HTTP 409). `auto` runs on the CPU and says so.

**CUDA pipeline** (`backend/cuda/anomaly_kernels.cu`): H2D copy → `k_block_sum` → `k_finalize_mean` → `k_block_sqdev` → `k_finalize_var` → `k_classify` → D2H copy. Mean/variance/std stay in device memory between kernels. Timing: CUDA events for H2D, kernels and D2H; wall clock (after `cudaEventSynchronize`) for the end-to-end figure, which includes `cudaMalloc`.

**Memory model:** datasets and analyses live in process memory (LRU: 5 datasets, 5 analyses with arrays, 200 history summaries). Restarting the server clears them. SQLite history is not implemented.
