import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { api, getStoredUser } from '../lib/api';
import {
  Container, Card, Button, Input, Select, Textarea, Badge, Modal, Icons,
  StatCard, Skeleton, EmptyState, Timeline, TimelineItem, useToast, Spinner, Tabs,
  QrScanner, FileActions,
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

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFileHistory, setSelectedFileHistory] = useState([]);
  const [isAuditValid, setIsAuditValid] = useState(true);

  // Track verification method: 'webcam' | 'mobile' | 'manual'
  const [scannedVia, setScannedVia] = useState('manual');
  const [showManualSearch, setShowManualSearch] = useState(false);

  const [actionTab, setActionTab] = useState('forward');
  const [nextLocation, setNextLocation] = useState('');
  const [nextStatus, setNextStatus] = useState('Pending');
  const [routingNotes, setRoutingNotes] = useState('');
  const [backtrackLocation, setBacktrackLocation] = useState('');
  const [backtrackReason, setBacktrackReason] = useState('');
  const [internalNotes, setInternalNotes] = useState('');

  const [aiDelayReport, setAiDelayReport] = useState(null);
  const [aiBacktrackSuggest, setAiBacktrackSuggest] = useState(null);
  const [checkingAi, setCheckingAi] = useState(false);

  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [fileLoading, setFileLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) { navigate('/login'); return; }
    setCurrentUser(user);
    loadDashboard(user.wardCode);
  }, [navigate]);

  // Auto-open a file passed via ?file= (e.g. from the Inbox), then clear the param.
  useEffect(() => {
    const fileParam = searchParams.get('file');
    if (fileParam) {
      handleSelectFile(fileParam, 'manual');
      searchParams.delete('file');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDashboard = async (wardCode) => {
    try {
      setLoading(true);
      const [summary, deptsData] = await Promise.all([
        api.dashboardSummary({ wardCode }),
        api.getDepartments().catch(() => ({ departments: [] })),
      ]);
      setMetrics(summary.metrics);
      setDepartmentQueue(summary.departmentQueue || []);
      setRecentHistory(summary.recentHistory || []);
      setDepartmentsList(deptsData.departments || []);
    } catch (err) {
      toast.error('Failed to load dashboard metrics.');
    } finally {
      setLoading(false);
    }
  };

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

  const handleSelectFile = async (identifier, scanMode = 'manual') => {
    try {
      setFileLoading(true);
      const data = await api.scanFile(identifier);
      setSelectedFile(data.file);
      setSelectedFileHistory(data.recentHistory || []);
      setIsAuditValid(data.auditChainValid);
      setScannedVia(scanMode);
      setNextLocation(''); setBacktrackLocation(''); setRoutingNotes('');
      setNextStatus('Pending');
      setBacktrackReason(''); setInternalNotes(''); setAiDelayReport(null); setAiBacktrackSuggest(null);
      // Closed files only expose the AI/history view — no routing tabs.
      setActionTab(['Dispatched', 'Approved', 'Rejected'].includes(data.file.currentStatus) ? 'ai' : 'forward');
      setSearchQuery(''); setSearchResults([]); setActiveResultIndex(-1);
    } catch (err) {
      toast.error(err.message || 'Error loading file.');
    } finally {
      setFileLoading(false);
    }
  };

  // Keyboard support for the search results combobox: Arrow keys move the
  // active option, Enter selects it, Escape clears the results.
  const handleSearchKeyDown = (e) => {
    if (searchResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveResultIndex((i) => (i + 1 >= searchResults.length ? 0 : i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveResultIndex((i) => (i - 1 < 0 ? searchResults.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      if (activeResultIndex >= 0 && searchResults[activeResultIndex]) {
        e.preventDefault();
        handleSelectFile(searchResults[activeResultIndex].fileUid);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setSearchQuery(''); setSearchResults([]); setActiveResultIndex(-1);
    }
  };

  const checkAiInsights = async () => {
    if (!selectedFile) return;
    setCheckingAi(true);
    try {
      const activeQueue = departmentQueue.find((q) => q._id === selectedFile.currentLocation);
      const queueLength = activeQueue ? activeQueue.count : 0;
      const [delayReport, backtrackReport] = await Promise.all([
        api.predictDelay({
          currentStatus: selectedFile.currentStatus, currentLocation: selectedFile.currentLocation,
          requiredDocuments: selectedFile.requiredDocuments || [], submittedDocuments: selectedFile.requiredDocuments || [],
          movementData: selectedFileHistory.map((h) => ({ action: h.actionType, timestamp: h.timestamp })),
          departmentQueueLength: queueLength,
        }).catch(() => null),
        api.smartBacktrack({
          documentType: selectedFile.documentType, currentLocation: selectedFile.currentLocation,
          requiredDocuments: selectedFile.requiredDocuments || [], submittedDocuments: [],
          movementData: selectedFileHistory.map((h) => ({ action: h.actionType, timestamp: h.timestamp })),
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
        scannedVia: actionScannedVia,
        scanned_via: actionScannedVia,
        remarks,
        manualReason: remarks,
      });
      const emailMsg = res?.emailNotified ? ' 📧 Email alert sent.' : '';
      const smsMsg = res?.smsNotified ? ' 📱 SMS alert logged.' : '';
      toast.success(`File routed with "${targetStatus}" status.${emailMsg}${smsMsg}`);
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
        scannedVia: actionScannedVia,
        scanned_via: actionScannedVia,
        remarks,
        manualReason: remarks,
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

  const handleScanSuccess = (decodedText, scanMode) => {
    handleSelectFile(decodedText, scanMode);
  };

  // Closed files (dispatched, approved, rejected) are archived — no further
  // routing actions are allowed on them, only the AI/history views.
  const CLOSED_STATUSES = ['Dispatched', 'Approved', 'Rejected'];
  const isFileClosed = selectedFile && CLOSED_STATUSES.includes(selectedFile.currentStatus);

  const tabs = useMemo(() => (
    isFileClosed
      ? [{ id: 'ai', label: 'AI Check', icon: Icons.Sparkles }]
      : [
          { id: 'forward', label: 'Forward', icon: Icons.ArrowRight },
          { id: 'backtrack', label: 'Backtrack', icon: Icons.ArrowLeft },
          { id: 'ai', label: 'AI Check', icon: Icons.Sparkles },
        ]
  ), [isFileClosed]);

  return (
    <AppShell user={currentUser}>
      <Container size="wide" className="space-y-8 pt-8">
        <PageHeading
          breadcrumbs={['Workspace']}
          title="Officer workspace"
          description="Search, scan and route physical files across ward desks with a full audit trail."
          actions={<Button variant="primary" onClick={() => navigate('/register-file')}><Icons.Plus className="h-4 w-4" /> Register file</Button>}
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
                />

                <Card>
                  <h4 className="mb-5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Ledger movement history</h4>
                  {selectedFileHistory.length > 0 ? (
                    <Timeline>
                      {selectedFileHistory.map((item, idx) => (
                        <TimelineItem key={idx} title={item.actionType}
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