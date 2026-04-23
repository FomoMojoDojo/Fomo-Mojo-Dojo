import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { HAS_SUPABASE_CREDENTIALS } from '@/integrations/supabase/client';

const c = {
  bg: "#faf7f6",
  panel: "#FFFFFF",
  paper: "#FBFAF7",
  line: "#DDE6D1",
  charcoal: "#233C4B",
  secondary: "#46606D",
  muted: "#6E847F",
  warm: "#B67A45",
  warmSoft: "#FFF8F2",
  danger: "#A35646",
  success: "#4D7A63",
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    if (mode === 'forgot') {
      if (!HAS_SUPABASE_CREDENTIALS) {
        setLoading(false);
        setError('Password reset is unavailable in preview mode.');
        return;
      }
      const { supabase } = await import('@/integrations/supabase/client');
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setLoading(false);
      if (error) {
        setError(error.message);
      } else {
        setSuccess('Check your email for a password reset link.');
      }
      return;
    }

    if (mode === 'signup') {
      const { error } = await signUp(email, password);
      setLoading(false);
      if (error) {
        setError(error.message);
      } else {
        setSuccess('Check your email to confirm your account.');
      }
    } else {
      const { error } = await signIn(email, password);
      setLoading(false);
      if (error) {
        setError(error.message);
      } else {
        navigate('/admin/companies');
      }
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background: c.bg,
        backgroundImage:
          'url("data:image/svg+xml,%3Csvg width=\'6\' height=\'6\' viewBox=\'0 0 6 6\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%23000\' fill-opacity=\'0.025\'%3E%3Cpath d=\'M5 0h1L0 5V4zM6 5v1H5z\'/%3E%3C/g%3E%3C/svg%3E")',
      }}
    >
      <div className="w-full max-w-[430px]">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-[12px] border shadow-sm" style={{ background: c.panel, borderColor: c.line }}>
            <span className="font-serif text-[22px] font-bold leading-none" style={{ color: c.charcoal }}>M</span>
          </div>
          <span className="font-sans text-[15px] font-bold tracking-[0.08em] uppercase" style={{ color: c.charcoal }}>
            MOJO MAP
          </span>
          <p className="mt-3 font-sans text-[14px] leading-[1.7]" style={{ color: c.secondary }}>
            Strategy workspace access for company research, opportunity mapping, and internal review.
          </p>
        </div>

        <div className="rounded-[24px] border p-6 shadow-sm" style={{ background: c.panel, borderColor: c.line }}>
          <h1 className="font-serif text-[24px] mb-1" style={{ color: c.charcoal }}>
            {mode === 'login' ? 'Admin Login' : mode === 'signup' ? 'Create Account' : 'Reset Password'}
          </h1>
          <p className="font-mono text-[11px] mb-5 uppercase tracking-wide" style={{ color: c.muted }}>
            {mode === 'forgot' ? 'Enter your email to reset' : 'CMS Access'}
          </p>
          {!HAS_SUPABASE_CREDENTIALS ? (
            <p className="mb-4 rounded-[12px] border px-3 py-2 font-mono text-[11px]" style={{ borderColor: c.line, color: c.secondary, background: c.paper }}>
              Preview mode: Supabase credentials are not configured, so admin access is local-only.
            </p>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="font-mono text-[10px] uppercase tracking-wide block mb-1" style={{ color: c.muted }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-[16px] px-3 py-2.5 font-sans text-[14px] focus:outline-none transition-colors"
                style={{ background: c.paper, border: `1px solid ${c.line}`, color: c.charcoal }}
                required
              />
            </div>
            {mode !== 'forgot' && (
              <div>
                <label className="font-mono text-[10px] uppercase tracking-wide block mb-1" style={{ color: c.muted }}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-[16px] px-3 py-2.5 font-sans text-[14px] focus:outline-none transition-colors"
                  style={{ background: c.paper, border: `1px solid ${c.line}`, color: c.charcoal }}
                  required
                />
              </div>
            )}
            {error && <p className="font-mono text-[12px]" style={{ color: c.danger }}>{error}</p>}
            {success && <p className="font-mono text-[12px]" style={{ color: c.success }}>{success}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full font-mono text-[12px] uppercase tracking-wide py-3 rounded-[16px] font-semibold transition-colors disabled:opacity-50"
              style={{ background: c.charcoal, color: "#FAF7F6" }}
            >
              {loading
                ? (mode === 'forgot' ? 'Sending…' : mode === 'login' ? 'Signing in…' : 'Creating account…')
                : (mode === 'forgot' ? 'Send Reset Link' : mode === 'login' ? 'Sign In' : 'Sign Up')}
            </button>
          </form>

          {mode === 'login' && (
            <p className="mt-3 text-center">
              <button
                type="button"
                onClick={() => { setMode('forgot'); setError(''); setSuccess(''); }}
                className="font-mono text-[11px] hover:underline"
                style={{ color: c.warm }}
              >
                Forgot password?
              </button>
            </p>
          )}

          <p className="mt-3 text-center font-mono text-[11px]" style={{ color: c.muted }}>
            {mode === 'login' ? "Don't have an account?" : 'Back to'}{' '}
            <button
              type="button"
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setSuccess(''); }}
              className="hover:underline"
              style={{ color: c.warm }}
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
