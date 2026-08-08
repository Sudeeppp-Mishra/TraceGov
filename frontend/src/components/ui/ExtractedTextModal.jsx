import React, { useEffect, useState } from 'react';
import { Button, Icons, Modal } from './index';

/**
 * Modal that shows the full extracted OCR text for a single document scan.
 *
 * When the AI service returns per-language partitions (`nepaliText` /
 * `englishText`) and both contain words, renders two labeled blocks so
 * officers can read the Nepali and English content separately. For single-
 * language docs and pre-feature scans, falls back to the single merged
 * block — preserving the original UX.
 *
 * Used both during registration (DocumentChecklistItem) and on the officer
 * dashboard's AI Scan Detail panel (ScanDetailRow), so officer workflows that
 * read or copy the full text work the same after registration as during it.
 *
 * Props:
 *  - open (bool) — controlled open flag
 *  - onClose (fn) — invoked by the modal's close button / Escape / backdrop click
 *  - documentLabel (string) — shown in the title / description for context
 *  - text (string) — the full extracted text to render (merged; falls back
 *                    when nepaliText/englishText are not available)
 *  - nepaliText (string, optional) — words tagged 'ne' by the AI service
 *  - englishText (string, optional) — words tagged 'en' by the AI service
 */
export function ExtractedTextModal({
  open,
  onClose,
  documentLabel,
  text,
  nepaliText,
  englishText,
}) {
  // Per-block copy state. `null` = no feedback, 'merged' = copy-all button,
  // 'ne' = Nepali block, 'en' = English block.
  const [copiedKey, setCopiedKey] = useState(null);

  // Reset feedback whenever the modal opens or the source text changes.
  useEffect(() => {
    if (open) setCopiedKey(null);
  }, [open, text, nepaliText, englishText]);

  const hasNe = typeof nepaliText === 'string' && nepaliText.trim().length > 0;
  const hasEn = typeof englishText === 'string' && englishText.trim().length > 0;
  const showSplit = hasNe && hasEn;

  const handleCopy = async (value, key) => {
    if (!value) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        // Fallback for browsers without clipboard API (rare today, but defensive).
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 2000);
    } catch {
      // Surface failure silently — user can still select-and-copy manually.
    }
  };

  const copyFeedback = (key) => (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 transition-opacity ${
        copiedKey === key ? 'opacity-100' : 'opacity-0'
      }`}
      aria-live="polite"
    >
      <Icons.Check className="h-3.5 w-3.5" /> Copied to clipboard
    </span>
  );

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Full extracted text"
      description={documentLabel ? `OCR text captured for "${documentLabel}"` : 'Full OCR text captured for this scan'}
    >
      <div className="space-y-4">
        {showSplit ? (
          // Mixed-language scan: two labeled blocks with per-block copy.
          <>
            <div className="rounded-xl border border-border bg-muted/20 p-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Icons.Globe className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  Nepali
                  <span className="text-muted-foreground font-normal">
                    ({nepaliText.length.toLocaleString()} chars)
                  </span>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(nepaliText, 'ne')}
                  disabled={!nepaliText}
                >
                  <Icons.Send className="h-3 w-3" /> Copy
                </Button>
              </div>
              <pre className="max-h-[40vh] overflow-auto rounded-lg border border-border bg-card p-3 text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words font-mono">
                {nepaliText}
              </pre>
            </div>

            <div className="rounded-xl border border-border bg-muted/20 p-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Icons.Globe className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  English
                  <span className="text-muted-foreground font-normal">
                    ({englishText.length.toLocaleString()} chars)
                  </span>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(englishText, 'en')}
                  disabled={!englishText}
                >
                  <Icons.Send className="h-3 w-3" /> Copy
                </Button>
              </div>
              <pre className="max-h-[40vh] overflow-auto rounded-lg border border-border bg-card p-3 text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words font-mono">
                {englishText}
              </pre>
            </div>
          </>
        ) : text ? (
          // Single-language scan or pre-feature data: original single-block view.
          <pre className="max-h-[60vh] overflow-auto rounded-xl border border-border bg-muted/30 p-4 text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words font-mono">
            {text}
          </pre>
        ) : (
          <p className="rounded-xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground italic">
            No full text captured for this scan.
          </p>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
          {copyFeedback('merged')}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => handleCopy(text, 'merged')}
              disabled={!text}
            >
              <Icons.Send className="h-3.5 w-3.5" /> Copy to clipboard
            </Button>
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default ExtractedTextModal;