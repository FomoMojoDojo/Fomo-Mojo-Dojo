// WHERE A SIGNED-IN ACCOUNT GOES (U6 part 1, signed 2026-11-11).
//
// THIS FILE IS PURE. It takes what the caller may read and returns one decision; it issues no query,
// touches no storage and knows no React. That is deliberate: the old answer to "which company?" was
// pickDefaultCompanyId over every row plus a localStorage id plus, when either failed, a hardcoded
// stand-in — three sources of truth, none of them the caller's own membership, and the one that won
// in the common case was a literal. A decision assembled from three places cannot be tested in one,
// and the stand-in reached a signed-out visitor for months before anyone saw it.
//
// THE STORED ID IS NOT AN INPUT (U6-62). `active_company_id` never appears here. A stored id is a
// claim a browser makes about itself, and the only authority on what an account may open is the set
// of companies the server let it read. The provider validates its stored id against that same list,
// so a stale or foreign id resolves to the caller's own company rather than to the stored one.
//
// MOST RECENTLY ASSIGNED WINS (U6-49). `companies` arrives ordered by company_members.created_at
// descending, so companies[0] is the newest engagement. There is no chooser: an account with two
// companies lands on the newer and reaches the other by its own URL.
import {
  CLIENT_REFINE_PREVIEW_DIAGNOSE_BASE,
  CLIENT_REFINE_PREVIEW_FIRSTREAD_BASE,
  CLIENT_REFINE_PREVIEW_COMPANY_ROUTE,
  CLIENT_REFINE_PREVIEW_ROUTE,
  clientRefineDiagnosePath,
  clientRefineFirstReadPath,
} from "@/lib/clientRefinePreview";
import { NEXT_PARAM } from "@/lib/authRedirect";

/** Every account signs in here; this route resolves and then redirects. */
export const POST_SIGN_IN_ROUTE = "/start";

/** `/start?next=<path>`, carrying a deep link through the resolve. The path must already have been
 *  validated by safeNextPath; this only encodes it. */
export function startPathFor(next: string | null | undefined): string {
  return next ? `${POST_SIGN_IN_ROUTE}?${NEXT_PARAM}=${encodeURIComponent(next)}` : POST_SIGN_IN_ROUTE;
}

export type LandingCompany = { id: string; name: string };

export type LandingInput = {
  isAdmin: boolean;
  /** The companies the CALLER MAY READ, most recently assigned first. Never the whole fleet. */
  companies: readonly LandingCompany[];
  /** Company ids with Diagnose running (src/lib/diagnoseRunning.ts). */
  diagnoseRunning: ReadonlySet<string>;
  /**
   * Company ids that have a First Read to open — a `first_read_sessions` row. Member-readable
   * through that table's own company_members arm, so the client resolves this for itself.
   *
   * WITHOUT THIS the landing would send a member to a First Read that renders its empty shell, and
   * an empty shell is the failure mode this whole build exists to end: it reads as "there is
   * nothing here" when the truth is "nothing has been opened yet". S-U6-6 says the truth.
   */
  firstReadReady: ReadonlySet<string>;
  /** A deep link already proven same-origin by safeNextPath, or null. */
  carriedNext: string | null;
};

export type LandingDecision =
  /** Go here. */
  | { kind: "deep_link"; path: string }
  | { kind: "admin_home"; path: string }
  | { kind: "diagnose"; path: string; companyId: string }
  | { kind: "first_read"; path: string; companyId: string }
  /** Render S-U6-6. The company is theirs; nothing in it is open yet. */
  | { kind: "not_ready"; companyId: string; organization: string }
  /** Render S-U6-1. There is nowhere to send this account. */
  | { kind: "no_company" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The company a path names, or null when it names none.
 *
 * Only the three families that carry a company in the URL are read: the First Read, the Diagnose
 * walk and the company page. Everything else — the Front Door, the workspace, the legacy prototype —
 * takes its company from the provider, so a member's deep link to one of those names no company and
 * is not honoured. That is the conservative answer on purpose: "honour it only if the user holds the
 * company it names" cannot be satisfied by a path that names nothing.
 */
export function companyIdFromPath(path: string | null | undefined): string | null {
  if (typeof path !== "string" || !path.startsWith("/")) return null;
  const pathname = path.split("?")[0].split("#")[0];
  for (const base of [
    CLIENT_REFINE_PREVIEW_FIRSTREAD_BASE,
    CLIENT_REFINE_PREVIEW_DIAGNOSE_BASE,
    CLIENT_REFINE_PREVIEW_COMPANY_ROUTE,
  ]) {
    if (!pathname.startsWith(`${base}/`)) continue;
    const segment = pathname.slice(base.length + 1).split("/")[0];
    if (UUID.test(segment)) return segment;
  }
  return null;
}

/**
 * ADMINS ARE NOT MEMBERS. An admin reads every company and holds none of them, so membership cannot
 * decide an admin's destination: any safe deep link is honoured and the default is the Front Door,
 * exactly as before this build.
 *
 * A MEMBER'S DEEP LINK is honoured only when the path names a company the member holds. A link to
 * someone else's company, or to a page that names no company, resolves to their own landing — the
 * refusal page exists for a member who NAVIGATES to a foreign company, not for one arriving from a
 * sign-in they were sent through.
 */
export function resolveLanding(input: LandingInput): LandingDecision {
  const { isAdmin, companies, diagnoseRunning, firstReadReady, carriedNext } = input;

  if (isAdmin) {
    return carriedNext
      ? { kind: "deep_link", path: carriedNext }
      : { kind: "admin_home", path: CLIENT_REFINE_PREVIEW_ROUTE };
  }

  if (companies.length === 0) return { kind: "no_company" };

  const held = new Set(companies.map((c) => c.id));
  const wanted = companyIdFromPath(carriedNext);
  if (wanted && held.has(wanted)) return { kind: "deep_link", path: carriedNext as string };

  // Diagnose first: once the inside read has started, that walk IS the company's current state, and
  // the First Read behind it stays reachable by its own URL.
  const own = companies[0];
  if (diagnoseRunning.has(own.id)) {
    return { kind: "diagnose", path: clientRefineDiagnosePath(own.id, "home"), companyId: own.id };
  }
  if (firstReadReady.has(own.id)) {
    return { kind: "first_read", path: clientRefineFirstReadPath(own.id), companyId: own.id };
  }
  return { kind: "not_ready", companyId: own.id, organization: own.name };
}

/**
 * The two route families a member may be sent to, plus /start itself.
 *
 * ClientModePathSync consults this. That sync bounces every path to "/" in client mode, and it
 * knows nothing of these families — `isClientRefinePreviewPath` does, but it also covers the
 * workshop, the inbox and the company page, which a member has no business on. So the exemption is
 * exactly the member's own destinations and nothing else: a narrower list than the one that already
 * exists, because the question here is narrower.
 */
export function isMemberLandingPath(pathname: string | null | undefined): boolean {
  if (typeof pathname !== "string") return false;
  if (pathname === POST_SIGN_IN_ROUTE) return true;
  return (
    pathname.startsWith(`${CLIENT_REFINE_PREVIEW_FIRSTREAD_BASE}/`) ||
    pathname.startsWith(`${CLIENT_REFINE_PREVIEW_DIAGNOSE_BASE}/`)
  );
}
