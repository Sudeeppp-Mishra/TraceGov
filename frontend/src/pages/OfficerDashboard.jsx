import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { api, getStoredUser } from '../lib/api';
import {
  Container, Card, Button, Input, Select, Textarea, Badge, Modal, Icons,
  StatCard, Skeleton, EmptyState, Timeline, TimelineItem, useToast, Spinner, Tabs,
  QrScanner, FileActions, ExtractedTextModal, StampOverlayImage, ScanReviewModal,
} from '../components/ui';
import { AppShell, PageHeading } from '../components/layout';

export default function OfficerDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const [currentUser, setCurrentUser] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [departmentQueue, setDepartmentQueue] = useState([]);
  const [recentHistory, setRecentHistory] = useState([]);
  const [departmentsList, setDepartmentsList] = useState([]);
  const [incomingFiles, setIncomingFiles] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  const [showManualSearch, setShowManualSearch] = useState(false);

  // Selection & action state
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFileHistory, setSelectedFileHistory] = useState([]);
  const [isAuditValid, setIsAuditValid] = useState(true);
  const [scannedVia, setScannedVia] = useState('manual');
  const [fileLoading, setFileLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionTab, setActionTab] = useState('forward');

  // QR Scanner modal state
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // AI insights state
  const [checkingAi, setCheckingAi] = useState(false);
  const [aiDelayReport, setAiDelayReport] = useState(null);
  const [aiBacktrackSuggest, setAiBacktrackSuggest] = useState(null);

  const handleSelectFile = async (identifier, scanMode = 'manual') => {
    try {
      setFileLoading(true);
      const data = await api.scanFile(identifier);
      setSelectedFile(data.file);
      setSelectedFileHistory(data.recentHistory || []);
      setIsAuditValid(data.auditChainValid);
      setScannedVia(scanMode);
      setAiDelayReport(null); setAiBacktrackSuggest(null);

      // Closed files only expose the AI/history view — no routing tabs.
      setActionTab(['Dispatched', 'Approved', 'Rejected'].includes(data.file.currentStatus) ? 'ai' : 'forward');
      setSearchQuery(''); setSearchResults([]); setActiveResultIndex(-1);
      return data.file;
    } catch (err) {
      toast.error(err.message || 'Error loading file.');
      return null;
    } finally {
      setFileLoading(false);
    }
  };

  // Tier-3 #13: optimistic-update a single documentVerifications[] row in place
  // after the backend's re-OCR endpoint returns. We avoid re-fetching the whole
  // file (which would lose the officer's open tabs and scroll position).
  const handleReOcrResult = (idx, updatedDv) => {
    setSelectedFile((prev) => {
      if (!prev || !Array.isArray(prev.documentVerifications)) return prev;
      const nextVerifications = prev.documentVerifications.slice();
      if (idx < 0 || idx >= nextVerifications.length) return prev;
      nextVerifications[idx] = { ...nextVerifications[idx], ...updatedDv };
      return { ...prev, documentVerifications: nextVerifications };
    });
  };

  const loadDashboard = async (wardCode) => {
    try {
      setLoading(true);
      const [summary, deptsData, incomingData] = await Promise.all([
        api.dashboardSummary({ wardCode }),
        api.getDepartments().catch(() => ({ departments: [] })),
        api.getOfficerInbox({ scope: 'incoming' }).catch(() => ({ files: [] })),
      ]);
      setMetrics(summary.metrics);
      setDepartmentQueue(summary.departmentQueue || []);
      setRecentHistory(summary.recentHistory || []);
      setDepartmentsList(deptsData.departments || []);
      setIncomingFiles(incomingData.files || []);
    } catch (err) {
      toast.error('Failed to load dashboard metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const user = getStoredUser();
    if (!user) { navigate('/login'); return; }
    setCurrentUser(user);
    loadDashboard(user.wardCode);
  }, [navigate]);

  // Read URL query parameter for file selection on page load
  useEffect(() => {
    const fileIdParam = searchParams.get('file');
    const actionParam = searchParams.get('action');
    if (fileIdParam) {
      handleSelectFile(fileIdParam).then((file) => {
        if (actionParam === 'receive' || file?.currentStatus === 'In Transit') {
          setIsScannerOpen(true);
        }
      });
      searchParams.delete('file');
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); setSearching(false); setActiveResultIndex(-1); return; }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const response = await api.searchFiles({ q: searchQuery });
        setSearchResults(response.files || []);
        setActiveResultIndex(-1);
      } catch { /* ignore */ } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearchKeyDown = (e) => {
    if (searchResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveResultIndex((i) => (i + 1 >= searchResults.length ? 0 : i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveResultIndex((i) => (i - 1 < 0 ? searchResults.length - 1 : i - 1));
    } else if (e.key === 'Enter' && activeResultIndex >= 0) {
      e.preventDefault();
      handleSelectFile(searchResults[activeResultIndex].fileUid, 'manual');
      setShowManualSearch(false);
    } else if (e.key === 'Escape') {
      setSearchResults([]);
      setActiveResultIndex(-1);
    }
  };

  const checkAiInsights = async () => {
    if (!selectedFile) return;
    setCheckingAi(true);
    try {
      const [delayReport, backtrackReport] = await Promise.all([
        api.getAiDelayReport(selectedFile.fileUid).catch(() => null),
        api.getAiBacktrackReport(selectedFile.id, {
          targetDesk: currentUser?.deskLocation || 'Verification',
        }).catch(() => null),
      ]);
      setAiDelayReport(delayReport);
      setAiBacktrackSuggest(backtrackReport);
    } catch { /* ignore */ } finally { setCheckingAi(false); }
  };

  const handleForwardFile = async ({ nextLocation: targetLoc, nextStatus: targetStatus, notes, scannedVia: actionScannedVia, remarks }) => {
    setActionLoading(true);
    try {
      const res = await api.forwardFile(selectedFile.id, {
        nextLocation: targetLoc,
        nextStatus: targetStatus,
        notes,
      });
      const emailMsg = res?.emailNotified ? ' 📧 Email alert sent.' : '';
      const smsMsg = res?.smsNotified ? ' 📱 SMS alert logged.' : '';
      toast.success(`File transferred to ${targetLoc}.${emailMsg}${smsMsg}`);
      await loadDashboard(currentUser.wardCode);
      await handleSelectFile(selectedFile.fileUid, actionScannedVia);
    } catch (err) {
      toast.error(err.message || 'Forward routing failed.');
    } finally { setActionLoading(false); }
  };

  const handleBacktrackFile = async ({ returnLocation: targetLoc, backtrackReason: reason, internalNotes: intNotes, scannedVia: actionScannedVia, remarks }) => {
    setActionLoading(true);
    try {
      const res = await api.backtrackFile(selectedFile.id, {
        returnLocation: targetLoc,
        backtrackReason: reason,
        internalNotes: intNotes,
      });
      const emailMsg = res?.emailNotified ? ' 📧 Email alert sent.' : '';
      const smsMsg = res?.smsNotified ? ' 📱 SMS alert logged.' : '';
      toast.success(`File returned to ${targetLoc}.${emailMsg}${smsMsg}`);
      await loadDashboard(currentUser.wardCode);
      await handleSelectFile(selectedFile.fileUid, actionScannedVia);
    } catch (err) {
      toast.error(err.message || 'Backtrack routing failed.');
    } finally { setActionLoading(false); }
  };

  const handleReceiveFile = async ({ scannedVia: actionScannedVia, remarks }) => {
    if (!selectedFile) return;
    setActionLoading(true);
    try {
      const res = await api.receiveFile(selectedFile.id, {
        scannedVia: actionScannedVia,
        scanned_via: actionScannedVia,
        remarks,
        manualReason: remarks,
      });
      const emailMsg = res?.emailNotified ? ' 📧 Email alert sent.' : '';
      const smsMsg = res?.smsNotified ? ' 📱 SMS alert logged.' : '';
      toast.success(`Physical receipt confirmed. File received into queue.${emailMsg}${smsMsg}`);
      await loadDashboard(currentUser.wardCode);
      await handleSelectFile(selectedFile.fileUid, actionScannedVia);
    } catch (err) {
      toast.error(err.message || 'Confirm receipt failed.');
    } finally { setActionLoading(false); }
  };

  const handleScanSuccess = async (decodedText, scanMode) => {
    let scannedData = null;
    try {
      scannedData = await api.scanFile(decodedText);
    } catch (err) {
      return {
        success: false,
        error: 'No file found for this QR tag. Please check if the tag is registered in TraceGov.',
      };
    }

    const scannedFile = scannedData?.file;
    if (!scannedFile) {
      return {
        success: false,
        error: 'No file found for this QR tag.',
      };
    }

    // 1. Workspace-Level Scan (No file currently open)
    if (!selectedFile) {
      setSelectedFile(scannedFile);
      setSelectedFileHistory(scannedData.recentHistory || []);
      setIsAuditValid(scannedData.auditChainValid);
      setScannedVia(scanMode);
      setAiDelayReport(null);
      setAiBacktrackSuggest(null);
      setActionTab(['Dispatched', 'Approved', 'Rejected'].includes(scannedFile.currentStatus) ? 'ai' : 'forward');
      setSearchQuery('');
      setSearchResults([]);
      setActiveResultIndex(-1);

      if (scannedFile.currentStatus === 'In Transit') {
        await handleReceiveFile({ scannedVia: scanMode, remarks: '' });
      }
      return { success: true };
    }

    // 2. In-File Verification Scan (A specific file is already open)
    const currentUid = String(selectedFile.fileUid || '').toLowerCase().trim();
    const currentTrackingId = String(selectedFile.trackingId || '').toLowerCase().trim();
    const scannedUid = String(scannedFile.fileUid || '').toLowerCase().trim();
    const scannedTrackingId = String(scannedFile.trackingId || '').toLowerCase().trim();

    const isMatch = scannedUid === currentUid ||
                    scannedTrackingId === currentTrackingId ||
                    scannedUid === currentTrackingId ||
                    scannedTrackingId === currentUid;

    if (!isMatch) {
      // MISMATCH: Keep open file and all form inputs untouched! Do NOT replace open file or navigate away!
      const scannedIdDisplay = scannedFile.fileUid || scannedFile.trackingId || 'Unknown Tag';
      return {
        success: false,
        error: `This QR is for "${scannedFile.title}" (${scannedIdDisplay}), not "${selectedFile.title}". Scan the correct envelope to continue.`,
      };
    }

    // MATCH: Confirm physical custody verification on current open file
    setScannedVia(scanMode);
    toast.success(`Physical QR tag verification confirmed for ${selectedFile.fileUid}!`);

    if (selectedFile.currentStatus === 'In Transit') {
      await handleReceiveFile({ scannedVia: scanMode, remarks: '' });
    }
    return { success: true };
  };

  // Closed files (dispatched, approved, rejected) are archived — no further
  // routing actions are allowed on them, only the AI/history views.
  const CLOSED_STATUSES = ['Dispatched', 'Approved', 'Rejected'];
  const isFileClosed = selectedFile && CLOSED_STATUSES.includes(selectedFile.currentStatus);

  const tabs = useMemo(() => (
    [
      { id: 'forward', label: 'Forward file', icon: Icons.ArrowRight },
      { id: 'backtrack', label: 'Backtrack / Return', icon: Icons.Undo },
      { id: 'ai', label: 'AI congestion analysis', icon: Icons.Sparkles },
    ]
  ), []);

  return (
    <AppShell user={currentUser}>
      <Container size="wide" className="space-y-6 pt-8">
        <PageHeading
          breadcrumbs={['Workspace', 'Overview']}
          title="Officer workspace"
          description="Search, scan and route physical files across ward desks with a full audit trail."
        />

        {/* Metrics */}
        {loading ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
        ) : metrics && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="In-progress queue" value={metrics.pendingFiles} icon={<Icons.Layers className="h-5 w-5" />} />
            <StatCard label="Registered today" value={metrics.todaysFiles} icon={<Icons.FileText className="h-5 w-5" />} tone="emerald" />
            <StatCard label="Avg processing" value={`${metrics.averageProcessingMinutes}m`} icon={<Icons.Clock className="h-5 w-5" />} />
            <StatCard label="Backtracks today" value={metrics.backtrackingToday} icon={<Icons.AlertCircle className="h-5 w-5" />} tone="red" />
          </div>
        )}

        <div className="grid items-start gap-6 md:grid-cols-[1.25fr_0.75fr]">
          <div className="space-y-6">
            {/* Incoming Files in Transit Section */}
            {incomingFiles.length > 0 && (
              <Card className="border-primary/30 bg-primary/[0.02]">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Icons.Clock className="h-4.5 w-4.5 text-primary" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                      Incoming Files in Transit ({incomingFiles.length})
                    </h3>
                  </div>
                  <span className="text-[11px] text-muted-foreground">Informational · Scan on physical arrival</span>
                </div>
                <div className="divide-y divide-border/60">
                  {incomingFiles.map((file) => (
                    <div key={file.fileUid} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="font-mono text-[11px] text-primary font-semibold">{file.fileUid}</span>
                        <p className="truncate text-xs font-semibold text-foreground">{file.title}</p>
                        <p className="text-[11px] text-muted-foreground">
                          Sent from: <strong className="text-foreground">{file.currentLocation}</strong> · Citizen: {file.citizenName}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          handleSelectFile(file.fileUid);
                          setIsScannerOpen(true);
                        }}
                        className="shrink-0"
                      >
                        <Icons.Scan className="h-3.5 w-3.5" /> Confirm Receipt
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Primary QR Scan & Manual Search Card */}
            <Card className="relative p-5">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icons.Scan className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Desk Verification Scanner</h3>
                    <p className="text-xs text-muted-foreground">Scan envelope QR tag to route or backtrack</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => setIsScannerOpen(true)}
                    className="shadow-sm"
                  >
                    <Icons.Scan className="h-4 w-4" /> Scan QR Tag (Primary)
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowManualSearch(!showManualSearch)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {showManualSearch ? 'Hide manual search' : "Can't scan? Search manually"}
                  </Button>
                </div>
              </div>

              {/* Secondary Fallback: Manual Search Bar */}
              {showManualSearch && (
                <div className="mt-4 pt-4 border-t border-border animate-fade-down">
                  <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-1">
                    <Icons.AlertCircle className="h-3.5 w-3.5" /> Manual search logged as unverified manual update. Reason required on action.
                  </p>
                  <Input
                    className="w-full"
                    icon={<Icons.Search className="h-4 w-4" />}
                    placeholder="Search by citizen, title, UID or tracking ID…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    aria-label="Search files"
                    role="combobox"
                    aria-expanded={searchResults.length > 0}
                    aria-controls="officer-search-listbox"
                    aria-autocomplete="list"
                    aria-activedescendant={activeResultIndex >= 0 ? `officer-search-option-${activeResultIndex}` : undefined}
                  />
                </div>
              )}

              {(searchResults.length > 0 || (searching && searchQuery)) && (
                <div className="absolute left-4 right-4 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
                  {searching && searchResults.length === 0 ? (
                    <div className="space-y-2 p-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
                  ) : (
                    <div id="officer-search-listbox" role="listbox" aria-label="Matching files" className="divide-y divide-border">
                      {searchResults.map((file, idx) => (
                        <button
                          key={file.fileUid}
                          id={`officer-search-option-${idx}`}
                          role="option"
                          aria-selected={idx === activeResultIndex}
                          onClick={() => {
                            handleSelectFile(file.fileUid, 'manual');
                            setShowManualSearch(false);
                          }}
                          onMouseEnter={() => setActiveResultIndex(idx)}
                          className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors cursor-pointer ${
                            idx === activeResultIndex ? 'bg-muted' : 'hover:bg-muted'
                          }`}
                        >
                          <div className="min-w-0">
                            <span className="font-mono text-xs text-muted-foreground">{file.fileUid}</span>
                            <span className="mt-0.5 block truncate text-sm font-semibold text-foreground">{file.title}</span>
                            <span className="text-xs text-muted-foreground">{file.citizenName} · {file.currentLocation}</span>
                          </div>
                          <Badge status={file.currentStatus} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* Selected file */}
            {fileLoading ? (
              <Skeleton className="h-80" />
            ) : selectedFile ? (
              <div className="space-y-6 animate-fade-up">
                <Card>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{selectedFile.fileUid}</span>
                        {isAuditValid
                          ? <Badge status="Verified">Ledger verified</Badge>
                          : <Badge status="Rejected">Ledger broken</Badge>}
                      </div>
                      <h3 className="mt-2 text-xl font-bold text-foreground">{selectedFile.title}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {selectedFile.citizenName} · {selectedFile.citizenPhone}
                      </p>
                    </div>
                    <Badge status={selectedFile.currentStatus} />
                  </div>

                  {isFileClosed && (
                    <div className="mt-5 flex items-center gap-2.5 rounded-xl border border-border bg-muted/40 p-3.5 text-sm text-muted-foreground">
                      <Icons.Lock className="h-4 w-4 shrink-0" />
                      <span>
                        This file is <strong className="text-foreground">{selectedFile.currentStatus.toLowerCase()}</strong> and closed
                        {selectedFile.currentStatus === 'Dispatched' ? ` — stored at ${selectedFile.currentLocation}.` : '.'} No further routing is possible.
                      </span>
                    </div>
                  )}
                </Card>

                {/* File Action Workflow Component */}
                <FileActions
                  selectedFile={selectedFile}
                  currentUser={currentUser}
                  departmentsList={departmentsList}
                  actionTab={actionTab}
                  setActionTab={(id) => {
                    setActionTab(id);
                    if (id === 'ai' && !aiDelayReport) checkAiInsights();
                  }}
                  tabs={tabs}
                  actionLoading={actionLoading}
                  scannedVia={scannedVia}
                  onScanClick={() => setIsScannerOpen(true)}
                  onForwardSubmit={handleForwardFile}
                  onBacktrackSubmit={handleBacktrackFile}
                  onReceiveSubmit={handleReceiveFile}
                  onResolveSuccess={() => handleSelectFile(selectedFile.fileUid)}
                />

                {/* AI Scan Detail Panel — surfaces persisted OCR metadata on
                    the registered file. Officers currently lose this signal
                    once registration completes, so the panel keeps the
                    classification, stamp detection, name verification,
                    completeness, and extracted-text preview visible here. */}
                {Array.isArray(selectedFile.documentVerifications) && selectedFile.documentVerifications.length > 0 && (
                  <Card>
                    <div className="flex items-center justify-between gap-2 mb-4">
                      <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">AI scan detail</h4>
                      <span className="text-[11px] text-muted-foreground">
                        {selectedFile.documentVerifications.filter((dv) => dv.status === 'verified').length}/{selectedFile.documentVerifications.length} verified
                      </span>
                    </div>
                    <div className="space-y-2.5">
                      {selectedFile.documentVerifications.map((dv, idx) => (
                        <ScanDetailRow
                          key={`${dv.documentLabel}-${idx}`}
                          dv={dv}
                          fileId={selectedFile._id}
                          idx={idx}
                          citizenName={selectedFile.citizenName}
                          onReOcrResult={handleReOcrResult}
                        />
                      ))}
                    </div>
                  </Card>
                )}

                <Card>
                  <h4 className="mb-5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Ledger movement history</h4>
                  {selectedFileHistory.length > 0 ? (
                    <Timeline>
                      {selectedFileHistory.map((item, idx) => (
                        <TimelineItem key={idx} title={item.actionType === 'Verified' ? 'Document Verified' : item.actionType}
                          meta={new Date(item.timestamp).toLocaleString()}
                          tone={item.actionType === 'Backtracked' ? 'red' : 'primary'}>
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-medium text-foreground/70">{item.currentLocation} · {item.officerId?.name}</p>
                            {item.scannedVia && item.scannedVia !== 'manual' && (
                              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                Verified scan ({item.scannedVia})
                              </span>
                            )}
                          </div>
                          {item.notes && <p className="mt-1">{item.notes}</p>}
                          {item.remarks && <p className="mt-0.5 text-xs text-muted-foreground italic">Reason: {item.remarks}</p>}
                        </TimelineItem>
                      ))}
                    </Timeline>
                  ) : (
                    <p className="py-6 text-center text-xs italic text-muted-foreground">No history recorded.</p>
                  )}
                </Card>
              </div>
            ) : (
              <EmptyState
                icon={<Icons.Scan className="h-6 w-6" />}
                title="No file selected"
                description="Scan a QR tag on a physical envelope to begin processing, or search manually if unreadable."
                action={
                  <Button variant="primary" onClick={() => setIsScannerOpen(true)}>
                    <Icons.Scan className="h-4 w-4" /> Scan QR tag (Primary)
                  </Button>
                }
              />
            )}
          </div>

          {/* Sidebar */}
          <Card>
            <h4 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Recent actions</h4>
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
            ) : recentHistory.length > 0 ? (
              <div className="max-h-[420px] divide-y divide-border overflow-y-auto pr-1">
                {recentHistory.map((hist, idx) => (
                  <div key={idx} className="py-3 text-xs first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{hist.fileId?.fileUid}</span>
                      <Badge status={hist.actionType} dot={false} />
                    </div>
                    <p className="mt-1 truncate font-semibold text-foreground">{hist.fileId?.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{hist.officerId?.name} · {hist.currentLocation}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-xs italic text-muted-foreground">No recent activity.</p>
            )}
          </Card>
        </div>
      </Container>

      {/* QR Scanner Modal Component */}
      <QrScanner
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
      />
    </AppShell>
  );
}

/* ───────────────────────── AI Scan Detail Row ───────────────────────── */

/**
 * Renders one persisted document-verification row on the officer dashboard.
 * Mirrors the structure of `DocumentChecklistItem`'s verbose block but reads
 * from the saved file state (no live re-scan), and adds a "View extracted text"
 * disclosure so officers can confirm what AI saw at registration time.
 *
 * Tier-3 #13: optionally renders a "Re-run OCR" button that re-invokes the
 * AI service against the stored imagePreview and atomically updates this
 * single entry via the `/re-ocr` endpoint.
 */
function ScanDetailRow({ dv, fileId, idx, citizenName, onReOcrResult }) {
  const [expanded, setExpanded] = React.useState(false);
  const [fullTextOpen, setFullTextOpen] = React.useState(false);
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [reOcrLoading, setReOcrLoading] = React.useState(false);
  const toast = useToast();
  const isVerified = dv.status === 'verified';
  const tone = isVerified ? 'emerald' : 'amber';

  // Tier-3 #12: the persisted row can carry bounding boxes (image path) —
  // surface them via the same review modal as the registration form.
  const hasReviewableBoxes = Array.isArray(dv.textBoxes) && dv.textBoxes.length > 0;
  // Tier-3 #13: re-run OCR against the stored preview; replace this row
  // in-place rather than re-fetching the whole file.
  const handleReOcr = async () => {
    if (!fileId || idx == null || reOcrLoading) return;
    setReOcrLoading(true);
    try {
      const res = await api.reOcrDocument(fileId, idx, {
        citizenName: citizenName || undefined,
        // The backend defaults to [dv.documentLabel] when no keywords are
        // supplied — matches what was used at registration time.
      });
      const updated = res?.documentVerification;
      if (updated && typeof onReOcrResult === 'function') {
        onReOcrResult(idx, updated);
        toast.success(`Refreshed OCR for "${dv.documentLabel}".`);
      } else {
        toast.error('Re-OCR succeeded but no updated entry was returned.');
      }
    } catch (err) {
      toast.error(err.message || 'Re-OCR failed.');
    } finally {
      setReOcrLoading(false);
    }
  };

  // Tier-2 #8: persisted full text — server only sends the first ~500 chars
  // as preview, so we can detect "real" full text by length or mismatch.
  const hasFullText = !!dv.extractedText && (
    dv.extractedText.length > 510 || dv.extractedText !== dv.extractedTextPreview
  );

  // Confidence tier — no `classificationSource` on persisted state, so we
  // degrade to a two-tier reading: high if completeness ≥0.8 and OCR ≥0.7.
  const ocr = typeof dv.ocrConfidence === 'number' ? dv.ocrConfidence : 0;
  const completeness = typeof dv.completenessScore === 'number' ? dv.completenessScore : 0;
  const tier = ocr < 0.5 || completeness < 0.5
    ? { label: 'Low', className: 'bg-red-500/10 text-red-700 dark:text-red-300' }
    : ocr < 0.7 || completeness < 0.8
      ? { label: 'Medium', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' }
      : { label: 'High', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' };

  return (
    <div className={`rounded-xl border p-3 text-xs transition-colors ${
      tone === 'emerald' ? 'border-emerald-500/20 bg-emerald-500/[0.03]' : 'border-amber-500/30 bg-amber-500/[0.03]'
    }`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-foreground truncate">{dv.documentLabel}</span>
            {dv.detectedType && (
              <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">
                {dv.detectedType} ({Math.round((dv.ocrConfidence || 0) * 100)}%)
              </span>
            )}
            {dv.detectedLanguage && (
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground">
                {LANGUAGE_LABELS_DASHBOARD[dv.detectedLanguage] || dv.detectedLanguage}
              </span>
            )}
            {typeof dv.completenessScore === 'number' && (
              <span className="rounded-md bg-muted px-1.5 py-0.5 font-semibold text-muted-foreground">
                {Math.round(dv.completenessScore * 100)}% complete
              </span>
            )}
            {tier && (
              <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${tier.className}`}>
                {tier.label} confidence
              </span>
            )}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            {dv.stampAnalysis?.stampDetected ? (
              <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                <span className={`h-2 w-2 rounded-full ${
                  dv.stampAnalysis.stampColor === 'red' ? 'bg-red-500'
                  : dv.stampAnalysis.stampColor === 'blue' ? 'bg-blue-500'
                  : 'bg-purple-500'
                }`} />
                {dv.stampAnalysis.stampCount > 1
                  ? `${dv.stampAnalysis.stampCount} stamps`
                  : `${dv.stampAnalysis.stampColor || 'official'} stamp`}
                <span className="text-muted-foreground font-normal">
                  ({Math.round((dv.stampAnalysis.stampConfidence || 0) * 100)}%)
                </span>
              </span>
            ) : (
              <span className="text-amber-600/80 dark:text-amber-400/80 font-medium">No stamp</span>
            )}

            {dv.nameVerification && (
              dv.nameVerification.nameFound ? (
                <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                  <Icons.User className="h-3 w-3 shrink-0" />
                  Name found ({Math.round((dv.nameVerification.matchConfidence || 0) * 100)}%)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-600/80 dark:text-amber-400/80 font-medium">
                  <Icons.User className="h-3 w-3 shrink-0" />
                  Name not found
                </span>
              )
            )}

            {dv.scannedAt && (
              <span className="text-muted-foreground">
                Scanned {new Date(dv.scannedAt).toLocaleDateString()}
              </span>
            )}
          </div>

          {dv.imagePreview && (
            <div className="mt-2 space-y-1.5">
              {/* Tier-3 #14: stamp region overlays — show where the AI service
                  detected official stamps on the persisted image. */}
              {dv.stampAnalysis?.stampRegions?.length > 0 ? (
                <StampOverlayImage
                  src={dv.imagePreview}
                  stampAnalysis={dv.stampAnalysis}
                  alt={`Scan of ${dv.documentLabel}`}
                  className="h-20 w-20 shrink-0 rounded-md border border-border bg-white shadow-xs"
                />
              ) : (
                <img
                  src={dv.imagePreview}
                  alt={`Scan of ${dv.documentLabel}`}
                  className="h-20 w-20 rounded-md border border-border bg-white object-cover shadow-xs"
                />
              )}
              {/* Tier-3 #15: page thumbnails if this is a multi-page scan. */}
              {Array.isArray(dv.imagePreviews) && dv.imagePreviews.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {dv.imagePreviews.map((p, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setReviewOpen(true)}
                      className="relative h-9 w-9 shrink-0 overflow-hidden rounded border border-border bg-white shadow-xs cursor-pointer hover:border-border-strong"
                      title={`Page ${i + 1}`}
                    >
                      <img src={p} alt={`Page ${i + 1}`} className="block h-full w-full object-cover" />
                      <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-0.5 text-[9px] font-bold text-white leading-tight text-center">
                        p.{i + 1}
                      </span>
                    </button>
                  ))}
                  <span className="ml-1 self-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {dv.imagePreviews.length} pages
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <Badge
            status={isVerified ? 'Verified' : 'Pending'}
          />
          {/* Tier-3 #13: re-run OCR against the stored preview. Refresh the
              single entry in place rather than re-registering the file. */}
          {fileId && idx != null && (
            <button
              type="button"
              onClick={handleReOcr}
              disabled={reOcrLoading}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-60 cursor-pointer"
              title="Re-run OCR analysis on the stored image and update this row"
            >
              {reOcrLoading ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  Re-running...
                </>
              ) : (
                <>
                  <Icons.Zap className="h-3 w-3" />
                  Re-run OCR
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {dv.extractedTextPreview && dv.extractedTextPreview !== '(OCR Service Unavailable)' && (
        <div className="mt-2 rounded-md border border-border bg-background/60">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            aria-expanded={expanded}
          >
            <span className="inline-flex items-center gap-1.5">
              <Icons.Eye className="h-3 w-3" />
              {expanded ? 'Hide extracted text' : 'View extracted text'}
            </span>
            <Icons.ChevronDown className={`h-3 w-3 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          </button>
          {expanded && (
            <div className="space-y-2 border-t border-border bg-muted/20 p-2">
              <pre className="max-h-32 overflow-auto text-[11px] leading-relaxed text-foreground whitespace-pre-wrap break-words font-mono">
                {dv.extractedTextPreview}
              </pre>
              <div className="flex flex-wrap items-center gap-2">
                {/* Tier-3 #12: side-by-side review modal — available when
                    the persisted row carries per-word bounding boxes. */}
                {hasReviewableBoxes && (
                  <button
                    type="button"
                    onClick={() => setReviewOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
                  >
                    <Icons.Eye className="h-3 w-3" />
                    Open review
                    <span className="text-muted-foreground font-normal">
                      ({dv.textBoxes.length} words)
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
                      ({dv.extractedText.length.toLocaleString()} chars)
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tier-2 #8: full extracted-text modal, opened by the "Read full text"
          button when the persisted dv contains the full OCR string. */}
      {hasFullText && (
        <ExtractedTextModal
          open={fullTextOpen}
          onClose={() => setFullTextOpen(false)}
          documentLabel={dv.documentLabel}
          text={dv.extractedText}
        />
      )}

      {/* Tier-3 #12: side-by-side review modal — opened by the
          "Open review" button when the persisted row carries bounding boxes.
          Pass `foundKeywords` / `missingKeywords` so the right column
          in-place highlights which required keywords the AI saw vs. missed. */}
      {hasReviewableBoxes && (
        <ScanReviewModal
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          documentLabel={dv.documentLabel}
          imagePreview={dv.imagePreview}
          imagePreviews={Array.isArray(dv.imagePreviews) && dv.imagePreviews.length > 0
            ? dv.imagePreviews
            : (dv.imagePreview ? [dv.imagePreview] : [])}
          pages={Array.isArray(dv.pages) ? dv.pages : []}
          textBoxes={dv.textBoxes}
          imageWidth={dv.imageWidth}
          imageHeight={dv.imageHeight}
          extractedText={dv.extractedText || dv.extractedTextPreview || ''}
          foundKeywords={Array.isArray(dv.foundKeywords) ? dv.foundKeywords : []}
          missingKeywords={Array.isArray(dv.missingKeywords) ? dv.missingKeywords : []}
        />
      )}
    </div>
  );
}

const LANGUAGE_LABELS_DASHBOARD = {
  nepali: 'Nepali',
  english: 'English',
  mixed: 'Mixed',
  unknown: 'Unknown',
};