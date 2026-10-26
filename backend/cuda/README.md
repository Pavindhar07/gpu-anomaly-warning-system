# CUDA sources

| File | Purpose |
|---|---|
| `anomaly_kernels.cu` | Kernels (sum reduction, mean, variance, Z-score + classification) and the C API `gpu_device_info`, `gpu_analyze`, `gpu_last_error`. Compiled into `build/libanomaly.so`, which `app/services/gpu_backend.py` loads with `ctypes`. |
| `selftest.cu` | Standalone program: runs the GPU pipeline and a C++ CPU reference, prints stats, timing and PASS/FAIL. |
| `Makefile` | `make` (default `ARCH=sm_75`, the Tesla T4) builds both targets. |

Everything is float64 so GPU and CPU agree to ~1e-9. (A T4 has weak FP64 throughput; the
reduction is memory-bound so this matters little, but a float32 variant would be faster.)

Status: written but **not compiled or run in the authoring sandbox** (no nvcc/GPU there). Compile and
test it in Colab with `notebooks/colab_cuda_backend.ipynb`.
