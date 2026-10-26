"""GPU backend adapter.

Three interchangeable backends share one interface (status(), analyze(), warmup()):
  * LocalCudaBackend   - loads libanomaly.so (built from backend/cuda) with ctypes.
  * RemoteGpuBackend   - forwards work to another instance of this API that runs LocalCudaBackend
                         (for example the Colab notebook behind a tunnel).
  * UnavailableBackend - reports why no GPU can be used. It never executes anything.

Results from the CPU path are never labeled as GPU results anywhere in this module.
"""
from __future__ import annotations

import ctypes
import io
import json
import os
import shutil
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from urllib.parse import urlparse

import numpy as np

from app.core.config import settings


class GpuUnavailable(RuntimeError):
    """Raised when GPU execution was requested but no real CUDA backend is available."""


@dataclass
class GpuResult:
    z: np.ndarray
    flags: np.ndarray        # bool
    mean: float
    variance: float
    std: float
    timing: dict             # alloc_ms, h2d_ms, kernel_ms, d2h_ms, total_ms (+ network_roundtrip_ms for remote)
    launch: dict             # threads_per_block, blocks_reduce, blocks_classify
    source: str              # "local-cuda" | "remote-cuda"
    device_name: str


def _base_status() -> dict:
    return {
        "available": False, "executes_cuda": False, "source": None, "mode": settings.gpu_mode,
        "device_name": None, "compute_capability": None, "cuda_runtime_version": None,
        "cuda_driver_version": None, "sm_count": None, "total_memory_mb": None,
        "library_path": None, "remote_host": None, "nvcc_found": shutil.which("nvcc") is not None,
        "reason": None,
    }


def _ver(v: int) -> str:
    return f"{v // 1000}.{(v % 1000) // 10}" if v else None


class UnavailableBackend:
    kind = "none"

    def __init__(self, reason: str):
        self.reason = reason

    def status(self) -> dict:
        s = _base_status()
        s["reason"] = self.reason
        return s

    def analyze(self, values, threshold):
        raise GpuUnavailable(self.reason)

    def warmup(self):
        raise GpuUnavailable(self.reason)


class LocalCudaBackend:
    kind = "local-cuda"

    def __init__(self, lib_path: str):
        self._lock = threading.Lock()
        self._lib = ctypes.CDLL(lib_path)          # raises OSError if it cannot be loaded
        self._path = lib_path
        f64p = np.ctypeslib.ndpointer(dtype=np.float64, flags="C_CONTIGUOUS")
        u8p = np.ctypeslib.ndpointer(dtype=np.uint8, flags="C_CONTIGUOUS")
        i32p = np.ctypeslib.ndpointer(dtype=np.int32, flags="C_CONTIGUOUS")
        self._lib.gpu_device_info.argtypes = [ctypes.c_char_p, ctypes.c_int, i32p]
        self._lib.gpu_device_info.restype = ctypes.c_int
        self._lib.gpu_last_error.restype = ctypes.c_char_p
        self._lib.gpu_analyze.argtypes = [f64p, ctypes.c_longlong, ctypes.c_double, f64p, u8p, f64p, f64p, i32p]
        self._lib.gpu_analyze.restype = ctypes.c_int
        name = ctypes.create_string_buffer(256)
        info = np.zeros(8, dtype=np.int32)
        if self._lib.gpu_device_info(name, 256, info) != 0:
            raise GpuUnavailable(self._lib.gpu_last_error().decode(errors="replace"))
        self._name = name.value.decode(errors="replace")
        self._info = info

    def status(self) -> dict:
        s = _base_status()
        i = self._info
        s.update(available=True, executes_cuda=True, source="local-cuda", device_name=self._name,
                 compute_capability=f"{i[0]}.{i[1]}", cuda_runtime_version=_ver(int(i[2])),
                 cuda_driver_version=_ver(int(i[3])), sm_count=int(i[4]), total_memory_mb=int(i[5]),
                 library_path=self._path)
        return s

    def analyze(self, values: np.ndarray, threshold: float) -> GpuResult:
        x = np.ascontiguousarray(values, dtype=np.float64)
        n = x.size
        z = np.empty(n, dtype=np.float64)
        flags = np.empty(n, dtype=np.uint8)
        stats = np.zeros(3, dtype=np.float64)
        timing = np.zeros(5, dtype=np.float64)
        launch = np.zeros(4, dtype=np.int32)
        with self._lock:
            rc = self._lib.gpu_analyze(x, n, float(threshold), z, flags, stats, timing, launch)
            if rc != 0:
                raise RuntimeError("CUDA error: " + self._lib.gpu_last_error().decode(errors="replace"))
        return GpuResult(
            z=z, flags=flags.astype(bool), mean=float(stats[0]), variance=float(stats[1]), std=float(stats[2]),
            timing={"alloc_ms": float(timing[0]), "h2d_ms": float(timing[1]), "kernel_ms": float(timing[2]),
                    "d2h_ms": float(timing[3]), "total_ms": float(timing[4])},
            launch={"threads_per_block": int(launch[0]), "blocks_reduce": int(launch[1]),
                    "blocks_classify": int(launch[2])},
            source="local-cuda", device_name=self._name)

    def warmup(self):
        """Initialise the CUDA context and JIT/caches before timed runs."""
        rng = np.random.default_rng(0)
        for _ in range(2):
            self.analyze(rng.standard_normal(4096), 3.0)


