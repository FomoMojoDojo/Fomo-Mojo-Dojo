import { Link, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { loginPathFor } from '@/lib/authRedirect';

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <p className="font-mono text-[13px] text-t-ds">Loading…</p>
      </div>
    );
  }

  // U6-55 (2026-11-10): NO SESSION → /login, carrying the attempted path. This used to render an
  // "Admin Login Required" page, and U6-46 made that untenable: every gated route now sends a
  // signed-out visitor here, members included, and a page telling a client to "sign in with an admin
  // account" is both wrong and the wrong register. The two refusals stay DISTINCT — no session is a
  // redirect, a session without an admin row is still the "Access Denied" page below — because
  // conflating them would let a signed-in non-admin be read as merely signed out
  // (zz-admin-gate v2 asserts exactly that distinction).
  if (!user) {
    return <Navigate to={loginPathFor(`${location.pathname}${location.search}`)} replace />;
  }
  // U6 part 1 (2026-11-11) — THE CLIENT-MODE BOUNCE IS GONE, AND ITS REASON WITH IT.
  //
  // What stood here sent a non-admin in client presentation to "/" instead of refusing them, because
  // in internal mode "/" redirected back into this guard and looped, and because "Access Denied" was
  // a dead end with nowhere to go (2026-09-09). Both premises are now false: "/" sends a non-admin
  // to /start, which resolves a real destination, and a member HAS somewhere of their own to be.
  //
  // IT HAD TO GO, not merely become unnecessary. A non-admin is always client presentation now
  // (usePresentationMode), so the bounce would have fired for EVERY member on EVERY gated route —
  // making the role refusal unreachable and collapsing the distinction U6-56 signed: no session is a
  // redirect, a session without an admin row is a refusal in words. Measured 2026-11-11: with the
  // bounce in place a signed-in non-admin on /legacy/routes ended at /start, and zz-admin-gate (v4)
  // went red.
  //
  // WHERE A MEMBER IS SENT HOME INSTEAD, it is the ROUTE's decision and not this guard's: "/" and the
  // Front Door, the two places an account arrives by default (U6-50). Everywhere else is an
  // operator's tool and says so.
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h1 className="font-serif text-[22px] text-t-dp mb-2">Access Denied</h1>
          <p className="font-mono text-[12px] text-t-ds mb-5">You don't have admin access to the CMS.</p>
          <Link
            to="/"
            className="inline-flex items-center rounded-md border border-white/20 bg-white/5 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[#d7def8] transition-colors hover:bg-white/10"
          >
            Go to Client View
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
