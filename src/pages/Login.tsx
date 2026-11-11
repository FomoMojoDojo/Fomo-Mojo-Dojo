import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { HAS_SUPABASE_CREDENTIALS } from '@/integrations/supabase/client';
import { carriedNextFrom } from '@/lib/authRedirect';
import { startPathFor } from '@/lib/landing/landingResolver';
import { LOGIN_STRINGS } from './loginStrings';

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
  // U6-58: no 'signup'. The mode existed because this page offered to create an account.
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

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

    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    // U6-63: EVERY sign-in goes to /start, which is the one place that knows what this account
    // holds. It used to go straight to the Front Door, which is an operator's page — a member
    // arrived there and met AdminGuard. A carried deep link rides along and is honoured only if
    // /start finds the account holds the company it names; carriedNextFrom re-validates it here
    // rather than trusting the query string.
    navigate(startPathFor(carriedNextFrom(location.search)));
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
          {/* U6-59: the mark, and no description. The line that stood here — "Strategy workspace
              access for company research, opportunity mapping, and internal review." — told a
              client that the product they were invited to is an internal tool. */}
          <span className="font-serif text-[20px]" style={{ color: c.charcoal }}>
            {LOGIN_STRINGS.wordmark}
          </span>
        </div>

        <div className="rounded-[24px] border p-6 shadow-sm" style={{ background: c.panel, borderColor: c.line }}>
          <h1 className="font-serif text-[24px] mb-1" style={{ color: c.charcoal }}>
            {mode === 'login' ? LOGIN_STRINGS.heading : 'Reset Password'}
          </h1>
          <p className="font-mono text-[11px] mb-5 uppercase tracking-wide" style={{ color: c.muted }}>
            {mode === 'forgot' ? 'Enter your email to reset' : LOGIN_STRINGS.subheading}
          </p>
          {!HAS_SUPABASE_CREDENTIALS ? (
            <p className="mb-4 rounded-[12px] border px-3 py-2 font-mono text-[11px]" style={{ borderColor: c.line, color: c.secondary, background: c.paper }}>
              {LOGIN_STRINGS.previewMode}
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
                ? (mode === 'forgot' ? 'Sending…' : 'Signing in…')
                : (mode === 'forgot' ? 'Send Reset Link' : 'Sign In')}
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

          {/* U6-58: the "Don't have an account? Sign up" invitation is gone — accounts are created
              by FomoMojoDojo (docs/operator-account-setup.md), not self-registered. What stays is
              the way back from the reset form, which is not an account-creation control. */}
          {mode === 'forgot' && (
            <p className="mt-3 text-center font-mono text-[11px]" style={{ color: c.muted }}>
              Back to{' '}
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
                className="hover:underline"
                style={{ color: c.warm }}
              >
                Sign in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
