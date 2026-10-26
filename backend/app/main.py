"""FastAPI entry point.  Run:  uvicorn app.main:app --reload --port 8000   (from the backend/ folder)"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routes import analysis, datasets, system

app = FastAPI(title="GPU-Powered Warning System for Hidden Data Anomalies", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"], allow_headers=["*"])
app.include_router(system.router)
app.include_router(datasets.router)
app.include_router(analysis.router)
