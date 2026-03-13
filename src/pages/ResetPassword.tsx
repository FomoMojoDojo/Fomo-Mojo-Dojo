import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('type=recovery')) {
      setReady(true);
    }
    // Also listen for PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setSuccess('Password updated! Redirecting…');
      setTimeout(() => navigate('/login'), 2000);
    }
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center px-4">
        <p className="font-mono text-[13px] text-t-ds">Verifying reset link…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center px-4">
      <div className="w-full max-w-[380px]">
        <div className="bg-ink-2 border border-[#3e3828] rounded-xl p-6">
          <h1 className="font-serif text-[20px] text-t-dp mb-1">Set New Password</h1>
          <p className="font-mono text-[11px] text-t-ds mb-5 uppercase tracking-wide">Enter your new password</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="font-mono text-[10px] text-t-ds uppercase tracking-wide block mb-1">New Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-ink border border-[#3e3828] rounded-lg px-3 py-2.5 text-t-dp font-sans text-[14px] focus:border-gold focus:outline-none transition-colors"
                required
                minLength={6}
              />
            </div>
            {error && <p className="font-mono text-[12px] text-danger">{error}</p>}
            {success && <p className="font-mono text-[12px] text-green-400">{success}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gold text-ink font-mono text-[12px] uppercase tracking-wide py-3 rounded-lg font-semibold hover:bg-gold-light transition-colors disabled:opacity-50"
            >
              {loading ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
