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
      .getOfficerInbox({ scope: 'bell', limit: 30 })
      .then((data) => {
        setFiles(data.files || []);
        setCount(data.count || 0);
      })
      .catch(() => {}); // badge is best-effort; never surface polling errors
  }, []);

  usePolling(refresh, 30000);

  const openFile = (file) => {
    setOpen(false);
    const actionQuery = file.currentStatus === 'In Transit' ? '&action=receive' : '';
    navigate(`/officer?file=${encodeURIComponent(file.fileUid)}${actionQuery}`);
  };

  return (
    <Popover
      align="end"
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) refresh(); // never show a stale list on click
      }}
      className="w-84"
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
              {count > 99 ? '99+' : count}
            </span>
          )}
        </button>
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="text-sm font-semibold text-foreground">Desk & Incoming Notifications</p>
        <span className="text-xs font-semibold text-primary">{count} file{count === 1 ? '' : 's'}</span>
      </div>

      {files.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">No active or incoming files.</p>
      ) : (
        <ul className="max-h-80 overflow-y-auto divide-y divide-border">
          {files.map((f) => {
            const isInTransit = f.currentStatus === 'In Transit';
            return (
              <li key={f.fileUid}>
                <button
                  type="button"
                  onClick={() => openFile(f)}
                  className="flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-muted/60 cursor-pointer"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">{f.title}</span>
                    <Badge status={isInTransit ? 'In Transit' : f.currentStatus} />
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center justify-between gap-2">
                    <span className="font-mono text-muted-foreground">{f.fileUid}</span>
                    <span>{isInTransit ? `Incoming from ${f.currentLocation}` : `${dwellLabel(f.updatedAt)} at desk`}</span>
                  </span>
                  {isInTransit && (
                    <span className="text-[11px] font-medium text-primary flex items-center gap-1 mt-0.5">
                      <Icons.Scan className="h-3 w-3" /> Click to scan & confirm receipt
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Link
        to="/inbox"
        onClick={() => setOpen(false)}
        className="flex items-center justify-center gap-1.5 px-4 py-3 text-sm font-semibold text-primary transition-colors hover:bg-muted/60 border-t border-border"
      >
        View full inbox <Icons.ArrowRight className="h-4 w-4" />
      </Link>
    </Popover>
  );
}
