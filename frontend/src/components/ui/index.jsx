import React, { useEffect, useRef, useState } from 'react';

/*
 * Design standard (applies to every page):
 * - Labels/overlines: text-xs only (no text-[9px]/[10px]/[11px] arbitrary sizes).
 * - Body copy: text-sm. Page titles come from layout/PageHeading.
 * - Card padding: default p-6. Exceptions: p-0 for full-bleed tables/lists
 *   (rows carry px-6 py-4), p-4 for compact list-item cards.
 * - Section rhythm: space-y-8 at page level, gap-4 within sections.
 * - Pills: Badge for anything status-like, Chip for neutral metadata.
 *   Never hand-roll rounded-full border spans.
 */

/* ───────────────────────── Layout ───────────────────────── */

export function Container({ children, className = '', size = 'default', ...props }) {
  const widths = { default: 'max-w-6xl', wide: 'max-w-7xl', narrow: 'max-w-3xl' };
  return (
    <div className={`mx-auto w-full ${widths[size]} px-4 sm:px-6 lg:px-8 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function SectionLabel({ children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary/80 ${className}`}>
      <span className="h-1 w-1 rounded-full bg-emerald-500" />
      {children}
    </span>
  );
}

/* ───────────────────────── Card ───────────────────────── */

export function Card({ children, className = '', hover = false, ...props }) {
  return (
    <div
      className={`rounded-2xl border border-border bg-card p-6 shadow-[0_1px_2px_rgba(15,31,54,0.04)] ${
        hover ? 'transition-all duration-300 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[0_12px_30px_-12px_rgba(15,31,54,0.16)]' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

/* ───────────────────────── Button ───────────────────────── */

export function Button({
  children,
  as: Tag = 'button',
  type = 'button',
  variant = 'primary',
  size = 'md',
  className = '',
  disabled = false,
  loading = false,
  ...props
}) {
  const base =
    'relative inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none cursor-pointer whitespace-nowrap select-none active:scale-[0.98]';

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-6 py-3 text-[15px]',
  };

  const styles = {
    primary: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover hover:shadow-md',
    accent: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 hover:shadow-md',
    secondary: 'bg-muted text-foreground hover:bg-accent hover:text-accent-foreground',
    outline: 'border border-border-strong bg-card text-foreground hover:bg-muted hover:border-muted-foreground/40',
    ghost: 'text-foreground hover:bg-muted',
    danger: 'border border-transparent bg-red-600 text-white shadow-sm hover:bg-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 dark:shadow-none dark:hover:bg-red-500/20 dark:hover:text-red-200',
  };

  const tagProps = Tag === 'button' ? { type, disabled: disabled || loading } : {};

  return (
    <Tag className={`${base} ${sizes[size]} ${styles[variant]} ${className}`} {...tagProps} {...props}>
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </Tag>
  );
}

/* ───────────────────────── Inputs ───────────────────────── */

export function Input({ label, id, type = 'text', className = '', mono = false, error, hint, icon, ...props }) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-foreground">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>}
        <input
          type={type}
          id={id}
          className={`w-full rounded-xl border bg-card py-2.5 text-sm text-foreground placeholder-muted-foreground/70 outline-none transition-all duration-200 focus:border-ring focus:ring-4 focus:ring-ring/10 ${
            icon ? 'pl-10 pr-3.5' : 'px-3.5'
          } ${mono ? 'font-mono uppercase tracking-wider' : ''} ${
            error ? 'border-red-400 focus:border-red-500 focus:ring-red-500/10' : 'border-border'
          } ${className}`}
          {...props}
        />
      </div>
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-red-500">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function Textarea({ label, id, className = '', error, rows = 3, ...props }) {
  return (
    <div className="w-full">
      {label && <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-foreground">{label}</label>}
      <textarea
        id={id}
        rows={rows}
        className={`w-full resize-y rounded-xl border bg-card px-3.5 py-2.5 text-sm text-foreground placeholder-muted-foreground/70 outline-none transition-all duration-200 focus:border-ring focus:ring-4 focus:ring-ring/10 ${
          error ? 'border-red-400' : 'border-border'
        } ${className}`}
        {...props}
      />
      {error && <p className="mt-1.5 text-xs font-medium text-red-500">{error}</p>}
    </div>
  );
}

export function Select({ label, id, children, className = '', error, hint, ...props }) {
  return (
    <div className="w-full">
      {label && <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-foreground">{label}</label>}
      <div className="relative">
        <select
          id={id}
          className={`w-full appearance-none rounded-xl border bg-card px-3.5 py-2.5 pr-9 text-sm text-foreground outline-none transition-all duration-200 focus:border-ring focus:ring-4 focus:ring-ring/10 ${
            error ? 'border-red-400' : 'border-border'
          } ${className}`}
          {...props}
        >
          {children}
        </select>
        <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-red-500">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/* ───────────────────────── Status system ───────────────────────── */

// Canonical status → visual mapping. Supports backend + citizen-facing labels.
export const STATUS_STYLES = {
  Received:    'bg-navy-50 text-navy-700 border-navy-200 dark:bg-navy-900/40 dark:text-navy-200 dark:border-navy-700/60',
  Pending:     'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50',
  'Under Review': 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/50',
  Approved:    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50',
  Verified:    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50',
  Dispatched:  'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/50 dark:text-slate-200 dark:border-slate-700',
  Backtracked: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/50',
  Returned:    'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/50',
  Rejected:    'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/50',
  Active:      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50',
  Inactive:    'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700',
};

const STATUS_DOT = {
  Received: 'bg-navy-500', Pending: 'bg-amber-500', 'Under Review': 'bg-blue-500',
  Approved: 'bg-emerald-500', Verified: 'bg-emerald-500', Dispatched: 'bg-slate-500',
  Backtracked: 'bg-red-500', Returned: 'bg-red-500', Rejected: 'bg-red-500',
  Active: 'bg-emerald-500', Inactive: 'bg-slate-400',
};

// `status` drives the color recipe; `children` optionally overrides the label text.
export function Badge({ status, children, dot = true, className = '' }) {
  const label = children || status;
  const style = STATUS_STYLES[status] || 'bg-muted text-muted-foreground border-border';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${style} ${className}`}>
      {dot && status && <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status] || 'bg-current'}`} />}
      {label}
    </span>
  );
}

export function Chip({ children, className = '', ...props }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground ${className}`} {...props}>
      {children}
    </span>
  );
}

