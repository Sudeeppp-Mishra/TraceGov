"""
TraceGov OCR & Document Classification Module
- EasyOCR Reader (Nepali + English)
- Text-Length Weighted Per-Word Detection Confidence
- Devanagari Skeleton Fuzzy Matcher
- ML Document Classifier (TF-IDF + Logistic Regression) with Heuristic Fallback
"""

from __future__ import annotations

import io
import os
import re
from pathlib import Path
from typing import Any

import numpy as np

from preprocessing import inspect_image_quality, preprocess_image_pipeline

_ocr_reader = None
_doc_classifier_model = None

DEVANAGARI_RE = re.compile(r"[ऀ-ॿ]")
DEVANAGARI_MARKS_RE = re.compile(r"[ऺ-ॏऀ-ः़ॕ-ॗॢॣ]")

DEFAULT_KEYWORDS = [
    "Certificate",
    "Tax Receipt",
    "Citizenship Certificate",
    "Recommendation Letter",
    "Stamp",
]

NEPALI_KEYWORD_ALIASES = {
    "certificate": ["प्रमाणपत्र", "प्रमाण-पत्र", "प्रमाण पत्र"],
    "citizenship": ["नागरिकता", "नागरिकताको प्रमाणपत्र"],
    "tax": ["कर", "राजस्व", "मालपोत"],
    "receipt": ["रसिद", "भरपाई"],
    "application": ["निवेदन", "दरखास्त"],
    "form": ["फारम", "फाराम"],
    "recommendation": ["सिफारिस", "सिफारिश"],
    "letter": ["पत्र"],
    "stamp": ["छाप", "टिकट", "दस्तखत"],
    "birth": ["जन्म", "जन्मदर्ता"],
    "marriage": ["विवाह", "विवाहदर्ता"],
    "land": ["जग्गा", "लालपुर्जा", "मालपोत"],
    "ownership": ["स्वामित्व", "लालपुर्जा"],
    "photo": ["फोटो", "तस्बिर"],
    "passport": ["राहदानी"],
    "business": ["व्यवसाय", "उद्योग"],
    "registration": ["दर्ता"],
    "ward": ["वडा"],
    "municipality": ["नगरपालिका", "गाउँपालिका", "महानगरपालिका"],
    "signature": ["दस्तखत", "सही"],
    "clearance": ["चुक्ता", "फरफारक"],
}


def get_ocr_reader():
    global _ocr_reader
    if _ocr_reader is None:
        import easyocr
        _ocr_reader = easyocr.Reader(["ne", "en"], gpu=False, verbose=False)
    return _ocr_reader


def load_doc_classifier_model():
    global _doc_classifier_model
    if _doc_classifier_model is None:
        model_path = Path(__file__).parent / "models" / "model_doc_classifier.joblib"
        if model_path.exists():
            import joblib
            try:
                _doc_classifier_model = joblib.load(model_path)
            except Exception:
                _doc_classifier_model = None
    return _doc_classifier_model


def devanagari_skeleton(text: str) -> str:
    """Lowercased text with Devanagari combining marks and spaces removed."""
    return DEVANAGARI_MARKS_RE.sub("", text.lower()).replace(" ", "")


def detect_script(text: str) -> dict[str, Any]:
    """Rough language mix of extracted text based on Devanagari script coverage."""
    letters = [ch for ch in text if ch.isalpha()]
    if not letters:
        return {"language": "unknown", "devanagariRatio": 0.0}
    devanagari = sum(1 for ch in letters if DEVANAGARI_RE.match(ch))
    ratio = devanagari / len(letters)
    if ratio > 0.6:
        language = "nepali"
    elif ratio > 0.15:
        language = "mixed"
    else:
        language = "english"
    return {"language": language, "devanagariRatio": round(ratio, 2)}


def keyword_aliases(keyword: str) -> list[str]:
    """Nepali alias strings that count as a match for this keyword."""
    normalized = keyword.lower()
    aliases: list[str] = []
    for fragment, nepali_terms in NEPALI_KEYWORD_ALIASES.items():
        if fragment in normalized:
            aliases.extend(nepali_terms)
    return aliases


def term_matches(term: str, normalized_text: str, skeleton_text: str) -> bool:
    """True if term appears in text, comparing Devanagari skeletons for 3+ letter words."""
    term_lower = term.lower()
    if term_lower in normalized_text:
        return True
    if DEVANAGARI_RE.search(term):
        term_skeleton = devanagari_skeleton(term)
        return len(term_skeleton) >= 3 and term_skeleton in skeleton_text
    return False


