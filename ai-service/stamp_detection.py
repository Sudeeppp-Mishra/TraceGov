"""
TraceGov Government Stamp / Seal Detection Module
- HSV color segmentation for red and blue official stamps
- Morphological cleanup to fill gaps in stamp ring patterns
- Contour filtering by area, circularity, and bounding dimensions
- Returns structured detection result with confidence scoring

Nepali government documents typically carry circular red or blue stamps
(sometimes both). This module detects them as a strong completeness signal
independent of OCR text extraction.
"""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np


# ─── HSV thresholds ─────────────────────────────────────────────────────────
# Red hue wraps around 0° in HSV, so we need two ranges.
# Saturation and value are kept deliberately low to catch faded ward-office stamps.

RED_RANGES = [
    # Lower red: hue 0-10
    (np.array([0, 70, 50]), np.array([10, 255, 255])),
    # Upper red: hue 160-180
    (np.array([160, 70, 50]), np.array([180, 255, 255])),
]

BLUE_RANGES = [
    # Blue: hue 100-130
    (np.array([100, 70, 50]), np.array([130, 255, 255])),
]

# Minimum contour area in pixels² (filters out noise dots)
MIN_STAMP_AREA = 400

# Maximum stamp area as a fraction of total image area (stamps are never >25%)
MAX_STAMP_AREA_RATIO = 0.25

# Circularity threshold: 4π·area / perimeter² — perfect circle = 1.0
# Government stamps are usually circular or nearly circular (>0.25 catches
# slightly irregular / partial stamps)
MIN_CIRCULARITY = 0.25

# Morphological kernel size for closing gaps in stamp ring patterns
MORPH_KERNEL_SIZE = 7


def _create_color_mask(
    hsv_img: np.ndarray,
    ranges: list[tuple[np.ndarray, np.ndarray]],
) -> np.ndarray:
    """Create a combined binary mask for one or more HSV ranges."""
    mask = np.zeros(hsv_img.shape[:2], dtype=np.uint8)
    for lower, upper in ranges:
        mask = cv2.bitwise_or(mask, cv2.inRange(hsv_img, lower, upper))
    return mask


def _clean_mask(mask: np.ndarray) -> np.ndarray:
    """Morphological close → open to fill stamp ring gaps and remove noise."""
    kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (MORPH_KERNEL_SIZE, MORPH_KERNEL_SIZE)
    )
    # Close: fill internal gaps in stamp ring
    cleaned = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    # Open: remove small noise specks
    cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_OPEN, kernel, iterations=1)
    return cleaned


def _find_stamp_contours(
    mask: np.ndarray,
    max_area: float,
) -> list[dict[str, Any]]:
    """
    Find contours that look like stamp outlines:
    - Area between MIN_STAMP_AREA and max_area
    - Circularity above MIN_CIRCULARITY
    Returns list of stamp region dicts sorted by circularity (best first).
    """
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    stamps: list[dict[str, Any]] = []

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < MIN_STAMP_AREA or area > max_area:
            continue

        perimeter = cv2.arcLength(cnt, True)
        if perimeter == 0:
            continue

        circularity = (4 * np.pi * area) / (perimeter * perimeter)
        if circularity < MIN_CIRCULARITY:
            continue

        x, y, w, h = cv2.boundingRect(cnt)
        # Reject very elongated shapes (aspect ratio sanity check)
        aspect = max(w, h) / (min(w, h) + 1e-6)
        if aspect > 3.0:
            continue

        stamps.append({
            "area": int(area),
            "circularity": round(float(circularity), 3),
            "boundingBox": {"x": int(x), "y": int(y), "w": int(w), "h": int(h)},
        })

    stamps.sort(key=lambda s: s["circularity"], reverse=True)
    return stamps


def detect_government_stamp(cv_img: np.ndarray) -> dict[str, Any]:
    """
    Detect red and/or blue government stamps in a document image.

    Parameters
    ----------
    cv_img : np.ndarray
        BGR image (already preprocessed / deskewed).

    Returns
    -------
    dict with keys:
        stampDetected : bool
        stampColor    : 'red' | 'blue' | 'both' | None
        stampConfidence : float (0.0 - 1.0)
        stampCount    : int
        stampRegions  : list[dict]  (bounding box + circularity per stamp)
    """
    if cv_img is None or cv_img.size == 0:
        return _empty_result()

    h, w = cv_img.shape[:2]
    max_area = h * w * MAX_STAMP_AREA_RATIO

    # Convert to HSV
    hsv = cv2.cvtColor(cv_img, cv2.COLOR_BGR2HSV)

    # Detect red stamps
    red_mask = _clean_mask(_create_color_mask(hsv, RED_RANGES))
    red_stamps = _find_stamp_contours(red_mask, max_area)

    # Detect blue stamps
    blue_mask = _clean_mask(_create_color_mask(hsv, BLUE_RANGES))
    blue_stamps = _find_stamp_contours(blue_mask, max_area)

    # Tag each result with its color
    for s in red_stamps:
        s["color"] = "red"
    for s in blue_stamps:
        s["color"] = "blue"

    all_stamps = red_stamps + blue_stamps

    if not all_stamps:
        return _empty_result()

    # Determine dominant color
    has_red = len(red_stamps) > 0
    has_blue = len(blue_stamps) > 0
    if has_red and has_blue:
        stamp_color = "both"
    elif has_red:
        stamp_color = "red"
    else:
        stamp_color = "blue"

    # Confidence: best circularity score (most circle-like contour)
    best_circularity = max(s["circularity"] for s in all_stamps)
    # Scale confidence: circularity 0.25 → ~0.5, circularity 0.8+ → ~0.95
    confidence = min(0.98, 0.3 + best_circularity * 0.8)

    return {
        "stampDetected": True,
        "stampColor": stamp_color,
        "stampConfidence": round(confidence, 2),
        "stampCount": len(all_stamps),
        "stampRegions": all_stamps[:5],  # cap at 5 regions to keep response lean
    }


def _empty_result() -> dict[str, Any]:
    """Return a clean 'no stamp found' result."""
    return {
        "stampDetected": False,
        "stampColor": None,
        "stampConfidence": 0.0,
        "stampCount": 0,
        "stampRegions": [],
    }
