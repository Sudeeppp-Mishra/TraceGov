"""
TraceGov Citizen Name Verification Module
- Exact substring match (case-insensitive)
- Token-level fuzzy match via Levenshtein ratio
- Devanagari skeleton match for Nepali names
- Returns structured match result with confidence scoring

Used to verify that the citizen's name (entered by the officer at registration)
appears on the scanned document — a strong identity signal independent of
keyword matching.
"""

from __future__ import annotations

import re
from typing import Any

# Inline Devanagari helpers to avoid circular import with ocr.py
DEVANAGARI_RE = re.compile(r"[ऀ-ॿ]")
DEVANAGARI_MARKS_RE = re.compile(r"[ऺ-ॏऀ-ः़ॕ-ॗॢॣ]")


def devanagari_skeleton(text: str) -> str:
    """Lowercased text with Devanagari combining marks and spaces removed."""
    return DEVANAGARI_MARKS_RE.sub("", text.lower()).replace(" ", "")


# ─── Levenshtein distance (no external dependency) ──────────────────────────

def _levenshtein(a: str, b: str) -> int:
    """Standard dynamic-programming Levenshtein edit distance."""
    if len(a) < len(b):
        return _levenshtein(b, a)
    if not b:
        return len(a)

    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a):
        curr = [i + 1]
        for j, cb in enumerate(b):
            ins = prev[j + 1] + 1
            dl = curr[j] + 1
            sub = prev[j] + (0 if ca == cb else 1)
            curr.append(min(ins, dl, sub))
        prev = curr
    return prev[-1]


def _levenshtein_ratio(a: str, b: str) -> float:
    """Similarity ratio: 1.0 = identical, 0.0 = completely different."""
    max_len = max(len(a), len(b))
    if max_len == 0:
        return 1.0
    return 1.0 - _levenshtein(a, b) / max_len


# ─── Tokenization helpers ───────────────────────────────────────────────────

_WHITESPACE_RE = re.compile(r"\s+")


def _tokenize(text: str) -> list[str]:
    """Split text into lowercase tokens, stripping punctuation."""
    cleaned = re.sub(r"[^\w\s]", "", text)
    return [t for t in _WHITESPACE_RE.split(cleaned.lower().strip()) if t]


def _tokenize_devanagari(text: str) -> list[str]:
    """Split Devanagari text into skeleton tokens."""
    tokens = _WHITESPACE_RE.split(text.strip())
    return [devanagari_skeleton(t) for t in tokens if t and DEVANAGARI_RE.search(t)]


# ─── Core verification ─────────────────────────────────────────────────────

