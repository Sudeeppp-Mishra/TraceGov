import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getStoredUser } from '../lib/api';
import {
  Container, Card, Badge, Icons, Skeleton, EmptyState, Chip, Tabs,
} from '../components/ui';
import { AppShell, PageHeading } from '../components/layout';
import { usePolling } from '../lib/hooks';
import { dwellLabel } from '../lib/time';

export default function OfficerInbox() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [deskFiles, setDeskFiles] = useState([]);
  const [wardFiles, setWardFiles] = useState([]);
  const [incomingFiles, setIncomingFiles] = useState([]);
  const [departmentQueue, setDepartmentQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('desk');

  useEffect(() => {
    const user = getStoredUser();
    if (!user) { navigate('/login'); return; }
    setCurrentUser(user);
  }, [navigate]);

  const load = async () => {
    const user = getStoredUser();
    if (!user) return;
    try {
      const [summary, deskData, wardData, incomingData] = await Promise.all([
        api.dashboardSummary({ wardCode: user.wardCode }),
        api.getOfficerInbox({ scope: 'desk' }),
        api.getOfficerInbox(),
        api.getOfficerInbox({ scope: 'incoming' }),
      ]);
      setDeskFiles(deskData.files || []);
      setWardFiles(wardData.files || []);
      setIncomingFiles(incomingData.files || []);
      setDepartmentQueue(summary.departmentQueue || []);
    } catch { /* handled by empty state */ } finally {
      setLoading(false);
    }
  };

  usePolling(load, 60000, { enabled: !!currentUser });

  const deskLocation = currentUser?.deskLocation;
  // Longest-waiting first — that is the order work should be picked up in.
  const byOldest = (a, b) => new Date(a.updatedAt) - new Date(b.updatedAt);
  const atMyDesk = useMemo(() => [...deskFiles].sort(byOldest), [deskFiles]);
  const needsAttention = useMemo(
    () => wardFiles.filter((f) => f.currentStatus === 'Backtracked' || f.currentStatus === 'Pending').sort(byOldest),
    [wardFiles]
  );
  const list = tab === 'desk' ? atMyDesk : tab === 'incoming' ? incomingFiles : needsAttention;

  const openFile = (file) => {
    const actionParam = file.currentStatus === 'In Transit' ? '&action=receive' : '';
    navigate(`/officer?file=${encodeURIComponent(file.fileUid)}${actionParam}`);
  };

  const TABS = [
    { id: 'desk', label: `My desk (${atMyDesk.length})`, icon: Icons.Folder },
    { id: 'incoming', label: `Incoming in-transit (${incomingFiles.length})`, icon: Icons.Clock },
    { id: 'attention', label: `Needs attention (${needsAttention.length})`, icon: Icons.AlertCircle },
  ];

  return (
    <AppShell user={currentUser}>
      <Container size="wide" className="space-y-6 pt-8">
        <PageHeading
          breadcrumbs={['Workspace', 'Inbox']}
          title="Inbox"
          description={deskLocation ? `Files awaiting action at the ${deskLocation}, longest-waiting first. Refreshes automatically.` : 'Files awaiting action across your ward.'}
        />

        <div className="grid items-start gap-6 lg:grid-cols-[1fr_18rem]">
          <div className="space-y-5">
            <Tabs tabs={TABS} active={tab} onChange={setTab} />

            {loading ? (
              <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
            ) : list.length === 0 ? (
              <EmptyState
                icon={<Icons.CheckCircle className="h-6 w-6" />}
                title={tab === 'desk' ? 'Your desk is clear' : 'Nothing needs attention'}
                description={tab === 'desk' ? 'No files are currently waiting at your desk.' : 'Files will appear here as they move through the ward.'}
              />
            ) : (
              <div className="space-y-3 animate-fade-up">
                {list.map((file) => (
                  <button
                    key={file.fileUid}
                    onClick={() => openFile(file)}
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
                      <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{file.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{file.citizenName} · {file.currentLocation}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-xs font-medium tabular-nums text-muted-foreground" title="Time since last movement">
                        {dwellLabel(file.updatedAt)}
                      </span>
                      <Icons.ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <Card>
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Ward queues</h3>
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6" />)}</div>
            ) : departmentQueue.length > 0 ? (
              <div className="space-y-3">
                {departmentQueue.map((dept) => (
                  <div key={dept._id} className="flex items-center justify-between text-xs">
                    <span className={`font-semibold ${dept._id === deskLocation ? 'text-primary' : 'text-foreground'}`}>{dept._id}</span>
                    <div className="flex items-center gap-2">
                      {dept.pending > 0 && <Chip>{dept.pending} delayed</Chip>}
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
