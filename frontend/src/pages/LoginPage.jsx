import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, saveSession, getStoredUser } from '../lib/api';
import { Container, Card, Button, Input, Icons } from '../components/ui';

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // Set default role from query param or fall back to officer
  const queryRole = searchParams.get('role');
  const [role, setRole] = useState(queryRole === 'admin' ? 'admin' : 'officer');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    const user = getStoredUser();
    if (user) {
      if (user.role === 'admin') navigate('/admin');
      else navigate('/officer');
    }
  }, [navigate]);

  // Handle submit credentials
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setLoading(true);
    setError('');

    try {
      const response = await api.login(email.trim(), password, role);
      saveSession(response.token, response.user);

      // Routing redirect based on authenticated role
      if (response.user.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/officer');
      }
    } catch (err) {
      setError(err.message || 'Authentication failed. Please verify credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center py-12 px-4 transition-colors">
      <div className="w-full max-w-md space-y-8 animate-in fade-in duration-200">
        
        {/* Brand identity */}
        <div className="text-center">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground mb-4">
            <span className="text-sm font-bold uppercase tracking-wider">TG</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Sign in to TraceGov</h2>
          <p className="mt-2 text-xs text-muted-foreground">Officer & Administrator Verification Terminal</p>
        </div>

        <Card className="p-6 md:p-8 space-y-6">
          {/* Custom minimal Tab Role Selector */}
          <div className="grid grid-cols-2 p-1 bg-muted rounded-lg border border-border">
            <button
              type="button"
              onClick={() => {
                setRole('officer');
                setError('');
              }}
              className={`py-2 text-xs font-semibold rounded-md transition-all cursor-pointer ${role === 'officer' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Officer Portal
            </button>
            <button
              type="button"
              onClick={() => {
                setRole('admin');
                setError('');
              }}
              className={`py-2 text-xs font-semibold rounded-md transition-all cursor-pointer ${role === 'admin' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Administrator
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Work Email Address"
              id="email"
              type="email"
              placeholder="e.g. officer@ward.gov.np"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />

            <Input
              label="Account Password"
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />

            {error && (
              <div className="rounded-lg border border-red-500/10 bg-red-500/5 p-3.5 text-xs font-medium text-red-600 dark:text-red-400 flex items-start gap-2 animate-shake">
                <Icons.AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              className="w-full py-2.5 mt-2"
              disabled={loading}
            >
              {loading ? 'Verifying Account...' : 'Sign In'}
            </Button>
          </form>
        </Card>

        {/* Back Link to Public tracker */}
        <div className="text-center">
          <Link
            to="/track"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-all"
          >
            <Icons.ArrowLeft className="h-3.5 w-3.5" />
            Back to Public tracking
          </Link>
        </div>

      </div>
    </div>
  );
}
