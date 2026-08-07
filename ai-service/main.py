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
    imageBase64: str | list[str] | None = None
    requiredKeywords: list[str] = Field(default_factory=lambda: DEFAULT_KEYWORDS.copy())
    detectedText: str | None = None
    citizenName: str | None = None
    citizenNameNepali: str | None = None


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
    name_kwargs = {
        "citizen_name": request.citizenName,
        "citizen_name_nepali": request.citizenNameNepali,
    }

    if request.detectedText:
        return run_full_ocr_analysis(keywords=keywords, detected_text=request.detectedText, **name_kwargs)

    if request.imageBase64:
        # Tier-3 #15: multi-page support. imageBase64 may now be either a
        # single base64 string or a list of base64 strings (one per page).
        # We OCR each page sequentially, then merge the results into a single
        # response with per-page breakdowns so the frontend can render tabs.
        images = request.imageBase64 if isinstance(request.imageBase64, list) else [request.imageBase64]
        if len(images) == 0:
            return {"error": "imageBase64 list is empty"}
        if len(images) == 1:
            raw = images[0]
            if "," in raw:
                raw = raw.split(",", 1)[1]
            image_bytes = base64.b64decode(raw)
            result = run_full_ocr_analysis(image_bytes=image_bytes, keywords=keywords, **name_kwargs)
            result["pageCount"] = 1
            result["pages"] = [
                {
                    "pageIndex": 0,
                    "extractedTextPreview": result.get("extractedTextPreview", ""),
                    "extractedText": result.get("extractedText", ""),
                    "completenessScore": result.get("completenessScore", 0),
                    "ocrConfidence": result.get("ocrConfidence", 0),
                    "imageWidth": result.get("imageWidth", 0),
                    "imageHeight": result.get("imageHeight", 0),
                    "textBoxes": result.get("textBoxes", []),
                    "nepaliText": result.get("nepaliText", ""),
                    "englishText": result.get("englishText", ""),
                }
            ]
            return result

        # Multi-page: run per-page, then merge.
        per_page_results = []
        per_page_meta = []  # (imageWidth, imageHeight) per page, for offsetting overlays
        for i, img_b64 in enumerate(images):
            raw = img_b64.split(",", 1)[1] if "," in img_b64 else img_b64
            try:
                image_bytes = base64.b64decode(raw)
            except Exception as decode_err:
                return {"error": f"Page {i+1}: invalid base64 ({decode_err})"}
            page_result = run_full_ocr_analysis(image_bytes=image_bytes, keywords=keywords, **name_kwargs)
            page_result["pageIndex"] = i
            per_page_results.append(page_result)
            per_page_meta.append({
                "imageWidth": page_result.get("imageWidth", 0),
                "imageHeight": page_result.get("imageHeight", 0),
            })

        merged = _merge_multi_page_results(per_page_results, per_page_meta)
        merged["pageCount"] = len(per_page_results)
        merged["pages"] = [
            {
                "pageIndex": r.get("pageIndex", i),
                "extractedTextPreview": r.get("extractedTextPreview", ""),
                "extractedText": r.get("extractedText", ""),
                "completenessScore": r.get("completenessScore", 0),
                "ocrConfidence": r.get("ocrConfidence", 0),
                "imageWidth": r.get("imageWidth", 0),
                "imageHeight": r.get("imageHeight", 0),
                "textBoxes": r.get("textBoxes", []),
                "nepaliText": r.get("nepaliText", ""),
                "englishText": r.get("englishText", ""),
            }
            for i, r in enumerate(per_page_results)
        ]
        return merged

    return {"error": "Provide imageBase64 or detectedText"}


