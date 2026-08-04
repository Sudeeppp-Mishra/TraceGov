import React, { useEffect, useState } from 'react';
import { Button, Icons, Modal } from './index';

/**
 * Modal that shows the full extracted OCR text for a single document scan.
 * Provides a copy-to-clipboard button with brief "Copied!" feedback.
 *
 * Used both during registration (DocumentChecklistItem) and on the officer
 * dashboard's AI Scan Detail panel (ScanDetailRow), so officer workflows that
 * read or copy the full text work the same after registration as during it.
 *
 * Props:
 *  - open (bool) — controlled open flag
 *  - onClose (fn) — invoked by the modal's close button / Escape / backdrop click
 *  - documentLabel (string) — shown in the title / description for context
 *  - text (string) — the full extracted text to render
 */
export function ExtractedTextModal({ open, onClose, documentLabel, text }) {
  const [copied, setCopied] = useState(false);

  // Reset the "Copied!" pill whenever the modal opens or the source text changes.
  useEffect(() => {
    if (open) setCopied(false);
  }, [open, text]);

  const handleCopy = async () => {
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for browsers without clipboard API (rare today, but defensive).
        const ta = document.createElement('textarea');
        ta.value = text;
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
      // Surface failure silently — user can still select-and-copy manually.
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Full extracted text"
      description={documentLabel ? `OCR text captured for "${documentLabel}"` : 'Full OCR text captured for this scan'}
    >
      <div className="space-y-4">
        {text ? (
          <pre className="max-h-[60vh] overflow-auto rounded-xl border border-border bg-muted/30 p-4 text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words font-mono">
            {text}
          </pre>
        ) : (
          <p className="rounded-xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground italic">
            No full text captured for this scan.
          </p>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 transition-opacity ${
              copied ? 'opacity-100' : 'opacity-0'
            }`}
            aria-live="polite"
          >
            <Icons.Check className="h-3.5 w-3.5" /> Copied to clipboard
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleCopy}
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
