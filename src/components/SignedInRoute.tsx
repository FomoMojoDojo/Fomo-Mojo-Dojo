// THE TWO GATES THAT ARE NOT "ADMIN OR DENIED" (U6 part 1, 2026-11-11).
//
// AdminGuard answers one question — is this an admin — with two outcomes, and until this build those
// were the only two a route could have. A product with members needs two more:
//
//   SignedInRoute      a session is enough; the page itself decides what the account may see.
//   MemberToLanding    wraps an admin gate: a MEMBER who reaches it is SENT HOME, not refused.
//
// WHY THE SECOND ONE EXISTS. "/" and the Front Door are where a signed-in account arrives by
// default — from a bookmark, from the logo, from sign-in. "Access Denied" is the right answer for a
// member who reached an operator's tool; it is the wrong answer for a member who simply opened the
// product. The distinction U6-56 drew between "no session" and "wrong role" needs a third line here:
// right account, wrong front door, and we know where their front door is.
//
// MemberToLanding WRAPS rather than REPLACES the admin gate, and that is deliberate: the gate it
// wraps keeps doing its own job untouched — a signed-out visitor still meets AdminGuard's redirect
// with the carried path, an admin still passes through — so this adds an outer door without moving
// an inner one.
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { loginPathFor } from "@/lib/authRedirect";
import { POST_SIGN_IN_ROUTE } from "@/lib/landing/landingResolver";

/** A session, nothing more. Signed out → /login carrying the attempted path (U6-45). */
export function SignedInRoute({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!user) return <Navigate to={loginPathFor(`${location.pathname}${location.search}`)} replace />;
  return children;
}

/**
 * Sends a signed-in NON-ADMIN to their own landing; everyone else falls through to `children`,
 * which is expected to carry the admin gate. It deliberately does NOT handle the signed-out case:
 * AdminGuard inside already redirects to /login with the attempted path, and duplicating that here
 * would give the same route two redirects to keep in step.
 */
export function MemberToLanding({ children }: { children: JSX.Element }) {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return null;
  if (user && !isAdmin) return <Navigate to={POST_SIGN_IN_ROUTE} replace />;
  return children;
}
