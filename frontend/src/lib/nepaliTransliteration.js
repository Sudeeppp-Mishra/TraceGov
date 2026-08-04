/**
 * Romanized Nepali → Devanagari transliteration engine.
 *
 * Converts phonetic Latin input (e.g. "aarav sharma") into Devanagari
 * script (e.g. "आरव शर्मा") in real-time as the user types.
 *
 * Uses a raw-buffer approach: keystrokes are intercepted via onKeyDown,
 * accumulated in a romanized buffer (ref), and the entire buffer is
 * re-transliterated on every keystroke to produce the displayed value.
 */

import { useRef, useCallback } from 'react';

// ─── Transliteration Map ───────────────────────────────────────────────────

const CONJUNCTS = {
  ksh: 'क्ष', gya: 'ज्ञ', tra: 'त्र',
};

// Consonants: longest keys first so the engine picks the most specific match
const CONSONANTS_MAP = [
  // 4-char
  ['shha', 'ष'],
  // 3-char aspirated
  ['chh', 'छ'], ['thh', 'ठ'], ['dhh', 'ढ'], ['shh', 'ष'],
  ['kha', 'ख'], ['gha', 'घ'], ['cha', 'च'], ['jha', 'झ'],
  ['tha', 'थ'], ['dha', 'ध'], ['pha', 'फ'], ['bha', 'भ'],
  ['sha', 'श'], ['nga', 'ङ'], ['nya', 'ञ'], ['nna', 'ण'],
  // 2-char
  ['kh', 'ख्'], ['gh', 'घ्'], ['ch', 'च्'], ['jh', 'झ्'],
  ['th', 'थ्'], ['dh', 'ध्'], ['ph', 'फ्'], ['bh', 'भ्'],
  ['sh', 'श्'],
  // 2-char with inherent 'a'
  ['ka', 'क'], ['ga', 'ग'], ['ja', 'ज'],
  ['ta', 'त'], ['da', 'द'], ['na', 'न'],
  ['pa', 'प'], ['ba', 'ब'], ['ma', 'म'],
  ['ya', 'य'], ['ra', 'र'], ['la', 'ल'],
  ['wa', 'व'], ['va', 'व'], ['sa', 'स'], ['ha', 'ह'],
  // 1-char (half-consonant with virama)
  ['k', 'क्'], ['g', 'ग्'], ['j', 'ज्'],
  ['t', 'त्'], ['d', 'द्'], ['n', 'न्'],
  ['p', 'प्'], ['b', 'ब्'], ['m', 'म्'],
  ['y', 'य्'], ['r', 'र्'], ['l', 'ल्'],
  ['w', 'व्'], ['v', 'व्'], ['s', 'स्'], ['h', 'ह्'],
];

// Standalone vowels (when no consonant precedes)
const VOWELS_STANDALONE = [
  ['aau', 'आउ'],
  ['aa', 'आ'], ['ai', 'ऐ'], ['au', 'औ'],
  ['ee', 'ई'], ['oo', 'ऊ'], ['ou', 'ओउ'],
  ['a', 'अ'], ['i', 'इ'], ['u', 'उ'], ['e', 'ए'], ['o', 'ओ'],
];

// Vowel matras (attached to preceding consonant)
const VOWEL_MATRAS = [
  ['aa', 'ा'], ['ai', 'ै'], ['au', 'ौ'],
  ['ee', 'ी'], ['oo', 'ू'],
  ['a', ''],   // inherent vowel — no matra needed
  ['i', 'ि'], ['u', 'ु'], ['e', 'े'], ['o', 'ो'],
];

const DIGITS = {
  '0': '०', '1': '१', '2': '२', '3': '३', '4': '४',
  '5': '५', '6': '६', '7': '७', '8': '८', '9': '९',
};

const VIRAMA = '्';

function endsWithConsonant(text) {
  if (!text) return false;
  const last = text[text.length - 1];
  return last >= '\u0915' && last <= '\u0939';
}

function endsWithVirama(text) {
  if (!text) return false;
  return text[text.length - 1] === VIRAMA;
}

// ─── Core Transliteration ─────────────────────────────────────────────────

/**
 * Transliterate a full romanized Nepali string to Devanagari.
 */
