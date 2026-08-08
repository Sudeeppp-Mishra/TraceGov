// Single source of truth for the document checklist bucketing rule on the
// client. The backend mirror lives at `backend/src/utils/docStatus.js` —
// keep the two files in sync. If the rule changes here, change it there.
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
//                  action still required. → MISSING.
//   needs_review — uploaded, OCR may have flagged missing keywords.
//                  Office responsibility. → NEEDS REVIEW (separate bucket).
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
 * an empty array.
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
    return [];
  }
  const legacy = file?.documentVerification;
  return [
    ...(Array.isArray(legacy?.missingKeywords) ? legacy.missingKeywords : []),
    ...(Array.isArray(legacy?.missingDocuments) ? legacy.missingDocuments : []),
  ];
}

/**
 * Labels of documents uploaded but flagged for officer review.
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