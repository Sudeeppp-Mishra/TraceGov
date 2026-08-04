"""
TraceGov Computer Vision & Preprocessing Pipeline
- Deskewing (rotation correction via minAreaRect)
- Denoising & Adaptive Thresholding / Contrast Enhancement
- Document Contour Detection & Perspective Crop
- Blur, Darkness, and Readability Quality Inspection
"""

from __future__ import annotations

import io
from typing import Any

import cv2
import numpy as np
from PIL import Image


def bytes_to_cv(image_bytes: bytes) -> np.ndarray:
    """Convert raw image bytes to an OpenCV BGR numpy array."""
    pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    cv_img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
    return cv_img


def cv_to_bytes(cv_img: np.ndarray, format: str = "PNG") -> bytes:
    """Convert an OpenCV image back to bytes."""
    rgb_img = cv2.cvtColor(cv_img, cv2.COLOR_BGR2RGB)
    pil_img = Image.fromarray(rgb_img)
    buffer = io.BytesIO()
    pil_img.save(buffer, format=format)
    return buffer.getvalue()


def deskew_image(cv_img: np.ndarray) -> tuple[np.ndarray, float]:
    """
    Detect text skew angle using minimum area rectangle of non-zero pixels
    and rotate image back to horizontal alignment (up to +/- 45 degrees).
    """
    gray = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)
    # Invert grayscale for text contour detection
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    thresh = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]

    coords = np.column_stack(np.where(thresh > 0))
    if coords.shape[0] < 50:
        return cv_img, 0.0

    rect = cv2.minAreaRect(coords)
    angle = rect[-1]

    # Normalize angle to range [-45, 45]
    if angle < -45:
        angle = -(90 + angle)
    elif angle > 45:
        angle = 90 - angle

    if abs(angle) < 0.5 or abs(angle) > 45.0:
        return cv_img, 0.0

    (h, w) = cv_img.shape[:2]
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    rotated = cv2.warpAffine(
        cv_img,
        M,
        (w, h),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REPLICATE,
    )
    return rotated, round(float(angle), 2)


def crop_document_bounds(cv_img: np.ndarray) -> np.ndarray:
    """
    Find largest 4-corner contour (document boundary) and apply perspective
    transformation to un-tilt document photo. Returns original image if no
    clear 4-corner boundary is found.
    """
    gray = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    edged = cv2.Canny(blur, 75, 200)

    contours, _ = cv2.findContours(edged, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return cv_img

    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:5]
    doc_cnt = None

    for c in contours:
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.02 * peri, True)
        if len(approx) == 4 and cv2.contourArea(c) > (cv_img.shape[0] * cv_img.shape[1] * 0.2):
            doc_cnt = approx
            break

    if doc_cnt is None:
        return cv_img

    pts = doc_cnt.reshape(4, 2)
    rect = np.zeros((4, 2), dtype="float32")

    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]  # top-left
    rect[2] = pts[np.argmax(s)]  # bottom-right

    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]  # top-right
    rect[3] = pts[np.argmax(diff)]  # bottom-left

    (tl, tr, br, bl) = rect
    widthA = np.sqrt(((br[0] - bl[0]) ** 2) + ((br[1] - bl[1]) ** 2))
    widthB = np.sqrt(((tr[0] - tl[0]) ** 2) + ((tr[1] - tl[1]) ** 2))
    maxWidth = max(int(widthA), int(widthB))

    heightA = np.sqrt(((tr[0] - br[0]) ** 2) + ((tr[1] - br[1]) ** 2))
    heightB = np.sqrt(((tl[0] - bl[0]) ** 2) + ((tl[1] - bl[1]) ** 2))
    maxHeight = max(int(heightA), int(heightB))

    dst = np.array(
        [
            [0, 0],
            [maxWidth - 1, 0],
            [maxWidth - 1, maxHeight - 1],
            [0, maxHeight - 1],
        ],
        dtype="float32",
    )

    M = cv2.getPerspectiveTransform(rect, dst)
    warped = cv2.warpPerspective(cv_img, M, (maxWidth, maxHeight))
    return warped


def inspect_image_quality(
    cv_img: np.ndarray, word_box_count: int | None = None
) -> dict[str, Any]:
    """
    Evaluate image blur (Laplacian variance), mean brightness, and text presence.
    Returns structured quality assessment object.
    """
    gray = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)

    # 1. Blur score via Laplacian variance
    lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    is_blurry = lap_var < 45.0  # Threshold under 45 indicates significant blur

    # 2. Luminance check
    mean_bright = float(np.mean(gray))
    is_dark = mean_bright < 35.0  # Threshold under 35 is severely underexposed

    # 3. Readability check
    no_text = word_box_count is not None and word_box_count == 0

    # Calculate overall quality score (0.0 to 1.0)
    blur_norm = min(1.0, lap_var / 300.0)
    bright_norm = min(1.0, mean_bright / 128.0) if mean_bright <= 128 else min(1.0, (255 - mean_bright) / 127.0 + 0.5)
    quality_score = round(0.6 * blur_norm + 0.4 * bright_norm, 2)

    issues = []
    if is_blurry:
        issues.append("Image is too blurry for reliable OCR extraction.")
    if is_dark:
        issues.append("Image is too dark or underexposed.")
    if no_text:
        issues.append("No readable text detected in the uploaded image.")

    issue_description = " ".join(issues) if issues else None

    return {
        "isBlurry": is_blurry,
        "isDark": is_dark,
        "noTextDetected": bool(no_text),
        "laplacianVariance": round(lap_var, 2),
        "meanBrightness": round(mean_bright, 2),
        "qualityScore": quality_score,
        "isQualityPassed": not (is_blurry or is_dark or no_text),
        "issueDescription": issue_description,
    }


def preprocess_image_pipeline(
    image_bytes: bytes,
) -> tuple[np.ndarray, float, dict[str, Any]]:
    """
    Full OpenCV preprocessing pipeline:
    Bytes -> CV array -> Deskew -> Crop Bounds -> Quality Inspection
    """
    cv_img = bytes_to_cv(image_bytes)

    # 1. Deskew
    cv_img, skew_angle = deskew_image(cv_img)

    # 2. Crop document bounds if prominent contour exists
    cv_img = crop_document_bounds(cv_img)

    # 3. Pre-OCR quality check
    pre_quality = inspect_image_quality(cv_img)

    return cv_img, skew_angle, pre_quality
