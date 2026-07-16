import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getStoredUser } from '../lib/api';
import {
  Container, Card, Button, Badge, Icons, Skeleton, EmptyState, Chip, Tabs,
} from '../components/ui';
import { AppShell, PageHeading } from '../components/layout';

export default function OfficerInbox() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [recentFiles, setRecentFiles] = useState([]);
  const [departmentQueue, setDepartmentQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('desk');

  useEffect(() => {
    const user = getStoredUser();
    if (!user) { navigate('/login'); return; }
    setCurrentUser(user);
    load(user.wardCode);
  }, [navigate]);

  const load = async (wardCode) => {
    setLoading(true);
    try {
      const [summary, inboxData] = await Promise.all([
        api.dashboardSummary({ wardCode }),
        api.getOfficerInbox(),
      ]);
      setRecentFiles(inboxData.files || []);
      setDepartmentQueue(summary.departmentQueue || []);
    } catch { /* handled by empty state */ } finally {
      setLoading(false);
    }
  };

  const deskLocation = currentUser?.deskLocation;
  const atMyDesk = useMemo(() => recentFiles.filter((f) => f.currentLocation === deskLocation), [recentFiles, deskLocation]);
  const needsAttention = useMemo(() => recentFiles.filter((f) => f.currentStatus === 'Backtracked' || f.currentStatus === 'Pending'), [recentFiles]);
  const list = tab === 'desk' ? atMyDesk : tab === 'attention' ? needsAttention : recentFiles;

  const openFile = (fileUid) => navigate(`/officer?file=${encodeURIComponent(fileUid)}`);

  const TABS = [
    { id: 'desk', label: `My desk (${atMyDesk.length})`, icon: Icons.Folder },
    { id: 'attention', label: `Needs attention (${needsAttention.length})`, icon: Icons.AlertCircle },
    { id: 'all', label: `All ward (${recentFiles.length})`, icon: Icons.Layers },
  ];

  return (
    <AppShell user={currentUser} kicker={currentUser ? `Ward ${currentUser.wardCode}` : ''}>
      <Container size="wide" className="space-y-6 pt-8">
        <PageHeading
          breadcrumbs={['Workspace', 'Inbox']}
          title="Inbox"
          description={deskLocation ? `Files awaiting action at the ${deskLocation}.` : 'Files awaiting action across your ward.'}
          actions={<Button variant="outline" onClick={() => load(currentUser.wardCode)}><Icons.Zap className="h-4 w-4" /> Refresh</Button>}
        />

        <div className="grid items-start gap-6 lg:grid-cols-[1fr_18rem]">
          <div className="space-y-5">
            <Tabs tabs={TABS} active={tab} onChange={setTab} />

            {loading ? (
              <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
            ) : list.length === 0 ? (
              <EmptyState
                icon={<Icons.CheckCircle className="h-6 w-6" />}
                title={tab === 'desk' ? 'Your desk is clear' : tab === 'attention' ? 'Nothing needs attention' : 'No files in the ward'}
                description={tab === 'desk' ? 'No files are currently waiting at your desk.' : 'Files will appear here as they move through the ward.'}
              />
            ) : (
              <div className="space-y-3 animate-fade-up">
                {list.map((file) => (
                  <button
                    key={file.fileUid}
                    onClick={() => openFile(file.fileUid)}
                    className="group flex w-full items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[0_12px_30px_-16px_rgba(15,31,54,0.2)] cursor-pointer"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-primary">
                      <Icons.FileText className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{file.fileUid}</span>
                        <Badge status={file.currentStatus} />
                      </div>
                      <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                        <span className="truncate">{file.title}</span>
                        {file.currentStatus === 'Backtracked' ? (
                          // Animated pulse reserved for files that genuinely need attention now.
                          <span className="relative flex h-2 w-2 shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                          </span>
                        ) : (
                          !['Approved', 'Verified', 'Dispatched'].includes(file.currentStatus) && (
                            // Calmer, static indicator for other in-progress files — avoids a whole
                            // list of rows pulsing at once.
                            <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-sky-500" aria-hidden="true" />
                          )
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{file.citizenName} · {file.currentLocation}</p>
                    </div>
                    <Icons.ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <Card className="p-6">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Ward queues</h3>
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6" />)}</div>
            ) : departmentQueue.length > 0 ? (
              <div className="space-y-3">
                {departmentQueue.map((dept) => (
                  <div key={dept._id} className="flex items-center justify-between text-xs">
                    <span className={`font-semibold ${dept._id === deskLocation ? 'text-primary' : 'text-foreground'}`}>{dept._id}</span>
                    <div className="flex items-center gap-2">
                      {dept.pending > 0 && <Chip className="!px-1.5 !py-0.5">{dept.pending} delayed</Chip>}
                      <span className="rounded bg-muted px-2 py-0.5 text-xs font-bold text-foreground">{dept.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-xs italic text-muted-foreground">No active queues.</p>
            )}
          </Card>
        </div>
      </Container>
    </AppShell>
  );
}