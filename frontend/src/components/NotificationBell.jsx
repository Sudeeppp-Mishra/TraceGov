import React, { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Icons, Popover } from './ui';
import { api } from '../lib/api';
import { usePolling } from '../lib/hooks';
import { dwellLabel } from '../lib/time';

/**
 * Header notification bell: shows how many files are currently sitting at the
 * signed-in officer's desk and lists them in a dropdown for one-click triage.
 */
export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    api
      .getOfficerInbox({ scope: 'desk', limit: 8 })
      .then((data) => {
        setFiles(data.files || []);
        setCount(data.count || 0);
      })
      .catch(() => {}); // badge is best-effort; never surface polling errors
  }, []);

  usePolling(refresh, 60000);

  const openFile = (fileUid) => {
    setOpen(false);
    navigate(`/officer?file=${encodeURIComponent(fileUid)}`);
  };

  return (
    <Popover
      align="end"
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) refresh(); // never show a stale list on click
      }}
      className="w-80"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-all hover:bg-muted hover:text-foreground cursor-pointer"
          aria-label={`Inbox notifications, ${count} file${count === 1 ? '' : 's'} pending at your desk`}
        >
          <Icons.Bell className="h-4.5 w-4.5" />
          {count > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {count > 9 ? '9+' : count}
            </span>
          )}
        </button>
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="text-sm font-semibold text-foreground">Pending at your desk</p>
        <span className="text-xs font-medium text-muted-foreground">{count} file{count === 1 ? '' : 's'}</span>
      </div>

      {files.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">Your desk is clear.</p>
      ) : (
        <ul className="max-h-80 overflow-y-auto">
          {files.map((f) => (
            <li key={f.fileUid}>
              <button
                type="button"
                onClick={() => openFile(f.fileUid)}
                className="flex w-full flex-col gap-1 border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted/60 cursor-pointer"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{f.title}</span>
                  <Badge status={f.currentStatus} />
                </span>
                <span className="text-xs text-muted-foreground">
                  <span className="font-mono">{f.fileUid}</span> · {dwellLabel(f.updatedAt)} at your desk
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Link
        to="/inbox"
        onClick={() => setOpen(false)}
        className="flex items-center justify-center gap-1.5 px-4 py-3 text-sm font-semibold text-primary transition-colors hover:bg-muted/60"
      >
        View inbox <Icons.ArrowRight className="h-4 w-4" />
      </Link>
    </Popover>
  );
}
