import io
import json
import secrets

import numpy as np
from fastapi import APIRouter, Header, Request
from fastapi.responses import Response

from app.core.config import settings
from app.services.gpu_backend import GpuUnavailable, LocalCudaBackend, get_backend, reset_backend
from app.services.detection import VARIANCE_CONVENTION
from app.state import err

router = APIRouter(prefix="/api")


@router.get("/health")
def health():
    return {"status": "ok", "service": "gpu-anomaly-warning-system", "version": "0.1.0",
            "variance_convention": VARIANCE_CONVENTION,
            "limits": {"max_upload_mb": settings.max_upload_mb, "max_rows": settings.max_rows,
                       "max_synthetic_rows": settings.max_synthetic_rows,
                       "max_benchmark_size": settings.max_benchmark_size}}


@router.get("/gpu/status")
def gpu_status(refresh: bool = False):
    if refresh:
        reset_backend()
    return get_backend().status()


@router.post("/gpu/analyze")
async def gpu_analyze(request: Request, threshold: float = 3.0, authorization: str = Header(default="")):
    """Binary endpoint used by RemoteGpuBackend. Body: little-endian float64 array.
    Reply: uncompressed .npz (z, flags, meta). Only served by a server with a real local CUDA backend."""
    if settings.gpu_api_token and not secrets.compare_digest(authorization, f"Bearer {settings.gpu_api_token}"):
        raise err(401, "unauthorized", "Missing or invalid bearer token.")
    backend = get_backend()
    if not isinstance(backend, LocalCudaBackend):
        raise err(503, "gpu_unavailable", "This server has no local CUDA backend: " + str(backend.status()["reason"]))
    if not (0 < threshold <= 100):
        raise err(422, "invalid_threshold", "threshold must be in (0, 100].")
    body = await request.body()
    if len(body) == 0 or len(body) % 8:
        raise err(422, "invalid_body", "Body must be a non-empty float64 array.")
    if len(body) > settings.max_upload_mb * 1024 * 1024 * 10:
        raise err(413, "too_large", "Payload too large.")
    x = np.frombuffer(body, dtype="<f8")
    if not np.all(np.isfinite(x)):
        raise err(422, "non_finite", "Values must be finite.")
    try:
        r = backend.analyze(x, threshold)
    except (GpuUnavailable, RuntimeError) as exc:
        raise err(500, "cuda_error", str(exc))
    meta = json.dumps({"mean": r.mean, "variance": r.variance, "std": r.std, "timing": r.timing,
                       "launch": r.launch, "device_name": r.device_name}).encode()
    buf = io.BytesIO()
    np.savez(buf, z=r.z, flags=r.flags.astype(np.uint8), meta=np.frombuffer(meta, dtype=np.uint8))
    return Response(buf.getvalue(), media_type="application/octet-stream")
