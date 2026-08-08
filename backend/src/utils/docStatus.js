// Single source of truth for the document checklist bucketing rule.
//
// The frontend mirror lives at `frontend/src/lib/docStatus.js` — keep the
// two files in sync. If the rule changes here, change it there too.
//
// Bug history: see `per-doc-source-of-truth` memory. Before this helper
// existed, every consumer inlined its own filter and the four surfaces
// (Register confirmation, Citizen Track, Resolve modal, email) drifted
// independently. Each one treated `status !== 'verified'` as "missing",
// which lumped `needs_review` (already uploaded, awaiting officer review)
// together with `not_uploaded` (never submitted), telling citizens that
// an uploaded document was still outstanding.
//
// Bucket definitions (status enum on File.documentVerifications[]):
//   not_uploaded — never submitted. Citizen action required. → MISSING
//   unverified   — default for newly-created rows with no scan. Citizen
//                  action still required (the office has nothing usable).
//                  → MISSING (treated identically to not_uploaded for the
//                  citizen-pending list — the office can't act without a
//                  scan, so from the citizen's side the doc is still owed).
//   needs_review — uploaded, OCR may have flagged missing keywords.
//                  Office responsibility. Citizen's job (uploading) is
//                  already done. → NEEDS REVIEW (separate bucket, never
//                  merges with missing).
//   verified     — officer has confirmed (or AI verified with no missing
//                  keywords). → VERIFIED.

export function isDocMissing(dv) {
  if (!dv) return true;
  if (dv.status === 'not_uploaded' || dv.status === 'unverified') return true;
  return false;
}

export function isDocNeedsReview(dv) {
  if (!dv) return false;
  return dv.status === 'needs_review';
}

export function isDocVerified(dv) {
  if (!dv) return false;
  return dv.status === 'verified';
}

/**
 * Returns the array of per-doc entries on a file, normalising absence to
 * an empty array. Callers can iterate without null-checking.
 */
export function getDocumentVerifications(file) {
  return Array.isArray(file?.documentVerifications) ? file.documentVerifications : [];
}

/**
 * Labels of documents the citizen still owes the office.
 *
 * Canonical source: the per-doc array. Only when the array is genuinely
 * absent (not just empty — files registered before the per-doc pipeline
 * existed) do we fall back to the legacy `documentVerification.missingKeywords`
 * / `documentVerification.missingDocuments` blob.
 */
export function getMissingDocs(file) {
  const dvs = getDocumentVerifications(file);
  if (dvs.length > 0) {
    return dvs.filter(isDocMissing).map((dv) => dv.documentLabel).filter(Boolean);
  }
  if (Array.isArray(file?.documentVerifications)) {
    // Present but empty — file has no required doc checklist at all.
    return [];
  }
  const legacy = file?.documentVerification;
  return [
    ...(Array.isArray(legacy?.missingKeywords) ? legacy.missingKeywords : []),
    ...(Array.isArray(legacy?.missingDocuments) ? legacy.missingDocuments : []),
  ];
}

/**
 * Labels of documents uploaded but flagged for officer review. Each label
 * is returned as a string.
 */
export function getNeedsReviewDocs(file) {
  return getDocumentVerifications(file)
    .filter(isDocNeedsReview)
    .map((dv) => dv.documentLabel)
    .filter(Boolean);
}

/**
 * Labels of verified documents.
 */
export function getVerifiedDocs(file) {
  return getDocumentVerifications(file)
    .filter(isDocVerified)
    .map((dv) => dv.documentLabel)
    .filter(Boolean);
}

export function getMissingCount(file) {
  return getMissingDocs(file).length;
}

export function getNeedsReviewCount(file) {
  return getNeedsReviewDocs(file).length;
}

export function getVerifiedCount(file) {
  return getDocumentVerifications(file).filter(isDocVerified).length;
}

/**
 * Filter a list of legacy `missingDocuments`/`missingKeywords` labels
 * down to those that are genuinely citizen-pending. Use this when reading
 * stale persisted lists (e.g. before the migration script has run) so the
 * email body and any other consumer never tells the citizen that an
 * already-uploaded document is still outstanding.
 */
export function filterCitizenPendingLabels(file, labels) {
  if (!Array.isArray(labels) || labels.length === 0) return [];
  const dvs = getDocumentVerifications(file);
  if (dvs.length === 0) return labels; // legacy fallback — no per-doc info
  return labels.filter((label) => {
    const match = dvs.find((dv) => dv && dv.documentLabel === label);
    if (!match) return true; // label not in documentVerifications -> pending
    return isDocMissing(match);
  });
}