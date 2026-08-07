import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getStoredUser } from '../lib/api';
import {
  Container, Card, Button, Select, Badge, Icons, Skeleton, EmptyState, useToast,
} from '../components/ui';
import { AppShell, PageHeading } from '../components/layout';

const ACTION_OPTIONS = [
  'Received', 'Pending', 'Under Review', 'Verified', 'Approved',
  'Dispatched', 'Backtracked', 'Returned', 'Rejected',
];

const PAGE_SIZE = 25;

function describeMovement(m) {
  if (m.actionType === 'Backtracked') {
    return `Returned to ${m.currentLocation}${m.backtrackReason ? ` — ${m.backtrackReason}` : ''}`;
  }
  if (m.actionType === 'Received') {
    return `Registered at ${m.currentLocation}`;
  }
  if (m.previousLocation && m.previousLocation !== m.currentLocation) {
    return `${m.previousLocation} → ${m.currentLocation}`;
  }
  return `At ${m.currentLocation}`;
}

export default function ActivityLogPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [currentUser, setCurrentUser] = useState(null);

  const [movements, setMovements] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [officers, setOfficers] = useState([]);

  const [officerFilter, setOfficerFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const isAdminOrWardChair = currentUser?.role === 'admin' || currentUser?.role === 'ward_chair';

  useEffect(() => {
    const user = getStoredUser();
    if (!user) { navigate('/login'); return; }
    setCurrentUser(user);
    if (user.role === 'admin' || user.role === 'ward_chair') {
      api.getOfficers()
        .then((list) => setOfficers((list || []).filter((o) => o.wardCode === user.wardCode)))
        .catch(() => {});
    }
  }, [navigate]);

  const loadActivity = useCallback(async (targetPage, filters) => {
    setLoading(true);
    try {
      const params = { page: targetPage, limit: PAGE_SIZE };
      if (filters.officerId) params.officerId = filters.officerId;
      if (filters.action) params.action = filters.action;
      const data = await api.getActivity(params);
      setMovements(data.movements || []);
      setPagination(data.pagination || { page: 1, total: 0, totalPages: 1 });
    } catch (err) {
      toast.error(err.message || 'Failed to load activity.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    loadActivity(page, { officerId: officerFilter, action: actionFilter });
  }, [currentUser, page, officerFilter, actionFilter, loadActivity]);

  const changeFilter = (setter) => (e) => {
    setter(e.target.value);
    setPage(1);
  };

  const summary = useMemo(() => {
    if (pagination.total === 0) return 'No movements';
    const start = (pagination.page - 1) * PAGE_SIZE + 1;
    const end = Math.min(pagination.page * PAGE_SIZE, pagination.total);
    return `Showing ${start}–${end} of ${pagination.total} movement${pagination.total === 1 ? '' : 's'}`;
  }, [pagination]);

  return (
    <AppShell user={currentUser}>
      <Container size="wide" className="space-y-6 pt-8">
        <PageHeading
          breadcrumbs={['Workspace', 'Activity']}
          title={isAdminOrWardChair ? 'Ward activity log' : 'My activity'}
          description={isAdminOrWardChair
            ? 'Every movement recorded in the ward ledger — inspect actions taken across all desks.'
            : 'Every file action you have performed, newest first. This is your personal audit trail.'}
        />

        <Card className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            {isAdminOrWardChair && (
              <div className="w-full sm:max-w-xs">
                <Select label="Officer" id="flt_officer" value={officerFilter} onChange={changeFilter(setOfficerFilter)}>
                  <option value="">All officers</option>
                  {officers.map((o) => (
                    <option key={o._id} value={o._id}>{o.name} · {o.deskLocation}</option>
                  ))}
                </Select>
              </div>
            )}
            <div className="w-full sm:max-w-xs">
              <Select label="Action type" id="flt_action" value={actionFilter} onChange={changeFilter(setActionFilter)}>
                <option value="">All actions</option>
                {ACTION_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
              </Select>
            </div>
            <div className="flex-1" />
            <p className="pb-2.5 text-xs text-muted-foreground">{summary}</p>
          </div>
        </Card>

        {loading ? (
          <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
        ) : movements.length === 0 ? (
          <EmptyState
            icon={<Icons.Layers className="h-6 w-6" />}
            title="No activity found"
            description={actionFilter || officerFilter ? 'No movements match the current filters.' : 'Movements will appear here as files are registered and routed.'}
          />
        ) : (
          <div className="space-y-3">
            {movements.map((m) => (
              <Card key={m._id} className="p-4 transition-colors hover:border-border-strong">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge status={m.actionType} />
                      <button
                        type="button"
                        onClick={() => m.fileId?.fileUid && navigate(`/officer?file=${encodeURIComponent(m.fileId.fileUid)}`)}
                        className="font-mono text-xs font-semibold text-primary hover:underline cursor-pointer"
                      >
                        {m.fileId?.fileUid || '(file removed)'}
                      </button>
                      <span className="truncate text-sm font-semibold text-foreground">{m.fileId?.title}</span>
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">{describeMovement(m)}</p>
                    {m.notes && !m.notes.startsWith('Backtracked:') && (
                      <p className="mt-1 truncate text-xs italic text-muted-foreground/80">"{m.notes}"</p>
                    )}
                  </div>
                  <div className="shrink-0 text-left sm:text-right">
                    <p className="text-xs font-semibold text-foreground">{m.officerId?.name || 'Unknown officer'}</p>
                    <p className="text-xs text-muted-foreground">{m.officerId?.deskLocation}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(m.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              </Card>
            ))}

            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  <Icons.ArrowLeft className="h-4 w-4" /> Previous
                </Button>
                <p className="text-xs font-medium text-muted-foreground">Page {pagination.page} of {pagination.totalPages}</p>
                <Button variant="outline" size="sm" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next <Icons.ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}
      </Container>
    </AppShell>
  );
}
