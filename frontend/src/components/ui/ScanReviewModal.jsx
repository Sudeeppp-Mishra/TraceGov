import React, { useEffect, useMemo, useState } from 'react';
import { Button, Icons, Modal } from './index';

/**
 * Side-by-side OCR review modal (Tier-3 #12).
 *
 * Renders the scan image on the left with per-word bounding-box overlays
 * (color-coded by OCR confidence) and the extracted text on the right
 * with found/missing keywords highlighted in place. Designed for officers
 * to spot misread characters and verify the AI's classification at a glance.
 *
 * Reused on the registration form (`DocumentChecklistItem`) and the officer
 * dashboard's `ScanDetailRow`, so the same review experience works whether
 * the file is being registered or has been registered.
 *
 * Props:
 *  - open (bool) — controlled open flag
 *  - onClose (fn) — invoked by the modal's close button / Escape / backdrop click
 *  - documentLabel (string) — shown in the title / description
 *  - imagePreview (string|null) — data URL or blob URL for the scan image
 *  - textBoxes (array) — [{ text, bbox, confidence }] per detected word
 *  - imageWidth (number) — pixel width of the preprocessed image
 *  - imageHeight (number) — pixel height of the preprocessed image
 *  - extractedText (string) — full OCR text to highlight keywords in
 *  - foundKeywords (array) — keywords the AI marked as found (highlighted green)
 *  - missingKeywords (array) — keywords still missing (highlighted red)
 *  - pages (array, optional, Tier-3 #15) — per-page breakdowns for multi-page
 *  - imagePreviews (array, optional, Tier-3 #15) — array of image URLs, one per page
 */

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Build a single regex that captures any of the provided keywords.
// Case-insensitive; preserves original-casing in the rendered spans.
function buildKeywordRegex(keywords) {
  if (!Array.isArray(keywords) || keywords.length === 0) return null;
  const escaped = keywords
    .filter((k) => k && String(k).trim().length > 0)
    .map((k) => escapeRegex(String(k).trim()))
    .sort((a, b) => b.length - a.length); // longest first so multi-word phrases match first
  if (escaped.length === 0) return null;
  return new RegExp(`(${escaped.join('|')})`, 'gi');
}

// Split text into segments where each segment is either a match or a non-match.
// `kind` is 'found', 'missing', or null for plain text.
function splitByKeywords(text, foundRegex, missingRegex) {
  if (!text) return [];
  // Combine into a single alternation with priority: missing > found > plain.
  // We do it in two passes: first missing (red), then found (green) within plain spans.
  const segments = [];
  let cursor = 0;

  const findMatches = (re) => {
    const matches = [];
    if (!re) return matches;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      matches.push({ start: m.index, end: m.index + m[0].length, value: m[0] });
      if (m.index === re.lastIndex) re.lastIndex++; // safety against zero-length
    }
    return matches;
  };

  const missingMatches = findMatches(missingRegex);
  const foundMatches = findMatches(foundRegex);

  // Build a unified timeline of (start, end, kind) for both kinds.
  const all = [
    ...missingMatches.map((mm) => ({ ...mm, kind: 'missing' })),
    ...foundMatches.map((fm) => ({ ...fm, kind: 'found' })),
  ].sort((a, b) => a.start - b.start || a.end - b.end);

  // When ranges overlap, prefer 'missing' (more important to surface).
  const merged = [];
  for (const m of all) {
    const last = merged[merged.length - 1];
    if (last && m.start < last.end) {
      if (m.kind === 'missing' && last.kind !== 'missing') {
        // Replace the existing 'found' with 'missing' if they overlap.
        if (m.start >= last.start) {
          // Split last around m.start
          if (m.start > last.start) {
            merged.push({ start: last.start, end: m.start, kind: last.kind, value: text.slice(last.start, m.start) });
          }
          merged.push({ start: m.start, end: Math.min(m.end, last.end), kind: 'missing', value: text.slice(m.start, Math.min(m.end, last.end)) });
          if (m.end < last.end) {
            merged.push({ start: m.end, end: last.end, kind: last.kind, value: text.slice(m.end, last.end) });
          }
          last.end = Math.max(last.end, m.end);
        }
      }
      continue;
    }
    merged.push({ ...m, value: text.slice(m.start, m.end) });
  }

  // Now emit plain segments between matches.
  let pos = 0;
  for (const seg of merged) {
    if (seg.start > pos) {
      segments.push({ kind: 'plain', value: text.slice(pos, seg.start) });
    }
    segments.push({ kind: seg.kind, value: seg.value });
    pos = seg.end;
  }
  if (pos < text.length) {
    segments.push({ kind: 'plain', value: text.slice(pos) });
  }
  return segments;
}

