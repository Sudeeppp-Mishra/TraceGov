"""
TraceGov Machine Learning Prediction Engine
- Completion Time Regressor (HistGradientBoostingRegressor)
- Delay/Backtrack Risk Classifier (CalibratedClassifierCV)
- Feature Engineering & Dual-Path Model Serving (Synthetic vs Real vs Heuristic)
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np

_completion_model = None
_risk_model = None
_model_metadata = None


def load_ml_models() -> tuple[Any, Any, dict[str, Any] | None]:
    global _completion_model, _risk_model, _model_metadata
    models_dir = Path(__file__).parent / "models"

    comp_path = models_dir / "model_completion.joblib"
    risk_path = models_dir / "model_risk.joblib"
    meta_path = models_dir / "model_card.json"

    if _completion_model is None and comp_path.exists():
        import joblib
        try:
            _completion_model = joblib.load(comp_path)
        except Exception:
            _completion_model = None

    if _risk_model is None and risk_path.exists():
        import joblib
        try:
            _risk_model = joblib.load(risk_path)
        except Exception:
            _risk_model = None

    if _model_metadata is None and meta_path.exists():
        import json
        try:
            _model_metadata = json.loads(meta_path.read_text())
        except Exception:
            _model_metadata = None

    return _completion_model, _risk_model, _model_metadata


def extract_features(
    required_docs: list[str],
    submitted_docs: list[str],
    movement_data: list[Any],
    queue_length: int = 0,
    current_status: str = "Pending",
) -> dict[str, float]:
    """Engineered feature vector for ML model inference."""
    missing = set(required_docs) - set(submitted_docs)
    missing_count = float(len(missing))
    total_required = float(len(required_docs)) if required_docs else 1.0
    submitted_ratio = float(len(submitted_docs)) / total_required

    backtrack_count = 0.0
    file_age_hours = 0.0

    if movement_data:
        backtrack_count = float(
            sum(
                1
                for item in movement_data
                if getattr(item, "action", "").lower() == "backtracked"
                or (isinstance(item, dict) and item.get("action", "").lower() == "backtracked")
            )
        )
        timestamps = []
        for item in movement_data:
            ts = getattr(item, "timestamp", None) or (item.get("timestamp") if isinstance(item, dict) else None)
            if ts:
                if isinstance(ts, str):
                    try:
                        ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                    except ValueError:
                        ts = None
                if ts:
                    timestamps.append(ts)

        if timestamps:
            timestamps.sort()
            now = datetime.now(timezone.utc)
            first_ts = timestamps[0]
            if first_ts.tzinfo is None:
                first_ts = first_ts.replace(tzinfo=timezone.utc)
            file_age_hours = max(0.0, (now - first_ts).total_seconds() / 3600.0)

    is_backtracked = 1.0 if current_status.lower() == "backtracked" else 0.0

    return {
        "missingDocumentCount": missing_count,
        "backtrackCount": backtrack_count,
        "departmentQueueLength": float(queue_length),
        "fileAgeHours": round(file_age_hours, 1),
        "submittedRatio": round(submitted_ratio, 2),
        "isBacktracked": is_backtracked,
        "movementStepCount": float(len(movement_data)),
    }


def predict_delay_ml(
    current_status: str = "Pending",
    current_location: str | None = None,
    required_documents: list[str] | None = None,
    submitted_documents: list[str] | None = None,
    movement_data: list[Any] | None = None,
    department_queue_length: int = 0,
) -> dict[str, Any]:
    required_docs = required_documents or []
    submitted_docs = submitted_documents or []
    movements = movement_data or []

    feats = extract_features(
        required_docs,
        submitted_docs,
        movements,
        department_queue_length,
        current_status,
    )

    comp_model, risk_model, metadata = load_ml_models()

    if comp_model is not None and risk_model is not None:
        try:
            feature_vector = np.array(
                [
                    [
                        feats["missingDocumentCount"],
                        feats["backtrackCount"],
                        feats["departmentQueueLength"],
                        feats["fileAgeHours"],
                        feats["submittedRatio"],
                        feats["isBacktracked"],
                        feats["movementStepCount"],
                    ]
                ]
            )

            # Predict processing hours (regression)
            pred_hours = float(comp_model.predict(feature_vector)[0])
            pred_hours = max(1.0, round(pred_hours, 1))

            # Predict delay probability (calibrated classification)
            pred_prob_raw = float(risk_model.predict_proba(feature_vector)[0][1])
            delay_prob = int(round(min(98.0, max(2.0, pred_prob_raw * 100.0))))

            model_ver = (metadata or {}).get("version", "v1.0.0-synthetic")
            pred_src = (metadata or {}).get("source", "trained_model_synthetic")

            confidence = "high" if len(movements) >= 3 else "medium"

            return {
                "completionDate": (datetime.now() + timedelta(hours=pred_hours)).isoformat(),
                "delayProbability": delay_prob,
                "expectedProcessingHours": pred_hours,
                "departmentDelay": current_location or "Unknown",
                "confidenceScore": confidence,
                "modelVersion": model_ver,
                "predictionSource": pred_src,
                "features": feats,
            }
        except Exception:
            pass

    # Heuristic Fallback
    missing_count = int(feats["missingDocumentCount"])
    backtrack_count = int(feats["backtrackCount"])

    risk_points = 12
    risk_points += min(35, missing_count * 12)
    risk_points += min(20, backtrack_count * 10)
    risk_points += min(18, department_queue_length * 2)
    risk_points += 18 if current_status.lower() == "backtracked" else 0
    risk_points += 12 if feats["fileAgeHours"] > 48 else 4 if feats["fileAgeHours"] > 24 else 0

    delay_prob = min(96, risk_points)
    expected_hours = max(
        2, round(4 + department_queue_length * 0.6 + missing_count * 3 + backtrack_count * 4)
    )

    return {
        "completionDate": (datetime.now() + timedelta(hours=expected_hours)).isoformat(),
        "delayProbability": delay_prob,
        "expectedProcessingHours": expected_hours,
        "departmentDelay": current_location or "Unknown",
        "confidenceScore": "medium" if movements else "low",
        "modelVersion": "v0.1.0-heuristic",
        "predictionSource": "heuristic_fallback",
        "features": feats,
    }


def estimate_completion_ml(
    movement_data: list[Any],
    mu: float | None,
    lam: float | None,
    remaining_steps: int,
) -> dict[str, Any]:
    """M/M/1 queuing estimate annotated with ML model serving metadata."""
    from main import mm1_estimate  # imported at route call time to prevent circular imports

    result = mm1_estimate(movement_data, mu, lam, remaining_steps)
    _, _, metadata = load_ml_models()

    model_ver = (metadata or {}).get("version", "v1.0.0-synthetic")
    pred_src = (metadata or {}).get("source", "trained_model_synthetic")

    result["modelVersion"] = model_ver
    result["predictionSource"] = pred_src
    return result


def smart_backtrack_ml(
    document_type: str | None,
    current_location: str | None,
    required_documents: list[str] | None,
    submitted_documents: list[str] | None,
    backtrack_reason: str | None,
    movement_data: list[Any] | None,
) -> dict[str, Any]:
    reqs = required_documents or []
    subs = submitted_documents or []
    missing = sorted(set(reqs) - set(subs))
    movements = movement_data or []

    reason = backtrack_reason or (
        f"Missing {', '.join(missing)}" if missing else "Incomplete verification details"
    )

    recommended_department = "Reception"
    if any("tax" in item.lower() for item in missing):
        recommended_department = "Tax Desk"
    elif any("citizen" in item.lower() for item in missing):
        recommended_department = "Verification Desk"

    similar_cases = sum(
        1
        for item in movements
        if getattr(item, "action", "").lower() == "backtracked"
        or (isinstance(item, dict) and item.get("action", "").lower() == "backtracked")
    )

    _, _, metadata = load_ml_models()
    model_ver = (metadata or {}).get("version", "v1.0.0-synthetic")
    pred_src = (metadata or {}).get("source", "trained_model_synthetic")

    return {
        "possibleReason": reason,
        "missingDocuments": missing,
        "requiredCorrections": [f"Attach or re-upload {doc}." for doc in missing]
        or ["Add a clear officer note and verify citizen details."],
        "historicalSimilarCases": similar_cases,
        "recommendedDepartment": recommended_department,
        "recommendation": f"Return to {recommended_department} with a citizen-friendly correction note.",
        "confidence": "high" if missing else "medium",
        "modelVersion": model_ver,
        "predictionSource": pred_src,
    }


def citizen_message_ml(
    current_status: str,
    current_location: str | None,
    required_documents: list[str] | None,
    submitted_documents: list[str] | None,
    movement_data: list[Any] | None,
    department_queue_length: int = 0,
) -> dict[str, Any]:
    prediction = predict_delay_ml(
        current_status=current_status,
        current_location=current_location,
        required_documents=required_documents,
        submitted_documents=submitted_documents,
        movement_data=movement_data,
        department_queue_length=department_queue_length,
    )

    location = current_location or "the responsible section"
    if current_status.lower() == "backtracked":
        message = "Your application needs one correction before it can continue."
    elif prediction["delayProbability"] > 65:
        message = f"Your application is under review in {location}. It may take a little longer than usual."
    else:
        message = f"Your application is currently under review in {location}."

    return {
        "message": message,
        "estimatedCompletion": f"Estimated completion within {max(1, round(prediction['expectedProcessingHours'] / 8))} working day(s).",
        "missingDocuments": sorted(
            set(required_documents or []) - set(submitted_documents or [])
        ),
        "modelVersion": prediction["modelVersion"],
        "predictionSource": prediction["predictionSource"],
    }