def classify_document_ml_or_heuristic(text: str) -> dict[str, Any]:
    """
    Classify document type using trained ML classifier if available,
    otherwise falling back to keyword scoring.
    """
    if not text.trim() if hasattr(text, 'trim') else not text.strip():
        return {
            "documentType": "Unknown",
            "classificationConfidence": 0.0,
            "classificationSource": "heuristic_fallback",
        }

    model = load_doc_classifier_model()
    if model is not None:
        try:
            pipeline = model["pipeline"]
            probs = pipeline.predict_proba([text])[0]
            classes = pipeline.classes_
            best_idx = int(np.argmax(probs))
            best_label = str(classes[best_idx])
            confidence = float(probs[best_idx])
            return {
                "documentType": best_label,
                "classificationConfidence": round(confidence, 2),
                "classificationSource": "trained_model",
            }
        except Exception:
            pass

    # Heuristic fallback
    labels = {
        "Certificate": ["certificate", "birth", "marriage", "registration",
                        "प्रमाणपत्र", "प्रमाण पत्र", "जन्म", "विवाह", "दर्ता"],
        "Tax Receipt": ["tax", "receipt", "revenue", "payment",
                        "कर", "रसिद", "राजस्व", "मालपोत", "भरपाई"],
        "Citizenship": ["citizenship", "citizen", "nationality", "id no",
                        "नागरिकता", "नेपाली नागरिक"],
        "Recommendation Letter": ["recommendation", "recommended", "ward chair", "letter",
                                  "सिफारिस", "सिफारिश", "वडा अध्यक्ष"],
        "Land Document": ["land", "ownership", "plot", "survey",
                          "जग्गा", "लालपुर्जा", "कित्ता", "नापी"],
        "Ward Form": ["ward", "form", "application", "municipality",
                      "वडा", "फारम", "निवेदन", "नगरपालिका", "गाउँपालिका"],
    }
    normalized = text.lower()
    skeleton = devanagari_skeleton(text)
    scores = {
        label: sum(1 for word in words if term_matches(word, normalized, skeleton))
        for label, words in labels.items()
    }
    best_label = max(scores, key=scores.get) if scores else "Unknown"
    best_score = scores.get(best_label, 0)
    confidence = min(0.96, 0.35 + best_score * 0.18) if best_score else 0.28
    return {
        "documentType": best_label if best_score else "Unknown",
        "classificationConfidence": round(confidence, 2),
        "scores": scores,
        "classificationSource": "heuristic_fallback",
    }


def check_keywords_with_confidence(
    text: str,
    keywords: list[str],
    easyocr_confidence: float | None = None,
) -> dict[str, Any]:
    normalized = text.lower()
    skeleton = devanagari_skeleton(text)
    found = []
    missing = []

    for kw in keywords:
        terms = [kw] + keyword_aliases(kw)
        if any(term_matches(t, normalized, skeleton) for t in terms):
            found.append(kw)
        else:
            missing.append(kw)

    completeness = len(found) / len(keywords) if keywords else 1.0

    # Real calibrated OCR confidence: combines actual EasyOCR detection confidence
    # (weighted by text length) with keyword completeness score.
    if easyocr_confidence is not None and easyocr_confidence > 0:
        calibrated_ocr_conf = round(0.6 * easyocr_confidence + 0.4 * completeness, 2)
    else:
        calibrated_ocr_conf = round(0.50 + completeness * 0.45, 2)

    return {
        "foundKeywords": found,
        "missingKeywords": missing,
        "highlightedMissingItems": [
            {"keyword": kw, "message": f"{kw} was not detected in the uploaded document."}
            for kw in missing
        ],
        "completenessScore": round(completeness, 2),
        "isComplete": len(missing) == 0,
        "ocrConfidence": min(0.98, calibrated_ocr_conf),
    }


def run_full_ocr_analysis(
    image_bytes: bytes | None = None,
    keywords: list[str] | None = None,
    detected_text: str | None = None,
) -> dict[str, Any]:
    keywords = keywords or DEFAULT_KEYWORDS

    if detected_text:
        text = detected_text
        easyocr_confidence = 0.85
        quality_info = {
            "isBlurry": False,
            "isDark": False,
            "noTextDetected": False,
            "qualityScore": 0.90,
            "isQualityPassed": True,
            "issueDescription": None,
        }
    elif image_bytes:
        cv_img, skew_angle, quality_info = preprocess_image_pipeline(image_bytes)

        reader = get_ocr_reader()
        raw_results = reader.readtext(cv_img, detail=1, paragraph=False)

        # Extract text boxes and text-length weighted confidence
        detected_parts = []
        total_len = 0
        weighted_conf_sum = 0.0

        for bbox, txt, prob in raw_results:
            txt_str = str(txt).strip()
            if txt_str:
                detected_parts.append(txt_str)
                length = len(txt_str)
                total_len += length
                weighted_conf_sum += length * float(prob)

        text = " ".join(detected_parts)
        easyocr_confidence = (
            weighted_conf_sum / total_len if total_len > 0 else 0.0
        )

        # Re-evaluate quality inspection with text box count
        quality_info = inspect_image_quality(cv_img, word_box_count=len(detected_parts))
    else:
        return {"error": "Provide imageBase64 or detectedText"}

    keyword_result = check_keywords_with_confidence(text, keywords, easyocr_confidence)
    classification = classify_document_ml_or_heuristic(text)
    script_info = detect_script(text)

    return {
        **keyword_result,
        **classification,
        "detectedLanguage": script_info["language"],
        "devanagariRatio": script_info["devanagariRatio"],
        "rawOCRConfidence": round(easyocr_confidence, 2) if easyocr_confidence else 0.0,
        "imageQualityIssue": quality_info,
        "extractedTextPreview": text[:500] if text else "",
        "keywordCount": len(keywords),
    }
