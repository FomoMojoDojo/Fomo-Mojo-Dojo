import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Insight-anchored Next Turn (2b, render-side). The home Next Turn becomes the
// three-beat — Observe (the fact) → Name-the-tension (the condition) → Open (the
// evidence move) — instead of the generic score-derived action.
//
// Two sources, in priority order:
//   1. Finding-anchored — the company's PRIMARY finding (find_primary_finding, the
//      existing resolver), reading its stored beats (2a). The finding leads (fork D).
//   2. Absence template — when no findings exist, a profile-aware three-beat built
//      from the signal-band counts (fork G). The Open converges on the same place the
//      finding-anchored Open lands: the first customer conversations.
//
// ACTION-ONLY: this drives the Next Turn block only. PTS is suppressed at render; the
// audience headline, SIGNAL, CONTEXT, ROUTES and the progress bar are untouched.

export type InsightNextTurn = {
  observe: string;
  name_tension: string;
  open: string;
  kind: "observation" | "watch_out" | "absence";
};

export type SignalBandCounts = {
  outside: number;
  organization: number;
  customer: number;
};

// findings / find_primary_finding are not in the generated Database types.
const db = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown }>;
};

function readBeats(v: unknown): { observe: string; name_tension: string; open: string } | null {
  if (!v || typeof v !== "object") return null;
  const b = v as { observe?: unknown; name_tension?: unknown; open?: unknown };
  const ok = (x: unknown): x is string => typeof x === "string" && x.trim().length > 0;
  if (ok(b.observe) && ok(b.name_tension) && ok(b.open)) {
    return { observe: b.observe, name_tension: b.name_tension, open: b.open };
  }
  return null;
}

// Profile-aware absence three-beat. Pure (render-side template). Distinguishes
// internal-rich-but-externally-thin (e.g. Edgewood) from thin-everywhere (e.g. FMD).
// The Open is convergent — when there is no customer signal it points at the first
// customer conversations, the same landing the finding-anchored Open uses.
export function buildAbsenceBeats(counts: SignalBandCounts): InsightNextTurn {
  const { outside, organization } = counts;
  // Rich (a detailed internal picture, e.g. CB) vs thin (little to go on, e.g. FMD).
  // The PUBLIC/TEAM/CUSTOMERS bar already shows the numbers, so the copy carries none —
  // and speaks in-voice (no "team signals / outside reads / customer signal").
  const internalRich = organization >= 10 && organization > outside * 2;

  const observe = internalRich
    ? "Your team has built a detailed internal picture — but almost none of it has been tested against the outside world or a real customer yet."
    : "There's only a little to go on so far — and nothing yet from a real customer.";

  const name_tension =
    "What would have to be true for the story you tell internally to hold up once a real customer and the outside world weigh in?";

  // Convergent Open — "first few customer conversations" is the orange forward phrase.
  const open =
    "What would your first few customer conversations reveal — and what's the fastest way to get that first piece of real evidence?";

  return { observe, name_tension, open, kind: "absence" };
}

export function useInsightNextTurn(
  companyId: string | undefined,
  counts: SignalBandCounts | null,
): InsightNextTurn | null {
  const { data: primary, isLoading } = useQuery({
    queryKey: ["insight-next-turn-primary", companyId],
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: async (): Promise<InsightNextTurn | null> => {
      if (!companyId) return null;
      const res = await db.rpc("find_primary_finding", { p_company_id: companyId });
      const data = (res as { data?: unknown }).data;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      const beats = readBeats((row as { beats?: unknown }).beats);
      if (!beats) return null;
      const kind = (row as { kind?: unknown }).kind;
      return { ...beats, kind: kind === "watch_out" ? "watch_out" : "observation" };
    },
  });

  // Finding-anchored leads (fork D). Wait for the resolver before falling back, so a
  // company that HAS a finding never flashes the absence template first.
  if (isLoading) return null;
  if (primary) return primary;
  // Absence template (fork G) — needs the band counts loaded.
  if (counts) return buildAbsenceBeats(counts);
  return null;
}