def verify_citizen_name(
    ocr_text: str,
    english_name: str | None = None,
    nepali_name: str | None = None,
) -> dict[str, Any]:
    """
    Check if the citizen's name appears in the OCR-extracted text.

    Tries three strategies in order of confidence:
    1. Exact substring match (highest confidence)
    2. Token-level fuzzy match (handles OCR typos)
    3. Devanagari skeleton match (Nepali name)

    Parameters
    ----------
    ocr_text : str
        Full OCR-extracted text from the document.
    english_name : str | None
        Citizen's name in English (e.g. "Aarav Sharma").
    nepali_name : str | None
        Citizen's name in Devanagari (e.g. "आरव शर्मा").

    Returns
    -------
    dict with keys:
        nameFound       : bool
        matchedName     : str | None  (the fragment that matched)
        matchConfidence : float (0.0 - 1.0)
        matchType       : 'exact' | 'fuzzy' | 'devanagari' | 'not_found'
    """
    if not ocr_text or (not english_name and not nepali_name):
        print(f"[NAME_VERIFY] Early return: ocr_text={bool(ocr_text)}, english={english_name}, nepali={nepali_name}")
        return _no_match()

    ocr_lower = ocr_text.lower()
    ocr_tokens = _tokenize(ocr_text)

    print(f"[NAME_VERIFY] english_name={english_name!r}, nepali_name={nepali_name!r}")
    print(f"[NAME_VERIFY] OCR text length={len(ocr_text)}, first 200 chars: {ocr_text[:200]!r}")

    # ── Strategy 1: Exact substring match (English) ────────────────────
    if english_name:
        name_lower = english_name.strip().lower()
        if name_lower and name_lower in ocr_lower:
            print(f"[NAME_VERIFY] Strategy 1 HIT: exact English match")
            return {
                "nameFound": True,
                "matchedName": english_name.strip(),
                "matchConfidence": 0.98,
                "matchType": "exact",
            }

    # ── Strategy 2: Exact substring match (Nepali) ─────────────────────
    if nepali_name:
        nepali_clean = nepali_name.strip()
        if nepali_clean and nepali_clean in ocr_text:
            print(f"[NAME_VERIFY] Strategy 2 HIT: exact Nepali match")
            return {
                "nameFound": True,
                "matchedName": nepali_clean,
                "matchConfidence": 0.97,
                "matchType": "exact",
            }
        else:
            print(f"[NAME_VERIFY] Strategy 2 MISS: '{nepali_clean}' not found as exact substring")

    # ── Strategy 3: Token-level fuzzy match (English) ──────────────────
    if english_name:
        result = _fuzzy_token_match(english_name, ocr_tokens)
        if result:
            print(f"[NAME_VERIFY] Strategy 3 HIT: fuzzy English match")
            return result

    # ── Strategy 4: Devanagari skeleton match (Nepali) ─────────────────
    if nepali_name:
        result = _devanagari_match(nepali_name, ocr_text)
        if result:
            print(f"[NAME_VERIFY] Strategy 4 HIT: skeleton match")
            return result
        else:
            # Debug: show what skeletons look like
            name_skel = devanagari_skeleton(nepali_name)
            text_skel = devanagari_skeleton(ocr_text)
            print(f"[NAME_VERIFY] Strategy 4 MISS: name_skeleton={name_skel!r} (len={len(name_skel)})")
            print(f"[NAME_VERIFY] Strategy 4 MISS: text_skeleton first 300: {text_skel[:300]!r}")
            print(f"[NAME_VERIFY] Strategy 4 MISS: name_skeleton in text_skeleton = {name_skel in text_skel}")

    # ── Strategy 5: Token-level fuzzy on Nepali (handles OCR noise) ────
    if nepali_name:
        ocr_dev_tokens = _tokenize_devanagari(ocr_text)
        name_dev_tokens = _tokenize_devanagari(nepali_name)
        if name_dev_tokens and ocr_dev_tokens:
            matched_count = 0
            best_ratio = 0.0
            for nt in name_dev_tokens:
                if len(nt) < 2:
                    continue
                for ot in ocr_dev_tokens:
                    ratio = _levenshtein_ratio(nt, ot)
                    if ratio >= 0.75:
                        matched_count += 1
                        best_ratio = max(best_ratio, ratio)
                        break

            if matched_count > 0 and matched_count >= len(name_dev_tokens) * 0.5:
                confidence = min(0.92, 0.55 + best_ratio * 0.35)
                return {
                    "nameFound": True,
                    "matchedName": nepali_name.strip(),
                    "matchConfidence": round(confidence, 2),
                    "matchType": "devanagari",
                }

    return _no_match()


def _fuzzy_token_match(
    english_name: str, ocr_tokens: list[str]
) -> dict[str, Any] | None:
    """
    Match individual name tokens against OCR tokens using Levenshtein ratio.
    At least 50% of name tokens must match at ≥0.80 ratio.
    """
    name_tokens = _tokenize(english_name)
    if not name_tokens:
        return None

    matched_count = 0
    total_ratio = 0.0
    matched_fragments: list[str] = []

    for nt in name_tokens:
        if len(nt) < 2:
            # Skip single-char tokens (initials are too noisy)
            matched_count += 1
            total_ratio += 1.0
            continue

        best_ratio = 0.0
        best_token = ""
        for ot in ocr_tokens:
            ratio = _levenshtein_ratio(nt, ot)
            if ratio > best_ratio:
                best_ratio = ratio
                best_token = ot

        if best_ratio >= 0.80:
            matched_count += 1
            total_ratio += best_ratio
            matched_fragments.append(best_token)

    if matched_count == 0 or matched_count < len(name_tokens) * 0.5:
        return None

    avg_ratio = total_ratio / len(name_tokens) if name_tokens else 0
    confidence = min(0.95, 0.50 + avg_ratio * 0.45)

    return {
        "nameFound": True,
        "matchedName": " ".join(matched_fragments) if matched_fragments else english_name.strip(),
        "matchConfidence": round(confidence, 2),
        "matchType": "fuzzy",
    }


def _devanagari_match(
    nepali_name: str, ocr_text: str
) -> dict[str, Any] | None:
    """
    Match Nepali name using Devanagari skeleton (combining marks stripped).
    """
    name_skeleton = devanagari_skeleton(nepali_name)
    if len(name_skeleton) < 3:
        return None

    text_skeleton = devanagari_skeleton(ocr_text)
    if name_skeleton in text_skeleton:
        return {
            "nameFound": True,
            "matchedName": nepali_name.strip(),
            "matchConfidence": 0.90,
            "matchType": "devanagari",
        }

    return None


def _no_match() -> dict[str, Any]:
    """Return a clean 'name not found' result."""
    return {
        "nameFound": False,
        "matchedName": None,
        "matchConfidence": 0.0,
        "matchType": "not_found",
    }
