"""Runtime configuration, read from environment variables (see .env.example)."""
import os
from dataclasses import dataclass
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    gpu_mode: str            # auto | local | remote | off
    cuda_lib_path: str       # path to libanomaly.so built from backend/cuda
    gpu_backend_url: str     # base URL of a remote GPU backend (e.g. Colab tunnel)
    gpu_backend_token: str   # bearer token sent to the remote GPU backend
    gpu_api_token: str       # if set, /api/gpu/analyze requires this bearer token
    cors_origins: list
    max_upload_mb: int
    max_rows: int
    max_synthetic_rows: int
    max_benchmark_size: int


def load_settings() -> Settings:
    mode = os.environ.get("GPU_MODE", "auto").strip().lower()
    if mode not in {"auto", "local", "remote", "off"}:
        mode = "auto"
    origins = os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    return Settings(
        gpu_mode=mode,
        cuda_lib_path=os.environ.get("CUDA_LIB_PATH", str(BACKEND_DIR / "cuda" / "build" / "libanomaly.so")),
        gpu_backend_url=os.environ.get("GPU_BACKEND_URL", "").strip().rstrip("/"),
        gpu_backend_token=os.environ.get("GPU_BACKEND_TOKEN", ""),
        gpu_api_token=os.environ.get("GPU_API_TOKEN", ""),
        cors_origins=[o.strip() for o in origins.split(",") if o.strip()],
        max_upload_mb=_int("MAX_UPLOAD_MB", 100),
        max_rows=_int("MAX_ROWS", 5_000_000),
        max_synthetic_rows=_int("MAX_SYNTHETIC_ROWS", 5_000_000),
        max_benchmark_size=_int("MAX_BENCHMARK_SIZE", 5_000_000),
    )


settings = load_settings()
