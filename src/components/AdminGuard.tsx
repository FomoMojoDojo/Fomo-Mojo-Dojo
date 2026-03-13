import { Navigate } from 'react-router-dom';
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

  if (!user) return <Navigate to="/login" replace />;
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