class RemoteGpuBackend:
    kind = "remote-cuda"

    def __init__(self, url: str, token: str = ""):
        self._url, self._token = url.rstrip("/"), token
        self._cache: tuple[float, dict] | None = None
        self._host = urlparse(url).netloc

    def _headers(self, extra=None):
        h = dict(extra or {})
        if self._token:
            h["Authorization"] = f"Bearer {self._token}"
        return h

    def status(self) -> dict:
        if self._cache and time.time() - self._cache[0] < 20:
            return self._cache[1]
        s = _base_status()
        s["mode"], s["remote_host"] = settings.gpu_mode, self._host
        try:
            req = urllib.request.Request(self._url + "/api/gpu/status", headers=self._headers())
            with urllib.request.urlopen(req, timeout=10) as r:
                remote = json.loads(r.read().decode())
            # Trust only a remote that itself reports real local CUDA execution.
            if remote.get("available") and remote.get("executes_cuda") and remote.get("source") == "local-cuda":
                for k in ("device_name", "compute_capability", "cuda_runtime_version", "cuda_driver_version",
                          "sm_count", "total_memory_mb"):
                    s[k] = remote.get(k)
                s.update(available=True, executes_cuda=True, source="remote-cuda")
            else:
                s["reason"] = "Remote server is reachable but reports no CUDA GPU: " + str(remote.get("reason"))
        except (urllib.error.URLError, OSError, ValueError) as exc:
            s["reason"] = f"Remote GPU backend unreachable: {exc}"
        self._cache = (time.time(), s)
        return s

    def analyze(self, values: np.ndarray, threshold: float) -> GpuResult:
        if not self.status()["available"]:
            raise GpuUnavailable(self.status()["reason"])
        body = np.ascontiguousarray(values, dtype="<f8").tobytes()
        req = urllib.request.Request(
            f"{self._url}/api/gpu/analyze?threshold={float(threshold)!r}", data=body, method="POST",
            headers=self._headers({"Content-Type": "application/octet-stream"}))
        t0 = time.perf_counter()
        try:
            with urllib.request.urlopen(req, timeout=600) as r:
                payload = r.read()
        except (urllib.error.URLError, OSError) as exc:
            self._cache = None
            raise GpuUnavailable(f"Remote GPU request failed: {exc}")
        rtt = (time.perf_counter() - t0) * 1000.0
        npz = np.load(io.BytesIO(payload), allow_pickle=False)
        meta = json.loads(bytes(npz["meta"]).decode())
        timing = dict(meta["timing"])
        timing["network_roundtrip_ms"] = rtt   # NOT GPU time; reported separately
        return GpuResult(z=npz["z"], flags=npz["flags"].astype(bool), mean=meta["mean"], variance=meta["variance"],
                         std=meta["std"], timing=timing, launch=meta["launch"], source="remote-cuda",
                         device_name=meta.get("device_name", "remote GPU"))

    def warmup(self):
        self.analyze(np.random.default_rng(0).standard_normal(4096), 3.0)


_backend = None
_backend_lock = threading.Lock()


def build_backend():
    mode = settings.gpu_mode
    reasons = []
    if mode == "off":
        return UnavailableBackend("GPU execution is disabled (GPU_MODE=off).")
    if mode in ("auto", "local"):
        if os.path.exists(settings.cuda_lib_path):
            try:
                return LocalCudaBackend(settings.cuda_lib_path)
            except (OSError, GpuUnavailable, AttributeError) as exc:
                reasons.append(f"CUDA library found but unusable: {exc}")
        else:
            reasons.append(f"CUDA library not built (expected {settings.cuda_lib_path}; see backend/cuda/README.md).")
    if mode in ("auto", "remote") and settings.gpu_backend_url:
        return RemoteGpuBackend(settings.gpu_backend_url, settings.gpu_backend_token)
    if mode == "remote":
        reasons.append("GPU_MODE=remote but GPU_BACKEND_URL is not set.")
    return UnavailableBackend(" ".join(reasons) or "No GPU backend configured.")


def get_backend():
    global _backend
    with _backend_lock:
        if _backend is None:
            _backend = build_backend()
        return _backend


def reset_backend():
    global _backend
    with _backend_lock:
        _backend = None