export function transliterateToDevanagari(input) {
  if (!input) return '';

  let result = '';
  let i = 0;
  const lower = input.toLowerCase();

  while (i < lower.length) {
    const ch = lower[i];

    // Whitespace passes through
    if (ch === ' ' || ch === '\n' || ch === '\t') {
      result += ch;
      i++;
      continue;
    }

    // Digits
    if (DIGITS[ch]) {
      result += DIGITS[ch];
      i++;
      continue;
    }

    // Non a-z passes through
    if (ch < 'a' || ch > 'z') {
      result += input[i];
      i++;
      continue;
    }

    // Try conjuncts (longest match)
    let matched = false;
    for (const [key, val] of Object.entries(CONJUNCTS)) {
      if (lower.startsWith(key, i)) {
        if (endsWithVirama(result)) {
          result = result.slice(0, -1);
        }
        result += val;
        i += key.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // If previous output ends with a consonant or virama, try vowel matras first
    if (endsWithConsonant(result) || endsWithVirama(result)) {
      let vowelMatched = false;
      for (const [key, matra] of VOWEL_MATRAS) {
        if (lower.startsWith(key, i)) {
          if (endsWithVirama(result)) {
            result = result.slice(0, -1);
          }
          result += matra;
          i += key.length;
          vowelMatched = true;
          break;
        }
      }
      if (vowelMatched) continue;
    }

    // Try consonants
    let consonantMatched = false;
    for (const [key, val] of CONSONANTS_MAP) {
      if (lower.startsWith(key, i)) {
        result += val;
        i += key.length;
        consonantMatched = true;
        break;
      }
    }
    if (consonantMatched) continue;

    // Try standalone vowels
    let vowelMatched = false;
    for (const [key, val] of VOWELS_STANDALONE) {
      if (lower.startsWith(key, i)) {
        result += val;
        i += key.length;
        vowelMatched = true;
        break;
      }
    }
    if (vowelMatched) continue;

    // Fallback
    result += input[i];
    i++;
  }

  return result;
}

// ─── React Hook ────────────────────────────────────────────────────────────

/**
 * Hook that provides onKeyDown + onChange + value for a controlled input
 * with real-time romanized → Devanagari transliteration.
 *
 * Maintains an internal raw romanized buffer (ref). Every Latin keystroke
 * is intercepted, appended to the buffer, and the entire buffer is
 * re-transliterated to produce the display value.
 *
 * Usage:
 *   const nepaliProps = useNepaliInput(value, setValue);
 *   <Input {...nepaliProps} />
 */
export function useNepaliInput(value, setValue) {
  const rawRef = useRef('');

  // If value was cleared externally, reset the raw buffer
  if (!value && rawRef.current) {
    rawRef.current = '';
  }

  const onKeyDown = useCallback((e) => {
    // Let modifier combos pass through (Ctrl+A, Ctrl+C, Cmd+V, etc.)
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const key = e.key;

    if (key === 'Backspace') {
      e.preventDefault();
      rawRef.current = rawRef.current.slice(0, -1);
      setValue(transliterateToDevanagari(rawRef.current));
      return;
    }

    if (key === 'Delete') {
      e.preventDefault();
      rawRef.current = rawRef.current.slice(0, -1);
      setValue(transliterateToDevanagari(rawRef.current));
      return;
    }

    if (key === ' ') {
      e.preventDefault();
      rawRef.current += ' ';
      setValue(transliterateToDevanagari(rawRef.current));
      return;
    }

    // Latin letter
    if (key.length === 1 && /[a-zA-Z]/.test(key)) {
      e.preventDefault();
      rawRef.current += key.toLowerCase();
      setValue(transliterateToDevanagari(rawRef.current));
      return;
    }

    // Digits
    if (key.length === 1 && /[0-9]/.test(key)) {
      e.preventDefault();
      rawRef.current += key;
      setValue(transliterateToDevanagari(rawRef.current));
      return;
    }

    // Everything else (Tab, Enter, arrows, Escape) — pass through naturally
  }, [setValue]);

  const onChange = useCallback((e) => {
    // This fires for paste and direct Devanagari input (e.g. OS keyboard).
    // For paste: if all-Latin, transliterate. Otherwise accept as-is.
    const newVal = e.target.value;
    if (!newVal) {
      rawRef.current = '';
      setValue('');
      return;
    }

    // Check for paste of Latin text (no Devanagari chars present)
    const hasLatin = /[a-zA-Z]/.test(newVal);
    const hasDevanagari = /[\u0900-\u097F]/.test(newVal);

    if (hasLatin && !hasDevanagari) {
      // Pure Latin paste — transliterate
      rawRef.current = newVal.toLowerCase();
      setValue(transliterateToDevanagari(rawRef.current));
    } else {
      // Direct Devanagari or mixed — accept as-is, reset raw buffer
      rawRef.current = '';
      setValue(newVal);
    }
  }, [setValue]);

  return { value, onKeyDown, onChange };
}
