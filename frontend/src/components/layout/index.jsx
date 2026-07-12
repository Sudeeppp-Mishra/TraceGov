import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Container, Icons } from '../ui';
import { useTheme } from '../../lib/theme';
import { clearSession } from '../../lib/api';

/* ───────────── Brand mark ───────────── */
export function Logo({ className = '', showText = true, to = '/' }) {
  return (
    <Link to={to} className={`group inline-flex items-center gap-2.5 ${className}`}>
      <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-transform group-hover:scale-105">
        <Icons.Route className="h-5 w-5" />
      </span>
      {showText && (
        <span className="flex flex-col leading-none">
          <span className="text-[15px] font-bold tracking-tight text-foreground">TraceGov</span>
          <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Gov File Tracking</span>
        </span>
      )}
    </Link>
  );
}

/* ───────────── Theme toggle ───────────── */
export function ThemeToggle({ className = '' }) {
  const { dark, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      className={`flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-all hover:bg-muted hover:text-foreground cursor-pointer ${className}`}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {dark ? <Icons.Sun className="h-4.5 w-4.5" /> : <Icons.Moon className="h-4.5 w-4.5" />}
    </button>
  );
}

/* ───────────── Authenticated portal shell ───────────── */
const OFFICER_NAV = [
  { to: '/officer', label: 'Workspace', icon: Icons.Layers },
  { to: '/register-file', label: 'Register File', icon: Icons.FileText },
  { to: '/ai', label: 'AI Insights', icon: Icons.Sparkles },
];

export function AppShell({ user, children, kicker }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const nav = [...OFFICER_NAV];
  if (user?.role === 'admin') nav.push({ to: '/admin', label: 'Administration', icon: Icons.Shield });

  const logout = () => {
    clearSession();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border glass">
        <Container size="wide" className="flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo to="/officer" />
            {kicker && (
              <span className="hidden rounded-md bg-muted px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground md:inline-block">
                {kicker}
              </span>
            )}
          </div>

          <nav className="hidden items-center gap-1 md:flex">
            {nav.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end
                className={({ isActive }) =>
                  `inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                    isActive ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle className="hidden sm:flex" />
            {user && (
              <div className="hidden items-center gap-2.5 rounded-lg border border-border bg-card py-1 pl-1 pr-2.5 sm:flex">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">
                  {user.name?.[0]?.toUpperCase() || 'O'}
                </span>
                <div className="leading-tight">
                  <p className="text-xs font-semibold text-foreground">{user.name}</p>
                  <p className="text-[10px] text-muted-foreground">Ward {user.wardCode} · {user.deskLocation}</p>
                </div>
              </div>
            )}
            <button
              onClick={logout}
              className="hidden items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500 sm:inline-flex cursor-pointer"
            >
              <Icons.LogOut className="h-4 w-4" />
            </button>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-foreground md:hidden cursor-pointer"
              aria-label="Toggle menu"
            >
              {menuOpen ? <Icons.X className="h-5 w-5" /> : <Icons.Menu className="h-5 w-5" />}
            </button>
          </div>
        </Container>

        {menuOpen && (
          <div className="border-t border-border bg-card md:hidden animate-fade-down">
            <Container size="wide" className="flex flex-col gap-1 py-3">
              {nav.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium ${
                      isActive ? 'bg-muted text-foreground' : 'text-muted-foreground'
                    }`
                  }
                >
                  <Icon className="h-4.5 w-4.5" />
                  {label}
                </NavLink>
              ))}
              <div className="mt-2 flex items-center justify-between border-t border-border pt-3">
                <ThemeToggle />
                <button onClick={logout} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-red-500 cursor-pointer">
                  <Icons.LogOut className="h-4 w-4" /> Sign Out
                </button>
              </div>
            </Container>
          </div>
        )}
      </header>

      <main className="pb-20">{children}</main>
    </div>
  );
}

/* ───────────── Page heading ───────────── */
export function PageHeading({ title, description, actions, className = '' }) {
  return (
    <div className={`flex flex-col justify-between gap-4 sm:flex-row sm:items-end ${className}`}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}
