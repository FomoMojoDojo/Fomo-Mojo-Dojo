// THE MEMBER GATE AND THE THREE THINGS IT CAN SAY (U6 part 1, signed 2026-11-11).
//
// IT IS KEYED ON THE URL'S COMPANY, not on the active company. A page that takes its company from
// the URL can be navigated to directly, so the only question worth asking is "may THIS account open
// THIS id" — and the answer comes from the companies the server returned for this caller, never
// from a stored id (U6-62).
//
// IT RENDERS A REFUSAL AND NEVER PASSES THROUGH. RLS would already give a member nothing on a
// company they do not hold, so the lazy version of this gate is to let the page mount and come up
// empty. That is precisely the failure this build exists to end: an empty page says "there is
// nothing here" when the truth is "this is not yours". The gate answers in words.
//
// WHY AN ADMIN SKIPS IT. An admin holds no company_members rows at all — membership is not how an
// operator reaches a client's page — so a membership test applied to an admin would refuse every
// page in the product.
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { LANDING_STRINGS, goToOwnLabel, notReadyLine } from "@/lib/landing/landingStrings";
import { POST_SIGN_IN_ROUTE } from "@/lib/landing/landingResolver";

// The /login palette. These pages are read by someone who may never have seen the operator side,
// and they are the first thing a mis-sent link shows them.
const c = {
  bg: "#faf7f6",
  panel: "#FFFFFF",
  line: "#DDE6D1",
  charcoal: "#233C4B",
  secondary: "#46606D",
  warm: "#B67A45",
};

/** One panel, one sentence, at most one way onward, and Sign out (S-U6-5). */
export function MemberNoticePanel({
  line,
  onward,
  testId,
}: {
  line: string;
  onward?: { to: string; label: string };
  testId: string;
}) {
  const { signOut } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: c.bg }}>
      <div className="w-full max-w-[430px]" data-testid={testId}>
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-[12px] border shadow-sm"
            style={{ background: c.panel, borderColor: c.line }}
          >
            <span className="font-serif text-[22px] font-bold leading-none" style={{ color: c.charcoal }}>M</span>
          </div>
        </div>
        <div className="rounded-[24px] border p-6 shadow-sm text-center" style={{ background: c.panel, borderColor: c.line }}>
          <p className="font-sans text-[15px] leading-[1.7]" style={{ color: c.charcoal }}>{line}</p>
          {onward ? (
            <p className="mt-4">
              <Link
                to={onward.to}
                className="font-mono text-[12px] hover:underline"
                style={{ color: c.warm }}
                data-testid="member-notice-onward"
              >
                {onward.label}
              </Link>
            </p>
          ) : null}
          <p className="mt-5">
            <button
              type="button"
              onClick={() => { void signOut(); }}
              className="font-mono text-[11px] hover:underline"
              style={{ color: c.secondary }}
              data-testid="member-notice-signout"
            >
              {LANDING_STRINGS.signOut}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

/** S-U6-1 — signed in, assigned to nothing. No onward link: there is nowhere to go. */
export function NoCompanyNotice() {
  return <MemberNoticePanel testId="notice-no-company" line={LANDING_STRINGS.noCompany} />;
}

/**
 * S-U6-2 — signed in, holds something, but not this. The onward link (S-U6-3) points at /start
 * rather than at a computed path, so the one resolver decides where "their MojoMap" is; this page
 * only has to name the organization.
 */
export function CannotOpenNotice({ organization }: { organization: string | null }) {
  return (
    <MemberNoticePanel
      testId="notice-cannot-open"
      line={LANDING_STRINGS.cannotOpen}
      onward={organization ? { to: POST_SIGN_IN_ROUTE, label: goToOwnLabel(organization) } : undefined}
    />
  );
}

/** S-U6-6 — their own company, nothing opened in it yet. */
export function NotReadyNotice({ organization }: { organization: string }) {
  return <MemberNoticePanel testId="notice-not-ready" line={notReadyLine(organization)} />;
}

/**
 * Wraps a route whose company comes from the URL. Admin → through. A member who holds the id →
 * through. Anyone else → a refusal in words.
 */
export default function MemberCompanyGate({ children }: { children: JSX.Element }) {
  const { companyId } = useParams<{ companyId: string }>();
  const { isAdmin, loading: authLoading } = useAuth();
  const { companies, loading: companiesLoading, fetchError } = useCompany();

  const held = useMemo(() => new Set(companies.map((company) => company.id)), [companies]);

  // The answer is not knowable yet; rendering a refusal on a race would be a lie that looks exactly
  // like the real thing.
  if (authLoading || companiesLoading) return null;

  if (isAdmin) return children;

  // U6-54: a failed read is not a refusal. Saying "you can't open this page" because a query
  // dropped would blame the account for a network fault.
  if (fetchError) {
    return (
      <MemberNoticePanel testId="notice-read-failed" line={LANDING_STRINGS.readFailed} />
    );
  }

  if (companies.length === 0) return <NoCompanyNotice />;
  if (!companyId || !held.has(companyId)) {
    return <CannotOpenNotice organization={companies[0]?.name ?? null} />;
  }
  return children;
}
