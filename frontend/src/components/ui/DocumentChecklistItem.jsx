import React, { useState } from 'react';
import { Icons, Button, DocumentOcrResult, ScanReviewModal } from './index';

// The OCR-results panel (preview thumbnail, plain-language verdict, advanced
// details, extracted text) lives in `DocumentOcrResult.jsx` so it can be
// shared with the officer Resolve Attachments modal — both surfaces must
// render identical OCR feedback. This file keeps only the checklist-row
// chrome (header, status pill, file picker, multi-page strip) plus the
// derived status-pill logic that lives outside the OCR card.

function qualityWarning(quality) {
  if (!quality) return null;
  if (quality.noTextDetected) return { tone: 'red', text: 'No text detected in image' };
  if (quality.isBlurry) return { tone: 'amber', text: 'Image is blurry — OCR may be unreliable' };
  if (quality.isDark) return { tone: 'amber', text: 'Image is too dark — text may not be legible' };
  return null;
}

export function DocumentChecklistItem({
  item,
  onLabelChange,
  onRemove,
  onFileChange,
  onClearScan,
  onRetryScan,
  disabled,
}) {
  const { id, label, isCustom, scanPreview, scanResult, scanning, scanError, status, pagePreviews = [], pageCount = 1 } = item;

  // Modal state lives at the row level so the multi-page thumbnail strip
  // can open the side-by-side review modal directly (the shared OCR
  // component delegates to this callback via the `onOpenReview` prop).
  const [reviewOpen, setReviewOpen] = useState(false);

  // The status pill becomes a red "Name mismatch" when keywords are all
  // present and quality is fine — the only failure is the name not appearing.
  const nv = scanResult?.nameVerification;
  const nameWasChecked = nv !== undefined && nv !== null;
  const nameNotMatched = nameWasChecked && !nv.nameFound;
  const hasMissingKeywords = (scanResult?.missingKeywords || []).length > 0;
  const qualityWarn = scanResult ? qualityWarning(scanResult.imageQualityIssue) : null;
  const isPureNameMismatch = status === 'needs_review' && nameNotMatched && !hasMissingKeywords && !qualityWarn;

  return (
    <div className="rounded-xl border border-border bg-card p-4 transition-all hover:border-border-strong">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Document Label */}
        <div className="flex flex-1 items-center gap-2.5 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icons.FileText className="h-4 w-4 text-primary" />
          </div>
          {isCustom ? (
            <input
              type="text"
              value={label}
              onChange={(e) => onLabelChange(id, e.target.value)}
              placeholder="Custom document name..."
              className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-semibold text-foreground focus:border-primary focus:outline-none"
              disabled={disabled}
            />
          ) : (
            <span className="text-sm font-semibold text-foreground truncate">{label}</span>
          )}
        </div>

        {/* Status Badge & Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {scanning ? (
            <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Scanning OCR...
            </span>
          ) : status === 'verified' ? (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <Icons.Check className="h-3.5 w-3.5" /> Verified
            </span>
          ) : isPureNameMismatch ? (
            <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-600 dark:text-red-400">
              <Icons.AlertCircle className="h-3.5 w-3.5" /> Name mismatch
            </span>
          ) : status === 'needs_review' ? (
            <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
              <Icons.AlertCircle className="h-3.5 w-3.5" /> Needs Review
            </span>
          ) : (
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              Not Uploaded
            </span>
          )}

          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(id)}
              className="rounded p-1 text-muted-foreground hover:text-red-500 transition-colors cursor-pointer"
              title="Remove document requirement"
              disabled={disabled || scanning}
            >
              <Icons.X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Upload area or Preview */}
      <div className="mt-3">
        {!scanPreview ? (
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-muted/20 px-3.5 py-2.5 transition-colors hover:border-border-strong hover:bg-muted/30">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Icons.Sparkles className="h-4 w-4 text-primary shrink-0" />
              <span>Attach scan or photo for <strong>{label || 'this document'}</strong></span>
            </div>
            <span className="rounded-md bg-background px-2.5 py-1 text-xs font-semibold text-foreground border border-border shadow-xs">
              Upload
            </span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length > 0) onFileChange(id, files);
                e.target.value = '';
              }}
              disabled={disabled || scanning}
            />
          </label>
        ) : (
          <div className="space-y-2 rounded-lg border border-border bg-muted/10 p-3">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1 text-xs">
                {scanning ? (
                  <p className="text-muted-foreground italic animate-pulse">
                    Running OCR analysis on image... (Nepali/English)
                  </p>
                ) : scanResult?.serviceUnavailable ? (
                  <div className="space-y-1">
                    <p className="font-semibold text-amber-600">AI service offline</p>
                    <Button variant="outline" size="sm" onClick={() => onRetryScan(id)} className="h-7 text-xs">
                      <Icons.Zap className="h-3 w-3" /> Retry scan
                    </Button>
                  </div>
                ) : scanResult ? (
                  // Shared OCR panel — same component the officer Resolve
                  // Attachments modal uses after a re-upload. Keeping it in
                  // one place guarantees the citizen and officer surfaces
                  // agree on what "the OCR said".
                  <DocumentOcrResult
                    scanResult={scanResult}
                    documentLabel={label}
                    imagePreview={scanPreview}
                    pagePreviews={pagePreviews}
                    onClearScan={() => onClearScan(id)}
                    onOpenReview={() => setReviewOpen(true)}
                  />
                ) : null}
              </div>
            </div>

            {/* Tier-3 #12: side-by-side review modal — opened by the
                "Open review" button inside the shared OCR component, or by
                clicking a thumbnail in the multi-page strip below. */}
            {scanResult && Array.isArray(scanResult.textBoxes) && scanResult.textBoxes.length > 0 && (
              <ScanReviewModal
                open={reviewOpen}
                onClose={() => setReviewOpen(false)}
                documentLabel={label}
                imagePreview={scanPreview}
                imagePreviews={pagePreviews.length > 0 ? pagePreviews : (scanPreview ? [scanPreview] : [])}
                pages={scanResult.pages || []}
                textBoxes={scanResult.textBoxes}
                imageWidth={scanResult.imageWidth}
                imageHeight={scanResult.imageHeight}
                extractedText={scanResult.extractedText || scanResult.extractedTextPreview || ''}
                foundKeywords={scanResult.foundKeywords || []}
                missingKeywords={scanResult.missingKeywords || []}
                nepaliText={scanResult.nepaliText}
                englishText={scanResult.englishText}
              />
            )}

            {/* Tier-3 #15: multi-page thumbnail strip — only render when we have
                more than one page attached. Clicking a thumbnail opens the
                review modal at that page's tab (handled by ScanReviewModal). */}
            {pageCount > 1 && pagePreviews.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {pagePreviews.map((p, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setReviewOpen(true)}
                      className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-border bg-white shadow-xs cursor-pointer hover:border-border-strong"
                      title={`Page ${i + 1}`}
                    >
                      <img src={p} alt={`Page ${i + 1}`} className="block h-full w-full object-cover" />
                      <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 text-[9px] font-bold text-white leading-tight text-center">
                        p.{i + 1}
                      </span>
                    </button>
                  ))}
                  <span className="ml-1 inline-flex items-center gap-1 self-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    <Icons.FileText className="h-3 w-3" /> {pageCount} pages
                  </span>
                </div>
              </div>
            )}

            {scanError && (
              <p className="text-xs font-medium text-amber-600">{scanError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
