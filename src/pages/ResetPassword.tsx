import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

const c = {
  bg: "#faf7f6",
  panel: "#FFFFFF",
  paper: "#FBFAF7",
  line: "#DDE6D1",
  charcoal: "#233C4B",
  secondary: "#46606D",
  muted: "#6E847F",
  danger: "#A35646",
  success: "#4D7A63",
};

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
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{ background: c.bg }}
      >
        <p className="font-mono text-[13px]" style={{ color: c.muted }}>Verifying reset link…</p>
      </div>
    );
  }

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
        <div className="rounded-[24px] border p-6 shadow-sm" style={{ background: c.panel, borderColor: c.line }}>
          <h1 className="font-serif text-[24px] mb-1" style={{ color: c.charcoal }}>Set New Password</h1>
          <p className="font-mono text-[11px] mb-5 uppercase tracking-wide" style={{ color: c.muted }}>Enter your new password</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="font-mono text-[10px] uppercase tracking-wide block mb-1" style={{ color: c.muted }}>New Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-[16px] px-3 py-2.5 font-sans text-[14px] focus:outline-none transition-colors"
                style={{ background: c.paper, border: `1px solid ${c.line}`, color: c.charcoal }}
                required
                minLength={6}
              />
            </div>
            {error && <p className="font-mono text-[12px]" style={{ color: c.danger }}>{error}</p>}
            {success && <p className="font-mono text-[12px]" style={{ color: c.success }}>{success}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full font-mono text-[12px] uppercase tracking-wide py-3 rounded-[16px] font-semibold transition-colors disabled:opacity-50"
              style={{ background: c.charcoal, color: "#FAF7F6" }}
            >
              {loading ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
