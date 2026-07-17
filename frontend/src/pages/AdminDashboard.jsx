import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getStoredUser } from '../lib/api';
import {
  Container, Card, Button, Input, Select, Modal, Icons, StatCard, Skeleton,
  EmptyState, useToast, Tabs, BarChart, BarList, DonutChart, Chip, Badge,
  Textarea, Alert,
} from '../components/ui';
import { AppShell, PageHeading } from '../components/layout';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const [currentUser, setCurrentUser] = useState(null);
  const [tab, setTab] = useState('overview');

  const [officers, setOfficers] = useState([]);
  const [officerStats, setOfficerStats] = useState([]);
  const [filesUnderAudit, setFilesUnderAudit] = useState([]);

  const [form, setForm] = useState({ name: '', email: '', password: '', deskLocation: '' });
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formLoading, setFormLoading] = useState(false);
  const [error, setError] = useState('');
  const [weekly, setWeekly] = useState([]);

  // Dynamic Departments State
  const [departmentsList, setDepartmentsList] = useState([]);
  const [isAddDeptOpen, setIsAddDeptOpen] = useState(false);
  const [deptForm, setDeptForm] = useState({ name: '', code: '', description: '' });
  const [deptFormLoading, setDeptFormLoading] = useState(false);

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
      const [summary, roster, deptsData, weeklyData] = await Promise.all([
        api.dashboardSummary({ wardCode, allWards: 'true' }),
        api.getOfficers(),
        api.getDepartments(),
        api.getWeeklyThroughput({ allWards: 'true' }).catch(() => ({ days: [] })),
      ]);
      setOfficers(roster);
      setOfficerStats(summary.officerStats || []);
      setFilesUnderAudit(summary.recentFiles || []);
      setDepartmentsList(deptsData.departments || []);
      setWeekly((weeklyData.days || []).map((d) => ({ label: d.label, value: d.count })));

      // Default staff select assignment to the first active department
      const activeDepts = (deptsData.departments || []).filter((d) => d.isActive);
      if (activeDepts.length > 0) {
        setForm((f) => ({ ...f, deskLocation: activeDepts[0]?.name || '' }));
      }
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
      const activeDepts = departmentsList.filter((d) => d.isActive);
      setForm({ name: '', email: '', password: '', deskLocation: activeDepts[0]?.name || '' });
      setIsAddStaffOpen(false);
      toast.success('Ward officer account created.');
      await loadAdministration(currentUser.wardCode);
    } catch (err) {
      toast.error(err.message || 'Account registration failed.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleAddDept = async (e) => {
    e.preventDefault();
    if (!deptForm.name.trim() || !deptForm.code.trim()) return;
    setDeptFormLoading(true);
    try {
      await api.createDepartment({
        name: deptForm.name.trim(),
        code: deptForm.code.trim().toUpperCase(),
        description: deptForm.description.trim(),
      });
      setDeptForm({ name: '', code: '', description: '' });
      setIsAddDeptOpen(false);
      toast.success('Department registered successfully.');
      await loadAdministration(currentUser.wardCode);
    } catch (err) {
      toast.error(err.message || 'Department registration failed.');
    } finally {
      setDeptFormLoading(false);
    }
  };

  const handleToggleDeptActive = async (id) => {
    try {
      await api.toggleDepartment(id);
      toast.success('Department status updated.');
      await loadAdministration(currentUser.wardCode);
    } catch (err) {
      toast.error(err.message || 'Failed to toggle department status.');
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
      if (tampered > 0) toast.error(`Audit complete — ${tampered} file(s) failed integrity check.`);
      else toast.success('Audit complete — all ledgers intact.');
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
    const checked = filesUnderAudit.filter((f) => f.isValidated).length;
    return {
      officers: officers.length, routed: totalRouted, bounces: totalBounces,
      intact, checked, total: filesUnderAudit.length,
      auditedLabel: checked ? `${intact}/${checked}` : '—',
    };
  }, [officers, officerStats, filesUnderAudit]);

  // Analytics derivations
  const throughput = useMemo(() =>
    officers.map((o) => ({ label: o.name, value: officerStats.find((s) => s._id === o._id || s._id === o.id)?.processed || 0, tone: 'primary' }))
      .sort((a, b) => b.value - a.value).slice(0, 6), [officers, officerStats]);

  const deptLoad = useMemo(() => {
    const counts = {};
    const deskNames = departmentsList.map((d) => d.name);
    deskNames.forEach((d) => { counts[d] = 0; });
    filesUnderAudit.forEach((f) => { if (counts[f.currentLocation] !== undefined) counts[f.currentLocation] += 1; });
    const ranked = deskNames.map((d, i) => ({ label: d, value: counts[d], tone: i === 0 ? 'red' : i === 1 ? 'amber' : 'emerald' }))
      .sort((a, b) => b.value - a.value);
    return ranked;
  }, [filesUnderAudit, departmentsList]);

  const departments = useMemo(() => departmentsList.map((d) => ({
    id: d._id,
    name: d.name,
    code: d.code,
    description: d.description,
    isActive: d.isActive,
    officers: officers.filter((o) => o.deskLocation === d.name).length,
    files: filesUnderAudit.filter((f) => f.currentLocation === d.name).length,
  })), [departmentsList, officers, filesUnderAudit]);

  const TABS = [
    { id: 'overview', label: 'Overview', icon: Icons.Grid },
    { id: 'analytics', label: 'Analytics', icon: Icons.BarChart },
    { id: 'departments', label: 'Departments', icon: Icons.Building },
  ];

  return (
    <AppShell user={currentUser}>
      <Container size="wide" className="space-y-8 pt-8">
        <PageHeading
          breadcrumbs={['Administration']}
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

        {error && <Alert tone="error">{error}</Alert>}

        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
            <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]"><Skeleton className="h-96" /><Skeleton className="h-96" /></div>
          </div>
        ) : (
          <div className="space-y-6 animate-fade-up">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Ward officers" value={stats.officers} icon={<Icons.Users className="h-5 w-5" />} />
              <StatCard label="Files routed" value={stats.routed} icon={<Icons.Route className="h-5 w-5" />} tone="emerald" />
              <StatCard label="Backtracks" value={stats.bounces} icon={<Icons.ArrowLeft className="h-5 w-5" />} tone="amber" />
              <StatCard label="Ledgers intact" value={stats.auditedLabel} icon={<Icons.ShieldCheck className="h-5 w-5" />} />
            </div>

            <Tabs tabs={TABS} active={tab} onChange={setTab} className="max-w-md" />

            {/* ── Overview ── */}
            {tab === 'overview' && (
              <div className="grid items-start gap-6 md:grid-cols-[1.1fr_0.9fr]">
                <Card className="p-0">
                  <div className="flex items-center gap-2 border-b border-border px-6 py-4">
                    <Icons.ShieldCheck className="h-4.5 w-4.5 text-primary" />
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Ledger integrity</h3>
                  </div>
                  {filesUnderAudit.length === 0 ? (
                    <EmptyState className="m-4 border-0" icon={<Icons.FileText className="h-6 w-6" />} title="No files to audit" description="Registered files appear here for ledger verification." />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                            <th className="px-6 py-3 font-semibold">File UID</th>
                            <th className="px-2 py-3 font-semibold">Title</th>
                            <th className="px-2 py-3 font-semibold">Desk</th>
                            <th className="px-6 py-3 text-right font-semibold">Chain</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {filesUnderAudit.map((file) => (
                            <tr key={file.fileUid} className="transition-colors hover:bg-muted/30">
                              <td className="px-6 py-3 font-mono text-xs text-muted-foreground">{file.fileUid}</td>
                              <td className="max-w-[160px] truncate px-2 py-3 font-semibold text-foreground">{file.title}</td>
                              <td className="px-2 py-3 text-muted-foreground">{file.currentLocation}</td>
                              <td className="px-6 py-3 text-right">
                                {file.isValidated ? (
                                  file.isChainIntact
                                    ? <Badge status="Verified" dot={false}>Intact</Badge>
                                    : <Badge status="Rejected" dot={false}>Tampered</Badge>
                                ) : (
                                  <span className="text-xs italic text-muted-foreground">Not checked</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>

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
                        const stat = officerStats.find((s) => s._id === off._id || s._id === off.id);
                        return (
                          <div key={off._id || off.id} className="flex items-center justify-between gap-3 px-6 py-4">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-bold text-foreground">{off.name?.[0]?.toUpperCase()}</span>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-foreground">{off.name}</p>
                                <p className="truncate text-xs text-muted-foreground">{off.deskLocation}</p>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className="rounded-lg bg-muted px-2 py-1 text-xs font-semibold text-foreground">{stat?.processed || 0} routed</span>
                              {stat?.backtracked > 0 && (
                                <span className="rounded-lg bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-500">{stat.backtracked} bounces</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              </div>
            )}

            {/* ── Analytics ── */}
            {tab === 'analytics' && (
              <div className="grid items-start gap-6 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <div className="mb-5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icons.TrendingUp className="h-4.5 w-4.5 text-primary" />
                      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Movements per day</h3>
                    </div>
                    <Chip>Last 7 days</Chip>
                  </div>
                  {weekly.length > 0 ? (
                    <BarChart data={weekly} />
                  ) : (
                    <EmptyState className="border-0" icon={<Icons.TrendingUp className="h-6 w-6" />} title="No movement data" description="Daily throughput appears once files start moving." />
                  )}
                </Card>

                <Card className="flex flex-col items-center justify-center">
                  <h3 className="mb-4 self-start text-xs font-semibold uppercase tracking-widest text-muted-foreground">Ledger integrity</h3>
                  <DonutChart value={stats.intact} max={stats.checked || 1} label={stats.checked ? `${stats.intact}/${stats.checked} intact` : 'Run an audit'} />
                  <p className="mt-4 text-center text-xs text-muted-foreground">Run the ledger audit to verify SHA-256 hash chains across all files.</p>
                </Card>

                <Card>
                  <div className="mb-5 flex items-center gap-2">
                    <Icons.Users className="h-4.5 w-4.5 text-primary" />
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Officer throughput</h3>
                  </div>
                  {throughput.length > 0 ? (
                    <BarList data={throughput} valueFormat={(v) => `${v} routed`} />
                  ) : (
                    <EmptyState className="border-0" icon={<Icons.Users className="h-6 w-6" />} title="No throughput yet" description="Officer routing volumes appear once files move." />
                  )}
                </Card>

                <Card className="lg:col-span-2">
                  <div className="mb-5 flex items-center gap-2">
                    <Icons.Layers className="h-4.5 w-4.5 text-primary" />
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Department file load</h3>
                  </div>
                  {filesUnderAudit.length > 0 ? (
                    <BarList data={deptLoad} valueFormat={(v) => `${v} file${v === 1 ? '' : 's'}`} />
                  ) : (
                    <EmptyState className="border-0" icon={<Icons.Layers className="h-6 w-6" />} title="No active files" description="Department distribution appears once files are registered." />
                  )}
                </Card>
              </div>
            )}

            {/* ── Departments ── */}
            {tab === 'departments' && (
              <div className="space-y-5">
                <div className="flex justify-end">
                  <Button variant="primary" onClick={() => setIsAddDeptOpen(true)}>
                    <Icons.Plus className="h-4 w-4" /> Add department
                  </Button>
                </div>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {departments.map((d) => (
                  <Card key={d.name} hover className="flex flex-col">
                    <div className="flex items-start justify-between">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/5 text-primary">
                        <Icons.Building className="h-5 w-5" />
                      </span>
                      <Badge status={d.isActive ? 'Active' : 'Inactive'} />
                    </div>
                    <h3 className="mt-4 text-sm font-semibold text-foreground">
                      {d.name} <span className="font-mono text-xs text-muted-foreground">({d.code})</span>
                    </h3>
                    {d.description && <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{d.description}</p>}
                    <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4">
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Officers</dt>
                        <dd className="mt-0.5 text-lg font-bold text-foreground">{d.officers}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active files</dt>
                        <dd className="mt-0.5 text-lg font-bold text-foreground">{d.files}</dd>
                      </div>
                    </dl>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => handleToggleDeptActive(d.id)}
                    >
                      {d.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                  </Card>
                ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Container>

      <Modal isOpen={isAddStaffOpen} onClose={() => setIsAddStaffOpen(false)} title="Register ward officer" description="Create a new processing account for this ward.">
        <form onSubmit={handleAddStaff} className="space-y-4">
          <Input label="Officer full name" id="staff_name" placeholder="e.g. Ram Prasad" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} required disabled={formLoading} />
          <Input label="Work email" id="staff_email" type="email" placeholder="officer@ward.gov.np" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} required disabled={formLoading} />
          <Input label="Initial password" id="staff_pw" type="password" placeholder="••••••••" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} required disabled={formLoading} />
          <Select label="Desk assignment" id="staff_loc" value={form.deskLocation}
            onChange={(e) => setForm({ ...form, deskLocation: e.target.value })} required disabled={formLoading}>
            {departmentsList.filter((d) => d.isActive).map((d) => (
              <option key={d.name} value={d.name}>{d.name}</option>
            ))}
          </Select>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setIsAddStaffOpen(false)} disabled={formLoading}>Cancel</Button>
            <Button type="submit" variant="primary" loading={formLoading}>Create account</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isAddDeptOpen} onClose={() => setIsAddDeptOpen(false)} title="Register ward department" description="Create a new processing section or desk for this ward.">
        <form onSubmit={handleAddDept} className="space-y-4">
          <Input label="Department name" id="dept_name" placeholder="e.g. Legal Advisory Office" value={deptForm.name}
            onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })} required disabled={deptFormLoading} />
          <Input label="Department code (unique)" id="dept_code" placeholder="e.g. LGL" value={deptForm.code}
            onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })} required disabled={deptFormLoading} maxLength={10} />
          <Textarea label="Description" id="dept_desc" rows={2} placeholder="Description of desk activities and responsibilities..." value={deptForm.description}
            onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })} disabled={deptFormLoading} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setIsAddDeptOpen(false)} disabled={deptFormLoading}>Cancel</Button>
            <Button type="submit" variant="primary" loading={deptFormLoading}>Create department</Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}