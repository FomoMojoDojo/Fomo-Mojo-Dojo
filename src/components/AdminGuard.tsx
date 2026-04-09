import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <p className="font-mono text-[13px] text-t-ds">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h1 className="font-serif text-[22px] text-t-dp mb-2">Admin Login Required</h1>
          <p className="font-mono text-[12px] text-t-ds mb-5">
            Sign in with an admin account to open this page.
          </p>
          <Link
            to="/login"
            className="inline-flex items-center rounded-md border border-white/20 bg-white/5 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[#d7def8] transition-colors hover:bg-white/10"
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="font-serif text-[22px] text-t-dp mb-2">Access Denied</h1>
          <p className="font-mono text-[12px] text-t-ds">You don't have admin access to the CMS.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
