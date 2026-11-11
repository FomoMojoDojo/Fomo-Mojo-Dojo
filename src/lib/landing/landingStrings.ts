// THE MEMBER-FACING COPY (S-U6-1 … S-U6-6, signed 2026-11-11).
//
// WHY A STRINGS FILE. These five lines are the entire product for someone who is NOT an operator and
// reaches a page they do not hold. Until this build that reader got one of three things: an empty
// shell, "Access Denied" over a page they owned, or a stand-in company that was never theirs. A
// refusal a client reads has to say what happened and what to do next, in their register, and a
// string only stays signed while something checks it — hence the parity test beside this file.
//
// TEMPLATES. S-U6-3 and S-U6-6 carry a placeholder, and the two differ in case ON PURPOSE: S-U6-3
// reads mid-sentence after "Go to", S-U6-6 opens a sentence. The formatters below substitute and
// nothing else — no title-casing, no truncation. A company's own name is rendered as the company
// wrote it.
export const LANDING_STRINGS = {
  /** S-U6-1 — a signed-in account with no company_members row at all. */
  noCompany: "This account isn't connected to a MojoMap™ yet. FomoMojoDojo sets up access.",
  /** S-U6-2 — a signed-in account that holds SOME company, but not the one this URL names. */
  cannotOpen: "This account can't open this page.",
  /** S-U6-3 — the way out of S-U6-2: a link to the company they do hold. */
  goToOwn: "Go to {organization}'s MojoMap™",
  /** S-U6-5 — on both refusal pages. The only control either one offers. */
  signOut: "Sign out",
  /** S-U6-6 — their own company, with nothing opened yet: no First Read, no Diagnose. */
  notReady: "{Organization}'s MojoMap™ isn't ready to open yet.",
  /**
   * S-U6-10 — a read FAILED. Distinct from every line above, which describe a true state of the
   * world; this one says we do not know the state. U6-54 is the whole reason it exists: a refused or
   * dropped query used to render as "nothing here", which tells a client something false about their
   * own company with complete confidence.
   */
  readFailed: "Something went wrong loading this page. Reload to try again.",
} as const;

export type LandingStringKey = keyof typeof LANDING_STRINGS;

/** S-U6-3 with the organization's name substituted. */
export function goToOwnLabel(organization: string): string {
  return LANDING_STRINGS.goToOwn.replace("{organization}", organization);
}

/** S-U6-6 with the organization's name substituted. */
export function notReadyLine(organization: string): string {
  return LANDING_STRINGS.notReady.replace("{Organization}", organization);
}
