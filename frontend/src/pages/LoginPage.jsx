import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, saveSession, getStoredUser } from '../lib/api';
import { Button, Input, Icons, Tabs, Alert } from '../components/ui';
import { Logo, ThemeToggle } from '../components/layout';

const DEMO = {
  officer: { email: 'officer@ward.gov.np', password: 'officer123' },
  admin: { email: 'admin@ward.gov.np', password: 'admin123' },
};

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryRole = searchParams.get('role');

  const [role, setRole] = useState(queryRole === 'admin' ? 'admin' : 'officer');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    if (user) navigate(user.role === 'admin' ? '/admin' : '/officer');
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.login(email.trim(), password, role);
      saveSession(res.token, res.user);
      navigate(res.user.role === 'admin' ? '/admin' : '/officer');
    } catch (err) {
      setError(err.message || 'Authentication failed. Please verify your credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = () => {
    setEmail(DEMO[role].email);
    setPassword(DEMO[role].password);
    setError('');
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Left brand panel */}
      <aside className="hidden bg-navy-900 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div>
          <Link to="/" className="inline-flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white"><Icons.Route className="h-5 w-5" /></span>
            <span className="text-[15px] font-bold tracking-tight text-white">TraceGov</span>
          </Link>
        </div>
        <div className="max-w-md">
          <Icons.ShieldCheck className="h-10 w-10 text-emerald-400" />
          <h2 className="mt-6 text-3xl font-bold leading-tight text-white">The trusted terminal for government file processing.</h2>
          <p className="mt-4 text-navy-100">Every action you take is recorded on a tamper-proof cryptographic ledger — accountable, permanent, and transparent to the citizens you serve.</p>
        </div>
        <div className="flex items-center gap-6 text-xs text-navy-200">
          <span className="flex items-center gap-1.5"><Icons.Lock className="h-4 w-4" /> Encrypted sessions</span>
          <span className="flex items-center gap-1.5"><Icons.ShieldCheck className="h-4 w-4" /> SHA-256 ledger</span>
        </div>
      </aside>

      {/* Right form panel */}
      <div className="relative flex flex-col items-center justify-center bg-background px-4 py-12">
        <div className="absolute right-4 top-4 flex items-center gap-2">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-sm animate-fade-up">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-foreground">Sign in to your portal</h1>
          <p className="mt-2 text-sm text-muted-foreground">Officer & administrator verification terminal.</p>

          <Tabs
            className="mt-7"
            tabs={[
              { id: 'officer', label: 'Officer' },
              { id: 'admin', label: 'Administrator' },
            ]}
            active={role}
            onChange={(r) => { setRole(r); setError(''); }}
          />

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <Input label="Work email address" id="email" type="email" placeholder="officer@ward.gov.np"
              icon={<Icons.User className="h-4 w-4" />}
              value={email} onChange={(e) => setEmail(e.target.value)} required disabled={loading} autoComplete="email" />
            <Input label="Password" id="password" type="password" placeholder="••••••••"
              icon={<Icons.Lock className="h-4 w-4" />}
              value={password} onChange={(e) => setPassword(e.target.value)} required disabled={loading} autoComplete="current-password" />

            {error && (
              <Alert tone="error" className="animate-shake">{error}</Alert>
            )}

            <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
              {loading ? 'Verifying…' : 'Sign in'}
            </Button>
          </form>

          <button onClick={fillDemo} className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground cursor-pointer">
            <Icons.Sparkles className="h-3.5 w-3.5" /> Fill demo {role} credentials
          </button>

          <div className="mt-8 text-center">
            <Link to="/track" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
              <Icons.ArrowLeft className="h-3.5 w-3.5" /> Back to public tracking
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}