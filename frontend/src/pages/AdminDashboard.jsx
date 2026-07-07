import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, getStoredUser } from '../lib/api';
import { Container, Card, Button, Badge, Icons } from '../components/ui';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);

  // Administrative stats
  const [officers, setOfficers] = useState([]);
  const [officerStats, setOfficerStats] = useState([]);
  const [filesUnderAudit, setFilesUnderAudit] = useState([]);
  
  // Registration form inputs
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('');
  const [newStaffLocation, setNewStaffLocation] = useState('Reception');
  
  // Controls
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [auditProgress, setAuditProgress] = useState('');
  const [loading, setLoading] = useState(true);
  const [formLoading, setFormLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const user = getStoredUser();
    if (!user || user.role !== 'admin') {
      navigate('/login');
      return;
    }
    setCurrentUser(user);
    loadAdministration(user.wardCode);
  }, [navigate]);

  // Load roster and operational summary
  const loadAdministration = async (wardCode) => {
    setLoading(true);
    setError('');
    try {
      const [summary, roster] = await Promise.all([
        api.dashboardSummary({ wardCode, allWards: 'true' }),
        api.getOfficers(),
      ]);

      setOfficers(roster);
      setOfficerStats(summary.officerStats || []);
      setFilesUnderAudit(summary.recentFiles || []);
    } catch (err) {
      setError(err.message || 'Error pulling administrative metrics.');
    } finally {
      setLoading(false);
    }
  };

  // Register new staff user
  const handleAddStaff = async (e) => {
    e.preventDefault();
    if (!newStaffName.trim() || !newStaffEmail.trim() || !newStaffPassword) return;

    setFormLoading(true);
    setError('');

    try {
      await api.register({
        name: newStaffName.trim(),
        email: newStaffEmail.trim(),
        password: newStaffPassword,
        role: 'officer',
        wardCode: currentUser.wardCode,
        deskLocation: newStaffLocation,
      });

      // Clear input fields and reload tables
      setNewStaffName('');
      setNewStaffEmail('');
      setNewStaffPassword('');
      setNewStaffLocation('Reception');
      setIsAddStaffOpen(false);
      
      await loadAdministration(currentUser.wardCode);
    } catch (err) {
      setError(err.message || 'Account registration failed.');
    } finally {
      setFormLoading(false);
    }
  };

  // Check the hash integrity chains of all files in the list
  const runSecurityAudit = async () => {
    setAuditProgress('Auditing cryptographic ledgers...');
    try {
      const audited = await Promise.all(
        filesUnderAudit.map(async (file) => {
          try {
            const data = await api.scanFile(file.fileUid);
            return { ...file, isValidated: true, isChainIntact: data.auditChainValid };
          } catch {
            return { ...file, isValidated: true, isChainIntact: false };
          }
        })
      );
      setFilesUnderAudit(audited);
      setAuditProgress('Audit complete.');
    } catch (err) {
      setAuditProgress('Audit encountered errors.');
    }
  };

  const deskLocations = [
    'Reception',
    'Verification Desk',
    'Ward Chair Section',
    'Tax Office Desk',
    'Administrative Archives',
    'Review Panel Office',
  ];

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors pb-16">
      
      {/* Header */}
      <header className="border-b border-border bg-card/65 backdrop-blur-md sticky top-0 z-40">
        <Container className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="h-6 w-1 bg-teal-600 rounded-full" />
            <span className="text-sm font-semibold uppercase tracking-wider text-foreground">TraceGov Administration</span>
          </div>

          <div className="flex items-center gap-4">
            <Link to="/officer" className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-all">
              Go to Workspace
            </Link>
          </div>
        </Container>
      </header>

      <main className="mt-8">
        <Container className="space-y-8">
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground font-sans">Ward {currentUser?.wardCode} Administration</h2>
              <p className="mt-1 text-xs text-muted-foreground">Manage ward officers, registry assignments, and verify cryptographic ledger security.</p>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={runSecurityAudit}>Run Ledger Security Audit</Button>
              <Button variant="primary" onClick={() => setIsAddStaffOpen(true)}>Add Ward Officer</Button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/10 bg-red-500/5 p-4 text-xs font-medium text-red-600 dark:text-red-400 flex items-start gap-2.5">
              <Icons.AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {auditProgress && (
            <div className="rounded-lg border border-primary/10 bg-primary/[0.02] p-4 text-xs font-semibold text-foreground flex items-center gap-2">
              <Icons.ShieldCheck className="h-4 w-4 text-teal-600 animate-pulse" />
              {auditProgress}
            </div>
          )}

          {loading ? (
            <p className="text-xs text-muted-foreground italic text-center py-12">Querying administrative logs...</p>
          ) : (
            <div className="grid md:grid-cols-[1.1fr_0.9fr] gap-6 items-start animate-in fade-in duration-200">
              
              {/* Security Audit panel */}
              <div className="space-y-6">
                <Card className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Icons.ShieldCheck className="h-4.5 w-4.5 text-primary" />
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Security Ledger Integrity Check</h3>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground font-semibold">
                          <th className="pb-3 pr-2">File UID</th>
                          <th className="pb-3 px-2">Title</th>
                          <th className="pb-3 px-2">Desk location</th>
                          <th className="pb-3 pl-2 text-right">Chain Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {filesUnderAudit.map((file) => (
                          <tr key={file.fileUid} className="hover:bg-muted/30 transition-colors">
                            <td className="py-3 pr-2 font-mono text-[10px] text-muted-foreground">{file.fileUid}</td>
                            <td className="py-3 px-2 font-bold text-foreground max-w-[160px] truncate">{file.title}</td>
                            <td className="py-3 px-2 text-muted-foreground">{file.currentLocation}</td>
                            <td className="py-3 pl-2 text-right">
                              {file.isValidated ? (
                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${file.isChainIntact ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400'}`}>
                                  {file.isChainIntact ? 'Intact' : 'Tampered'}
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground italic">Pending Check</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>

              {/* Roster Panel */}
              <div className="space-y-6">
                <Card className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Icons.User className="h-4.5 w-4.5 text-primary" />
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Officer Roster & Logs</h3>
                  </div>

                  <div className="space-y-4.5">
                    {officers.map((off) => {
                      const stat = officerStats.find((s) => s._id === off.id);
                      
                      return (
                        <div key={off.id} className="flex justify-between items-center text-xs border-b border-border/40 pb-3 last:border-0 last:pb-0">
                          <div>
                            <span className="block font-bold text-foreground">{off.name}</span>
                            <span className="block text-[10px] text-muted-foreground mt-0.5">
                              {off.email} · {off.deskLocation}
                            </span>
                          </div>
                          
                          <div className="flex gap-2.5">
                            <span className="rounded bg-muted px-2 py-1 text-[10px] text-foreground font-semibold">
                              {stat?.processed || 0} routed
                            </span>
                            {stat?.backtracked > 0 && (
                              <span className="rounded bg-red-500/10 px-2 py-1 text-[10px] text-red-500 font-semibold">
                                {stat.backtracked} bounces
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </div>

            </div>
          )}

        </Container>
      </main>

      {/* Add Staff account modal */}
      <Modal isOpen={isAddStaffOpen} onClose={() => setIsAddStaffOpen(false)} title="Register Ward Officer">
        <form onSubmit={handleAddStaff} className="space-y-4">
          <Input
            label="Officer Full Name"
            id="staff_name"
            placeholder="e.g. Sudeep Mishra"
            value={newStaffName}
            onChange={(e) => setNewStaffName(e.target.value)}
            required
            disabled={formLoading}
          />
          <Input
            label="Work Email Address"
            id="staff_email"
            type="email"
            placeholder="e.g. officer.sudeep@ward.gov.np"
            value={newStaffEmail}
            onChange={(e) => setNewStaffEmail(e.target.value)}
            required
            disabled={formLoading}
          />
          <Input
            label="Initial Account Password"
            id="staff_pw"
            type="password"
            placeholder="••••••••"
            value={newStaffPassword}
            onChange={(e) => setNewStaffPassword(e.target.value)}
            required
            disabled={formLoading}
          />
          <Select
            label="Desk Location Assignment"
            id="staff_loc"
            value={newStaffLocation}
            onChange={(e) => setNewStaffLocation(e.target.value)}
            required
            disabled={formLoading}
          >
            {deskLocations.map((loc) => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </Select>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setIsAddStaffOpen(false)} disabled={formLoading}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={formLoading}>
              {formLoading ? 'Registering...' : 'Create Account'}
            </Button>
          </div>
        </form>
      </Modal>

    </div>
  );
}
