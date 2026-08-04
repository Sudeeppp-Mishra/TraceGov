"""
TraceGov AI Microservice — Production-Grade FastAPI Application
- Document OCR Analysis (EasyOCR, Nepali + English) with OpenCV Preprocessing Pipeline
- Real Machine Learning Prediction Engine (HistGradientBoosting + Calibrated Risk)
- Dual-Path Model Serving (Real-Data vs Synthetic vs Heuristic Fallback)
"""

from __future__ import annotations

import base64
import os
from datetime import datetime
from typing import Any

import certifi

# macOS python.org installs often lack default CA bundle, breaking EasyOCR downloads
os.environ.setdefault("SSL_CERT_FILE", certifi.where())

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from ml_models import (
    citizen_message_ml,
    estimate_completion_ml,
    load_ml_models,
    predict_delay_ml,
    smart_backtrack_ml,
)
from ocr import DEFAULT_KEYWORDS, run_full_ocr_analysis

app = FastAPI(
    title="TraceGov AI Service",
    description="Production-grade OCR document verification and ML completion/delay prediction microservice",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeDocumentRequest(BaseModel):
    imageBase64: str | None = None
    requiredKeywords: list[str] = Field(default_factory=lambda: DEFAULT_KEYWORDS.copy())
    detectedText: str | None = None


class MovementEntry(BaseModel):
    action: str
    timestamp: datetime
    location: str | None = None


class EstimateCompletionRequest(BaseModel):
    movementData: list[MovementEntry] = Field(default_factory=list)
    avgServiceRateMu: float | None = None
    avgArrivalRateLambda: float | None = None
    remainingSteps: int = 2


class DelayPredictionRequest(BaseModel):
    currentStatus: str = "Pending"
    currentLocation: str | None = None
    requiredDocuments: list[str] = Field(default_factory=list)
    submittedDocuments: list[str] = Field(default_factory=list)
    movementData: list[MovementEntry] = Field(default_factory=list)
    departmentQueueLength: int = 0


class BacktrackSuggestionRequest(BaseModel):
    documentType: str | None = None
    currentLocation: str | None = None
    requiredDocuments: list[str] = Field(default_factory=list)
    submittedDocuments: list[str] = Field(default_factory=list)
    backtrackReason: str | None = None
    movementData: list[MovementEntry] = Field(default_factory=list)


@app.on_event("startup")
def startup_event():
    # Attempt to load ML models on startup
    load_ml_models()


@app.get("/")
@app.get("/health")
def health():
    _, _, metadata = load_ml_models()
    return {
        "service": "TraceGov AI Service",
        "status": "running",
        "version": "1.0.0",
        "modelVersion": (metadata or {}).get("version", "v1.0.0-synthetic"),
        "predictionSource": (metadata or {}).get("source", "trained_model_synthetic"),
    }


@app.post("/analyze-document")
def analyze_document(request: AnalyzeDocumentRequest):
    keywords = request.requiredKeywords or DEFAULT_KEYWORDS

    if request.detectedText:
        return run_full_ocr_analysis(keywords=keywords, detected_text=request.detectedText)

    if request.imageBase64:
        raw = request.imageBase64
        if "," in raw:
            raw = raw.split(",", 1)[1]
        image_bytes = base64.b64decode(raw)
        return run_full_ocr_analysis(image_bytes=image_bytes, keywords=keywords)

    return {"error": "Provide imageBase64 or detectedText"}


@app.post("/analyze-document-upload")
async def analyze_document_upload(file: UploadFile = File(...)):
    contents = await file.read()
    return run_full_ocr_analysis(image_bytes=contents, keywords=DEFAULT_KEYWORDS)


@app.post("/estimate-completion")
def estimate_completion(request: EstimateCompletionRequest):
    movement_data = request.movementData
    remaining = request.remainingSteps

    if movement_data:
        last_action = movement_data[-1].action
        status_steps = {
            "Received": 4,
            "Pending": 3,
            "Approved": 2,
            "Backtracked": 3,
            "Dispatched": 0,
        }
        remaining = status_steps.get(last_action, remaining)

    if remaining <= 0:
        _, _, metadata = load_ml_models()
        return {
            "estimatedMinutesRemaining": 0,
            "estimatedHoursRemaining": 0,
            "model": "M/M/1",
            "confidence": "high",
            "message": "File processing complete",
            "modelVersion": (metadata or {}).get("version", "v1.0.0-synthetic"),
            "predictionSource": (metadata or {}).get("source", "trained_model_synthetic"),
        }

    return estimate_completion_ml(
        movement_data,
        request.avgServiceRateMu,
        request.avgArrivalRateLambda,
        remaining,
    )


@app.post("/predict-delay")
def predict_delay(request: DelayPredictionRequest):
    return predict_delay_ml(
        current_status=request.currentStatus,
        current_location=request.currentLocation,
        required_documents=request.requiredDocuments,
        submitted_documents=request.submittedDocuments,
        movement_data=request.movementData,
        department_queue_length=request.departmentQueueLength,
    )


@app.post("/smart-backtrack")
def smart_backtrack(request: BacktrackSuggestionRequest):
    return smart_backtrack_ml(
        document_type=request.documentType,
        current_location=request.currentLocation,
        required_documents=request.requiredDocuments,
        submitted_documents=request.submittedDocuments,
        backtrack_reason=request.backtrackReason,
        movement_data=request.movementData,
    )


@app.post("/citizen-message")
def citizen_message(request: DelayPredictionRequest):
    return citizen_message_ml(
        current_status=request.currentStatus,
        current_location=request.currentLocation,
        required_documents=request.requiredDocuments,
        submitted_documents=request.submittedDocuments,
        movement_data=request.movementData,
        department_queue_length=request.departmentQueueLength,
    )


@app.post("/bottleneck-analysis")
def bottleneck_analysis(movements: list[MovementEntry]):
    if not movements:
        return {"locations": [], "message": "No movement data"}

    by_location: dict[str, list[float]] = {}
    sorted_m = sorted(movements, key=lambda e: e.timestamp)

    for i, entry in enumerate(sorted_m):
        loc = entry.location or "Unknown"
        if i > 0:
            dwell = (entry.timestamp - sorted_m[i - 1].timestamp).total_seconds() / 60
            by_location.setdefault(loc, []).append(dwell)

    analysis = [
        {
            "location": loc,
            "avgDwellMinutes": round(float(sum(times) / len(times)), 1),
            "maxDwellMinutes": round(float(max(times)), 1),
            "sampleCount": len(times),
        }
        for loc, times in by_location.items()
    ]
    analysis.sort(key=lambda x: x["avgDwellMinutes"], reverse=True)

    return {"locations": analysis, "topBottleneck": analysis[0] if analysis else None}
