/**
 * Engagement day — the single source for the "DAY N" stamp across the workspace.
 *
 * Derived from companies.engagement_started_at (the column the company view
 * describes as "Sets the DAY counter throughout the workspace"). Returns null when
 * no start date is set, so callers render "—" instead of inventing a day. The
 * formula lived inline in three places; DEF-2 gave it one home after two of the
 * copies were found hardcoded to a literal.
 */
export function engagementDayFrom(startAt: string | null | undefined): number | null {
  if (!startAt) return null;
  const ms = Date.now() - new Date(startAt).getTime();
  return Math.max(1, Math.floor(ms / 86_400_000));
}
