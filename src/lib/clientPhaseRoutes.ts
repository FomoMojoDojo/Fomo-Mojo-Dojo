import type { ClientSystemPhase } from "@/hooks/useClientMapInteractionState";

export const CLIENT_PHASE_NAV_ITEMS: Array<{
  phase: ClientSystemPhase;
  label: string;
  shortLabel: string;
}> = [
  { phase: "outside", label: "Outside", shortLabel: "01" },
  { phase: "diagnosis", label: "Diagnose", shortLabel: "02" },
  { phase: "focus", label: "Focus", shortLabel: "03" },
  { phase: "execution", label: "Flow", shortLabel: "04" },
];

const CLIENT_PHASE_ALIASES: Record<ClientSystemPhase, string[]> = {
  outside: ["/", "/foundation"],
  diagnosis: ["/diagnosis"],
  focus: ["/decision"],
  execution: ["/execution", "/learning"],
};

export function clientPhaseFromPath(pathname: string): ClientSystemPhase | null {
  const normalized = pathname.trim() || "/";

  for (const [phase, aliases] of Object.entries(CLIENT_PHASE_ALIASES) as Array<
    [ClientSystemPhase, string[]]
  >) {
    if (aliases.includes(normalized)) return phase;
  }

  return null;
}

export function isClientPhasePath(pathname: string) {
  return clientPhaseFromPath(pathname) !== null;
}
