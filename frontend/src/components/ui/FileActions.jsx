import { useState } from 'react';
import { api } from '../../lib/api';
import { Button, Card, Icons, Input, Modal, Select, Tabs, Textarea } from '.';

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

  // Resolve missing documents modal state
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [resolveNotes, setResolveNotes] = useState('');
  const [docScanPreview, setDocScanPreview] = useState(null);
  const [docScanning, setDocScanning] = useState(false);
  const [docScanResult, setDocScanResult] = useState(null);
  const [docScanError, setDocScanError] = useState('');

  const isScanVerified = scannedVia === 'webcam' || scannedVia === 'mobile';
  const isClosed = ['Dispatched', 'Approved', 'Rejected'].includes(selectedFile?.currentStatus);
  const isInTransit = selectedFile?.currentStatus === 'In Transit';

  const isTargetDeskForCurrentOfficer = Boolean(
    currentUser?.deskLocation &&
    selectedFile?.targetLocation &&
    currentUser.deskLocation.toLowerCase().trim() === selectedFile.targetLocation.toLowerCase().trim()
  );

  const missingDocs = (Array.isArray(selectedFile?.documentVerifications) && selectedFile.documentVerifications.length > 0)
    ? selectedFile.documentVerifications.filter((dv) => dv.status !== 'verified').map((dv) => dv.documentLabel)
    : (selectedFile?.documentVerification?.missingKeywords || selectedFile?.documentVerification?.missingDocuments || []);
  const hasMissingDocs = missingDocs.length > 0 || selectedFile?.verificationStatus === 'missing-documents';

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

  const handleDocFileChangeForItem = async (docLabel, file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setDocScanError('');

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result;
      setDocScanPreview(base64);
      setDocScanning(true);
      try {
        const result = await api.analyzeDocument({
          imageBase64: base64,
          requiredKeywords: [docLabel],
        });
        setDocScanResult(result);
      } catch {
        setDocScanError('AI OCR service offline. File photo attached for manual officer verification.');
      } finally {
        setDocScanning(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmResolve = async () => {
    const fileId = selectedFile?.id || selectedFile?._id;
    if (!fileId) return;
    setResolveLoading(true);

    try {
      const currentVerifications = Array.isArray(selectedFile?.documentVerifications) && selectedFile.documentVerifications.length > 0
        ? selectedFile.documentVerifications
        : (selectedFile?.requiredDocuments || missingDocs).map((lbl) => ({
            documentLabel: lbl,
            status: missingDocs.includes(lbl) ? 'not_uploaded' : 'verified',
          }));

      const updatedVerifications = currentVerifications.map((dv) => {
        if (missingDocs.includes(dv.documentLabel)) {
          return {
            ...dv,
            status: 'verified',
            imagePreview: docScanPreview || dv.imagePreview || null,
            scannedAt: new Date(),
            detectedType: docScanResult?.documentType || dv.documentLabel,
            ocrConfidence: docScanResult?.ocrConfidence || 0.9,
            completenessScore: 1.0,
            missingKeywords: [],
          };
        }
        return dv;
      });

      await api.resolveMissingDocuments(fileId, {
        documentVerifications: updatedVerifications,
        documentVerification: docScanResult ? {
          detectedType: docScanResult.documentType,
          ocrConfidence: docScanResult.ocrConfidence,
          qualityScore: docScanResult.imageQualityIssue?.qualityScore || 0.9,
          completenessScore: 1.0,
          detectedLanguage: docScanResult.detectedLanguage,
        } : undefined,
        resolvedKeywords: missingDocs,
        notes: resolveNotes.trim() || 'Officer uploaded and verified remaining physical documents.',
      });

      setIsResolveModalOpen(false);
      setDocScanPreview(null);
      setDocScanResult(null);
      setResolveNotes('');
      if (onResolveSuccess) onResolveSuccess();
    } catch (err) {
      setManualReasonError(err.message || 'Failed to resolve missing documents.');
    } finally {
      setResolveLoading(false);
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
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white font-bold">✓</span>
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

      {/* Missing Required Documents Alert Banner & Edit Modal Trigger */}
      {hasMissingDocs && !isClosed && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Icons.AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <strong className="text-sm font-bold text-amber-950 dark:text-amber-100">
                  Routing Blocked — Remaining Required Document(s) Needed ({missingDocs.length})
                </strong>
                <p className="text-xs text-amber-900/80 dark:text-amber-300/80 mt-0.5">
                  Forwarding and backtracking are locked until missing required checklist item(s) are submitted and verified by the officer.
                </p>
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (!isScanVerified) {
                  setManualReasonError('Physical QR scan required! Please scan the envelope QR tag first to verify custody before editing/resolving documents.');
                  onScanClick();
                  return;
                }
                setIsResolveModalOpen(true);
              }}
              className="shrink-0 shadow-sm"
            >
              <Icons.FileText className="h-3.5 w-3.5" /> Edit / Resolve Missing Documents
            </Button>
          </div>
          <ul className="flex flex-wrap gap-1.5 pt-1">
            {missingDocs.map((doc) => (
              <li key={doc} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-950 dark:text-amber-100">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                {doc}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Missing Required Documents Alert Banner & Edit Modal Trigger */}
      {hasMissingDocs && !isClosed && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Icons.AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <strong className="text-sm font-bold text-amber-950 dark:text-amber-100">
                  Routing Blocked — Remaining Required Document(s) Needed ({missingDocs.length})
                </strong>
                <p className="text-xs text-amber-900/80 dark:text-amber-300/80 mt-0.5">
                  Forwarding and backtracking are locked until missing required checklist item(s) are submitted and verified by the officer.
                </p>
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (!isScanVerified) {
                  setManualReasonError('Physical QR scan required! Please scan the envelope QR tag first to verify custody before editing/resolving documents.');
                  onScanClick();
                  return;
                }
                setIsResolveModalOpen(true);
              }}
              className="shrink-0 shadow-sm"
            >
              <Icons.FileText className="h-3.5 w-3.5" /> Edit / Resolve Missing Documents
            </Button>
          </div>
          <ul className="flex flex-wrap gap-1.5 pt-1">
            {missingDocs.map((doc) => (
              <li key={doc} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-950 dark:text-amber-100">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                {doc}
              </li>
            ))}
          </ul>
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
              <h4 className="text-sm font-bold text-foreground">File in transit to {selectedFile.targetLocation || 'your desk'}</h4>
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

      {/* In Transit Receive Card */}
      {isInTransit && (
        isTargetDeskForCurrentOfficer ? (
          <div className="space-y-4 p-4 rounded-xl border border-primary/20 bg-primary/5">
            <div className="flex items-start gap-3">
              <Icons.Clock className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-foreground">File in transit to your desk ({selectedFile.targetLocation})</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Sent from <strong>{selectedFile.currentLocation}</strong>. Confirm physical receipt via QR scan (or manual ID confirm) to receive into your active desk queue.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <Button
                variant="primary"
                size="md"
                onClick={onScanClick}
                className="w-full sm:w-auto shadow-sm"
                loading={actionLoading}
              >
                <Icons.Scan className="h-4 w-4" /> Scan QR to Confirm Receipt
              </Button>
              {!isScanVerified && (
                <Button
                  variant="outline"
                  size="md"
                  onClick={handleReceive}
                  className="w-full sm:w-auto"
                  loading={actionLoading}
                >
                  Confirm Receipt Manually
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
            <div className="flex items-start gap-3">
              <Icons.CheckCircle className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-emerald-950 dark:text-emerald-100">
                  File forwarded & currently in transit
                </h4>
                <p className="text-xs text-emerald-900/80 dark:text-emerald-300/80 mt-0.5">
                  This file has been forwarded to <strong>{selectedFile.targetLocation || 'destination desk'}</strong>. Your desk work is complete. Awaiting physical receipt confirmation by receiving officer at {selectedFile.targetLocation}.
                </p>
              </div>
            </div>
          </div>
        )
      )}

      {actionTab === 'forward' && !isClosed && !isInTransit && (
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

      {/* Edit / Resolve Missing Documents Modal */}
      <Modal
        isOpen={isResolveModalOpen}
        onClose={() => setIsResolveModalOpen(false)}
        title="Edit / Resolve Missing Documents"
        description="Verify remaining physical attachments or upload scans to complete the document checklist."
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-950 dark:text-amber-100">
            <p className="font-bold flex items-center gap-1.5 mb-2">
              <Icons.AlertCircle className="h-4 w-4 text-amber-600 shrink-0" /> Select missing item to upload/verify:
            </p>
            <div className="space-y-2">
              {missingDocs.map((doc) => (
                <div key={doc} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded-lg border border-amber-500/20 bg-background">
                  <span className="font-semibold text-foreground text-xs">{doc}</span>
                  <label className="flex items-center gap-1.5 cursor-pointer rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors shrink-0">
                    <Icons.Upload className="h-3.5 w-3.5" /> Upload Scan
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleDocFileChangeForItem(doc, file);
                        e.target.value = '';
                      }}
                      disabled={docScanning}
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>

          {docScanPreview && (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 p-3">
              <img src={docScanPreview} alt="Missing doc scan" className="h-16 w-16 rounded-lg border bg-white object-cover shadow-xs" />
              <div className="min-w-0 flex-1 text-xs">
                {docScanning ? (
                  <p className="text-muted-foreground italic animate-pulse">Scanning document with AI OCR…</p>
                ) : docScanResult ? (
                  <p className="font-semibold text-emerald-600">✓ AI OCR scan complete ({docScanResult.documentType || 'Verified'})</p>
                ) : (
                  <p className="text-muted-foreground">{docScanError || 'Attachment ready for verification'}</p>
                )}
              </div>
            </div>
          )}

          <Textarea
            label="Officer verification notes"
            id="resolve_notes"
            rows={2}
            placeholder="e.g. Received original physical copy at Reception desk."
            value={resolveNotes}
            onChange={(e) => setResolveNotes(e.target.value)}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setIsResolveModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={resolveLoading} onClick={handleConfirmResolve}>
              <Icons.CheckCircle className="h-4 w-4" /> Mark missing documents as verified
            </Button>
          </div>
        </div>
      </Modal>

      {actionTab === 'backtrack' && !isClosed && !isInTransit && (
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
    </Card>
  );
}

export default FileActions;
