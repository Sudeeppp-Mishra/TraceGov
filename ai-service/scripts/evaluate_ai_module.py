"""
TraceGov AI Module Evaluation Script
=====================================

Measures real, reproducible quantitative results for the Results chapter:
  1. OCR + keyword-detection precision/recall/accuracy (synthetic test documents)
  2. M/M/1 completion-time estimates and rule-based risk scores across the same
     workflow-stage scenarios used in the demo seed data

Usage:
    Terminal 1:  cd ai-service && uvicorn main:app --reload --port 8000
    Terminal 2:  cd ai-service && python scripts/evaluate_ai_module.py

Optional: test against REAL scanned/photographed documents instead of the
built-in synthetic set (recommended before reporting final numbers, since
cleanly-rendered synthetic text is easier for OCR than a real scan):

    python scripts/evaluate_ai_module.py --samples-dir path/to/images --labels-file path/to/labels.json

labels.json format:
    {
      "doc1.jpg": {"expected_keywords": ["Certificate", "Citizenship"], "expected_type": "Citizenship"},
      "doc2.jpg": {"expected_keywords": ["Tax Receipt"], "expected_type": "Tax Receipt"}
    }

No extra dependencies beyond what's already in requirements.txt (Pillow, numpy);
HTTP calls use only the Python standard library.
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import statistics
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

AI_BASE_URL = "http://localhost:8000"
OUTPUT_FILE = Path(__file__).parent / "evaluation_results.json"

# The very first /analyze-document call on a fresh machine has to download
# EasyOCR's English + Nepali model weights before it can respond, which can
# take several minutes depending on connection speed. Subsequent calls in the
# same running uvicorn process are fast (models stay loaded in memory).
WARMUP_TIMEOUT_SECONDS = 300
NORMAL_TIMEOUT_SECONDS = 60

DEFAULT_KEYWORDS = [
    "Certificate",
    "Tax Receipt",
    "Citizenship",
    "Application Form",
    "Recommendation Letter",
    "Stamp",
]

# ---------------------------------------------------------------------------
# HTTP helpers (stdlib only — no extra dependency for a one-off test script)
# ---------------------------------------------------------------------------

def get_json(path: str, timeout: float = 10) -> dict:
    with urllib.request.urlopen(f"{AI_BASE_URL}{path}", timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def post_json(path: str, payload: dict, timeout: float = NORMAL_TIMEOUT_SECONDS) -> tuple[dict, float]:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{AI_BASE_URL}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    start = time.perf_counter()
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    elapsed_ms = (time.perf_counter() - start) * 1000
    return body, elapsed_ms


def fmt_list(items: list[str]) -> str:
    """Join a list into a display string; never pass a raw list to a format spec."""
    return ", ".join(items) if items else "-"


# ---------------------------------------------------------------------------
# Synthetic OCR test set
#
# Each document's ground truth ("expected_keywords" / "expected_type") was
# derived by tracing through the actual classify_document()/check_keywords()
# logic in main.py, not guessed — e.g. the Citizenship doc contains the exact
# phrase "Citizenship Certificate", which legitimately matches both the
# "Certificate" and "Citizenship" checklist keywords, and scores highest
# against the Citizenship label's keyword list.
# ---------------------------------------------------------------------------

SYNTHETIC_DOCS = [
    {
        "name": "certificate_sample_en",
        "lines": ["BIRTH CERTIFICATE", "Government of Nepal", "Ward No. 4", "Certificate No: 88213"],
        "expected_keywords": ["Certificate"],
        "expected_type": "Certificate",
    },
    {
        "name": "certificate_sample_np",
        "lines": ["जन्मदर्ता प्रमाणपत्र", "नेपाल सरकार", "वडा नं ४", "प्रमाणपत्र नं: ८८२१३"],
        "expected_keywords": ["Certificate"],
        "expected_type": "Certificate",
    },
    {
        "name": "tax_receipt_sample_en",
        "lines": ["TAX RECEIPT", "Municipality Revenue Office", "Amount Paid: Rs. 5000", "Payment Confirmed"],
        "expected_keywords": ["Tax Receipt"],
        "expected_type": "Tax Receipt",
    },
    {
        "name": "tax_receipt_sample_np",
        "lines": ["मालपोत तथा कर रसिद", "नगरपालिका राजस्व शाखा", "रकम भुक्तानी चुक्ता भरपाई"],
        "expected_keywords": ["Tax Receipt"],
        "expected_type": "Tax Receipt",
    },
    {
        "name": "citizenship_sample_en",
        "lines": ["CITIZENSHIP CERTIFICATE", "Government of Nepal", "Citizenship No: 10-01-77-04521", "Nationality: Nepali"],
        "expected_keywords": ["Certificate", "Citizenship"],
        "expected_type": "Citizenship",
    },
    {
        "name": "citizenship_sample_np",
        "lines": ["नेपाली नागरिकताको प्रमाणपत्र", "नेपाल सरकार", "नागरिकता नं: १०-०१-७७-०४५२१", "जिल्ला प्रशासन कार्यालय"],
        "expected_keywords": ["Certificate", "Citizenship"],
        "expected_type": "Citizenship",
    },
    {
        "name": "recommendation_letter_sample_en",
        "lines": ["RECOMMENDATION LETTER", "Office of the Ward Chair", "This is to certify the recommendation", "Ward Chair Signature"],
        "expected_keywords": ["Recommendation Letter"],
        "expected_type": "Recommendation Letter",
    },
    {
        "name": "recommendation_letter_sample_np",
        "lines": ["वडा अध्यक्षको सिफारिस पत्र", "कार्यालय वडा नं १", "सिफारिस गरिएको प्रमाणित गरिन्छ", "वडा अध्यक्ष दस्तखत"],
        "expected_keywords": ["Recommendation Letter"],
        "expected_type": "Recommendation Letter",
    },
    {
        "name": "land_document_sample_en",
        "lines": ["LAND OWNERSHIP CERTIFICATE", "Plot Survey Record", "Ownership Transfer", "Land Revenue Office"],
        "expected_keywords": ["Certificate"],
        "expected_type": "Land Document",
    },
    {
        "name": "land_document_sample_np",
        "lines": ["जग्गा धनी प्रमाण पुर्जा", "लालपुर्जा कित्ता नं ५०२", "नापी कार्यालय जग्गा स्वामित्व"],
        "expected_keywords": ["Certificate"],
        "expected_type": "Land Document",
    },
    {
        "name": "ward_form_sample_en",
        "lines": ["WARD APPLICATION FORM", "Municipality Office", "Application Form No: 221", "Ward No: 7"],
        "expected_keywords": ["Application Form"],
        "expected_type": "Ward Form",
    },
    {
        "name": "ward_form_sample_np",
        "lines": ["वडा कार्यालय निवेदन फारम", "नगरपालिका फाराम नं २२१", "निवेदन दर्ता"],
        "expected_keywords": ["Application Form"],
        "expected_type": "Ward Form",
    },
    {
        "name": "marriage_cert_np",
        "lines": ["विवाह दर्ता प्रमाणपत्र", "स्थानीय पञ्जिकाधिकारीको कार्यालय", "विवाह दर्ता कित्ता"],
        "expected_keywords": ["Certificate"],
        "expected_type": "Certificate",
    },
    {
        "name": "business_reg_np",
        "lines": ["व्यवसाय दर्ता प्रमाणपत्र", "घरेलु तथा साना उद्योग कार्यालय", "दर्ता रसिद"],
        "expected_keywords": ["Certificate", "Tax Receipt"],
        "expected_type": "Certificate",
    },
    {
        "name": "ward_clearance_np",
        "lines": ["वडा कर चुक्ता प्रमाण", "राजस्व चुक्ता रसिद वडा नं २", "कर चुक्ता भरपाई"],
        "expected_keywords": ["Tax Receipt"],
        "expected_type": "Tax Receipt",
    },
    {
        "name": "photo_id_np",
        "lines": ["तस्बिर सहितको नागरिकता", "नेपाल सरकार राष्ट्रिय परिचयपत्र"],
        "expected_keywords": ["Citizenship"],
        "expected_type": "Citizenship",
    },
    {
        "name": "recommendation_building_np",
        "lines": ["घर कायम सिफारिस पत्र", "वडा कार्यालय नक्सा पास सिफारिस"],
        "expected_keywords": ["Recommendation Letter"],
        "expected_type": "Recommendation Letter",
    },
    {
        "name": "lalpurja_copy_np",
        "lines": ["नेपाल सरकार भूमि सुधार", "जग्गा स्वामित्व लालपुर्जा प्रतिलिपि"],
        "expected_keywords": ["Certificate"],
        "expected_type": "Land Document",
    },
    {
        "name": "ward_application_general",
        "lines": ["APPLICATION FOR WARD RECOMMENDATION", "To the Ward Chairman", "Formal Request Letter"],
        "expected_keywords": ["Application Form", "Recommendation Letter"],
        "expected_type": "Ward Form",
    },
    {
        "name": "tax_payment_voucher",
        "lines": ["TAX PAYMENT VOUCHER", "Revenue Receipt Copy", "Amount Received Rs 1200"],
        "expected_keywords": ["Tax Receipt"],
        "expected_type": "Tax Receipt",
    },
    {
        "name": "birth_registration_form",
        "lines": ["BIRTH REGISTRATION APPLICATION FORM", "Local Registrar Office"],
        "expected_keywords": ["Application Form", "Certificate"],
        "expected_type": "Certificate",
    },
    {
        "name": "citizenship_recommendation_np",
        "lines": ["नागरिकता सिफारिस पत्र", "वडा अध्यक्षको सिफारिस नागरिकताका लागि"],
        "expected_keywords": ["Citizenship", "Recommendation Letter"],
        "expected_type": "Citizenship",
    },
    {
        "name": "land_tax_receipt_np",
        "lines": ["मालपोत जग्गा कर रसिद", "भूमिकर असुली भरपाई रसिद"],
        "expected_keywords": ["Tax Receipt"],
        "expected_type": "Tax Receipt",
    },
    {
        "name": "character_certificate_np",
        "lines": ["चारित्रिक प्रमाणपत्र", "वडा कार्यालय चरित्र सिफारिस पत्र"],
        "expected_keywords": ["Certificate", "Recommendation Letter"],
        "expected_type": "Certificate",
    },
    {
        "name": "noise_sample_1",
        "lines": ["GROCERY SHOPPING LIST", "Milk Eggs Bread Rice", "Buy tomorrow at market", "Random unrelated note"],
        "expected_keywords": [],
        "expected_type": "Unknown",
    },
    {
        "name": "noise_sample_2",
        "lines": ["MEETING MINUTES DRAFT", "Project update discussion", "Coffee break at 3 PM"],
        "expected_keywords": [],
        "expected_type": "Unknown",
    },
]


def load_font(size: int = 30) -> ImageFont.ImageFont:
    """Best-effort scalable font lookup, falling back to Pillow's built-in
    default bitmap font if no TrueType font can be found on this machine."""
    candidates = [
        "DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "C:\\Windows\\Fonts\\arialbd.ttf",
        "Arial.ttf",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except Exception:
            continue
    try:
        return ImageFont.load_default(size=size)  # Pillow >= 9.2
    except TypeError:
        return ImageFont.load_default()


def make_test_image_base64(lines: list[str]) -> str:
    """Render lines of text onto a white canvas and return it as a base64 PNG,
    matching the imageBase64 input shape /analyze-document expects."""
    font = load_font(30)
    width, height = 700, 90 + 50 * len(lines)
    image = Image.new("RGB", (width, height), color="white")
    draw = ImageDraw.Draw(image)
    y = 30
    for line in lines:
        draw.text((30, y), line, fill="black", font=font)
        y += 50
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def warm_up_ocr() -> None:
    """Fire one throwaway OCR request with a long timeout so the (possibly
    multi-minute) first-time model download/load happens here, with a clear
    message, rather than silently timing out on the first real test document."""
    print("Warming up OCR models (first run may download model weights — this can take a few minutes)...")
    warm_image = make_test_image_base64(["WARM UP"])
    start = time.perf_counter()
    try:
        post_json(
            "/analyze-document",
            {"imageBase64": warm_image, "requiredKeywords": ["Certificate"]},
            timeout=WARMUP_TIMEOUT_SECONDS,
        )
        print(f"OCR models ready ({time.perf_counter() - start:.1f}s).")
    except (urllib.error.URLError, TimeoutError) as exc:
        print(f"WARNING: warm-up request did not complete cleanly ({exc}).")
        print("Check the uvicorn terminal for download/error output before continuing.")


def run_ocr_evaluation(samples_dir: str | None, labels_file: str | None) -> dict:
    print("\n=== OCR / Keyword Detection Evaluation ===")

    if samples_dir and labels_file:
        print(f"Using real sample documents from: {samples_dir}")
        labels = json.loads(Path(labels_file).read_text())
        docs = []
        for filename, meta in labels.items():
            image_bytes = Path(samples_dir, filename).read_bytes()
            docs.append({
                "name": filename,
                "image_b64": base64.b64encode(image_bytes).decode("ascii"),
                "expected_keywords": meta["expected_keywords"],
                "expected_type": meta["expected_type"],
            })
    else:
        print("Using built-in synthetic test documents (clean, computer-rendered text).")
        print("NOTE: synthetic text is easier for OCR than a real scan/photo — treat these")
        print("      numbers as a pipeline sanity check, not a real-world accuracy claim.")
        docs = [
            {**d, "image_b64": make_test_image_base64(d["lines"])}
            for d in SYNTHETIC_DOCS
        ]

    rows = []
    latencies = []
    tp_total = fp_total = fn_total = 0
    type_correct = 0

    for doc in docs:
        payload = {"imageBase64": doc["image_b64"], "requiredKeywords": DEFAULT_KEYWORDS}
        try:
            resp, ms = post_json(payload=payload, path="/analyze-document")
        except (urllib.error.URLError, TimeoutError) as exc:
            print(f"  [SKIP] {doc['name']}: request failed ({exc})")
            continue

        found = set(resp.get("foundKeywords", []))
        expected = set(doc["expected_keywords"])
        tp = len(found & expected)
        fp = len(found - expected)
        fn = len(expected - found)
        tp_total += tp
        fp_total += fp
        fn_total += fn
        latencies.append(ms)

        is_type_correct = resp.get("documentType") == doc["expected_type"]
        type_correct += int(is_type_correct)

        rows.append({
            "name": doc["name"],
            "expected_keywords": sorted(expected),
            "found_keywords": sorted(found),
            "expected_type": doc["expected_type"],
            "detected_type": resp.get("documentType"),
            "type_correct": is_type_correct,
            "latency_ms": round(ms, 1),
        })
        print(
            f"  {doc['name']:30s} "
            f"expected={fmt_list(sorted(expected)):<28} "
            f"found={fmt_list(sorted(found)):<28} "
            f"type={resp.get('documentType')} "
            f"({'OK' if is_type_correct else 'WRONG'})  {ms:.0f} ms"
        )

    precision = tp_total / (tp_total + fp_total) if (tp_total + fp_total) else None
    recall = tp_total / (tp_total + fn_total) if (tp_total + fn_total) else None
    type_accuracy = type_correct / len(rows) if rows else None

    summary = {
        "documents_tested": len(rows),
        "keyword_precision": round(precision, 3) if precision is not None else None,
        "keyword_recall": round(recall, 3) if recall is not None else None,
        "document_type_accuracy": round(type_accuracy, 3) if type_accuracy is not None else None,
        "avg_latency_ms": round(statistics.mean(latencies), 1) if latencies else None,
        "rows": rows,
    }

    print("\n--- OCR Summary ---")
    print(f"Documents tested:            {summary['documents_tested']}")
    print(f"Keyword detection precision: {summary['keyword_precision']}")
    print(f"Keyword detection recall:    {summary['keyword_recall']}")
    print(f"Document-type accuracy:      {summary['document_type_accuracy']}")
    print(f"Average OCR latency (ms):    {summary['avg_latency_ms']}")
    return summary


# ---------------------------------------------------------------------------
# M/M/1 completion estimate + risk scoring, across demo-style workflow stages
# ---------------------------------------------------------------------------

def hours_ago_iso(hours: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()


SCENARIOS = [
    {
        "name": "Freshly registered file (1 movement)",
        "steps": [("Received", 1)],
        "required_docs": ["Citizenship Certificate Copy"],
        "submitted_docs": ["Citizenship Certificate Copy"],
        "queue_length": 1,
    },
    {
        "name": "Mid-workflow file (3 movements)",
        "steps": [("Received", 50), ("Pending", 26), ("Pending", 2)],
        "required_docs": ["Application Form", "Tax Clearance Certificate", "Recommendation Letter"],
        "submitted_docs": ["Application Form"],
        "queue_length": 4,
    },
    {
        "name": "Long-running / backtracked file (5+ movements)",
        "steps": [("Received", 90), ("Pending", 70), ("Pending", 40), ("Backtracked", 20), ("Pending", 2)],
        "required_docs": ["Land Ownership Certificate", "Tax Clearance Certificate", "Citizenship Certificate Copy"],
        "submitted_docs": ["Land Ownership Certificate"],
        "queue_length": 6,
    },
]


def run_queueing_and_risk_evaluation() -> list[dict]:
    print("\n=== M/M/1 Completion Estimate + Risk Scoring Evaluation ===")
    results = []

    for scenario in SCENARIOS:
        movement_data = [
            {"action": action, "timestamp": hours_ago_iso(h), "location": "Reception"}
            for action, h in scenario["steps"]
        ]

        try:
            estimate, ms1 = post_json(
                "/estimate-completion",
                {"movementData": movement_data, "remainingSteps": 2},
            )
            risk, ms2 = post_json(
                "/predict-delay",
                {
                    "currentStatus": scenario["steps"][-1][0],
                    "requiredDocuments": scenario["required_docs"],
                    "submittedDocuments": scenario["submitted_docs"],
                    "movementData": movement_data,
                    "departmentQueueLength": scenario["queue_length"],
                },
            )
        except (urllib.error.URLError, TimeoutError) as exc:
            print(f"  [SKIP] {scenario['name']}: request failed ({exc})")
            continue

        row = {
            "scenario": scenario["name"],
            "sample_size": len(movement_data),
            "estimated_minutes_remaining": estimate.get("estimatedMinutesRemaining"),
            "estimate_confidence": estimate.get("confidence"),
            "delay_probability": risk.get("delayProbability"),
            "expected_processing_hours": risk.get("expectedProcessingHours"),
            "latency_ms": round(ms1 + ms2, 1),
        }
        results.append(row)
        print(
            f"  {scenario['name']:45s} "
            f"wait={row['estimated_minutes_remaining']:>5} min "
            f"(conf={row['estimate_confidence']:<6})  "
            f"delayProb={row['delay_probability']:>3}%  "
            f"{row['latency_ms']:.0f} ms"
        )

    return results


# ---------------------------------------------------------------------------
# LaTeX-ready output (mirrors the tables in results_chapter.tex)
# ---------------------------------------------------------------------------

def print_latex_rows(ocr_summary: dict, queueing_results: list[dict]) -> None:
    print("\n=== Copy-paste rows for results_chapter.tex ===\n")
    print("% --- OCR and keyword-detection table ---")
    print(f"Number of test documents & {ocr_summary['documents_tested']} \\\\")
    print(f"Keyword detection precision & {ocr_summary['keyword_precision']} \\\\")
    print(f"Keyword detection recall & {ocr_summary['keyword_recall']} \\\\")
    print(f"Document-type classification accuracy & {ocr_summary['document_type_accuracy']} \\\\")
    print(f"Average OCR processing time per document & {ocr_summary['avg_latency_ms']} ms \\\\")

    print("\n% --- Completion-time estimate table ---")
    for row in queueing_results:
        print(f"{row['scenario']} & {row['sample_size']} & {row['estimated_minutes_remaining']} \\\\")


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate TraceGov's AI module and produce Results-chapter numbers.")
    parser.add_argument("--samples-dir", help="Folder of real scanned/photographed test documents")
    parser.add_argument("--labels-file", help="JSON ground-truth labels for --samples-dir")
    args = parser.parse_args()

    print(f"Checking AI service at {AI_BASE_URL} ...")
    try:
        health = get_json("/health")
        print(f"AI service is up: {health}")
    except (urllib.error.URLError, TimeoutError) as exc:
        print(f"ERROR: could not reach the AI service at {AI_BASE_URL}.")
        print("Make sure it's running first: uvicorn main:app --reload --port 8000")
        print(f"Details: {exc}")
        sys.exit(1)

    warm_up_ocr()

    ocr_summary = run_ocr_evaluation(args.samples_dir, args.labels_file)
    queueing_results = run_queueing_and_risk_evaluation()

    OUTPUT_FILE.write_text(json.dumps(
        {"ocr": ocr_summary, "queueing_and_risk": queueing_results},
        indent=2,
    ))
    print(f"\nFull raw results saved to: {OUTPUT_FILE}")

    print_latex_rows(ocr_summary, queueing_results)


if __name__ == "__main__":
    main()