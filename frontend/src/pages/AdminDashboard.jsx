import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getStoredUser } from '../lib/api';
import {
  Container, Card, Button, Input, Select, Modal, Icons, StatCard, Skeleton,
  EmptyState, useToast,
} from '../components/ui';
import { AppShell, PageHeading } from '../components/layout';

const DESK_LOCATIONS = [
  'Reception', 'Verification Desk', 'Ward Chair Section',
  'Tax Office Desk', 'Administrative Archives', 'Review Panel Office',
];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const [currentUser, setCurrentUser] = useState(null);

  const [officers, setOfficers] = useState([]);
  const [officerStats, setOfficerStats] = useState([]);
  const [filesUnderAudit, setFilesUnderAudit] = useState([]);

  const [form, setForm] = useState({ name: '', email: '', password: '', deskLocation: 'Reception' });
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formLoading, setFormLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const user = getStoredUser();
    if (!user || user.role !== 'admin') { navigate('/login'); return; }
    setCurrentUser(user);
    loadAdministration(user.wardCode);
  }, [navigate]);

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
      setError(err.message || 'Error loading administrative metrics.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddStaff = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.password) return;
    setFormLoading(true);
    try {
      await api.register({
        name: form.name.trim(), email: form.email.trim(), password: form.password,
        role: 'officer', wardCode: currentUser.wardCode, deskLocation: form.deskLocation,
      });
      setForm({ name: '', email: '', password: '', deskLocation: 'Reception' });
      setIsAddStaffOpen(false);
      toast.success('Ward officer account created.');
      await loadAdministration(currentUser.wardCode);
    } catch (err) {
      toast.error(err.message || 'Account registration failed.');
    } finally {
      setFormLoading(false);
    }
  };

  const runSecurityAudit = async () => {
    setAuditing(true);
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
      const tampered = audited.filter((f) => !f.isChainIntact).length;
      tampered > 0
        ? toast.error(`Audit complete — ${tampered} file(s) failed integrity check.`)
        : toast.success('Audit complete — all ledgers intact.');
    } catch {
      toast.error('Audit encountered errors.');
    } finally {
      setAuditing(false);
    }
  };

  const stats = useMemo(() => {
    const totalRouted = officerStats.reduce((a, s) => a + (s.processed || 0), 0);
    const totalBounces = officerStats.reduce((a, s) => a + (s.backtracked || 0), 0);
    const intact = filesUnderAudit.filter((f) => f.isValidated && f.isChainIntact).length;
    return {
      officers: officers.length,
      routed: totalRouted,
      bounces: totalBounces,
      audited: filesUnderAudit.some((f) => f.isValidated) ? `${intact}/${filesUnderAudit.length}` : '—',
    };
  }, [officers, officerStats, filesUnderAudit]);

  return (
    <AppShell user={currentUser} kicker="Administration">
      <Container size="wide" className="space-y-8 pt-8">
        <PageHeading
          title={`Ward ${currentUser?.wardCode || ''} Administration`}
          description="Manage ward officers, monitor throughput, and verify cryptographic ledger integrity."
          actions={
            <>
              <Button variant="outline" onClick={runSecurityAudit} loading={auditing}>
                <Icons.ShieldCheck className="h-4 w-4" /> Run ledger audit
              </Button>
              <Button variant="primary" onClick={() => setIsAddStaffOpen(true)}>
                <Icons.Plus className="h-4 w-4" /> Add officer
              </Button>
            </>
          }
        />

        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm font-medium text-red-600 dark:text-red-400">
            <Icons.AlertCircle className="mt-0.5 h-4.5 w-4.5 shrink-0" /> {error}
          </div>
        )}

        {loading ? (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
            </div>
            <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
              <Skeleton className="h-96" /><Skeleton className="h-96" />
            </div>
          </>
        ) : (
          <div className="space-y-8 animate-fade-up">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Ward officers" value={stats.officers} icon={<Icons.Users className="h-5 w-5" />} />
              <StatCard label="Files routed" value={stats.routed} icon={<Icons.Route className="h-5 w-5" />} tone="emerald" />
              <StatCard label="Backtracks" value={stats.bounces} icon={<Icons.ArrowLeft className="h-5 w-5" />} tone="amber" />
              <StatCard label="Ledgers intact" value={stats.audited} icon={<Icons.ShieldCheck className="h-5 w-5" />} />
            </div>

            <div className="grid items-start gap-6 md:grid-cols-[1.1fr_0.9fr]">
              {/* Audit table */}
              <Card className="p-0">
                <div className="flex items-center gap-2 border-b border-border px-6 py-4">
                  <Icons.ShieldCheck className="h-4.5 w-4.5 text-primary" />
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Ledger integrity</h3>
                </div>
                {filesUnderAudit.length === 0 ? (
                  <EmptyState className="m-4 border-0" icon={<Icons.FileText className="h-6 w-6" />} title="No files to audit" description="Registered files will appear here for ledger verification." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                          <th className="px-6 py-3 font-semibold">File UID</th>
                          <th className="px-2 py-3 font-semibold">Title</th>
                          <th className="px-2 py-3 font-semibold">Desk</th>
                          <th className="px-6 py-3 text-right font-semibold">Chain</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {filesUnderAudit.map((file) => (
                          <tr key={file.fileUid} className="transition-colors hover:bg-muted/30">
                            <td className="px-6 py-3 font-mono text-[10px] text-muted-foreground">{file.fileUid}</td>
                            <td className="max-w-[160px] truncate px-2 py-3 font-semibold text-foreground">{file.title}</td>
                            <td className="px-2 py-3 text-muted-foreground">{file.currentLocation}</td>
                            <td className="px-6 py-3 text-right">
                              {file.isValidated ? (
                                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${file.isChainIntact ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'border-red-500/25 bg-red-500/10 text-red-600 dark:text-red-400'}`}>
                                  {file.isChainIntact ? <><Icons.Check className="h-3 w-3" /> Intact</> : <><Icons.AlertCircle className="h-3 w-3" /> Tampered</>}
                                </span>
                              ) : (
                                <span className="text-[10px] italic text-muted-foreground">Not checked</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              {/* Officer roster */}
              <Card className="p-0">
                <div className="flex items-center gap-2 border-b border-border px-6 py-4">
                  <Icons.Users className="h-4.5 w-4.5 text-primary" />
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Officer roster</h3>
                </div>
                {officers.length === 0 ? (
                  <EmptyState className="m-4 border-0" icon={<Icons.User className="h-6 w-6" />} title="No officers yet" description="Add ward officers to start routing files."
                    action={<Button variant="primary" size="sm" onClick={() => setIsAddStaffOpen(true)}>Add officer</Button>} />
                ) : (
                  <div className="divide-y divide-border">
                    {officers.map((off) => {
                      const stat = officerStats.find((s) => s._id === off.id);
                      return (
                        <div key={off.id} className="flex items-center justify-between gap-3 px-6 py-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-bold text-foreground">{off.name?.[0]?.toUpperCase()}</span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-foreground">{off.name}</p>
                              <p className="truncate text-[11px] text-muted-foreground">{off.deskLocation}</p>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="rounded-lg bg-muted px-2 py-1 text-[10px] font-semibold text-foreground">{stat?.processed || 0} routed</span>
                            {stat?.backtracked > 0 && (
                              <span className="rounded-lg bg-red-500/10 px-2 py-1 text-[10px] font-semibold text-red-500">{stat.backtracked} bounces</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>
          </div>
        )}
      </Container>

      <Modal isOpen={isAddStaffOpen} onClose={() => setIsAddStaffOpen(false)} title="Register ward officer" description="Create a new processing account for this ward.">
        <form onSubmit={handleAddStaff} className="space-y-4">
          <Input label="Officer full name" id="staff_name" placeholder="e.g. Sudeep Mishra" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} required disabled={formLoading} />
          <Input label="Work email" id="staff_email" type="email" placeholder="officer@ward.gov.np" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} required disabled={formLoading} />
          <Input label="Initial password" id="staff_pw" type="password" placeholder="••••••••" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} required disabled={formLoading} />
          <Select label="Desk assignment" id="staff_loc" value={form.deskLocation}
            onChange={(e) => setForm({ ...form, deskLocation: e.target.value })} required disabled={formLoading}>
            {DESK_LOCATIONS.map((loc) => <option key={loc} value={loc}>{loc}</option>)}
          </Select>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setIsAddStaffOpen(false)} disabled={formLoading}>Cancel</Button>
            <Button type="submit" variant="primary" loading={formLoading}>Create account</Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
