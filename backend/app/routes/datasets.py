import io
import uuid

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import Response

from app.core.config import settings
from app.schemas.models import GenerateRequest
from app.services import store
from app.services.analysis import now_iso
from app.services.datasets import DatasetError, generate_dataframe, parse_csv, profile
from app.state import err

router = APIRouter(prefix="/api")


def _register(df, name, extra=None):
    did = uuid.uuid4().hex[:12]
    prof = profile(df)
    store.datasets.put(did, {"id": did, "df": df, "name": name, "profile": prof, "created_at": now_iso()})
    return {"dataset_id": did, "name": name, "created_at": now_iso(), **prof, **(extra or {})}


@router.post("/datasets/upload")
async def upload(file: UploadFile = File(...)):
    name = (file.filename or "upload.csv")
    if not name.lower().endswith((".csv", ".txt")):
        raise err(415, "unsupported_type", "Only .csv files are accepted.")
    limit = settings.max_upload_mb * 1024 * 1024
    content = await file.read(limit + 1)
    if len(content) > limit:
        raise err(413, "file_too_large", f"File exceeds the {settings.max_upload_mb} MB limit.")
    try:
        df = parse_csv(content, settings.max_rows)
    except DatasetError as exc:
        raise err(400, "invalid_csv", str(exc))
    return _register(df, name.split("/")[-1].split("\\")[-1])


@router.post("/datasets/generate")
def generate(req: GenerateRequest):
    if req.n > settings.max_synthetic_rows:
        raise err(422, "too_many_rows", f"n exceeds the server limit of {settings.max_synthetic_rows:,}.")
    try:
        df = generate_dataframe(req.n, baseline=req.baseline, noise_std=req.noise_std,
                                anomaly_count=req.anomaly_count, seed=req.seed,
                                positive_fraction=req.positive_fraction, magnitude_min=req.magnitude_min,
                                magnitude_max=req.magnitude_max, drift_total=req.drift_total)
    except DatasetError as exc:
        raise err(422, "invalid_parameters", str(exc))
    return _register(df, f"synthetic_n{req.n}_seed{req.seed}.csv",
                     {"generator": req.model_dump(), "injected_anomalies": req.anomaly_count})


@router.get("/datasets/{dataset_id}")
def get_dataset(dataset_id: str):
    ds = store.datasets.get(dataset_id)
    if not ds:
        raise err(404, "dataset_not_found", "Dataset not found (it may have been evicted; upload it again).")
    return {"dataset_id": ds["id"], "name": ds["name"], "created_at": ds["created_at"], **ds["profile"]}


@router.get("/sample.csv")
def sample_csv():
    df = generate_dataframe(500, baseline=50.0, noise_std=2.0, anomaly_count=8, seed=42)
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    return Response(buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="sample_sensor_data.csv"'})
