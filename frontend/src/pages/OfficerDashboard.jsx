import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { api, getStoredUser } from '../lib/api';
import {
  Container, Card, Button, Input, Select, Textarea, Badge, Modal, Icons,
  StatCard, Skeleton, EmptyState, Timeline, TimelineItem, useToast,
} from '../components/ui';
import { AppShell, PageHeading } from '../components/layout';

const DESK_OPTIONS = [
  'Reception', 'Verification Desk', 'Ward Chair Section',
  'Tax Office Desk', 'Administrative Archives', 'Review Panel Office',
];

export default function OfficerDashboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const [currentUser, setCurrentUser] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [departmentQueue, setDepartmentQueue] = useState([]);
  const [recentHistory, setRecentHistory] = useState([]);
  const [officers, setOfficers] = useState([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFileHistory, setSelectedFileHistory] = useState([]);
  const [isAuditValid, setIsAuditValid] = useState(true);

  const [actionTab, setActionTab] = useState('forward');
  const [nextLocation, setNextLocation] = useState('');
  const [routingNotes, setRoutingNotes] = useState('');
  const [backtrackLocation, setBacktrackLocation] = useState('');
  const [backtrackReason, setBacktrackReason] = useState('');
  const [internalNotes, setInternalNotes] = useState('');

  const [aiDelayReport, setAiDelayReport] = useState(null);
  const [aiBacktrackSuggest, setAiBacktrackSuggest] = useState(null);
  const [checkingAi, setCheckingAi] = useState(false);

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const qrScannerRef = useRef(null);
  const [scannerError, setScannerError] = useState('');

  const [loading, setLoading] = useState(true);
  const [fileLoading, setFileLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) { navigate('/login'); return; }
    setCurrentUser(user);
    loadDashboard(user.wardCode);
  }, [navigate]);

  const loadDashboard = async (wardCode) => {
    try {
      setLoading(true);
      const [summary, officersList] = await Promise.all([
        api.dashboardSummary({ wardCode }),
        api.getOfficers().catch(() => []),
      ]);
      setMetrics(summary.metrics);
      setDepartmentQueue(summary.departmentQueue || []);
      setRecentHistory(summary.recentHistory || []);
      setOfficers(officersList);
    } catch (err) {
      toast.error('Failed to load dashboard metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const response = await api.searchFiles({ q: searchQuery });
        setSearchResults(response.files || []);
      } catch { /* ignore */ } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectFile = async (identifier) => {
    try {
      setFileLoading(true);
      const data = await api.scanFile(identifier);
      setSelectedFile(data.file);
      setSelectedFileHistory(data.recentHistory || []);
      setIsAuditValid(data.auditChainValid);
      setNextLocation(''); setBacktrackLocation(''); setRoutingNotes('');
      setBacktrackReason(''); setInternalNotes(''); setAiDelayReport(null); setAiBacktrackSuggest(null);
      setActionTab('forward');
      setSearchQuery(''); setSearchResults([]);
    } catch (err) {
      toast.error(err.message || 'Error loading file.');
    } finally {
      setFileLoading(false);
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

  const handleForwardFile = async (e) => {
    e.preventDefault();
    if (!nextLocation) return;
    setActionLoading(true);
    try {
      await api.forwardFile(selectedFile.id, { nextLocation, notes: routingNotes.trim() });
      toast.success(`File forwarded to ${nextLocation}.`);
      await loadDashboard(currentUser.wardCode);
      await handleSelectFile(selectedFile.fileUid);
    } catch (err) {
      toast.error(err.message || 'Forward routing failed.');
    } finally { setActionLoading(false); }
  };

  const handleBacktrackFile = async (e) => {
    e.preventDefault();
    if (!backtrackLocation || !backtrackReason.trim()) return;
    setActionLoading(true);
    try {
      await api.backtrackFile(selectedFile.id, {
        returnLocation: backtrackLocation, backtrackReason: backtrackReason.trim(), internalNotes: internalNotes.trim(),
      });
      toast.success(`File returned to ${backtrackLocation}.`);
      await loadDashboard(currentUser.wardCode);
      await handleSelectFile(selectedFile.fileUid);
    } catch (err) {
      toast.error(err.message || 'Backtrack routing failed.');
    } finally { setActionLoading(false); }
  };

  const startCameraScanner = () => {
    setIsScannerOpen(true);
    setScannerError('');
    setTimeout(() => {
      const html5QrCode = new Html5Qrcode('qr-reader-container');
      qrScannerRef.current = html5QrCode;
      html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => { stopCameraScanner(); handleSelectFile(decodedText); },
        () => {}
      ).catch(() => setScannerError('Could not access camera. Please check hardware permissions.'));
    }, 300);
  };

  const stopCameraScanner = () => {
    setIsScannerOpen(false);
    if (qrScannerRef.current) {
      qrScannerRef.current.stop().then(() => { qrScannerRef.current = null; }).catch(() => {});
    }
  };

  const tabs = useMemo(() => ([
    { id: 'forward', label: 'Forward', icon: Icons.ArrowRight },
    { id: 'backtrack', label: 'Backtrack', icon: Icons.ArrowLeft },
    { id: 'ai', label: 'AI Check', icon: Icons.Sparkles },
  ]), []);

  return (
    <AppShell user={currentUser} kicker={currentUser ? `Ward ${currentUser.wardCode}` : ''}>
      <Container size="wide" className="space-y-8 pt-8">
        <PageHeading
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
            {/* Search */}
            <Card className="relative p-4">
              <div className="flex gap-3">
                <Input
                  className="flex-1" icon={<Icons.Search className="h-4 w-4" />}
                  placeholder="Search by citizen, title, UID or tracking ID…"
                  value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} aria-label="Search files"
                />
                <Button variant="outline" onClick={startCameraScanner} className="shrink-0">
                  <Icons.Scan className="h-4 w-4" /> <span className="hidden sm:inline">Scan</span>
                </Button>
              </div>
              {(searchResults.length > 0 || (searching && searchQuery)) && (
                <div className="absolute left-4 right-4 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
                  {searching && searchResults.length === 0 ? (
                    <div className="space-y-2 p-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
                  ) : (
                    <div className="divide-y divide-border">
                      {searchResults.map((file) => (
                        <button key={file.fileUid} onClick={() => handleSelectFile(file.fileUid)}
                          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted cursor-pointer">
                          <div className="min-w-0">
                            <span className="font-mono text-[10px] text-muted-foreground">{file.fileUid}</span>
                            <span className="mt-0.5 block truncate text-sm font-semibold text-foreground">{file.title}</span>
                            <span className="text-[11px] text-muted-foreground">{file.citizenName} · {file.currentLocation}</span>
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
                <Card className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[10px] text-muted-foreground">{selectedFile.fileUid}</span>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold ${isAuditValid ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'border-red-500/25 bg-red-500/10 text-red-600 dark:text-red-400'}`}>
                          <Icons.ShieldCheck className="h-3 w-3" /> {isAuditValid ? 'Ledger verified' : 'Integrity fail'}
                        </span>
                      </div>
                      <h3 className="mt-2 text-xl font-bold text-foreground">{selectedFile.title}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {selectedFile.citizenName} · {selectedFile.citizenPhone}
                      </p>
                    </div>
                    <Badge status={selectedFile.currentStatus} />
                  </div>

                  <div className="mt-5 flex gap-1 rounded-xl border border-border bg-muted p-1">
                    {tabs.map((tab) => (
                      <button key={tab.id}
                        onClick={() => { setActionTab(tab.id); if (tab.id === 'ai' && !aiDelayReport) checkAiInsights(); }}
                        className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all cursor-pointer ${actionTab === tab.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                        <tab.icon className="h-3.5 w-3.5" /> {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="mt-5">
                    {actionTab === 'forward' && (
                      <form onSubmit={handleForwardFile} className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Select label="Target desk" id="f_loc" value={nextLocation} onChange={(e) => setNextLocation(e.target.value)} required>
                            <option value="">Choose desk…</option>
                            {DESK_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                          </Select>
                          <Select label="Assign officer" id="f_off">
                            <option value="">Auto-assign section staff…</option>
                            {officers.map((off) => <option key={off.id} value={off.id}>{off.name} ({off.deskLocation})</option>)}
                          </Select>
                        </div>
                        <Textarea label="Routing notes" id="f_notes" rows={2}
                          placeholder="e.g. Verification complete, forwarding for final endorsement."
                          value={routingNotes} onChange={(e) => setRoutingNotes(e.target.value)} />
                        <div className="flex justify-end">
                          <Button type="submit" variant="primary" loading={actionLoading}>Confirm forward <Icons.ArrowRight className="h-4 w-4" /></Button>
                        </div>
                      </form>
                    )}

                    {actionTab === 'backtrack' && (
                      <form onSubmit={handleBacktrackFile} className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Select label="Return to desk" id="b_loc" value={backtrackLocation} onChange={(e) => setBacktrackLocation(e.target.value)} required>
                            <option value="">Choose desk…</option>
                            {DESK_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                          </Select>
                          <Input label="Reason (visible to citizen)" id="b_reason"
                            placeholder="e.g. Missing ward form stamp." value={backtrackReason}
                            onChange={(e) => setBacktrackReason(e.target.value)} required />
                        </div>
                        <Textarea label="Internal notes (hidden from citizens)" id="b_int" rows={2}
                          placeholder="e.g. Verify citizen ID against database records."
                          value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} />
                        <div className="flex justify-end">
                          <Button type="submit" variant="danger" loading={actionLoading}>Confirm backtrack</Button>
                        </div>
                      </form>
                    )}

                    {actionTab === 'ai' && (
                      <div className="space-y-5">
                        {checkingAi ? (
                          <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-16" /></div>
                        ) : (
                          <>
                            {aiDelayReport && (
                              <div className="grid gap-4 sm:grid-cols-3">
                                <div className="rounded-xl border border-border bg-muted/40 p-3">
                                  <span className="text-[9px] font-semibold uppercase text-muted-foreground">Delay risk</span>
                                  <span className={`mt-1 block text-xl font-bold ${aiDelayReport.delayProbability > 70 ? 'text-red-500' : aiDelayReport.delayProbability > 40 ? 'text-amber-500' : 'text-emerald-500'}`}>{aiDelayReport.delayProbability}%</span>
                                </div>
                                <div className="rounded-xl border border-border bg-muted/40 p-3">
                                  <span className="text-[9px] font-semibold uppercase text-muted-foreground">Expected dwell</span>
                                  <span className="mt-1 block text-xl font-bold text-foreground">{aiDelayReport.expectedProcessingHours}h</span>
                                </div>
                                <div className="rounded-xl border border-border bg-muted/40 p-3">
                                  <span className="text-[9px] font-semibold uppercase text-muted-foreground">Confidence</span>
                                  <span className="mt-1 block text-xl font-bold capitalize text-foreground">{aiDelayReport.confidenceScore}</span>
                                </div>
                              </div>
                            )}
                            {aiBacktrackSuggest && (
                              <div className="rounded-xl border border-primary/15 bg-primary/[0.02] p-4">
                                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-foreground">Backtrack suggestion</h4>
                                <p className="text-xs leading-relaxed text-muted-foreground">{aiBacktrackSuggest.recommendation}</p>
                                {aiBacktrackSuggest.missingDocuments?.length > 0 && (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {aiBacktrackSuggest.missingDocuments.map((doc) => (
                                      <span key={doc} className="rounded bg-red-500/10 px-2 py-0.5 text-[9px] font-semibold text-red-500">{doc}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                            {!aiDelayReport && !aiBacktrackSuggest && (
                              <EmptyState className="border-0" icon={<Icons.Sparkles className="h-6 w-6" />} title="AI service unavailable" description="Congestion analysis could not be reached. Try again shortly." />
                            )}
                            <div className="flex justify-end">
                              <Button variant="outline" onClick={checkAiInsights}><Icons.Zap className="h-4 w-4" /> Refresh analysis</Button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </Card>

                <Card className="p-6">
                  <h4 className="mb-5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Ledger movement history</h4>
                  {selectedFileHistory.length > 0 ? (
                    <Timeline>
                      {selectedFileHistory.map((item, idx) => (
                        <TimelineItem key={idx} title={item.actionType}
                          meta={new Date(item.timestamp).toLocaleString()}
                          tone={item.actionType === 'Backtracked' ? 'red' : 'primary'}
                          last={idx === selectedFileHistory.length - 1}>
                          <p className="text-[11px] font-medium text-foreground/70">{item.currentLocation} · {item.officerId?.name}</p>
                          {item.notes && <p className="mt-1">{item.notes}</p>}
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
                description="Search for a file or scan a QR tag on a physical envelope to begin processing."
                action={<Button variant="outline" onClick={startCameraScanner}><Icons.Scan className="h-4 w-4" /> Scan QR tag</Button>}
              />
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card className="p-6">
              <h4 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Recent actions</h4>
              {loading ? (
                <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
              ) : recentHistory.length > 0 ? (
                <div className="max-h-[420px] divide-y divide-border overflow-y-auto pr-1">
                  {recentHistory.map((hist, idx) => (
                    <div key={idx} className="py-3 text-xs first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-mono text-[9px] text-muted-foreground">{hist.fileId?.fileUid}</span>
                        <Badge status={hist.actionType} dot={false} />
                      </div>
                      <p className="mt-1 font-semibold text-foreground">{hist.fileId?.title}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{hist.officerId?.name} · {hist.currentLocation}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-6 text-center text-xs italic text-muted-foreground">No recent activity.</p>
              )}
            </Card>

            <Card className="p-6">
              <h4 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Ward section queues</h4>
              {loading ? (
                <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6" />)}</div>
              ) : departmentQueue.length > 0 ? (
                <div className="space-y-3">
                  {departmentQueue.map((dept) => (
                    <div key={dept._id} className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-foreground">{dept._id}</span>
                      <div className="flex gap-2">
                        {dept.pending > 0 && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-500">{dept.pending} delayed</span>}
                        <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-bold text-foreground">{dept.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-6 text-center text-xs italic text-muted-foreground">No active queues.</p>
              )}
            </Card>
          </div>
        </div>
      </Container>

      <Modal isOpen={isScannerOpen} onClose={stopCameraScanner} title="Scan QR tag" description="Center the printed QR tag in the viewfinder.">
        <div className="space-y-4">
          <div id="qr-reader-container" className="mx-auto aspect-square max-w-[280px] overflow-hidden rounded-xl border border-border bg-black" />
          {scannerError && <p className="text-center text-xs font-semibold text-red-500">{scannerError}</p>}
          <div className="flex justify-end"><Button variant="secondary" onClick={stopCameraScanner}>Cancel</Button></div>
        </div>
      </Modal>
    </AppShell>
  );
}
