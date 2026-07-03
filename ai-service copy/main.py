"""
TraceGov AI Microservice
- Document OCR analysis (EasyOCR) for missing document detection
- M/M/1 queueing model for file completion time estimation
"""

from __future__ import annotations

import base64
import io
import math
import re
from datetime import datetime
from typing import Any

import numpy as np
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from PIL import Image

app = FastAPI(
    title="TraceGov AI Service",
    description="OCR document checks and queueing-based completion estimates",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Lazy-load EasyOCR to avoid slow startup when not needed
_ocr_reader = None


def get_ocr_reader():
    global _ocr_reader
    if _ocr_reader is None:
        import easyocr
        _ocr_reader = easyocr.Reader(["en"], gpu=False, verbose=False)
    return _ocr_reader


DEFAULT_KEYWORDS = [
    "Certificate",
    "Tax Receipt",
    "Citizenship",
    "Application Form",
    "Recommendation Letter",
    "Stamp",
]


class AnalyzeDocumentRequest(BaseModel):
    imageBase64: str | None = None
    requiredKeywords: list[str] = Field(default_factory=lambda: DEFAULT_KEYWORDS.copy())
    detectedText: str | None = None  # skip OCR if text already extracted


class MovementEntry(BaseModel):
    action: str
    timestamp: datetime
    location: str | None = None


class EstimateCompletionRequest(BaseModel):
    movementData: list[MovementEntry] = Field(default_factory=list)
    avgServiceRateMu: float | None = None  # files/hour at bottleneck desk
    avgArrivalRateLambda: float | None = None  # files/hour entering queue
    remainingSteps: int = 2


def extract_text_from_image(image_bytes: bytes) -> str:
    reader = get_ocr_reader()
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    arr = np.array(image)
    results = reader.readtext(arr, detail=0, paragraph=True)
    return " ".join(str(r) for r in results)


def check_keywords(text: str, keywords: list[str]) -> dict[str, Any]:
    normalized = text.lower()
    found = []
    missing = []

    for kw in keywords:
        pattern = re.escape(kw.lower())
        if re.search(pattern, normalized):
            found.append(kw)
        else:
            missing.append(kw)

    completeness = len(found) / len(keywords) if keywords else 1.0

    return {
        "foundKeywords": found,
        "missingKeywords": missing,
        "completenessScore": round(completeness, 2),
        "isComplete": len(missing) == 0,
    }


def compute_inter_arrival_times(movement_data: list[MovementEntry]) -> list[float]:
    """Return inter-arrival times in hours from movement timestamps."""
    if len(movement_data) < 2:
        return [0.5]  # default 30 min between steps

    sorted_entries = sorted(movement_data, key=lambda e: e.timestamp)
    deltas = []
    for i in range(1, len(sorted_entries)):
        delta_hours = (sorted_entries[i].timestamp - sorted_entries[i - 1].timestamp).total_seconds() / 3600
        if delta_hours > 0:
            deltas.append(delta_hours)
    return deltas if deltas else [0.5]


def mm1_estimate(
    movement_data: list[MovementEntry],
    mu: float | None,
    lam: float | None,
    remaining_steps: int,
) -> dict[str, Any]:
    """
    M/M/1 queueing model:
    - λ (lambda): arrival rate (files per hour)
    - μ (mu): service rate (files per hour)
    - W = 1 / (μ - λ)  expected time in system (hours)
    """
    deltas = compute_inter_arrival_times(movement_data)

    # Estimate λ from historical inter-arrival times
    avg_inter_arrival = float(np.mean(deltas))
    estimated_lambda = lam or (1.0 / avg_inter_arrival if avg_inter_arrival > 0 else 2.0)

    # Estimate μ from average step processing time (inverse of inter-step time × efficiency factor)
    avg_service_time = avg_inter_arrival * 0.8  # service typically faster than full cycle
    estimated_mu = mu or (1.0 / avg_service_time if avg_service_time > 0 else 4.0)

    # Stability condition: ρ = λ/μ < 1
    rho = estimated_lambda / estimated_mu if estimated_mu > 0 else 0.9
    if rho >= 1:
        estimated_mu = estimated_lambda * 1.2
        rho = estimated_lambda / estimated_mu

    # M/M/1 expected time in system (hours): W = 1/(μ-λ)
    wait_hours = 1.0 / (estimated_mu - estimated_lambda)
    wait_minutes = wait_hours * 60 * remaining_steps

    # Confidence based on sample size and stability margin
    sample_size = len(deltas)
    stability_margin = 1 - rho
    if sample_size >= 5 and stability_margin > 0.3:
        confidence = "high"
    elif sample_size >= 2:
        confidence = "medium"
    else:
        confidence = "low"

    return {
        "estimatedMinutesRemaining": max(5, round(wait_minutes)),
        "estimatedHoursRemaining": round(wait_hours * remaining_steps, 2),
        "model": "M/M/1",
        "parameters": {
            "lambda_per_hour": round(estimated_lambda, 3),
            "mu_per_hour": round(estimated_mu, 3),
            "utilization_rho": round(rho, 3),
            "remainingSteps": remaining_steps,
            "sampleSize": sample_size,
        },
        "confidence": confidence,
        "bottleneckHint": "High utilization — consider adding desk capacity" if rho > 0.85 else None,
    }


@app.get("/health")
def health():
    return {"status": "ok", "service": "tracegov-ai"}


@app.post("/analyze-document")
async def analyze_document(
    request: AnalyzeDocumentRequest | None = None,
    file: UploadFile | None = File(None),
):
    keywords = DEFAULT_KEYWORDS
    text = ""

    if file:
        contents = await file.read()
        text = extract_text_from_image(contents)
    elif request:
        keywords = request.requiredKeywords or DEFAULT_KEYWORDS
        if request.detectedText:
            text = request.detectedText
        elif request.imageBase64:
            raw = request.imageBase64
            if "," in raw:
                raw = raw.split(",", 1)[1]
            image_bytes = base64.b64decode(raw)
            text = extract_text_from_image(image_bytes)
        else:
            return {"error": "Provide imageBase64, detectedText, or upload a file"}
    else:
        return {"error": "No input provided"}

    result = check_keywords(text, keywords)
    return {
        **result,
        "extractedTextPreview": text[:500] if text else "",
        "keywordCount": len(keywords),
    }


@app.post("/estimate-completion")
def estimate_completion(request: EstimateCompletionRequest):
    movement_data = request.movementData

    # Infer remaining steps from current status if not provided
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
        return {
            "estimatedMinutesRemaining": 0,
            "estimatedHoursRemaining": 0,
            "model": "M/M/1",
            "confidence": "high",
            "message": "File processing complete",
        }

    result = mm1_estimate(
        movement_data,
        request.avgServiceRateMu,
        request.avgArrivalRateLambda,
        remaining,
    )
    return result


@app.post("/bottleneck-analysis")
def bottleneck_analysis(movements: list[MovementEntry]):
    """Group dwell times by location for admin bottleneck dashboard."""
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
            "avgDwellMinutes": round(float(np.mean(times)), 1),
            "maxDwellMinutes": round(float(np.max(times)), 1),
            "sampleCount": len(times),
        }
        for loc, times in by_location.items()
    ]
    analysis.sort(key=lambda x: x["avgDwellMinutes"], reverse=True)

    return {"locations": analysis, "topBottleneck": analysis[0] if analysis else None}
