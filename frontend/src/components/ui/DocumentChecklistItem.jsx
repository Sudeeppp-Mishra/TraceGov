import React, { useState } from 'react';
import { Icons, Button, ExtractedTextModal, StampOverlayImage, ScanReviewModal } from './index';

const LANGUAGE_LABELS = {
  nepali: 'Nepali (नेपाली)',
  english: 'English',
  mixed: 'Nepali + English',
  unknown: 'Unknown',
};

// Confidence tier pill — single-glance trust indicator combining OCR confidence,
// classification source, and quality. Officers shouldn't have to mentally
// weight five separate fields to decide whether to trust this scan.
function confidenceTier(scanResult) {
  if (!scanResult) return null;
  const ocr = scanResult.ocrConfidence || 0;
  const quality = scanResult.imageQualityIssue;
  const isMl = scanResult.classificationSource === 'trained_model';
  const noText = quality?.noTextDetected;

  if (noText || ocr < 0.5) return { label: 'Low', className: 'bg-red-500/10 text-red-700 dark:text-red-300' };
  if (ocr < 0.8 || !isMl) return { label: 'Medium', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' };
  return { label: 'High', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' };
}

// Tiny SVG ring for completenessScore — green ≥0.8, amber 0.5–0.8, red <0.5.
function CompletenessRing({ value = 0, size = 22, stroke = 3 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, Math.max(0, value));
  const color =
    pct >= 0.8 ? 'var(--color-emerald-500)' :
    pct >= 0.5 ? 'var(--color-amber-500)' :
    'var(--color-red-500)';
  return (
    <svg width={size} height={size} className="-rotate-90 shrink-0" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
    </svg>
  );
}

// Human-readable explanation for image-quality warnings.
function qualityWarning(quality) {
  if (!quality) return null;
  if (quality.noTextDetected) return { tone: 'red', text: 'No text detected in image' };
  if (quality.isBlurry) return { tone: 'amber', text: 'Image is blurry — OCR may be unreliable' };
  if (quality.isDark) return { tone: 'amber', text: 'Image is too dark — text may not be legible' };
  return null;
}

// Plain-language verdict badge. Pulls three independent signals — document
// classification, citizen-name match, and stamp detection — into one glance-
// able row so non-technical officers can read this without parsing OCR
// jargon. The technical pills (completeness %, raw OCR confidence, etc.)
// still exist in the collapsible "Advanced details" section below.
function VerificationVerdict({ scanResult }) {
  if (!scanResult || scanResult.serviceUnavailable) return null;

  const quality = scanResult.imageQualityIssue;
  const hasQualityIssue = quality && (quality.noTextDetected || quality.isBlurry || quality.isDark);

  // ── Document authentic? ──────────────────────────────────────────────
  const docClassified = scanResult.documentType && scanResult.documentType !== 'Unknown';
  const docConf = scanResult.classificationConfidence || 0;
  const documentLooksAuthentic = docClassified && docConf >= 0.6 && !hasQualityIssue;

  // ── Name check ───────────────────────────────────────────────────────
  const nv = scanResult.nameVerification;
  // Name verification only ran when a citizen name was sent to the AI
  // service. If neither name nor nepali name was passed, the AI returns
  // null for this field — that's the "not checked" case.
  const nameWasChecked = nv !== undefined && nv !== null;
  const nameFound = !!(nameWasChecked && nv.nameFound && (nv.matchConfidence || 0) >= 0.7);
  const nameNotMatched = nameWasChecked && !nv.nameFound;

  // ── Stamp check ──────────────────────────────────────────────────────
  const stamp = scanResult.stampAnalysis;
  const stampChecked = stamp !== undefined && stamp !== null;
  const stampDetected = !!(stampChecked && stamp.stampDetected);

  // Color tokens for badges.
  const emerald = 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
  const amber = 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30';
  const red = 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30';
  const muted = 'bg-muted text-muted-foreground border-border';

  return (
    <div className="space-y-1.5">
      {/* Document authenticity */}
      {documentLooksAuthentic ? (
        <div className={`flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${emerald}`}>
          <Icons.CheckCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold leading-tight">Document looks authentic</p>
            <p className="text-[11px] opacity-80 mt-0.5">
              Recognized as {scanResult.documentType}
              {docConf > 0 ? ` · ${Math.round(docConf * 100)}% confident` : ''}
            </p>
          </div>
        </div>
      ) : (
        <div className={`flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${amber}`}>
          <Icons.AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold leading-tight">Document type unclear</p>
            <p className="text-[11px] opacity-80 mt-0.5">
              {hasQualityIssue
                ? 'Image quality is poor — re-scan for a clearer picture.'
                : docClassified
                  ? `Low recognition confidence (${Math.round(docConf * 100)}%).`
                  : "We couldn't recognize this document type. Officer should verify manually."}
            </p>
          </div>
        </div>
      )}

      {/* Name check — the headline officers actually care about */}
      {nameFound ? (
        <div className={`flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${emerald}`}>
          <Icons.User className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold leading-tight">Name verified</p>
            <p className="text-[11px] opacity-80 mt-0.5">
              &ldquo;{nv.matchedName || ''}&rdquo; matches the name entered on the form.
            </p>
          </div>
        </div>
      ) : nameNotMatched ? (
        <div className={`flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${red}`}>
          <Icons.AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold leading-tight">Name not matched</p>
            <p className="text-[11px] opacity-80 mt-0.5">
              The name entered for this file was not found on this scan. Officer
              discretion applies — the file can still be registered.
            </p>
          </div>
        </div>
      ) : (
        <div className={`flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${muted}`}>
          <Icons.User className="h-3.5 w-3.5 mt-0.5 shrink-0 opacity-70" />
          <div className="min-w-0">
            <p className="font-semibold leading-tight">Name not checked on this document</p>
            <p className="text-[11px] opacity-80 mt-0.5">
              Enter the citizen&rsquo;s name in the form before scanning to compare names automatically.
            </p>
          </div>
        </div>
      )}

      {/* Stamp check */}
      {stampChecked && (
        stampDetected ? (
          <div className={`flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${emerald}`}>
            <Icons.ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold leading-tight">Official stamp detected</p>
              <p className="text-[11px] opacity-80 mt-0.5">
                {stamp.stampCount > 1
                  ? `${stamp.stampCount} stamps found on this scan.`
                  : (stamp.stampColor ? `${stamp.stampColor[0].toUpperCase()}${stamp.stampColor.slice(1)} stamp visible on the scan.` : 'Stamp visible on the scan.')}
              </p>
            </div>
          </div>
        ) : (
          <div className={`flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${amber}`}>
            <Icons.Shield className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold leading-tight">No stamp detected</p>
              <p className="text-[11px] opacity-80 mt-0.5">
                Some required documents must carry an official stamp. Re-scan or attach the original.
              </p>
            </div>
          </div>
        )
      )}
    </div>
  );
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
  const [textExpanded, setTextExpanded] = useState(false);
  const [fullTextOpen, setFullTextOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const tier = confidenceTier(scanResult);

  // True when the AI service returned text beyond the 500-char preview —
  // i.e. there's a meaningful "full text" worth opening in a modal.
  const hasFullText = !!scanResult?.extractedText && (
    scanResult.extractedText.length > 510 ||
    scanResult.extractedText !== scanResult.extractedTextPreview
  );

  // Tier-3 #12: the side-by-side review modal is available when we have
  // bounding boxes (image path) — the legacy `detectedText` path keeps the
  // plain full-text modal as fallback.
  const hasReviewableBoxes = Array.isArray(scanResult?.textBoxes) && scanResult.textBoxes.length > 0;

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
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground font-mono text-xs font-bold">
            📄
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
              {/* Tier-3 #14: stamp bounding boxes overlay the preview so officers
                  see exactly where the stamp was detected. Click opens the
                  larger review modal (#12) for full inspection. */}
              {scanResult?.stampAnalysis?.stampRegions?.length > 0 ? (
                <StampOverlayImage
                  src={scanPreview}
                  stampAnalysis={scanResult.stampAnalysis}
                  alt={label}
                  className="h-16 w-16 shrink-0 rounded-md border border-border bg-white shadow-xs"
                />
              ) : (
                <img
                  src={scanPreview}
                  alt={label}
                  className="h-16 w-16 shrink-0 rounded-md border border-border bg-white object-cover shadow-xs"
                />
              )}
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
                  <div className="space-y-2.5">
                    {/* Plain-language verdict row — three independent badges
                        (document / name / stamp) so non-technical officers
                        can read the result in one glance. The technical
                        metrics live in the collapsible "Advanced details"
                        section below. */}
                    <VerificationVerdict scanResult={scanResult} />

                    {/* Image-quality warning stays at the top — officers
                        need to see "Image is blurry — re-scan" immediately,
                        not buried behind a toggle. */}
                    {(() => {
                      const warn = qualityWarning(scanResult.imageQualityIssue);
                      if (!warn) return null;
                      const palette = warn.tone === 'red'
                        ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
                        : 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300';
                      return (
                        <div className={`flex items-start gap-1.5 rounded-md border px-2 py-1.5 ${palette}`}>
                          <Icons.AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <p className="font-semibold leading-tight">{warn.text}</p>
                            {typeof scanResult.imageQualityIssue?.qualityScore === 'number' && (
                              <p className="text-[11px] opacity-80 mt-0.5">
                                Quality score {Math.round(scanResult.imageQualityIssue.qualityScore * 100)}%
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Missing-keywords explanation stays visible — it's the
                        officer's most actionable signal after the verdict
                        row (which document must be re-scanned, and which
                        word the AI couldn't find). */}
                    {(scanResult.missingKeywords || []).length > 0 && (
                      <div className="rounded-md bg-amber-500/10 px-2 py-1.5">
                        <p className="font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1">
                          <Icons.AlertCircle className="h-3 w-3 shrink-0" />
                          Required keyword{(scanResult.missingKeywords || []).length > 1 ? 's' : ''} not detected
                        </p>
                        <ul className="mt-1 ml-4 list-disc space-y-0.5 text-amber-800/90 dark:text-amber-200/90">
                          {(scanResult.highlightedMissingItems || []).length > 0 ? (
                            scanResult.highlightedMissingItems.map((item) => (
                              <li key={item.keyword}>{item.message}</li>
                            ))
                          ) : (
                            scanResult.missingKeywords.map((kw) => (
                              <li key={kw}>{kw} was not detected in the uploaded document.</li>
                            ))
                          )}
                        </ul>
                      </div>
                    )}

                    {/* Advanced details — the original technical pills,
                        demoted behind a toggle. Officers who want the raw
                        OCR confidence / match type can expand; everyone
                        else stays in plain language above. */}
                    <div className="rounded-lg border border-border bg-background/60">
                      <button
                        type="button"
                        onClick={() => setAdvancedOpen((v) => !v)}
                        className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        aria-expanded={advancedOpen}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <Icons.Sparkles className="h-3 w-3" />
                          {advancedOpen ? 'Hide technical details' : 'Show technical details'}
                        </span>
                        <Icons.ChevronDown
                          className={`h-3 w-3 transition-transform duration-200 ${advancedOpen ? 'rotate-180' : ''}`}
                        />
                      </button>
                      {advancedOpen && (
                        <div className="space-y-2.5 border-t border-border bg-muted/10 p-3">
                          {/* Row 1: completeness ring (left) + metadata stack (right).
                              Ring is large (44px) and shows the score in the
                              middle so it reads as a metric, not decoration. */}
                          <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                            {typeof scanResult.completenessScore === 'number' ? (
                              <div className="relative shrink-0" title={`${Math.round(scanResult.completenessScore * 100)}% of required keywords found in this document`}>
                                <CompletenessRing value={scanResult.completenessScore} size={56} stroke={4} />
                                <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
                                  <span className="text-[15px] font-bold tabular-nums text-foreground">
                                    {Math.round(scanResult.completenessScore * 100)}%
                                  </span>
                                  <span className="mt-0.5 text-[8px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    keywords
                                  </span>
                                </span>
                              </div>
                            ) : (
                              <div className="h-14 w-14 shrink-0 rounded-full border border-dashed border-border" aria-hidden="true" />
                            )}
                            <div className="min-w-0 flex-1 space-y-1">
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Required keywords found
                              </p>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                                  {scanResult.documentType || label}
                                  {scanResult.classificationConfidence > 0 && (
                                    <span className="text-primary/70 font-medium">
                                      · {Math.round(scanResult.classificationConfidence * 100)}% match
                                    </span>
                                  )}
                                </span>
                                <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                  {LANGUAGE_LABELS[scanResult.detectedLanguage] || 'Nepali / English'}
                                </span>
                                {tier && (
                                  <span
                                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${tier.className}`}
                                    title={`OCR confidence ${Math.round((scanResult.ocrConfidence || 0) * 100)}% · source: ${scanResult.classificationSource || 'unknown'}`}
                                  >
                                    <span className="font-medium opacity-80">OCR</span>
                                    <span className="opacity-60">·</span>
                                    {Math.round((scanResult.ocrConfidence || 0) * 100)}% {tier.label.toLowerCase()}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Row 2: stamp & name raw details — small two-column
                              block so each metric has space to breathe. */}
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {scanResult.stampAnalysis && (
                              <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                                  scanResult.stampAnalysis.stampColor === 'red' ? 'bg-red-500/10'
                                  : scanResult.stampAnalysis.stampColor === 'blue' ? 'bg-blue-500/10'
                                  : 'bg-purple-500/10'
                                }`}>
                                  <span className={`h-2.5 w-2.5 rounded-full ${
                                    scanResult.stampAnalysis.stampColor === 'red' ? 'bg-red-500'
                                    : scanResult.stampAnalysis.stampColor === 'blue' ? 'bg-blue-500'
                                    : 'bg-purple-500'
                                  }`} />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    Stamp analysis
                                  </p>
                                  <p className="text-xs font-semibold text-foreground">
                                    {scanResult.stampAnalysis.stampDetected
                                      ? scanResult.stampAnalysis.stampCount > 1
                                        ? `${scanResult.stampAnalysis.stampCount} stamps`
                                        : `${scanResult.stampAnalysis.stampColor || 'official'} stamp`
                                      : 'No stamp detected'}
                                    <span className="ml-1 font-normal text-muted-foreground">
                                      · {Math.round((scanResult.stampAnalysis.stampConfidence || 0) * 100)}% conf.
                                    </span>
                                  </p>
                                </div>
                              </div>
                            )}

                            {scanResult.nameVerification && (
                              <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                                  scanResult.nameVerification.nameFound
                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                    : 'bg-red-500/10 text-red-600 dark:text-red-400'
                                }`}>
                                  <Icons.User className="h-3.5 w-3.5" />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    Name match
                                  </p>
                                  <p className="text-xs font-semibold text-foreground">
                                    {scanResult.nameVerification.nameFound
                                      ? `Matched · ${scanResult.nameVerification.matchType || 'exact'}`
                                      : `Not matched · ${scanResult.nameVerification.matchType || 'not_found'}`}
                                    {scanResult.nameVerification.nameFound && (
                                      <span className="ml-1 font-normal text-muted-foreground">
                                        · {Math.round((scanResult.nameVerification.matchConfidence || 0) * 100)}% conf.
                                      </span>
                                    )}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Extracted-text preview — also collapsible so the row
                        stays compact, expand to verify what OCR actually saw.
                        Tier-2 #8: when full text is also captured, an extra
                        "Read full text" button opens the modal viewer. */}
                    {scanResult.extractedTextPreview && scanResult.extractedTextPreview !== '(OCR Service Unavailable)' && (
                      <div className="rounded-md border border-border bg-background/60">
                        <button
                          type="button"
                          onClick={() => setTextExpanded((v) => !v)}
                          className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                          aria-expanded={textExpanded}
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <Icons.Eye className="h-3 w-3" />
                            {textExpanded ? 'Hide extracted text' : 'View extracted text'}
                          </span>
                          <Icons.ChevronDown
                            className={`h-3 w-3 transition-transform duration-200 ${textExpanded ? 'rotate-180' : ''}`}
                          />
                        </button>
                        {textExpanded && (
                          <div className="space-y-2 border-t border-border bg-muted/20 p-2">
                            <pre className="max-h-40 overflow-auto text-[11px] leading-relaxed text-foreground whitespace-pre-wrap break-words font-mono">
                              {scanResult.extractedTextPreview}
                            </pre>
                            <div className="flex flex-wrap items-center gap-2">
                              {/* Tier-3 #12: open the side-by-side review modal when
                                  the AI service returned bounding boxes. Otherwise
                                  fall back to the plain full-text modal. */}
                              {hasReviewableBoxes && (
                                <button
                                  type="button"
                                  onClick={() => setReviewOpen(true)}
                                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
                                >
                                  <Icons.Eye className="h-3 w-3" />
                                  Open review
                                  <span className="text-muted-foreground font-normal">
                                    ({scanResult.textBoxes.length} words)
                                  </span>
                                </button>
                              )}
                              {hasFullText && (
                                <button
                                  type="button"
                                  onClick={() => setFullTextOpen(true)}
                                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
                                >
                                  <Icons.FileText className="h-3 w-3" />
                                  Read full text
                                  <span className="text-muted-foreground font-normal">
                                    ({scanResult.extractedText.length.toLocaleString()} chars)
                                  </span>
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : null}

                {/* Tier-2 #8: full extracted-text modal — opened by the
                    "Read full text" button when the full text is available. */}
                {hasFullText && (
                  <ExtractedTextModal
                    open={fullTextOpen}
                    onClose={() => setFullTextOpen(false)}
                    documentLabel={label}
                    text={scanResult.extractedText}
                    nepaliText={scanResult.nepaliText}
                    englishText={scanResult.englishText}
                  />
                )}

                {/* Tier-3 #12: side-by-side review modal — opened by the
                    "Open review" button when bounding boxes are available. */}
                {hasReviewableBoxes && (
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
              </div>

              <button
                type="button"
                onClick={() => onClearScan(id)}
                className="rounded p-1 text-muted-foreground hover:text-red-500 transition-colors cursor-pointer"
                title="Replace scan (clears result; re-uploads trigger a fresh OCR)"
                disabled={disabled || scanning}
              >
                <Icons.X className="h-4 w-4" />
              </button>
            </div>

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
                      onClick={() => {
                        setReviewOpen(true);
                      }}
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