// Confidence color tier for bounding-box overlays.
function confidenceTierClass(c) {
  if (c >= 0.8) return 'border-emerald-500 bg-emerald-500/15';
  if (c >= 0.5) return 'border-amber-500 bg-amber-500/15';
  return 'border-red-500 bg-red-500/15';
}

// Per-word script emoji for overlay tooltips. Tier-3 #16 — when the AI
// service tagged each word with a language, officers can see at a glance
// which script each detected word belongs to (e.g. 🇳🇵 on a Devanagari
// word, 🇬🇧 on a Latin word in the same line).
function languageFlag(language) {
  if (language === 'ne') return '🇳🇵';
  if (language === 'en') return '🇬🇧';
  if (language === 'mixed') return '🌐';
  return '';
}

// Renders the image + bounding-box overlays. Coordinates are normalized to %.
// Clicking the image opens a fullscreen lightbox with the same overlays
// rendered at natural pixel size — the small thumbnail boxes are too tiny
// to read confidence at a glance, so the lightbox lets officers inspect
// each word's bounding box clearly.
function TextBoxOverlayImage({ src, textBoxes, imageWidth, imageHeight, alt }) {
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [expanded, setExpanded] = useState(false);
  const w = imageWidth || naturalSize.w;
  const h = imageHeight || naturalSize.h;

  // Close on Escape — same affordance as the outer Modal.
  useEffect(() => {
    if (!expanded) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [expanded]);

  // Render the overlay rects at a given container size (px). When the parent
  // container is the natural-size image, percentage math gives pixel-perfect
  // alignment. We compute left/top/width/height in pixels here so the
  // lightbox can use any container size we like.
  const renderOverlays = (containerW, containerH) => {
    if (!(w > 0 && h > 0) || !Array.isArray(textBoxes) || textBoxes.length === 0) return null;
    return textBoxes.map((tb, i) => {
      const bbox = Array.isArray(tb.bbox) ? tb.bbox : [];
      if (bbox.length < 4) return null;
      const xs = bbox.map((p) => p[0]);
      const ys = bbox.map((p) => p[1]);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const maxX = Math.max(...xs);
      const maxY = Math.max(...ys);
      const left = (minX / w) * containerW;
      const top = (minY / h) * containerH;
      const width = ((maxX - minX) / w) * containerW;
      const height = ((maxY - minY) / h) * containerH;
      const pct = Math.round((tb.confidence || 0) * 100);
      return (
        <div
          key={i}
          className={`absolute border ${confidenceTierClass(tb.confidence || 0)} rounded-sm ${expanded ? 'cursor-pointer hover:bg-current/10' : 'pointer-events-none'}`}
          style={{
            left: `${left}px`,
            top: `${top}px`,
            width: `${width}px`,
            height: `${height}px`,
          }}
          title={`${languageFlag(tb.language)} "${tb.text}" · ${pct}% confidence`}
        />
      );
    });
  };

  return (
    <>
      <div className="relative w-full overflow-auto max-h-[44vh] rounded-lg border border-border bg-white">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="Expand source image"
          className="block w-full cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <img
            src={src}
            alt={alt}
            onLoad={(e) => setNaturalSize({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
            className="block w-full h-auto"
          />
        </button>
        {/* Overlays in thumbnail view: pinned to the image's percentage
            bounding box. pointer-events-none so clicks fall through to the
            zoom button underneath. */}
        {w > 0 && h > 0 && (
          <div className="pointer-events-none absolute inset-0">
            {textBoxes?.map((tb, i) => {
              const bbox = Array.isArray(tb.bbox) ? tb.bbox : [];
              if (bbox.length < 4) return null;
              const xs = bbox.map((p) => p[0]);
              const ys = bbox.map((p) => p[1]);
              const left = (Math.min(...xs) / w) * 100;
              const top = (Math.min(...ys) / h) * 100;
              const width = ((Math.max(...xs) - Math.min(...xs)) / w) * 100;
              const height = ((Math.max(...ys) - Math.min(...ys)) / h) * 100;
              const pct = Math.round((tb.confidence || 0) * 100);
              return (
                <div
                  key={i}
                  className={`absolute border ${confidenceTierClass(tb.confidence || 0)} rounded-sm`}
                  style={{
                    left: `${left}%`,
                    top: `${top}%`,
                    width: `${width}%`,
                    height: `${height}%`,
                  }}
                  title={`${languageFlag(tb.language)} "${tb.text}" · ${pct}% confidence`}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Lightbox: fullscreen overlay with the image at natural size and
          overlays scaled in pixels. Backdrop click or Esc closes it. */}
      {expanded && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-4 animate-fade-in"
          onClick={() => setExpanded(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`${alt || 'Source image'} expanded view`}
        >
          <div className="flex max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-card shadow-2xl">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{alt || 'Source image'}</p>
                <p className="text-[11px] text-muted-foreground">
                  {w > 0 && h > 0 ? `${w} × ${h} px · ${textBoxes?.length || 0} words · click backdrop or press Esc to close` : 'Click backdrop or press Esc to close'}
                </p>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm border border-emerald-500 bg-emerald-500/20" /> ≥0.8
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm border border-amber-500 bg-amber-500/20" /> 0.5–0.8
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm border border-red-500 bg-red-500/20" /> &lt;0.5
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded(false);
                  }}
                  className="ml-2 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
                  aria-label="Close expanded view"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div
              className="relative min-h-0 flex-1 overflow-auto bg-white p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="relative mx-auto"
                style={{
                  width: w > 0 ? `${w}px` : 'auto',
                  height: h > 0 ? `${h}px` : 'auto',
                  maxWidth: '100%',
                }}
              >
                <img
                  src={src}
                  alt={alt}
                  className="block h-auto w-full select-none"
                  draggable={false}
                  style={w > 0 ? { width: `${w}px`, height: `${h}px`, maxWidth: 'none' } : undefined}
                />
                {/* Pixel-anchored overlays matching the natural-size image. */}
                <div className="pointer-events-none absolute inset-0">
                  {renderOverlays(w, h)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function ScanReviewModal({
  open,
  onClose,
  documentLabel,
  imagePreview,
  textBoxes,
  imageWidth,
  imageHeight,
  extractedText,
  foundKeywords,
  missingKeywords,
  pages,
  imagePreviews,
  nepaliText,
  englishText,
}) {
  const [activePage, setActivePage] = useState(0);
  const [copied, setCopied] = useState(false);

  // Tier-3 #15: per-page breakdown for multi-page documents.
  const pageCount = Math.max(
    Array.isArray(pages) ? pages.length : 0,
    Array.isArray(imagePreviews) ? imagePreviews.length : 0,
    1
  );
  const usePages = pageCount > 1;
  const pageImages = Array.isArray(imagePreviews) && imagePreviews.length > 0
    ? imagePreviews
    : (imagePreview ? [imagePreview] : []);
  const pageTexts = usePages && Array.isArray(pages)
    ? pages.map((p) => p.extractedTextPreview || '')
    : (extractedText ? [extractedText] : ['']);

  // Tier-3 #16: when the AI service returned per-language partitions AND the
  // active page has them too (for multi-page), split the right pane into two
  // labeled blocks. Otherwise fall back to the merged single view.
  const hasNe = typeof nepaliText === 'string' && nepaliText.trim().length > 0;
  const hasEn = typeof englishText === 'string' && englishText.trim().length > 0;
  const showSplit = hasNe && hasEn;

  // Reset active page when modal reopens.
  useEffect(() => {
    if (open) {
      setActivePage(0);
      setCopied(false);
    }
  }, [open, documentLabel]);

  const activeImage = pageImages[Math.min(activePage, pageImages.length - 1)] || imagePreview;
  const activeText = pageTexts[Math.min(activePage, pageTexts.length - 1)] || extractedText || '';

  // For multi-page + split view, prefer the active page's per-language strings
  // when the AI service returned them; fall back to file-level partitions.
  const activeNe = usePages && Array.isArray(pages) && pages[activePage]?.nepaliText !== undefined
    ? (pages[activePage].nepaliText || '')
    : nepaliText;
  const activeEn = usePages && Array.isArray(pages) && pages[activePage]?.englishText !== undefined
    ? (pages[activePage].englishText || '')
    : englishText;
  const useSplit = showSplit && (activeNe || activeEn);

  const foundRegex = useMemo(() => buildKeywordRegex(foundKeywords), [foundKeywords]);
  const missingRegex = useMemo(() => buildKeywordRegex(missingKeywords), [missingKeywords]);
  const segments = useMemo(
    () => splitByKeywords(activeText || '', foundRegex, missingRegex),
    [activeText, foundRegex, missingRegex]
  );
  const neSegments = useMemo(
    () => splitByKeywords(activeNe || '', foundRegex, missingRegex),
    [activeNe, foundRegex, missingRegex]
  );
  const enSegments = useMemo(
    () => splitByKeywords(activeEn || '', foundRegex, missingRegex),
    [activeEn, foundRegex, missingRegex]
  );

  const handleCopy = async () => {
    if (!activeText) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(activeText);
      } else {
        const ta = document.createElement('textarea');
        ta.value = activeText;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // surface silently
    }
  };

  const foundCount = Array.isArray(foundKeywords) ? foundKeywords.length : 0;
  const missingCount = Array.isArray(missingKeywords) ? missingKeywords.length : 0;

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="OCR review"
      description={documentLabel
        ? `Inspect the AI's reading of "${documentLabel}". Green boxes are high-confidence words; amber/red need a second look.`
        : 'Inspect the AI OCR result side-by-side with the source image.'}
      // Wider than the default `max-w-lg` so the image and text panes sit
      // side-by-side comfortably without being squeezed into a tall narrow
      // column. Pairs with the Modal's own `max-h-[90vh]` + scrolling body
      // so the window stays anchored and the inner content scrolls.
      className="max-w-5xl"
    >
      <div className="space-y-4">
        {/* Tier-3 #15: page tabs when multi-page */}
        {usePages && (
          <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist">
            {Array.from({ length: pageCount }, (_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={activePage === i}
                onClick={() => setActivePage(i)}
                className={`shrink-0 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  activePage === i
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-foreground hover:bg-muted'
                }`}
              >
                Page {i + 1}
              </button>
            ))}
          </div>
        )}

        {/* Two-column split: image + text */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Left: image with overlays */}
          <div className="rounded-xl border border-border bg-muted/20 p-2">
            <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Icons.Eye className="h-3 w-3" /> Source image
              </span>
              <span>
                {Array.isArray(textBoxes) ? textBoxes.length : 0} word{Array.isArray(textBoxes) && textBoxes.length !== 1 ? 's' : ''}
              </span>
            </div>
            {activeImage ? (
              <TextBoxOverlayImage
                src={activeImage}
                textBoxes={textBoxes}
                imageWidth={imageWidth}
                imageHeight={imageHeight}
                alt={documentLabel || 'Scan preview'}
              />
            ) : (
              <p className="rounded-lg border border-border bg-card p-4 text-xs italic text-muted-foreground">
                No image preview available for this scan.
              </p>
            )}
          </div>

          {/* Right: text with highlights */}
          <div className="rounded-xl border border-border bg-muted/20 p-2">
            <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Icons.FileText className="h-3 w-3" /> Extracted text
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300">
                  <Icons.Check className="h-3 w-3" /> {foundCount}
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-red-500/15 px-1.5 py-0.5 text-red-700 dark:text-red-300">
                  <Icons.AlertCircle className="h-3 w-3" /> {missingCount}
                </span>
              </span>
            </div>
            {useSplit ? (
              // Tier-3 #16: two stacked language blocks with per-block keyword
              // highlighting, so officers can see Nepali vs. English side-by-side
              // without scrolling through a wall of mixed characters.
              <div className="space-y-2 max-h-[44vh] overflow-auto pr-1">
                {activeNe && (
                  <div className="rounded-lg border border-border bg-card p-3">
                    <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden="true">🇳🇵</span> Nepali
                      </span>
                      <span>{activeNe.length.toLocaleString()} chars</span>
                    </div>
                    <div className="max-h-[18vh] overflow-auto font-mono text-xs leading-relaxed text-foreground whitespace-pre-wrap break-words">
                      {neSegments.map((seg, i) => {
                        if (seg.kind === 'missing') {
                          return (
                            <mark key={i} className="rounded-sm bg-red-500/20 px-0.5 text-red-700 dark:text-red-300" title="Missing required keyword">
                              {seg.value}
                            </mark>
                          );
                        }
                        if (seg.kind === 'found') {
                          return (
                            <mark key={i} className="rounded-sm bg-emerald-500/20 px-0.5 text-emerald-700 dark:text-emerald-300" title="Found required keyword">
                              {seg.value}
                            </mark>
                          );
                        }
                        return <React.Fragment key={i}>{seg.value}</React.Fragment>;
                      })}
                    </div>
                  </div>
                )}
                {activeEn && (
                  <div className="rounded-lg border border-border bg-card p-3">
                    <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden="true">🇬🇧</span> English
                      </span>
                      <span>{activeEn.length.toLocaleString()} chars</span>
                    </div>
                    <div className="max-h-[18vh] overflow-auto font-mono text-xs leading-relaxed text-foreground whitespace-pre-wrap break-words">
                      {enSegments.map((seg, i) => {
                        if (seg.kind === 'missing') {
                          return (
                            <mark key={i} className="rounded-sm bg-red-500/20 px-0.5 text-red-700 dark:text-red-300" title="Missing required keyword">
                              {seg.value}
                            </mark>
                          );
                        }
                        if (seg.kind === 'found') {
                          return (
                            <mark key={i} className="rounded-sm bg-emerald-500/20 px-0.5 text-emerald-700 dark:text-emerald-300" title="Found required keyword">
                              {seg.value}
                            </mark>
                          );
                        }
                        return <React.Fragment key={i}>{seg.value}</React.Fragment>;
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : activeText ? (
              <div className="max-h-[44vh] overflow-auto rounded-lg border border-border bg-card p-3 font-mono text-xs leading-relaxed text-foreground whitespace-pre-wrap break-words">
                {segments.map((seg, i) => {
                  if (seg.kind === 'missing') {
                    return (
                      <mark
                        key={i}
                        className="rounded-sm bg-red-500/20 px-0.5 text-red-700 dark:text-red-300"
                        title="Missing required keyword"
                      >
                        {seg.value}
                      </mark>
                    );
                  }
                  if (seg.kind === 'found') {
                    return (
                      <mark
                        key={i}
                        className="rounded-sm bg-emerald-500/20 px-0.5 text-emerald-700 dark:text-emerald-300"
                        title="Found required keyword"
                      >
                        {seg.value}
                      </mark>
                    );
                  }
                  return <React.Fragment key={i}>{seg.value}</React.Fragment>;
                })}
              </div>
            ) : (
              <p className="rounded-lg border border-border bg-card p-4 text-xs italic text-muted-foreground">
                No extracted text captured for this scan.
              </p>
            )}
          </div>
        </div>

        {/* Legend + actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm border border-emerald-500 bg-emerald-500/20" /> High confidence (≥0.8)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm border border-amber-500 bg-amber-500/20" /> Medium (0.5–0.8)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm border border-red-500 bg-red-500/20" /> Low (&lt;0.5)
            </span>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 transition-opacity ${
              copied ? 'opacity-100' : 'opacity-0'
            }`}
            aria-live="polite"
          >
            <Icons.Check className="h-3.5 w-3.5" /> Copied to clipboard
          </span>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleCopy} disabled={!activeText}>
            <Icons.Send className="h-3.5 w-3.5" /> Copy text
          </Button>
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}

export default ScanReviewModal;