def _merge_multi_page_results(per_page_results: list[dict], per_page_meta: list[dict]) -> dict:
    """Merge per-page OCR results into a single response.

    Strategy:
    - extractedText: page-separated with a small divider.
    - extractedTextPreview: first 500 chars of the merged text.
    - foundKeywords / missingKeywords: union across pages.
    - completenessScore: average (citizens care about overall completeness).
    - ocrConfidence: weighted average by extracted-text length (longer pages
      contribute proportionally).
    - rawOCRConfidence: min across pages (worst-case signal).
    - keywordCount: kept from first page (the request supplied it).
    - stampCount: sum; stampRegions re-indexed with y-offset = sum of prior
      pages' imageHeight so the frontend can render overlays on a stacked
      image.
    - textBoxes: concatenated with imageWidth/imageHeight per page so the
      modal can render each page's overlays at the right scale.
    """
    if not per_page_results:
        return {}

    pages_with_text = [p for p in per_page_results if p.get("extractedText")]
    text_blocks = []
    for p in per_page_results:
        if p.get("extractedText"):
            text_blocks.append(p["extractedText"])
    merged_text = "\n\n".join(text_blocks)

    # Per-language partitions: concatenate across pages so the file-level
    # `nepaliText` / `englishText` strings are complete for multi-page docs.
    nepali_blocks = [p.get("nepaliText", "") for p in per_page_results if p.get("nepaliText")]
    english_blocks = [p.get("englishText", "") for p in per_page_results if p.get("englishText")]
    merged_nepali = "\n\n".join(nepali_blocks)
    merged_english = "\n\n".join(english_blocks)

    found_set = set()
    missing_set = set()
    found_with_meta = []
    missing_with_meta = []
    for p in per_page_results:
        for kw in p.get("foundKeywords", []) or []:
            if kw not in found_set:
                found_set.add(kw)
                found_with_meta.append(kw)
        for kw in p.get("missingKeywords", []) or []:
            if kw not in missing_set:
                missing_set.add(kw)
                missing_with_meta.append(kw)

    # Average completeness; if any page is incomplete we mark the whole as not
    # complete (officers need to see worst-case).
    completeness_scores = [p.get("completenessScore", 0) for p in per_page_results]
    avg_completeness = sum(completeness_scores) / len(completeness_scores) if completeness_scores else 0.0
    is_complete = all(p.get("isComplete", False) for p in per_page_results)

    # Weighted OCR confidence by extracted-text length.
    total_len = sum(len(p.get("extractedText", "") or "") for p in per_page_results)
    weighted_ocr = 0.0
    if total_len > 0:
        weighted_ocr = sum(
            (len(p.get("extractedText", "") or "") * (p.get("ocrConfidence", 0) or 0))
            for p in per_page_results
        ) / total_len

    raw_confs = [p.get("rawOCRConfidence", 0) for p in per_page_results if p.get("rawOCRConfidence") is not None]
    raw_min = min(raw_confs) if raw_confs else 0.0

    # Stamp regions: re-index with y-offset.
    y_offset = 0
    reindexed_regions = []
    stamp_count = 0
    for i, p in enumerate(per_page_results):
        meta = per_page_meta[i] if i < len(per_page_meta) else {}
        page_h = meta.get("imageHeight", 0) or 0
        sa = p.get("stampAnalysis") or {}
        stamp_count += sa.get("stampCount", 0) or 0
        for r in sa.get("stampRegions", []) or []:
            bb = r.get("boundingBox") or {}
            reindexed_regions.append({
                "area": r.get("area", 0),
                "circularity": r.get("circularity", 0),
                "boundingBox": {
                    "x": bb.get("x", 0),
                    "y": (bb.get("y", 0) or 0) + y_offset,
                    "w": bb.get("w", 0),
                    "h": bb.get("h", 0),
                },
                "pageIndex": i,
            })
        y_offset += page_h

    merged_stamp = {
        "stampDetected": any((p.get("stampAnalysis") or {}).get("stampDetected") for p in per_page_results),
        "stampColor": (per_page_results[0].get("stampAnalysis") or {}).get("stampColor"),
        "stampConfidence": max(((p.get("stampAnalysis") or {}).get("stampConfidence", 0) or 0) for p in per_page_results),
        "stampCount": stamp_count,
        "stampRegions": reindexed_regions,
    }

    # Take image dimensions from the first page (the merged OCR result is
    # conceptually rendered against the first page's coordinate space for
    # the persistent preview, which only stores a single image).
    first_meta = per_page_meta[0] if per_page_meta else {}
    first_page = per_page_results[0] if per_page_results else {}

    return {
        # Carry through top-level scalar fields with sensible aggregation.
        "documentType": first_page.get("documentType", "Unknown"),
        "classificationConfidence": first_page.get("classificationConfidence", 0),
        "classificationSource": first_page.get("classificationSource", "heuristic"),
        "foundKeywords": found_with_meta,
        "missingKeywords": missing_with_meta,
        "highlightedMissingItems": [
            item for p in per_page_results
            for item in (p.get("highlightedMissingItems") or [])
        ],
        "completenessScore": round(avg_completeness, 2),
        "isComplete": is_complete,
        "ocrConfidence": round(weighted_ocr, 2),
        "rawOCRConfidence": round(raw_min, 2),
        "detectedLanguage": first_page.get("detectedLanguage", "unknown"),
        "devanagariRatio": max((p.get("devanagariRatio", 0) or 0) for p in per_page_results),
        "extractedTextPreview": merged_text[:500],
        "extractedText": merged_text,
        "keywordCount": len(found_with_meta) + len(missing_with_meta),
        "stampAnalysis": merged_stamp,
        "nameVerification": first_page.get("nameVerification"),
        "imageQualityIssue": first_page.get("imageQualityIssue"),
        # Tier-3 #12/#15: bounding boxes are per-page; the modal reads from `pages`.
        "textBoxes": first_page.get("textBoxes", []) or [],
        "imageWidth": first_meta.get("imageWidth", 0),
        "imageHeight": first_meta.get("imageHeight", 0),
        # Per-language partitions: empty strings if any page had no words in
        # that script (frontend falls back to the single-block merged view).
        "nepaliText": merged_nepali,
        "englishText": merged_english,
    }


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
