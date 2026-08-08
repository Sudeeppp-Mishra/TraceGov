import { useState, useEffect, useRef } from 'react';
import { api } from '../../lib/api';
import { Button, Card, DocumentOcrResult, Icons, Input, Modal, Select, Tabs, Textarea } from '.';
import {
  getMissingDocs,
  getNeedsReviewDocs,
  getVerifiedDocs,
} from '../../lib/docStatus';

/**
 * Enforces QR-Scan verification as primary action flow for officer file operations.
 * Manual updates are supported as a secondary fallback requiring a mandatory reason.
 */
export function FileActions({
  selectedFile,
  currentUser,
  departmentsList = [],
  actionTab,
  setActionTab,
  tabs = [],
  actionLoading = false,
  scannedVia = 'manual', // 'webcam' | 'mobile' | 'manual'
  onScanClick,
  onForwardSubmit,
  onBacktrackSubmit,
  onReceiveSubmit,
  onResolveSuccess,
}) {
  // Routing form state
  const [nextLocation, setNextLocation] = useState('');
  const [nextStatus, setNextStatus] = useState('Pending');
  const [routingNotes, setRoutingNotes] = useState('');

  // Backtrack form state
  const [backtrackLocation, setBacktrackLocation] = useState('');
  const [backtrackReason, setBacktrackReason] = useState('');
  const [internalNotes, setInternalNotes] = useState('');

  // Manual bypass mandatory reason
  const [manualReason, setManualReason] = useState('');
  const [manualReasonError, setManualReasonError] = useState('');

  // Resolve missing documents modal state. Per-row handlers (upload /
  // reupload / reviewed) drive their own loading + error state — see
  // uploadLoadingIdx, reviewLoadingIdx, etc. — so there is no bulk
  // "resolveLoading" or global preview state to manage here.
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [resolveNotes, setResolveNotes] = useState('');

  // Per-row state for the new per-doc actions. Each row tracks its own
  // loading flag and error message; bulk state lives in `resolveLoading`.
  const [uploadLoadingIdx, setUploadLoadingIdx] = useState(null);
  const [uploadErrorIdx, setUploadErrorIdx] = useState({});
  const [reuploadLoadingIdx, setReuploadLoadingIdx] = useState(null);
  const [reuploadErrorIdx, setReuploadErrorIdx] = useState({});
  const [reviewLoadingIdx, setReviewLoadingIdx] = useState(null);
  const [reviewErrorIdx, setReviewErrorIdx] = useState({});
  // Per-row override state: when the backend returns 400 with
  // needsOverride:true, we render an inline checkbox the officer must
  // check before the second click goes through with forceVerified:true.
  const [reviewOverrideIdx, setReviewOverrideIdx] = useState({});
  const [reviewOverrideChecked, setReviewOverrideChecked] = useState({});
  // Per-row OCR feedback after a re-upload. The backend's reuploadDocument
  // controller already runs the full aiAnalyzeDocument pipeline and writes
  // every scan field into documentVerifications[idx]; we thread the response
  // through here so the officer sees the same OCR panel as on the Register
  // page, without scrolling to the separate "AI Scan Detail" section.
  const [reuploadResultByLabel, setReuploadResultByLabel] = useState({});

  const isScanVerified = scannedVia === 'webcam' || scannedVia === 'mobile';

  // When the officer clicks "Edit / Resolve" without QR verification, we open the
  // scanner first. This ref remembers that intent so we auto-open the resolve modal
  // as soon as the scan succeeds, instead of dumping the officer back to the page.
  const pendingResolveRef = useRef(false);
  useEffect(() => {
    if (isScanVerified && pendingResolveRef.current) {
      pendingResolveRef.current = false;
      setIsResolveModalOpen(true);
    }
  }, [isScanVerified]);
  const isClosed = ['Dispatched', 'Approved', 'Rejected'].includes(selectedFile?.currentStatus);
  const isInTransit = selectedFile?.currentStatus === 'In Transit';

  const isTargetDeskForCurrentOfficer = Boolean(
    currentUser?.deskLocation &&
    selectedFile?.targetLocation &&
    currentUser.deskLocation.toLowerCase().trim() === selectedFile.targetLocation.toLowerCase().trim()
  );

  // Per-doc source of truth: route through the shared helper so the
  // banner, the modal, and the email body all agree on what counts as
  // "missing" vs "needs review" vs "verified".
  const missingDocs = getMissingDocs(selectedFile);
  const needsReviewDocs = getNeedsReviewDocs(selectedFile);
  const verifiedCount = getVerifiedDocs(selectedFile).length;
  const hasMissingDocs = missingDocs.length > 0 || selectedFile?.verificationStatus === 'missing-documents';
  // needs_review still blocks forward/backtrack (per sendFileCore) but is
  // NOT a citizen-action banner — it's the office's own backlog.
  const hasBlockingDocs = hasMissingDocs || needsReviewDocs.length > 0;

  const [overrideReason, setOverrideReason] = useState('');

  const handleReceive = (e) => {
    if (e) e.preventDefault();
    setManualReasonError('');

    if (!isScanVerified && !manualReason.trim()) {
      setManualReasonError('Mandatory reason required for manual receipt confirm (e.g. QR damaged, Camera unavailable).');
      return;
    }

    if (onReceiveSubmit) {
      onReceiveSubmit({
        scannedVia: isScanVerified ? scannedVia : 'manual',
        remarks: isScanVerified ? undefined : manualReason.trim(),
      });
    }
  };

  const handleForward = (e) => {
    e.preventDefault();
    setManualReasonError('');

    if (!isScanVerified) {
      if (!manualReason.trim()) {
        setManualReasonError('Physical file QR verification required! Please scan the envelope QR tag to confirm file custody before forwarding.');
        onScanClick();
        return;
      }
    }

    if (hasMissingDocs && !overrideReason.trim()) {
      setManualReasonError(`Cannot forward file: missing required document(s) (${missingDocs.join(', ')}). Either upload missing documents or enter an official Officer Override reason below.`);
      return;
    }

    onForwardSubmit({
      nextLocation,
      nextStatus,
      notes: routingNotes.trim(),
      scannedVia: isScanVerified ? scannedVia : 'manual',
      remarks: isScanVerified ? undefined : manualReason.trim(),
      overrideReason: overrideReason.trim() || undefined,
    });
  };

  const handleBacktrack = (e) => {
    e.preventDefault();
    setManualReasonError('');

    if (!isScanVerified) {
      if (!manualReason.trim()) {
        setManualReasonError('Physical file QR verification required! Please scan the envelope QR tag to confirm file custody before backtracking.');
        onScanClick();
        return;
      }
    }

    onBacktrackSubmit({
      returnLocation: backtrackLocation,
      backtrackReason: backtrackReason.trim(),
      internalNotes: internalNotes.trim(),
      scannedVia: isScanVerified ? scannedVia : 'manual',
      remarks: isScanVerified ? undefined : manualReason.trim(),
    });
  };

  // Find the index of a label within the file's documentVerifications[]
  // array. Returns -1 if not found (legacy files without per-doc entries).
  function findIdx(label) {
    const dvs = Array.isArray(selectedFile?.documentVerifications) ? selectedFile.documentVerifications : [];
    return dvs.findIndex((dv) => dv && dv.documentLabel === label);
  }

  // Per-row handler: officer uploads a missing doc on the citizen's behalf.
  // Backend runs the standard AI OCR pipeline; status flips to verified on
  // a clean scan or stays needs_review if OCR flags any missing keywords.
  const handlePerRowUpload = async (docLabel, file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const fileId = selectedFile?.id || selectedFile?._id;
    if (!fileId) return;
    const idx = findIdx(docLabel);
    if (idx < 0) {
      setUploadErrorIdx((prev) => ({ ...prev, [docLabel]: 'Document not found in verification array.' }));
      return;
    }
    setUploadLoadingIdx(`${docLabel}-upload`);
    setUploadErrorIdx((prev) => ({ ...prev, [docLabel]: '' }));
    try {
      const reader = new FileReader();
      const base64 = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await api.uploadDocumentOnBehalf(fileId, idx, {
        imageBase64: base64,
        documentLabel: docLabel,
        scannedVia: 'manual',
        notes: resolveNotes.trim() || undefined,
      });
      if (onResolveSuccess) onResolveSuccess();
    } catch (err) {
      setUploadErrorIdx((prev) => ({ ...prev, [docLabel]: err.message || 'Upload failed.' }));
    } finally {
      setUploadLoadingIdx(null);
    }
  };

  // Per-row handler: officer replaces a needs_review scan with a new photo.
  // The backend runs the full aiAnalyzeDocument pipeline; the response
  // includes the updated documentVerification, which we surface inline via
  // the shared DocumentOcrResult panel so the officer reads the same OCR
  // feedback they see on the Register page.
  const handlePerRowReupload = async (docLabel, file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const fileId = selectedFile?.id || selectedFile?._id;
    if (!fileId) return;
    const idx = findIdx(docLabel);
    if (idx < 0) {
      setReuploadErrorIdx((prev) => ({ ...prev, [docLabel]: 'Document not found in verification array.' }));
      return;
    }
    setReuploadLoadingIdx(`${docLabel}-reupload`);
    setReuploadErrorIdx((prev) => ({ ...prev, [docLabel]: '' }));
    try {
      const reader = new FileReader();
      const base64 = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await api.reuploadDocument(fileId, idx, {
        imageBase64: base64,
        scannedVia: 'manual',
        notes: resolveNotes.trim() || undefined,
      });
      // Thread the OCR result back into per-row state so the officer can
      // see exactly what the AI returned for this scan — extracted text,
      // completeness %, stamp analysis, name match, etc.
      if (res?.documentVerification) {
        setReuploadResultByLabel((prev) => ({ ...prev, [docLabel]: res.documentVerification }));
      }
      if (onResolveSuccess) onResolveSuccess();
    } catch (err) {
      setReuploadErrorIdx((prev) => ({ ...prev, [docLabel]: err.message || 'Re-upload failed.' }));
    } finally {
      setReuploadLoadingIdx(null);
    }
  };

  // Per-row handler: officer manual sign-off for a needs_review doc.
  // If the row still has missingKeywords, the first click surfaces the
  // override checkbox; the second click (with forceVerified:true) flips
  // the row to verified even though the OCR didn't.
  const handlePerRowReviewed = async (docLabel) => {
    const fileId = selectedFile?.id || selectedFile?._id;
    if (!fileId) return;
    const idx = findIdx(docLabel);
    if (idx < 0) {
      setReviewErrorIdx((prev) => ({ ...prev, [docLabel]: 'Document not found in verification array.' }));
      return;
    }
    const forceVerified = !!reviewOverrideChecked[docLabel];
    setReviewLoadingIdx(`${docLabel}-reviewed`);
    setReviewErrorIdx((prev) => ({ ...prev, [docLabel]: '' }));
    try {
      await api.reviewDocumentReviewed(fileId, idx, {
        notes: resolveNotes.trim() || undefined,
        forceVerified,
      });
      // Clear the override flag and any cached OCR card once the call
      // succeeded — the row is leaving the "Under Review" section.
      setReviewOverrideChecked((prev) => ({ ...prev, [docLabel]: false }));
      setReviewOverrideIdx((prev) => ({ ...prev, [docLabel]: false }));
      setReuploadResultByLabel((prev) => {
        if (!(docLabel in prev)) return prev;
        const next = { ...prev };
        delete next[docLabel];
        return next;
      });
      if (onResolveSuccess) onResolveSuccess();
    } catch (err) {
      // Backend returns 400 with `{ needsOverride: true, missingKeywords }`
      // when an officer tries to sign off a row whose OCR still has flags
      // — surface the inline checkbox for explicit confirmation.
      const data = err?.data || err?.response?.data;
      if (err?.status === 400 && data?.needsOverride) {
        setReviewOverrideIdx((prev) => ({ ...prev, [docLabel]: true }));
        setReviewErrorIdx((prev) => ({
          ...prev,
          [docLabel]: `Document has flagged keywords: ${(data.missingKeywords || []).join(', ')}`,
        }));
      } else if (err?.status === 400 || err?.status === 409) {
        // Stale index (server-side `documentVerifications[]` shrank since
        // the modal opened), or some other validation/state error. Surface
        // the actual server message instead of "Review failed.", and
        // refetch the file so the row list stays in sync — clicking the
        // same button again against a fresh index usually resolves it.
        const msg = data?.error || err.message || 'Review failed.';
        setReviewErrorIdx((prev) => ({ ...prev, [docLabel]: `${msg} — refreshing file state.` }));
        // Reset override flag — it's no longer meaningful against a stale row.
        setReviewOverrideChecked((prev) => ({ ...prev, [docLabel]: false }));
        setReviewOverrideIdx((prev) => ({ ...prev, [docLabel]: false }));
        if (onResolveSuccess) onResolveSuccess();
      } else {
        setReviewErrorIdx((prev) => ({ ...prev, [docLabel]: err.message || 'Review failed.' }));
      }
    } finally {
      setReviewLoadingIdx(null);
    }
  };

  if (!selectedFile) {
    return (
      <Card className="text-center py-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icons.Scan className="h-7 w-7" />
        </div>
        <h3 className="mt-4 text-lg font-bold text-foreground">Scan QR tag to select file</h3>
        <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
          Scan the envelope QR tag at your desk for instant verification, or fallback to manual search if unreadable.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button variant="primary" size="lg" onClick={onScanClick} className="w-full sm:w-auto shadow-md">
            <Icons.Scan className="h-5 w-5" /> Scan QR tag (Primary)
          </Button>
        </div>
      </Card>
    );
  }

  const isWardChair = currentUser?.role === 'ward_chair';

  if (isWardChair) {
    return (
      <Card className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-xs text-blue-900 dark:text-blue-200">
          <Icons.Shield className="h-5 w-5 text-blue-600 shrink-0" />
          <div>
            <strong className="font-bold text-sm block">Ward Chair Inspection View</strong>
            <span>Read-only inspection mode. All file details, OCR scans, ledger movements, and AI bottleneck predictions are visible below. Routing actions are disabled.</span>
          </div>
        </div>

        {hasMissingDocs && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-2">
            <p className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
              <Icons.AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
              Missing Required Document(s) ({missingDocs.length})
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {missingDocs.map((doc) => (
                <li key={doc} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-950 dark:text-amber-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                  {doc}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card className="space-y-5">
      {/* Verification Status Banner */}
      <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl border text-xs ${
        isScanVerified
          ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
          : 'border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-300'
      }`}>
        <div className="flex items-center gap-2">
          {isScanVerified ? (
            <>
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white">
                <Icons.Check className="h-3.5 w-3.5" />
              </span>
              <div>
                <strong className="font-bold">QR Scan Verified ({scannedVia})</strong>
                <p className="text-[11px] opacity-80">Physical envelope verified at desk desk log.</p>
              </div>
            </>
          ) : (
            <>
              <Icons.AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
              <div>
                <strong className="font-bold">Manual Entry Mode</strong>
                <p className="text-[11px] opacity-80">Action not verified via QR scan. Mandatory reason required.</p>
              </div>
            </>
          )}
        </div>

        <Button
          variant={isScanVerified ? 'outline' : 'primary'}
          size="sm"
          onClick={onScanClick}
          className="shrink-0"
        >
          <Icons.Scan className="h-3.5 w-3.5" />
          {isScanVerified ? 'Re-scan QR' : 'Verify with QR scan'}
        </Button>
      </div>

      {/* Missing Required Documents Alert Banner & Edit Modal Trigger.
          Uses `hasBlockingDocs` (not just `hasMissingDocs`) so the banner
          stays visible while any needs_review row is still pending — the
          forward/backtrack gate in sendFileCore blocks on both buckets. */}
      {hasBlockingDocs && !isClosed && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Icons.AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <strong className="text-sm font-bold text-amber-950 dark:text-amber-100">
                  Routing Blocked — {missingDocs.length} missing, {needsReviewDocs.length} awaiting review
                </strong>
                <p className="text-xs text-amber-900/80 dark:text-amber-300/80 mt-0.5">
                  Forwarding and backtracking are locked until the checklist is complete and officer review has been resolved.
                </p>
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (!isScanVerified) {
                  pendingResolveRef.current = true;
                  onScanClick();
                  return;
                }
                setIsResolveModalOpen(true);
              }}
              className="shrink-0 shadow-sm"
            >
              <Icons.FileText className="h-3.5 w-3.5" /> Edit / Resolve Documents
            </Button>
          </div>
          {missingDocs.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 pt-1">
              {missingDocs.map((doc) => (
                <li key={doc} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-950 dark:text-amber-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                  {doc}
                </li>
              ))}
            </ul>
          )}
          {needsReviewDocs.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 pt-1">
              {needsReviewDocs.map((doc) => (
                <li key={doc} className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/20 px-2.5 py-1 text-xs font-semibold text-sky-950 dark:text-sky-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-600" />
                  {doc} (review)
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* If file is in transit, block all forward/backtrack actions until physical receipt is confirmed */}
      {isInTransit ? (
        <div className="space-y-4 p-5 rounded-2xl border border-primary/30 bg-primary/[0.03]">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icons.Clock className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-foreground">
                File in transit to {selectedFile.targetLocation || 'your desk'}
              </h4>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Sent from <strong>{selectedFile.currentLocation}</strong>. Physical receipt confirmation is required before any forward or backtrack routing can be performed.
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <Button
              variant="primary"
              size="lg"
              onClick={onScanClick}
              className="w-full shadow-md"
              loading={actionLoading}
            >
              <Icons.Scan className="h-5 w-5" /> Scan QR Tag to Confirm Receipt (Primary)
            </Button>

            <div className="pt-2 border-t border-border/60 space-y-2">
              <label htmlFor="manual_receive_reason" className="block text-xs font-semibold text-muted-foreground">
                Can't scan? Confirm receipt manually with mandatory reason <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  id="manual_receive_reason"
                  placeholder="e.g. QR code damaged, Camera unavailable"
                  value={manualReason}
                  onChange={(e) => {
                    setManualReason(e.target.value);
                    if (e.target.value.trim()) setManualReasonError('');
                  }}
                  className="bg-background text-xs flex-1"
                />
                <Button
                  variant="outline"
                  size="md"
                  onClick={handleReceive}
                  className="shrink-0"
                  loading={actionLoading}
                >
                  Confirm Receipt Manually
                </Button>
              </div>
              {manualReasonError && (
                <p className="text-xs font-semibold text-red-500 mt-1">{manualReasonError}</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          <Tabs tabs={tabs} active={actionTab} onChange={setActionTab} />

          {/* Manual Action Bypass Reason Box */}
          {!isScanVerified && !isClosed && actionTab !== 'ai' && (
            <div className="space-y-1.5 p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5">
              <label htmlFor="manual_reason_input" className="block text-xs font-semibold text-amber-900 dark:text-amber-200">
                Mandatory manual update reason <span className="text-red-500">*</span>
              </label>
              <Input
                id="manual_reason_input"
                placeholder="e.g. QR code damaged, Camera unavailable, Bulk processing"
                value={manualReason}
                onChange={(e) => {
                  setManualReason(e.target.value);
                  if (e.target.value.trim()) setManualReasonError('');
                }}
                required
                className="bg-background text-xs"
              />
              {manualReasonError && (
                <p className="text-xs font-semibold text-red-500 mt-1">{manualReasonError}</p>
              )}
            </div>
          )}

          {actionTab === 'forward' && !isClosed && (
            <form onSubmit={handleForward} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label="Target desk"
                  id="f_loc"
                  value={nextLocation}
                  onChange={(e) => setNextLocation(e.target.value)}
                  required={!['Approved', 'Dispatched'].includes(nextStatus)}
                >
                  <option value="">Choose desk…</option>
                  {departmentsList
                    .filter((d) => d.isActive)
                    .map((d) => (
                      <option key={d.name} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                </Select>
                <Select
                  label="Update file status"
                  id="f_status"
                  value={nextStatus}
                  onChange={(e) => setNextStatus(e.target.value)}
                  required
                >
                  <option value="Pending">Pending (Under routing)</option>
                  <option value="Under Review">Under Review (Details verification)</option>
                  <option value="Verified">Verified (Verification complete)</option>
                  <option value="Approved">Approved (Final endorsement)</option>
                  <option value="Dispatched">Dispatched (Closed / Archiving)</option>
                </Select>
              </div>

              <Textarea
                label="Routing notes"
                id="f_notes"
                rows={2}
                placeholder="e.g. Verification complete, forwarding for final endorsement."
                value={routingNotes}
                onChange={(e) => setRoutingNotes(e.target.value)}
              />

              {hasMissingDocs && (
                <div className="space-y-1.5 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs">
                  <p className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1">
                    <Icons.AlertCircle className="h-4 w-4 text-amber-600 shrink-0" /> File has missing required document(s): {missingDocs.join(', ')}
                  </p>
                  <p className="text-amber-800/80 dark:text-amber-300/80">
                    To forward before resolving attachments, enter an official Officer Override reason (logged to audit ledger):
                  </p>
                  <Input
                    id="forward_override_reason"
                    placeholder="e.g. Approved verbal exemption by Ward Chair"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    className="bg-background text-xs"
                  />
                </div>
              )}

              <div className="flex justify-end">
                <Button type="submit" variant="primary" loading={actionLoading}>
                  Confirm forward <Icons.ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </form>
          )}

          {actionTab === 'backtrack' && !isClosed && (
            <form onSubmit={handleBacktrack} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label="Return to desk"
                  id="b_loc"
                  value={backtrackLocation}
                  onChange={(e) => setBacktrackLocation(e.target.value)}
                  required
                >
                  <option value="">Choose desk…</option>
                  {departmentsList
                    .filter((d) => d.isActive)
                    .map((d) => (
                      <option key={d.name} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                </Select>
                <Input
                  label="Reason (visible to citizen)"
                  id="b_reason"
                  placeholder="e.g. Missing ward form stamp."
                  value={backtrackReason}
                  onChange={(e) => setBacktrackReason(e.target.value)}
                  required
                />
              </div>

              <Textarea
                label="Internal notes (hidden from citizens)"
                id="b_int"
                rows={2}
                placeholder="e.g. Verify citizen ID against database records."
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
              />

              <div className="flex justify-end">
                <Button type="submit" variant="danger" loading={actionLoading}>
                  Confirm backtrack
                </Button>
              </div>
            </form>
          )}
        </>
      )}

      {/* Edit / Resolve Missing Documents Modal — now powered by per-doc
          endpoints so each row updates independently and the page reflects
          the new state without a full reload. Three sections, mirroring
          the bucket rule in `lib/docStatus.js`:
            A. Missing documents       → Upload button (signal-blue)
            B. Documents under review  → Reviewed (primary) + Re-upload (outline)
            C. Verified documents      → collapsible footer, no actions
          Auto-clear of the "Routing Blocked" banner on the parent card
          happens via onResolveSuccess → OfficerDashboard re-fetches
          selectedFile, which recomputes hasBlockingDocs through the
          shared helper. */}
      <Modal
        isOpen={isResolveModalOpen}
        onClose={() => setIsResolveModalOpen(false)}
        title="Resolve Attachments"
        description={`${selectedFile?.title || 'this file'} · ${missingDocs.length} missing · ${needsReviewDocs.length} under review`}
      >
        <div className="space-y-5">
          {/* Officer Notes — applied to the next per-doc action submit. */}
          <Textarea
            label="Officer notes (optional)"
            id="resolve_notes"
            rows={2}
            placeholder="e.g. Received original physical copy at Reception desk."
            value={resolveNotes}
            onChange={(e) => setResolveNotes(e.target.value)}
          />

          {/* Section A — Missing documents */}
          {missingDocs.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-300">
                <Icons.AlertCircle className="h-4 w-4" />
                Missing ({missingDocs.length})
              </div>
              {missingDocs.map((doc) => {
                const loading = uploadLoadingIdx === `${doc}-upload`;
                const err = uploadErrorIdx[doc];
                return (
                  <div
                    key={`missing-${doc}`}
                    className="flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300">
                        <Icons.FileText className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate">{doc}</p>
                        <p className="text-[11px] text-muted-foreground">Not uploaded</p>
                      </div>
                      <label
                        className={`flex items-center gap-1.5 cursor-pointer rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 transition-all shrink-0 shadow-xs ${
                          loading ? 'opacity-50 pointer-events-none' : ''
                        }`}
                      >
                        <Icons.Upload className="h-3.5 w-3.5" />
                        {loading ? 'Uploading…' : 'Upload'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handlePerRowUpload(doc, file);
                            e.target.value = '';
                          }}
                          disabled={loading}
                        />
                      </label>
                    </div>
                    {err && (
                      <p className="pl-10 text-[11px] font-semibold text-red-600">{err}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Section B — Documents under review */}
          {needsReviewDocs.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-sky-700 dark:text-sky-300">
                <Icons.Clock className="h-4 w-4" />
                Under Review ({needsReviewDocs.length})
              </div>
              {needsReviewDocs.map((doc) => {
                const loading = reviewLoadingIdx === `${doc}-reviewed`;
                const reupLoading = reuploadLoadingIdx === `${doc}-reupload`;
                const err = reviewErrorIdx[doc] || reuploadErrorIdx[doc];
                const showOverride = !!reviewOverrideIdx[doc];
                const overrideChecked = !!reviewOverrideChecked[doc];
                return (
                  <div
                    key={`review-${doc}`}
                    className="flex flex-col gap-2 rounded-xl border border-sky-500/30 bg-sky-500/5 p-3.5"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-700 dark:text-sky-300">
                        <Icons.Clock className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate">{doc}</p>
                        <p className="text-[11px] text-muted-foreground">Awaiting officer review</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handlePerRowReviewed(doc)}
                          disabled={loading || reupLoading || (showOverride && !overrideChecked)}
                          loading={loading}
                          className="shadow-sm"
                        >
                          <Icons.CheckCircle className="h-3.5 w-3.5" /> Reviewed
                        </Button>
                        <label
                          className={`flex items-center gap-1.5 cursor-pointer rounded-lg border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 transition-all shadow-xs ${
                            reupLoading ? 'opacity-50 pointer-events-none' : ''
                          }`}
                        >
                          <Icons.RefreshCw className="h-3.5 w-3.5" />
                          {reupLoading ? '…' : 'Re-upload'}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handlePerRowReupload(doc, file);
                              e.target.value = '';
                            }}
                            disabled={reupLoading}
                          />
                        </label>
                      </div>
                    </div>
                    {showOverride && (
                      <label className="flex items-start gap-2 pl-10 text-[11px] text-amber-800 dark:text-amber-200">
                        <input
                          type="checkbox"
                          checked={overrideChecked}
                          onChange={(e) =>
                            setReviewOverrideChecked((prev) => ({ ...prev, [doc]: e.target.checked }))
                          }
                          className="mt-0.5 h-3.5 w-3.5 rounded border-amber-500/40 text-amber-600 focus:ring-amber-500/30"
                        />
                        <span>
                          <strong className="font-bold">[OFFICER OVERRIDE]</strong> This document has flagged missing keywords. Confirm to mark as verified despite the OCR findings.
                        </span>
                      </label>
                    )}
                    {err && (
                      <p className="pl-10 text-[11px] font-semibold text-red-600">{err}</p>
                    )}
                    {/* Inline OCR feedback for the latest re-upload on this
                        row. Same component the Register page uses, so the
                        officer reads identical OCR output here as anywhere
                        else in the app — no need to scroll to the separate
                        "AI Scan Detail" section to see what changed. */}
                    {reuploadResultByLabel[doc] && (
                      <div className="pl-10">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-sky-700 dark:text-sky-300">
                            <Icons.Sparkles className="h-3.5 w-3.5" />
                            Latest OCR scan
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              setReuploadResultByLabel((prev) => {
                                const next = { ...prev };
                                delete next[doc];
                                return next;
                              })
                            }
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground hover:text-red-500 transition-colors cursor-pointer"
                            title="Dismiss OCR result"
                          >
                            <Icons.X className="h-3 w-3" />
                            Dismiss
                          </button>
                        </div>
                        <DocumentOcrResult
                          scanResult={reuploadResultByLabel[doc]}
                          documentLabel={doc}
                          imagePreview={
                            reuploadResultByLabel[doc].imagePreviews?.[0] ||
                            reuploadResultByLabel[doc].imagePreview
                          }
                          pagePreviews={reuploadResultByLabel[doc].imagePreviews || []}
                          compact
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Section C — Verified (collapsible footer, no actions). */}
          {verifiedCount > 0 && (
            <details className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
              <summary className="flex cursor-pointer items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
                <Icons.Check className="h-4 w-4" />
                Verified ({verifiedCount})
              </summary>
              <ul className="mt-2 space-y-1 pl-1">
                {getVerifiedDocs(selectedFile).map((doc) => (
                  <li
                    key={`verified-${doc}`}
                    className="flex items-center gap-2 text-[11px] font-medium text-emerald-800 dark:text-emerald-200"
                  >
                    <Icons.Check className="h-3 w-3 text-emerald-600" />
                    {doc}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {missingDocs.length === 0 && needsReviewDocs.length === 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <Icons.CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                All documents verified. Forwarding is now unlocked.
              </p>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-1 border-t border-border">
            <Button variant="ghost" size="sm" onClick={() => setIsResolveModalOpen(false)} className="text-muted-foreground">
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

export default FileActions;
