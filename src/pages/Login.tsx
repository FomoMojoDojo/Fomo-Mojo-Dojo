import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

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
        navigate('/admin');
      }
    }
  };

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center px-4">
      <div className="w-full max-w-[380px]">
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="w-8 h-8 rounded-[5px] bg-gold flex items-center justify-center">
            <span className="font-serif text-ink text-[18px] font-bold leading-none">M</span>
          </div>
          <span className="font-sans text-[15px] font-bold text-gold tracking-[0.06em] uppercase">
            MOJO MAP
          </span>
        </div>

        <div className="bg-ink-2 border border-[#3e3828] rounded-xl p-6">
          <h1 className="font-serif text-[20px] text-t-dp mb-1">
            {mode === 'login' ? 'Admin Login' : mode === 'signup' ? 'Create Account' : 'Reset Password'}
          </h1>
          <p className="font-mono text-[11px] text-t-ds mb-5 uppercase tracking-wide">
            {mode === 'forgot' ? 'Enter your email to reset' : 'CMS Access'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="font-mono text-[10px] text-t-ds uppercase tracking-wide block mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-ink border border-[#3e3828] rounded-lg px-3 py-2.5 text-t-dp font-sans text-[14px] focus:border-gold focus:outline-none transition-colors"
                required
              />
            </div>
            {mode !== 'forgot' && (
              <div>
                <label className="font-mono text-[10px] text-t-ds uppercase tracking-wide block mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-ink border border-[#3e3828] rounded-lg px-3 py-2.5 text-t-dp font-sans text-[14px] focus:border-gold focus:outline-none transition-colors"
                  required
                />
              </div>
            )}
            {error && <p className="font-mono text-[12px] text-danger">{error}</p>}
            {success && <p className="font-mono text-[12px] text-green-400">{success}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gold text-ink font-mono text-[12px] uppercase tracking-wide py-3 rounded-lg font-semibold hover:bg-gold-light transition-colors disabled:opacity-50"
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
                className="font-mono text-[11px] text-gold hover:underline"
              >
                Forgot password?
              </button>
            </p>
          )}

          <p className="mt-3 text-center font-mono text-[11px] text-t-ds">
            {mode === 'login' ? "Don't have an account?" : 'Back to'}{' '}
            <button
              type="button"
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setSuccess(''); }}
              className="text-gold hover:underline"
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
