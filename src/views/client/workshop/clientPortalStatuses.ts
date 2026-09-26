// R-status — the seven Notion single-select values, in Notion's own option order.
//
// Split out of clientPortalLink.ts by B2a, and ONLY the split: the values, the type and the guard are
// byte-identical to what B1 signed. clientPortalLink.ts re-exports all three, so every existing
// importer is unchanged and there is still exactly ONE definition of the seven.
//
// WHY the split: clientPortalLink.ts imports the browser Supabase client, which assigns to `window`
// under DEV. Anything importing it therefore cannot run under Node — and B2a's sync runner and its
// tests need these seven values to compare against the live Notion options. Copying them would give
// the byte-for-byte check two sources of truth to disagree about, which is the one thing that check
// exists to prevent. This module imports nothing.
export const CLIENT_PORTAL_STATUSES = [
  "Cold Intake",
  "Web Intake",
  "Map Created",
  "In Progress",
  "Completed",
  "On Hold",
  "Ongoing",
] as const;

export type ClientStatus = (typeof CLIENT_PORTAL_STATUSES)[number];

export function isClientStatus(value: unknown): value is ClientStatus {
  return typeof value === "string" && (CLIENT_PORTAL_STATUSES as readonly string[]).includes(value);
}
