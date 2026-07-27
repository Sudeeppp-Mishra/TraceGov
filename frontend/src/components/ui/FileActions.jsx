import React, { useState } from 'react';
import { Button, Card, Icons, Input, Select, Tabs, Textarea } from './index';

/**
 * Enforces QR-Scan verification as primary action flow for officer file operations.
 * Manual updates are supported as a secondary fallback requiring a mandatory reason.
 */
export function FileActions({
  selectedFile,
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

  const isScanVerified = scannedVia === 'webcam' || scannedVia === 'mobile';
  const isClosed = ['Dispatched', 'Approved', 'Rejected'].includes(selectedFile?.currentStatus);
  const isInTransit = selectedFile?.currentStatus === 'In Transit';

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

    if (!isScanVerified && !manualReason.trim()) {
      setManualReasonError('Mandatory reason required for manual update (e.g. QR damaged, Camera unavailable).');
      return;
    }

    onForwardSubmit({
      nextLocation,
      nextStatus,
      notes: routingNotes.trim(),
      scannedVia: isScanVerified ? scannedVia : 'manual',
      remarks: isScanVerified ? undefined : manualReason.trim(),
    });
  };

  const handleBacktrack = (e) => {
    e.preventDefault();
    setManualReasonError('');

    if (!isScanVerified && !manualReason.trim()) {
      setManualReasonError('Mandatory reason required for manual update (e.g. QR damaged, Bulk processing).');
      return;
    }

    onBacktrackSubmit({
      returnLocation: backtrackLocation,
      backtrackReason: backtrackReason.trim(),
      internalNotes: internalNotes.trim(),
      scannedVia: isScanVerified ? scannedVia : 'manual',
      remarks: isScanVerified ? undefined : manualReason.trim(),
    });
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

          {/* Manual Action Bypass Reason Box for Forward/Backtrack */}
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
        </>
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

          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={actionLoading}>
              Confirm forward <Icons.ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </form>
      )}

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
