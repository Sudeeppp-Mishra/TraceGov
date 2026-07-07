import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { api, getStoredUser, clearSession } from '../lib/api';
import { Container, Card, Button, Input, Select, Badge, Modal, Icons } from '../components/ui';

export default function OfficerDashboard() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [departmentQueue, setDepartmentQueue] = useState([]);
  const [recentFiles, setRecentFiles] = useState([]);
  const [recentHistory, setRecentHistory] = useState([]);
  const [officers, setOfficers] = useState([]);

  // Search and selection states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFileHistory, setSelectedFileHistory] = useState([]);
  const [isAuditValid, setIsAuditValid] = useState(true);

  // Form inputs for file routing actions
  const [actionTab, setActionTab] = useState('forward'); // 'forward' | 'backtrack' | 'ai'
  const [nextLocation, setNextLocation] = useState('');
  const [routingNotes, setRoutingNotes] = useState('');
  const [backtrackLocation, setBacktrackLocation] = useState('');
  const [backtrackReason, setBacktrackReason] = useState('');
  const [internalNotes, setInternalNotes] = useState('');

  // AI-assisted panel states
  const [aiDelayReport, setAiDelayReport] = useState(null);
  const [aiBacktrackSuggest, setAiBacktrackSuggest] = useState(null);
  const [checkingAi, setCheckingAi] = useState(false);

  // Scanner modal states
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const qrScannerRef = useRef(null);
  const [scannerError, setScannerError] = useState('');

  // General control states
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Load profile and dashboard stats
  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      navigate('/login');
      return;
    }
    setCurrentUser(user);
    loadDashboard(user.wardCode);
  }, [navigate]);

  // Load ward metrics
  const loadDashboard = async (wardCode) => {
    try {
      setLoading(true);
      const [summary, officersList] = await Promise.all([
        api.dashboardSummary({ wardCode }),
        api.getOfficers().catch(() => []),
      ]);

      setMetrics(summary.metrics);
      setDepartmentQueue(summary.departmentQueue || []);
      setRecentFiles(summary.recentFiles || []);
      setRecentHistory(summary.recentHistory || []);
      setOfficers(officersList);
    } catch (err) {
      console.error('Failed to load dashboard metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  // Real-time search query dispatch
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const response = await api.searchFiles({ q: searchQuery });
        setSearchResults(response.files || []);
      } catch (err) {
        console.error(err);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Select file and check details (QR scanner target or search selection)
  const handleSelectFile = async (identifier) => {
    try {
      setLoading(true);
      const data = await api.scanFile(identifier);
      setSelectedFile(data.file);
      setSelectedFileHistory(data.recentHistory || []);
      setIsAuditValid(data.auditChainValid);
      
      // Auto fill location dropdown defaults
      setNextLocation('');
      setBacktrackLocation('');
      setRoutingNotes('');
      setBacktrackReason('');
      setInternalNotes('');
      setAiDelayReport(null);
      setAiBacktrackSuggest(null);
      
      // Reset search
      setSearchQuery('');
      setSearchResults([]);
    } catch (err) {
      alert(err.message || 'Error loading file properties');
    } finally {
      setLoading(false);
    }
  };

  // Fetch AI risk predictions & backtracking hints
  const checkAiInsights = async () => {
    if (!selectedFile) return;
    setCheckingAi(true);
    try {
      const activeQueue = departmentQueue.find((q) => q._id === selectedFile.currentLocation);
      const queueLength = activeQueue ? activeQueue.count : 0;

      const [delayReport, backtrackReport] = await Promise.all([
        api.predictDelay({
          currentStatus: selectedFile.currentStatus,
          currentLocation: selectedFile.currentLocation,
          requiredDocuments: selectedFile.requiredDocuments || [],
          submittedDocuments: selectedFile.requiredDocuments || [], // Mock checklist verification
          movementData: selectedFileHistory.map((h) => ({ action: h.actionType, timestamp: h.timestamp })),
          departmentQueueLength: queueLength,
        }).catch(() => null),
        api.smartBacktrack({
          documentType: selectedFile.documentType,
          currentLocation: selectedFile.currentLocation,
          requiredDocuments: selectedFile.requiredDocuments || [],
          submittedDocuments: [], // Bypassed checklist items
          movementData: selectedFileHistory.map((h) => ({ action: h.actionType, timestamp: h.timestamp })),
        }).catch(() => null),
      ]);

      setAiDelayReport(delayReport);
      setAiBacktrackSuggest(backtrackReport);
    } catch (err) {
      console.error(err);
    } finally {
      setCheckingAi(false);
    }
  };

  // Trigger file forward routing Action
  const handleForwardFile = async (e) => {
    e.preventDefault();
    if (!nextLocation) return;

    setActionLoading(true);
    try {
      await api.forwardFile(selectedFile.id, {
        nextLocation,
        notes: routingNotes.trim(),
      });
      
      // Reload dashboard metrics and refresh active selected file details
      await loadDashboard(currentUser.wardCode);
      await handleSelectFile(selectedFile.fileUid);
    } catch (err) {
      alert(err.message || 'Forward routing failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Trigger file backtrack routing Action
  const handleBacktrackFile = async (e) => {
    e.preventDefault();
    if (!backtrackLocation || !backtrackReason.trim()) return;

    setActionLoading(true);
    try {
      await api.backtrackFile(selectedFile.id, {
        returnLocation: backtrackLocation,
        backtrackReason: backtrackReason.trim(),
        internalNotes: internalNotes.trim(),
      });
      
      await loadDashboard(currentUser.wardCode);
      await handleSelectFile(selectedFile.fileUid);
    } catch (err) {
      alert(err.message || 'Backtrack routing failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Start Webcam QR scanner instance
  const startCameraScanner = () => {
    setIsScannerOpen(true);
    setScannerError('');
    
    // Set slight delay for element query reference
    setTimeout(() => {
      const html5QrCode = new Html5Qrcode('qr-reader-container');
      qrScannerRef.current = html5QrCode;

      html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          // Success: stop scanner, close modal, and select file
          stopCameraScanner();
          handleSelectFile(decodedText);
        },
        (errorMessage) => {
          // Camera scanner verboses log continuously, ignore
        }
      ).catch((err) => {
        setScannerError('Could not initialize camera feed. Please check hardware permissions.');
      });
    }, 300);
  };

  // Close & clean camera assets
  const stopCameraScanner = () => {
    setIsScannerOpen(false);
    if (qrScannerRef.current) {
      qrScannerRef.current.stop().then(() => {
        qrScannerRef.current = null;
      }).catch((err) => console.error(err));
    }
  };

  // Log out session
  const handleLogout = () => {
    clearSession();
    navigate('/login');
  };

  const deskOptions = useMemo(() => [
    'Reception',
    'Verification Desk',
    'Ward Chair Section',
    'Tax Office Desk',
    'Administrative Archives',
    'Review Panel Office',
  ], []);

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors pb-16">
      
      {/* Officer header nav */}
      <header className="border-b border-border bg-card/65 backdrop-blur-md sticky top-0 z-40">
        <Container className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="h-6 w-1 bg-teal-600 rounded-full" />
            <h1 className="text-sm font-semibold uppercase tracking-wider text-foreground">TraceGov Terminal</h1>
            {currentUser && (
              <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground uppercase">
                Ward {currentUser.wardCode} · {currentUser.deskLocation}
              </span>
            )}
          </div>

          <div className="flex items-center gap-4">
            <Link to="/register-file" className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-all">
              Register File
            </Link>
            <Link to="/ai" className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-all">
              AI Insights
            </Link>
            {currentUser?.role === 'admin' && (
              <Link to="/admin" className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-all">
                Admin Panel
              </Link>
            )}
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1 text-xs font-semibold text-red-500 hover:text-red-600 cursor-pointer"
            >
              <Icons.LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </div>
        </Container>
      </header>

      <main className="mt-8">
        <Container className="space-y-8">
          
          {/* Telemetry metrics row */}
          {metrics && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="p-4.5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">In Progress Queue</span>
                  <span className="block text-2xl font-bold text-foreground mt-1">{metrics.pendingFiles}</span>
                </div>
                <Icons.Layers className="h-8 w-8 text-primary/10 shrink-0" />
              </Card>
              <Card className="p-4.5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Registrations Today</span>
                  <span className="block text-2xl font-bold text-foreground mt-1">{metrics.todaysFiles}</span>
                </div>
                <Icons.Sparkles className="h-8 w-8 text-primary/10 shrink-0" />
              </Card>
              <Card className="p-4.5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Avg Processing Time</span>
                  <span className="block text-2xl font-bold text-foreground mt-1">{metrics.averageProcessingMinutes}m</span>
                </div>
                <Icons.Clock className="h-8 w-8 text-primary/10 shrink-0" />
              </Card>
              <Card className="p-4.5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Rejections Today</span>
                  <span className="block text-2xl font-bold text-foreground mt-1">{metrics.backtrackingToday}</span>
                </div>
                <Icons.AlertCircle className="h-8 w-8 text-red-500/10 shrink-0" />
              </Card>
            </div>
          )}

          {/* Quick search input */}
          <div className="grid md:grid-cols-[1.2fr_0.8fr] gap-6 items-start">
            <div className="space-y-6">
              
              {/* Search Box */}
              <Card className="p-5 relative">
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <Icons.Search className="absolute left-3 top-3.5 h-4.5 w-4.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search files by Citizen Name, File Title, UID, or Tracking ID..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full rounded-lg border border-border bg-card py-3 pl-10 pr-4 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all"
                    />
                  </div>
                  <Button variant="outline" onClick={startCameraScanner} className="flex gap-2 shrink-0">
                    <Icons.Scan className="h-4 w-4" />
                    Scan Tag
                  </Button>
                </div>

                {/* Instant suggestions list */}
                {searchResults.length > 0 && (
                  <div className="absolute left-5 right-5 mt-2 max-h-60 overflow-y-auto rounded-lg border border-border bg-card shadow-lg z-20 divide-y divide-border">
                    {searchResults.map((file) => (
                      <button
                        key={file.fileUid}
                        onClick={() => handleSelectFile(file.fileUid)}
                        className="w-full text-left px-4 py-3 text-xs hover:bg-muted font-medium transition-colors flex items-center justify-between"
                      >
                        <div>
                          <span className="font-mono text-[10px] text-muted-foreground">{file.fileUid}</span>
                          <span className="block font-bold text-foreground mt-0.5">{file.title}</span>
                          <span className="text-[10px] text-muted-foreground mt-0.5">{file.citizenName} · {file.currentLocation}</span>
                        </div>
                        <Badge status={file.currentStatus} />
                      </button>
                    ))}
                  </div>
                )}
              </Card>

              {/* Selected File action deck */}
              {selectedFile ? (
                <div className="space-y-6 animate-in fade-in duration-200">
                  <Card className="p-5 relative overflow-hidden">
                    
                    {/* Top title deck */}
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-muted-foreground">{selectedFile.fileUid}</span>
                          {/* Ledger audit check badge */}
                          <div className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold border ${isAuditValid ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400'}`}>
                            <Icons.ShieldCheck className="h-3 w-3" />
                            {isAuditValid ? 'Ledger Verified' : 'Integrity Fail'}
                          </div>
                        </div>
                        <h3 className="text-xl font-bold text-foreground mt-2">{selectedFile.title}</h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          Citizen: <strong>{selectedFile.citizenName}</strong> · Phone: {selectedFile.citizenPhone}
                        </p>
                      </div>
                      <Badge status={selectedFile.currentStatus} />
                    </div>

                    <hr className="border-border my-5" />

                    {/* Action Panel Tabs */}
                    <div className="flex border-b border-border mb-5">
                      {['forward', 'backtrack', 'ai'].map((tab) => (
                        <button
                          key={tab}
                          onClick={() => {
                            setActionTab(tab);
                            if (tab === 'ai' && !aiDelayReport) {
                              checkAiInsights();
                            }
                          }}
                          className={`pb-2.5 px-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${actionTab === tab ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                        >
                          {tab === 'forward' && 'Forward Desk'}
                          {tab === 'backtrack' && 'Backtrack File'}
                          {tab === 'ai' && 'AI Congestion Check'}
                        </button>
                      ))}
                    </div>

                    {/* Forward form */}
                    {actionTab === 'forward' && (
                      <form onSubmit={handleForwardFile} className="space-y-4">
                        <div className="grid sm:grid-cols-2 gap-4">
                          <Select
                            label="Target Department / Location"
                            id="f_loc"
                            value={nextLocation}
                            onChange={(e) => setNextLocation(e.target.value)}
                            required
                          >
                            <option value="">Choose department...</option>
                            {deskOptions.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </Select>
                          <Select
                            label="Assign Desk Officer"
                            id="f_off"
                          >
                            <option value="">Auto-Assign Section staff...</option>
                            {officers.map((off) => (
                              <option key={off.id} value={off.id}>{off.name} ({off.deskLocation})</option>
                            ))}
                          </Select>
                        </div>
                        <Input
                          label="Redirection Log Notes"
                          id="f_notes"
                          placeholder="e.g. Verification complete, forwarding for final endorsement signature."
                          value={routingNotes}
                          onChange={(e) => setRoutingNotes(e.target.value)}
                        />
                        <div className="flex justify-end pt-2">
                          <Button type="submit" variant="primary" disabled={actionLoading}>
                            {actionLoading ? 'Routing...' : 'Confirm File Redirection'}
                          </Button>
                        </div>
                      </form>
                    )}

                    {/* Backtrack form */}
                    {actionTab === 'backtrack' && (
                      <form onSubmit={handleBacktrackFile} className="space-y-4">
                        <div className="grid sm:grid-cols-2 gap-4">
                          <Select
                            label="Return File Destination"
                            id="b_loc"
                            value={backtrackLocation}
                            onChange={(e) => setBacktrackLocation(e.target.value)}
                            required
                          >
                            <option value="">Choose destination...</option>
                            {deskOptions.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </Select>
                          <Input
                            label="Rejection Correction Reason"
                            id="b_reason"
                            placeholder="e.g. Missing Ward Form Stamp / Verification failed."
                            value={backtrackReason}
                            onChange={(e) => setBacktrackReason(e.target.value)}
                            required
                          />
                        </div>
                        <Input
                          label="Private Desk Staff Notes (Internal notes - hidden from citizens)"
                          id="b_int"
                          placeholder="e.g. Check citizen's ID match details against database entry records."
                          value={internalNotes}
                          onChange={(e) => setInternalNotes(e.target.value)}
                        />
                        <div className="flex justify-end pt-2">
                          <Button type="submit" variant="danger" disabled={actionLoading}>
                            {actionLoading ? 'Bouncing...' : 'Confirm Backtrack Loop'}
                          </Button>
                        </div>
                      </form>
                    )}

                    {/* AI assisted congestion risk */}
                    {actionTab === 'ai' && (
                      <div className="space-y-5 animate-in fade-in-20 duration-150">
                        {checkingAi ? (
                          <p className="text-xs text-muted-foreground italic text-center py-6">Analyzing database parameters and M/M/1 wait times...</p>
                        ) : (
                          <>
                            {aiDelayReport && (
                              <div className="grid sm:grid-cols-3 gap-4">
                                <div className="border border-border rounded-lg p-3 bg-muted/40">
                                  <span className="block text-[9px] uppercase font-semibold text-muted-foreground">Congestion Delay Risk</span>
                                  <span className={`block text-xl font-bold mt-1 ${aiDelayReport.delayProbability > 70 ? 'text-red-500' : aiDelayReport.delayProbability > 40 ? 'text-amber-500' : 'text-emerald-500'}`}>
                                    {aiDelayReport.delayProbability}%
                                  </span>
                                </div>
                                <div className="border border-border rounded-lg p-3 bg-muted/40">
                                  <span className="block text-[9px] uppercase font-semibold text-muted-foreground">Expected Processing Dwell</span>
                                  <span className="block text-xl font-bold text-foreground mt-1">
                                    {aiDelayReport.expectedProcessingHours} hrs
                                  </span>
                                </div>
                                <div className="border border-border rounded-lg p-3 bg-muted/40">
                                  <span className="block text-[9px] uppercase font-semibold text-muted-foreground">Audit verification</span>
                                  <span className="block text-xl font-bold text-foreground mt-1 capitalize">
                                    {aiDelayReport.confidenceScore}
                                  </span>
                                </div>
                              </div>
                            )}

                            {aiBacktrackSuggest && (
                              <div className="rounded-lg border border-primary/10 bg-primary/[0.01] p-4.5">
                                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">Backtrack suggestion helper</h4>
                                <p className="text-xs text-muted-foreground leading-relaxed">{aiBacktrackSuggest.recommendation}</p>
                                {aiBacktrackSuggest.missingDocuments && aiBacktrackSuggest.missingDocuments.length > 0 && (
                                  <div className="mt-3.5">
                                    <span className="block text-[10px] font-semibold text-foreground mb-1.5 uppercase">Missing Documents:</span>
                                    <div className="flex flex-wrap gap-2">
                                      {aiBacktrackSuggest.missingDocuments.map((doc) => (
                                        <span key={doc} className="rounded bg-red-500/10 px-2 py-0.5 text-[9px] font-semibold text-red-500">
                                          {doc}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="flex justify-end">
                              <Button variant="outline" onClick={checkAiInsights}>Refresh Model Analysis</Button>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                  </Card>

                  {/* File Audit Log Ledger */}
                  <Card className="p-5">
                    <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-5">Ledger Movement History</h4>
                    <div className="relative border-l border-border ml-2 pl-4 py-1 space-y-6">
                      {selectedFileHistory.map((item, idx) => (
                        <div key={idx} className="relative">
                          <span className="absolute -left-[21px] mt-1 h-2.5 w-2.5 rounded-full bg-primary border-2 border-background ring-4 ring-background" />
                          <div className="flex flex-wrap justify-between gap-3 text-xs">
                            <div>
                              <p className="font-bold text-foreground">{item.actionType}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                Desk: {item.currentLocation} · Officer: {item.officerId?.name}
                              </p>
                              {item.notes && <p className="text-[11px] text-muted-foreground mt-1.5 font-medium">{item.notes}</p>}
                            </div>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(item.timestamp).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              ) : (
                <Card className="p-8 text-center text-xs text-muted-foreground italic border-dashed">
                  Search or scan a QR tag on a physical file envelope to start operations.
                </Card>
              )}

            </div>

            {/* Sidebar list: Recent movements */}
            <div className="space-y-6">
              <Card className="p-5">
                <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Recent department actions</h4>
                <div className="divide-y divide-border max-h-[420px] overflow-y-auto pr-1">
                  {recentHistory.map((hist, idx) => (
                    <div key={idx} className="py-3 text-xs first:pt-0 last:pb-0">
                      <div className="flex justify-between items-start gap-2">
                        <span className="font-mono text-[9px] text-muted-foreground">{hist.fileId?.fileUid}</span>
                        <Badge status={hist.actionType} />
                      </div>
                      <p className="font-bold text-foreground mt-1">{hist.fileId?.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Officer {hist.officerId?.name} at {hist.currentLocation}
                      </p>
                      <span className="block text-[9px] text-muted-foreground mt-1">
                        {new Date(hist.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Department Queue Counts */}
              <Card className="p-5">
                <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Ward Section Queues</h4>
                <div className="space-y-3">
                  {departmentQueue.map((dept) => (
                    <div key={dept._id} className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-foreground">{dept._id}</span>
                      <div className="flex gap-2">
                        {dept.pending > 0 && (
                          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-500">
                            {dept.pending} delayed
                          </span>
                        )}
                        <span className="rounded bg-muted px-2 py-0.5 font-bold text-foreground">{dept.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

          </div>

        </Container>
      </main>

      {/* QR scanner Modal */}
      <Modal isOpen={isScannerOpen} onClose={stopCameraScanner} title="Webcam QR Handshake Scanner">
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Center the printed QR tag code within the viewfinder window box. The scanner will decode and load file ledger details automatically.
          </p>
          <div id="qr-reader-container" className="overflow-hidden rounded-lg border border-border bg-black aspect-square max-w-[280px] mx-auto" />
          {scannerError && (
            <p className="text-xs font-semibold text-red-500 text-center">{scannerError}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={stopCameraScanner}>Cancel</Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
