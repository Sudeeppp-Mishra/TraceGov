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
from datetime import datetime, timedelta
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


def extract_text_from_image(image_bytes: bytes) -> str:
    reader = get_ocr_reader()
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    arr = np.array(image)
    results = reader.readtext(arr, detail=0, paragraph=True)
    return " ".join(str(r) for r in results)


def classify_document(text: str) -> dict[str, Any]:
    labels = {
        "Certificate": ["certificate", "birth", "marriage", "registration"],
        "Tax Receipt": ["tax", "receipt", "revenue", "payment"],
        "Citizenship": ["citizenship", "citizen", "nationality", "id no"],
        "Recommendation Letter": ["recommendation", "recommended", "ward chair", "letter"],
        "Ward Form": ["ward", "form", "application", "municipality"],
    }
    normalized = text.lower()
    scores = {
        label: sum(1 for word in words if word in normalized)
        for label, words in labels.items()
    }
    best_label = max(scores, key=scores.get) if scores else "Unknown"
    best_score = scores.get(best_label, 0)
    confidence = min(0.96, 0.35 + best_score * 0.18) if best_score else 0.28
    return {
        "documentType": best_label if best_score else "Unknown",
        "classificationConfidence": round(confidence, 2),
        "scores": scores,
    }


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
        "highlightedMissingItems": [
            {"keyword": kw, "message": f"{kw} was not detected in the uploaded document."}
            for kw in missing
        ],
        "completenessScore": round(completeness, 2),
        "isComplete": len(missing) == 0,
        "ocrConfidence": round(0.55 + completeness * 0.4, 2),
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
    classification = classify_document(text)
    return {
        **result,
        **classification,
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


@app.post("/predict-delay")
def predict_delay(request: DelayPredictionRequest):
    """Lightweight ML-style prediction using engineered features.

    The service keeps this deterministic for demos, but the feature shape mirrors
    what a scikit-learn/XGBoost model would consume after enough training data is
    collected from movement histories.
    """
    missing = sorted(set(request.requiredDocuments) - set(request.submittedDocuments))
    backtrack_count = sum(1 for item in request.movementData if item.action.lower() == "backtracked")
    age_hours = 0.0
    if request.movementData:
        ordered = sorted(request.movementData, key=lambda e: e.timestamp)
        age_hours = (datetime.now(tz=ordered[0].timestamp.tzinfo) - ordered[0].timestamp).total_seconds() / 3600

    risk_points = 12
    risk_points += min(35, len(missing) * 12)
    risk_points += min(20, backtrack_count * 10)
    risk_points += min(18, request.departmentQueueLength * 2)
    risk_points += 18 if request.currentStatus.lower() == "backtracked" else 0
    risk_points += 12 if age_hours > 48 else 4 if age_hours > 24 else 0

    delay_probability = min(96, risk_points)
    expected_processing_hours = max(2, round(4 + request.departmentQueueLength * 0.6 + len(missing) * 3 + backtrack_count * 4))
    confidence = "high" if len(request.movementData) >= 5 else "medium" if request.movementData else "low"

    return {
        "completionDate": (datetime.now() + timedelta(hours=expected_processing_hours)).isoformat(),
        "delayProbability": delay_probability,
        "expectedProcessingHours": expected_processing_hours,
        "departmentDelay": request.currentLocation or "Unknown",
        "confidenceScore": confidence,
        "features": {
            "missingDocumentCount": len(missing),
            "backtrackCount": backtrack_count,
            "departmentQueueLength": request.departmentQueueLength,
            "fileAgeHours": round(age_hours, 1),
        },
    }


@app.post("/smart-backtrack")
def smart_backtrack(request: BacktrackSuggestionRequest):
    missing = sorted(set(request.requiredDocuments) - set(request.submittedDocuments))
    reason = request.backtrackReason or (
        f"Missing {', '.join(missing)}" if missing else "Incomplete verification details"
    )
    recommended_department = "Reception"
    if any("tax" in item.lower() for item in missing):
        recommended_department = "Tax Desk"
    elif any("citizen" in item.lower() for item in missing):
        recommended_department = "Verification Desk"

    similar_cases = sum(1 for item in request.movementData if item.action.lower() == "backtracked")

    return {
        "possibleReason": reason,
        "missingDocuments": missing,
        "requiredCorrections": [
            f"Attach or re-upload {doc}." for doc in missing
        ] or ["Add a clear officer note and verify citizen details."],
        "historicalSimilarCases": similar_cases,
        "recommendedDepartment": recommended_department,
        "recommendation": f"Return to {recommended_department} with a citizen-friendly correction note.",
        "confidence": "high" if missing else "medium",
    }


@app.post("/citizen-message")
def citizen_message(request: DelayPredictionRequest):
    prediction = predict_delay(request)
    location = request.currentLocation or "the responsible section"
    if request.currentStatus.lower() == "backtracked":
        message = "Your application needs one correction before it can continue."
    elif prediction["delayProbability"] > 65:
        message = f"Your application is under review in {location}. It may take a little longer than usual."
    else:
        message = f"Your application is currently under review in {location}."

    return {
        "message": message,
        "estimatedCompletion": f"Estimated completion within {max(1, round(prediction['expectedProcessingHours'] / 8))} working day(s).",
        "missingDocuments": sorted(set(request.requiredDocuments) - set(request.submittedDocuments)),
    }


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
