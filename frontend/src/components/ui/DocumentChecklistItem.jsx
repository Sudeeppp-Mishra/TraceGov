import React from 'react';
import { Icons, Button, Badge } from './index';

const LANGUAGE_LABELS = {
  nepali: 'Nepali (नेपाली)',
  english: 'English',
  mixed: 'Nepali + English',
  unknown: 'Unknown',
};

export function DocumentChecklistItem({
  item,
  onLabelChange,
  onRemove,
  onFileChange,
  onClearScan,
  onRetryScan,
  disabled,
}) {
  const { id, label, isCustom, scanPreview, scanResult, scanning, scanError, status } = item;

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
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onFileChange(id, file);
                e.target.value = '';
              }}
              disabled={disabled || scanning}
            />
          </label>
        ) : (
          <div className="space-y-2 rounded-lg border border-border bg-muted/10 p-3">
            <div className="flex items-start gap-3">
              <img
                src={scanPreview}
                alt={label}
                className="h-16 w-16 shrink-0 rounded-md border border-border bg-white object-cover shadow-xs"
              />
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
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                        {scanResult.documentType || label} ({Math.round((scanResult.classificationConfidence || 0) * 100)}%)
                      </span>
                      <span className="rounded-md bg-muted px-2 py-0.5 text-muted-foreground">
                        {LANGUAGE_LABELS[scanResult.detectedLanguage] || 'Nepali / English'}
                      </span>
                    </div>

                    {(scanResult.missingKeywords || []).length > 0 ? (
                      <p className="text-amber-600 dark:text-amber-400 font-medium">
                        ⚠️ Missing keywords: {(scanResult.missingKeywords || []).join(', ')}
                      </p>
                    ) : (
                      <p className="text-emerald-600 dark:text-emerald-400 font-medium">
                        ✓ All expected keywords and structure verified.
                      </p>
                    )}
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => onClearScan(id)}
                className="rounded p-1 text-muted-foreground hover:text-red-500 transition-colors cursor-pointer"
                title="Replace or clear scan"
                disabled={disabled || scanning}
              >
                <Icons.X className="h-4 w-4" />
              </button>
            </div>

            {scanError && (
              <p className="text-xs font-medium text-amber-600">{scanError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
