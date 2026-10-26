"""Pydantic request models (the API contract is documented in docs/API.md)."""
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, model_validator


class GenerateRequest(BaseModel):
    n: int = Field(10_000, ge=10, description="Number of readings (upper limit set by MAX_SYNTHETIC_ROWS)")
    baseline: float = 50.0
    noise_std: float = Field(2.0, gt=0)
    anomaly_count: int = Field(20, ge=0)
    positive_fraction: float = Field(0.5, ge=0, le=1)
    magnitude_min: float = Field(5.0, gt=0)
    magnitude_max: float = Field(8.0, gt=0)
    drift_total: float = 0.0
    seed: int = Field(42, ge=0, le=2**32 - 1)


class AnalyzeRequest(BaseModel):
    dataset_id: str
    sensor_column: str
    timestamp_column: Optional[str] = None
    threshold: float = Field(3.0, gt=0, le=100)
    mode: Literal["cpu", "gpu", "auto"] = "auto"
    missing_policy: Literal["drop", "mean", "median", "error"] = "drop"
    moderate_z: float = Field(4.0, gt=0)
    high_z: float = Field(5.0, gt=0)

    @model_validator(mode="after")
    def _check(self):
        if not (self.threshold <= self.moderate_z <= self.high_z):
            raise ValueError("Severity ranges must satisfy threshold <= moderate_z <= high_z.")
        return self


class BenchmarkRequest(BaseModel):
    sizes: List[int] = Field(default_factory=lambda: [1_000, 10_000, 100_000, 1_000_000], min_length=1, max_length=8)
    repeats: int = Field(5, ge=1, le=50)
    seed: int = Field(42, ge=0, le=2**32 - 1)
    threshold: float = Field(3.0, gt=0, le=100)

    @model_validator(mode="after")
    def _check(self):
        if any(s < 10 for s in self.sizes):
            raise ValueError("Every benchmark size must be at least 10.")
        return self