/* ───────────────────────── Stat card ───────────────────────── */

export function StatCard({ label, value, icon, trend, tone = 'default', className = '' }) {
  const tones = {
    default: 'text-primary',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-500',
    red: 'text-red-500',
  };

  return (
    <Card hover className={className}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-foreground tabular-nums">{value}</p>
          {trend && <p className="mt-1.5 text-xs font-medium text-muted-foreground">{trend}</p>}
        </div>
        {icon && (
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted ${tones[tone]}`}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}

/* ───────────────────────── Feedback: Spinner / Skeleton / Empty ───────────────────────── */

export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
    </svg>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={`skeleton rounded-lg ${className}`} />;
}

export function EmptyState({ icon, title, description, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong bg-muted/20 px-6 py-14 text-center ${className}`}>
      {icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">{icon}</div>
      )}
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ───────────────────────── Alert ───────────────────────── */

export function Alert({ tone = 'error', title, children, className = '' }) {
  const config = {
    error:   { style: STATUS_STYLES.Rejected, icon: Icons.AlertCircle },
    warning: { style: STATUS_STYLES.Pending, icon: Icons.AlertCircle },
    success: { style: STATUS_STYLES.Approved, icon: Icons.CheckCircle },
    info:    { style: STATUS_STYLES.Received, icon: Icons.Info },
  }[tone] || {};
  const Icon = config.icon || Icons.Info;
  return (
    <div
      role={tone === 'error' || tone === 'warning' ? 'alert' : undefined}
      className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${config.style} ${className}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
      </div>
    </div>
  );
}

/* ───────────────────────── Popover ───────────────────────── */

// Lightweight anchored panel. `trigger` is a render prop receiving props to
// spread on the trigger button; the panel closes on outside click / Escape.
export function Popover({ trigger, children, align = 'end', open, onOpenChange, className = '' }) {
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open !== undefined ? open : internalOpen;
  const setOpen = (next) => {
    if (open === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };

  useEffect(() => {
    if (!isOpen) return undefined;
    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus?.();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  return (
    <div ref={rootRef} className="relative">
      {trigger({
        ref: triggerRef,
        onClick: () => setOpen(!isOpen),
        'aria-expanded': isOpen,
        'aria-haspopup': 'dialog',
      })}
      {isOpen && (
        <div
          role="dialog"
          className={`absolute top-full z-50 mt-2 overflow-hidden rounded-2xl border border-border bg-card shadow-xl animate-fade-down ${
            align === 'end' ? 'right-0' : 'left-0'
          } ${className}`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Modal ───────────────────────── */

// Focusable-selector used by the Modal's internal focus trap.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

let modalIdSeq = 0;

export function Modal({ isOpen, onClose, title, description, children, className = '' }) {
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);
  // Keep the latest onClose in a ref so the focus-trap effect below only runs
  // on open/close — not on every parent re-render (an inline onClose prop
  // would otherwise re-trigger it per keystroke and steal focus mid-typing).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const idsRef = useRef(null);
  if (!idsRef.current) {
    modalIdSeq += 1;
    idsRef.current = { title: `modal-title-${modalIdSeq}`, desc: `modal-desc-${modalIdSeq}` };
  }

  useEffect(() => {
    if (!isOpen) return;

    // Remember what had focus so it can be restored once the dialog closes.
    previousFocusRef.current = document.activeElement;
    document.body.style.overflow = 'hidden';

    const getFocusable = () =>
      dialogRef.current
        ? Array.from(dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR)).filter((el) => el.offsetParent !== null)
        : [];

    // Move focus into the dialog as soon as it opens — preferring the first
    // form field over the header close button.
    const focusables = getFocusable();
    const firstField = focusables.find((el) => ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName));
    (firstField || focusables[0] || dialogRef.current)?.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (e.key === 'Tab') {
        const items = getFocusable();
        if (items.length === 0) {
          e.preventDefault();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = '';
      // Restore focus to whatever triggered the dialog (e.g. the button that opened it).
      previousFocusRef.current?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-[100] overflow-y-auto"
      onClick={onClose}
      aria-hidden="true"
    >
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? idsRef.current.title : undefined}
          aria-describedby={description ? idsRef.current.desc : undefined}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          className={`relative w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl animate-zoom-in outline-none my-4 ${className}`}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
            <div>
              <h3 id={idsRef.current.title} className="text-base font-semibold text-foreground">{title}</h3>
              {description && <p id={idsRef.current.desc} className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-1.5 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
              aria-label="Close dialog"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="px-6 py-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Timeline ───────────────────────── */

// Automatically marks the final child as `last` so callers don't have to
// compute `idx === arr.length - 1` themselves.
export function Timeline({ children, className = '' }) {
  const items = React.Children.toArray(children);
  return (
    <ol className={`relative space-y-6 ${className}`}>
      {items.map((child, idx) =>
        React.isValidElement(child) && child.props.last === undefined
          ? React.cloneElement(child, { last: idx === items.length - 1 })
          : child
      )}
    </ol>
  );
}

export function TimelineItem({ title, meta, children, tone = 'primary', last = false }) {
  const dot = {
    primary: 'bg-primary', emerald: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500',
  }[tone];
  return (
    <li className="relative pl-8">
      {!last && <span className="absolute left-[7px] top-4 h-full w-px bg-border" aria-hidden="true" />}
      <span className={`absolute left-0 top-1 h-3.5 w-3.5 rounded-full ${dot} ring-4 ring-card`} aria-hidden="true" />
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-0.5">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {meta && <span className="text-xs font-medium text-muted-foreground">{meta}</span>}
      </div>
      {children && <div className="mt-1 text-xs text-muted-foreground">{children}</div>}
    </li>
  );
}

/* ───────────────────────── Reveal on scroll ───────────────────────── */

export function Reveal({ children, className = '', delay = 0, as: Tag = 'div' }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref} className={`reveal ${visible ? 'is-visible' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </Tag>
  );
}

/* ───────────────────────── Count-up hook ───────────────────────── */

export function useCountUp(target, { duration = 1400, start = true } = {}) {
  const [value, setValue] = useState(0);
  const raf = useRef(null);
  useEffect(() => {
    if (!start) return;
    const numeric = typeof target === 'number' ? target : parseFloat(target) || 0;
    let startTs = null;
    const step = (ts) => {
      if (startTs === null) startTs = ts;
      const p = Math.min((ts - startTs) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(numeric * eased);
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration, start]);
  return value;
}

/* ───────────────────────── Toast system ───────────────────────── */

const ToastContext = React.createContext(null);
let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismiss = (id) => setToasts((t) => t.filter((x) => x.id !== id));
  const push = (toast) => {
    const id = ++toastId;
    setToasts((t) => [...t, { id, ...toast }]);
    setTimeout(() => dismiss(id), toast.duration || 4000);
  };
  const toast = {
    success: (msg, opts) => push({ type: 'success', message: msg, ...opts }),
    error: (msg, opts) => push({ type: 'error', message: msg, ...opts }),
    info: (msg, opts) => push({ type: 'info', message: msg, ...opts }),
  };
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-[200] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4 sm:left-auto sm:right-5 sm:translate-x-0">
        {toasts.map((t) => (
          <ToastCard key={t.id} {...t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  return ctx || { success: () => {}, error: () => {}, info: () => {} };
}

function ToastCard({ type, message, title, onDismiss }) {
  const config = {
    success: { icon: Icons.CheckCircle, ring: 'text-emerald-500', bar: 'bg-emerald-500' },
    error: { icon: Icons.AlertCircle, ring: 'text-red-500', bar: 'bg-red-500' },
    info: { icon: Icons.Info, ring: 'text-navy-500 dark:text-navy-300', bar: 'bg-navy-500' },
  }[type] || {};
  const Icon = config.icon || Icons.Info;
  return (
    <div className="pointer-events-auto flex items-start gap-3 overflow-hidden rounded-xl border border-border bg-card p-3.5 shadow-lg animate-fade-up">
      <span className={`absolute left-0 top-0 h-full w-1 ${config.bar}`} />
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${config.ring}`} />
      <div className="min-w-0 flex-1">
        {title && <p className="text-sm font-semibold text-foreground">{title}</p>}
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
      <button onClick={onDismiss} className="rounded p-0.5 text-muted-foreground hover:text-foreground cursor-pointer" aria-label="Dismiss">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
  );
}

/* ───────────────────────── Tabs ───────────────────────── */

export function Tabs({ tabs, active, onChange, className = '' }) {
  return (
    <div className={`flex gap-1 rounded-xl border border-border bg-muted p-1 ${className}`} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all cursor-pointer ${
            active === t.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {t.icon && <t.icon className="h-3.5 w-3.5" />}
          <span className="whitespace-nowrap">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ───────────────────────── Charts (dependency-free) ───────────────────────── */

// Vertical column chart. data: [{ label, value }]
// Vertical column SVG chart. data: [{ label, value }]
export function BarChart({ data, height = 180, className = '' }) {
  if (!data || data.length === 0) return null;
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  
  const paddingX = 35;
  const paddingY = 20;
  const chartHeight = height - paddingY * 2;
  const totalWidth = 480;
  
  return (
    <div className={`w-full overflow-hidden ${className}`}>
      <svg className="w-full h-auto overflow-visible" viewBox={`0 0 ${totalWidth} ${height}`}>
        {/* Horizontal grid lines */}
        {Array.from({ length: 4 }).map((_, idx) => {
          const y = paddingY + (chartHeight / 3) * idx;
          const val = Math.round(maxVal - (maxVal / 3) * idx);
          return (
            <g key={idx} className="opacity-30 dark:opacity-20">
              <line x1={paddingX} y1={y} x2={totalWidth - 10} y2={y} stroke="var(--border-strong)" strokeWidth={1} strokeDasharray="3 3" />
              <text x={paddingX - 8} y={y + 3} textAnchor="end" className="fill-muted-foreground text-xs font-mono font-medium">{val}</text>
            </g>
          );
        })}
        
        {/* Columns */}
        {data.map((d, idx) => {
          const spacing = (totalWidth - paddingX - 10) / data.length;
          const barWidth = Math.max(16, spacing - 14);
          const x = paddingX + 10 + idx * spacing;
          const pct = d.value / maxVal;
          const barHeight = pct * chartHeight;
          const y = paddingY + chartHeight - barHeight;
          
          return (
            <g key={d.label} className="group cursor-pointer">
              {/* Invisible interactive background block */}
              <rect x={x - 6} y={paddingY} width={barWidth + 12} height={chartHeight} fill="transparent" />
              
              {/* Dynamic Gradient Bar */}
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={4}
                fill="var(--primary)"
                className="fill-primary/70 transition-all duration-300 group-hover:fill-emerald-500"
              />
              
              {/* Value label: always visible (touch-friendly), emphasized further on hover */}
              <text
                x={x + barWidth / 2}
                y={y - 6}
                textAnchor="middle"
                className="fill-foreground text-xs font-mono font-bold opacity-60 transition-opacity duration-200 group-hover:opacity-100"
              >
                {d.value}
              </text>
              
              {/* Label text */}
              <text
                x={x + barWidth / 2}
                y={paddingY + chartHeight + 14}
                textAnchor="middle"
                className="fill-muted-foreground text-xs font-semibold"
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// Horizontal ranked bars. data: [{ label, value, tone? }]
export function BarList({ data, valueFormat = (v) => v, className = '' }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const toneClass = { emerald: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500', primary: 'bg-primary/80' };
  return (
    <div className={`space-y-3.5 ${className}`}>
      {data.map((d) => {
        const pct = Math.max(6, (d.value / max) * 100);
        return (
          <div key={d.label} className="space-y-1.5 text-xs">
            <div className="flex justify-between font-semibold text-foreground">
              <span className="truncate pr-2">{d.label}</span>
              <span className="tabular-nums text-muted-foreground">{valueFormat(d.value)}</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div className={`h-full rounded-full transition-all duration-700 ${toneClass[d.tone] || toneClass.primary}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Single-ratio donut ring (SVG).
export function DonutChart({ value, max = 100, size = 132, stroke = 13, label, tone = 'emerald', className = '' }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, (value || 0) / (max || 1));
  const color = tone === 'emerald' ? 'var(--color-emerald-500)' : 'var(--primary)';
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.22,1,0.36,1)' }} />
      </svg>
      <div className="absolute text-center">
        <span className="block text-2xl font-bold tabular-nums text-foreground">{Math.round(pct * 100)}%</span>
        {label && <span className="mt-0.5 block text-xs font-medium text-muted-foreground">{label}</span>}
      </div>
    </div>
  );
}

/* ───────────────────────── Icons ───────────────────────── */

const mk = (path) => (props) => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
    {path}
  </svg>
);

export const Icons = {
  Search: mk(<path d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />),
  Scan: mk(<><path d="M4 7V5a1 1 0 011-1h2M4 17v2a1 1 0 001 1h2m10-16h2a1 1 0 011 1v2m-3 13h2a1 1 0 001-1v-2M7 12h10" /></>),
  Clock: mk(<><path d="M12 7v5l3 2" /><circle cx="12" cy="12" r="9" /></>),
  User: mk(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></>),
  Users: mk(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0113 0M16 5.5a3.5 3.5 0 010 7M15 20a6.5 6.5 0 016.5-6.5" /></>),
  ArrowRight: mk(<path d="M5 12h14m-6-7l7 7-7 7" />),
  ArrowLeft: mk(<path d="M19 12H5m6 7l-7-7 7-7" />),
  ArrowUpRight: mk(<path d="M7 17L17 7M7 7h10v10" />),
  ChevronRight: mk(<path d="M9 5l7 7-7 7" />),
  ChevronDown: mk(<path d="M6 9l6 6 6-6" />),
  ShieldCheck: mk(<path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3zM9 12l2 2 4-4" />),
  Shield: mk(<path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" />),
  AlertCircle: mk(<><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></>),
  CheckCircle: mk(<><circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></>),
  Check: mk(<path d="M5 13l4 4L19 7" />),
  Info: mk(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>),
  LogOut: mk(<path d="M15 12H3m0 0l4-4m-4 4l4 4M11 8V6a2 2 0 012-2h5a2 2 0 012 2v12a2 2 0 01-2 2h-5a2 2 0 01-2-2v-2" />),
  Sparkles: mk(<path d="M12 3l1.8 4.9L18.7 9.7l-4.9 1.8L12 16.4l-1.8-4.9L5.3 9.7l4.9-1.8L12 3zM19 14l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9.9-2.4z" />),
  Layers: mk(<path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5" />),
  Bell: mk(<path d="M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 004 0" />),
  Inbox: mk(<path d="M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.5-6.9A2 2 0 0016.7 4H7.3a2 2 0 00-1.8 1.1z" />),
  FileText: mk(<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5zM14 3v5h5M9 13h6M9 17h4" />),
  Folder: mk(<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />),
  QrCode: mk(<path d="M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 3h3m3 0v3m0-6h-3m0 0v-3m0 6h3" />),
  Eye: mk(<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>),
  Building: mk(<path d="M4 21V5a1 1 0 011-1h9a1 1 0 011 1v16M15 9h4a1 1 0 011 1v11M8 8h1m-1 4h1m3-4h1m-1 4h1M9 21v-4h3v4" />),
  Route: mk(<><circle cx="6" cy="19" r="2.5" /><circle cx="18" cy="5" r="2.5" /><path d="M8.5 19H15a3.5 3.5 0 000-7H9a3.5 3.5 0 010-7h6.5" /></>),
  Lock: mk(<><rect x="4.5" y="10" width="15" height="10" rx="2" /><path d="M8 10V7a4 4 0 018 0v3" /></>),
  Zap: mk(<path d="M13 3L4 14h7l-1 7 9-11h-7l1-7z" />),
  BarChart: mk(<path d="M4 20V10M10 20V4M16 20v-6M22 20H2" />),
  Globe: mk(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 4 6 4 9s-1.5 6.5-4 9c-2.5-2.5-4-6-4-9s1.5-6.5 4-9z" /></>),
  Phone: mk(<path d="M5 4h4l2 5-3 2a12 12 0 005 5l2-3 5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" />),
  Menu: mk(<path d="M4 6h16M4 12h16M4 18h16" />),
  X: mk(<path d="M6 18L18 6M6 6l12 12" />),
  Sun: mk(<><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2m0 16v2M4 12H2m20 0h-2M5.6 5.6L4.2 4.2m15.6 1.4l1.4-1.4M5.6 18.4l-1.4 1.4m15.6-1.4l1.4 1.4" /></>),
  Moon: mk(<path d="M20.5 15.5A9 9 0 018.5 3.5 9 9 0 1020.5 15.5z" />),
  Star: mk(<path d="M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 21l1.1-6.5L2.6 9.8l6.5-.9L12 3z" />),
  Send: mk(<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />),
  Printer: mk(<path d="M7 8V4h10v4M7 18H5a2 2 0 01-2-2v-4a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2h-2M7 14h10v6H7v-6z" />),
  Plus: mk(<path d="M12 5v14M5 12h14" />),
  Pencil: mk(<path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />),
  Trash: mk(<path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-1 0v12M9 7v12M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13" />),
  Grid: mk(<path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z" />),
  TrendingUp: mk(<path d="M3 17l6-6 4 4 8-8m0 0h-5m5 0v5" />),
  RefreshCw: mk(<path d="M20 11A8.1 8.1 0 004.5 9M4 5v4h4m-4 6a8.1 8.1 0 0015.5 2m.5 4v-4h-4" />),
  Upload: mk(<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />),
  Undo: mk(<path d="M3 7v6h6M3 13a9 9 0 0118 0 9 9 0 01-9 9 9 9 0 01-7.7-4.4" />),
};

export { QrScanner } from './QrScanner';
export { FileActions } from './FileActions';
export { ExtractedTextModal } from './ExtractedTextModal';
export { StampOverlayImage } from './StampOverlayImage';
export { ScanReviewModal } from './ScanReviewModal';
