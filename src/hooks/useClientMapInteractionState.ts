import { useEffect, useMemo, useState } from "react";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/safeLocalStorage";
import type {
  ClientActionStatus,
  ClientActionSummary,
  ClientConfidenceLevel,
} from "@/lib/clientViewModel";

export type ClientMapSystemStatus = "signal" | "committed" | "in_progress" | "validated";
export type ClientSystemPhase = "outside" | "diagnosis" | "focus" | "execution";
export const CLIENT_PHASE_CHANGE_EVENT = "mojo:client-phase-change";

type ActionInteractionState = {
  owner: string | null;
  status: ClientActionStatus;
};

export type ConstraintBeliefResponse = "yes" | "not_quite" | "no";

type BeliefEntry = {
  userLabel: string;
  response: ConstraintBeliefResponse;
};

type StoredInteractionState = {
  status: ClientMapSystemStatus;
  phase: ClientSystemPhase;
  committedAt: string | null;
  primaryOwner: string | null;
  users: string[];
  actions: Record<string, ActionInteractionState>;
  constraintBeliefs: Record<string, BeliefEntry>;
  constraintConfidenceOverride: ClientConfidenceLevel | null;
  actionConfidenceOverrides: Record<string, ClientConfidenceLevel>;
};

type UseClientMapInteractionStateArgs = {
  companyId?: string;
  actions: ClientActionSummary[];
};

const DEFAULT_OWNER_OPTIONS = ["Owner 1", "Owner 2", "Owner 3"];

function isValidActionSummary(value: unknown): value is ClientActionSummary {
  if (!value || typeof value !== "object") return false;
  const record = value as { id?: unknown };
  return typeof record.id === "string" && record.id.trim().length > 0;
}

function sanitizeActions(actions: ClientActionSummary[]): ClientActionSummary[] {
  if (!Array.isArray(actions)) return [];
  return actions.filter(isValidActionSummary);
}

function actionContributors(action: ClientActionSummary): string[] {
  return Array.isArray(action.contributors) ? action.contributors : [];
}

export function getClientInteractionStorageKey(companyId?: string | null) {
  return `mojo.client.interaction.${companyId || "no-company"}`;
}

function normalizeActionStatus(value: string | null | undefined): ClientActionStatus {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "done") return "done";
  if (raw === "in_progress") return "in_progress";
  if (raw === "parked") return "parked";
  return "planned";
}

function normalizeUsers(users: string[]) {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const user of users) {
    const clean = String(user || "").trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(clean);
  }
  return list;
}

function createBaseState(actions: ClientActionSummary[]): StoredInteractionState {
  const safeActions = sanitizeActions(actions);
  const users = normalizeUsers([
    ...DEFAULT_OWNER_OPTIONS,
    ...safeActions.flatMap((action) => [
      action.primaryOwner || "",
      action.decider || "",
      ...actionContributors(action),
    ]),
  ]);

  const actionState: Record<string, ActionInteractionState> = {};
  for (const action of safeActions) {
    actionState[action.id] = {
      owner: action.primaryOwner || null,
      status: normalizeActionStatus(action.status),
    };
  }

  return {
    status: "signal",
    phase: "outside",
    committedAt: null,
    primaryOwner: null,
    users,
    actions: actionState,
    constraintBeliefs: {},
    constraintConfidenceOverride: null,
    actionConfidenceOverrides: {},
  };
}

function normalizePhase(value: unknown): ClientSystemPhase {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "outside" || raw === "diagnosis" || raw === "focus" || raw === "execution") return raw;
  return "outside";
}

function normalizeMapStatus(value: unknown): ClientMapSystemStatus {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "committed" || raw === "in_progress" || raw === "validated") return raw;
  return "signal";
}

export function readStoredClientPhase(companyId?: string | null): ClientSystemPhase {
  const raw = safeLocalStorageGet(getClientInteractionStorageKey(companyId));
  if (!raw) return "outside";

  try {
    const parsed = JSON.parse(raw) as { phase?: unknown };
    return normalizePhase(parsed.phase);
  } catch {
    return "outside";
  }
}

function phaseFromStatus(status: ClientMapSystemStatus): ClientSystemPhase {
  if (status === "signal") return "outside";
  if (status === "committed") return "focus";
  if (status === "in_progress" || status === "validated") return "execution";
  return "outside";
}

function statusForPhase(phase: ClientSystemPhase, currentStatus: ClientMapSystemStatus): ClientMapSystemStatus {
  if (phase === "outside" || phase === "diagnosis") return "signal";
  if (phase === "focus") return currentStatus === "validated" ? "validated" : "committed";
  return currentStatus === "validated" ? "validated" : "in_progress";
}

export function writeStoredClientPhase(companyId: string | null | undefined, phase: ClientSystemPhase) {
  const key = getClientInteractionStorageKey(companyId);
  const raw = safeLocalStorageGet(key);
  let next: Record<string, unknown> = {};

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) next = parsed;
    } catch {
      next = {};
    }
  }

  const currentStatus = normalizeMapStatus(next.status);
  next.phase = normalizePhase(phase);
  next.status = statusForPhase(normalizePhase(phase), currentStatus);
  safeLocalStorageSet(key, JSON.stringify(next));
}

export function dispatchClientPhaseChange(companyId: string | null | undefined, phase: ClientSystemPhase) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent(CLIENT_PHASE_CHANGE_EVENT, {
      detail: {
        companyId: companyId || "no-company",
        phase,
      },
    }),
  );
}

const PHASE_PRIORITY: Record<ClientSystemPhase, number> = {
  outside: 0,
  diagnosis: 1,
  focus: 2,
  execution: 3,
};

function readStoredState(key: string, actions: ClientActionSummary[]) {
  if (typeof window === "undefined") return createBaseState(actions);
  const base = createBaseState(actions);
  const raw = safeLocalStorageGet(key);
  if (!raw) return base;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredInteractionState>;
    const users = normalizeUsers([
      ...base.users,
      ...((Array.isArray(parsed.users) ? parsed.users : []) as string[]),
    ]);

    const actionState: Record<string, ActionInteractionState> = { ...base.actions };
    const parsedActions = parsed.actions && typeof parsed.actions === "object" ? parsed.actions : {};

    for (const [actionId, value] of Object.entries(parsedActions as Record<string, Partial<ActionInteractionState>>)) {
      if (!actionState[actionId]) continue;
      actionState[actionId] = {
        owner: typeof value.owner === "string" && value.owner.trim() ? value.owner.trim() : actionState[actionId].owner,
        status: normalizeActionStatus(value.status as string),
      };
    }

    const status = parsed.status;
    const normalizedStatus: ClientMapSystemStatus =
      status === "committed" || status === "in_progress" || status === "validated" ? status : "signal";
    const normalizedPhase = normalizePhase(parsed.phase);

    return {
      status: normalizedStatus,
      phase: normalizedPhase,
      committedAt: typeof parsed.committedAt === "string" ? parsed.committedAt : null,
      primaryOwner: typeof parsed.primaryOwner === "string" && parsed.primaryOwner.trim() ? parsed.primaryOwner.trim() : null,
      users,
      actions: actionState,
      constraintBeliefs:
        parsed.constraintBeliefs && typeof parsed.constraintBeliefs === "object"
          ? (parsed.constraintBeliefs as Record<string, BeliefEntry>)
          : {},
      constraintConfidenceOverride:
        parsed.constraintConfidenceOverride === "Low" ||
        parsed.constraintConfidenceOverride === "Medium" ||
        parsed.constraintConfidenceOverride === "High"
          ? parsed.constraintConfidenceOverride
          : null,
      actionConfidenceOverrides:
        parsed.actionConfidenceOverrides && typeof parsed.actionConfidenceOverrides === "object"
          ? (parsed.actionConfidenceOverrides as Record<string, ClientConfidenceLevel>)
          : {},
    };
  } catch {
    return base;
  }
}

function statusFromActions(
  currentStatus: ClientMapSystemStatus,
  actions: Record<string, ActionInteractionState>,
): ClientMapSystemStatus {
  const values = Object.values(actions);
  if (values.length === 0) return currentStatus;
  if (values.every((item) => item.status === "done")) return "validated";
  if (values.some((item) => item.status === "in_progress" || item.status === "done")) return "in_progress";
  return currentStatus;
}

export function useClientMapInteractionState({
  companyId,
  actions,
}: UseClientMapInteractionStateArgs) {
  const safeActions = useMemo(() => sanitizeActions(actions), [actions]);
  const key = useMemo(() => getClientInteractionStorageKey(companyId), [companyId]);
  const [state, setState] = useState<StoredInteractionState>(() => readStoredState(key, safeActions));

  useEffect(() => {
    setState((current) => {
      const next = readStoredState(key, safeActions);

      // Preserve latest in-memory status if it is ahead of storage.
      const statusPriority: Record<ClientMapSystemStatus, number> = {
        signal: 0,
        committed: 1,
        in_progress: 2,
        validated: 3,
      };
      const preferredStatus =
        statusPriority[current.status] > statusPriority[next.status] ? current.status : next.status;

      const minimumPhase = phaseFromStatus(preferredStatus);
      const preferredPhase = [normalizePhase(current.phase), normalizePhase(next.phase), minimumPhase].sort(
        (a, b) => PHASE_PRIORITY[b] - PHASE_PRIORITY[a],
      )[0] as ClientSystemPhase;

      const merged: StoredInteractionState = {
        ...next,
        status: preferredStatus,
        phase: preferredPhase,
        committedAt: current.committedAt || next.committedAt,
        primaryOwner: current.primaryOwner || next.primaryOwner,
      };

      return merged;
    });
  }, [safeActions, key]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    safeLocalStorageSet(key, JSON.stringify(state));
  }, [key, state]);

  const mappedActions = useMemo(() => {
    return safeActions.map((action) => {
      const interaction = state.actions[action.id];
      const owner = interaction?.owner ?? action.primaryOwner ?? null;
      const status = interaction?.status ?? normalizeActionStatus(action.status);
      return {
        ...action,
        primaryOwner: owner,
        status,
        isOwned: Boolean(owner && owner.trim()),
      };
    });
  }, [safeActions, state.actions]);

  const addOwnerOption = (name: string) => {
    const clean = String(name || "").trim();
    if (!clean) return;
    setState((current) => ({
      ...current,
      users: normalizeUsers([...current.users, clean]),
    }));
  };

  const assignActionOwner = (actionId: string, owner: string | null) => {
    const clean = String(owner || "").trim();
    setState((current) => {
      const existing = current.actions[actionId] ?? { owner: null, status: "planned" as ClientActionStatus };
      const nextOwner = clean || null;
      const nextUsers = nextOwner ? normalizeUsers([...current.users, nextOwner]) : current.users;
      return {
        ...current,
        users: nextUsers,
        actions: {
          ...current.actions,
          [actionId]: {
            ...existing,
            owner: nextOwner,
          },
        },
      };
    });
  };

  const setActionStatus = (actionId: string, status: ClientActionStatus) => {
    setState((current) => {
      const existing = current.actions[actionId] ?? { owner: null, status: "planned" as ClientActionStatus };
      const nextActions = {
        ...current.actions,
        [actionId]: {
          ...existing,
          status: normalizeActionStatus(status),
        },
      };

      const derivedStatus = statusFromActions(current.status, nextActions);
      const statusPhase = phaseFromStatus(derivedStatus);
      const nextPhase =
        PHASE_PRIORITY[normalizePhase(current.phase)] > PHASE_PRIORITY[statusPhase]
          ? normalizePhase(current.phase)
          : statusPhase;
      return {
        ...current,
        actions: nextActions,
        status: derivedStatus,
        phase: nextPhase,
      };
    });
  };

  const setPhase = (phase: ClientSystemPhase) => {
    const normalized = normalizePhase(phase);
    setState((current) => ({
      ...current,
      phase: normalized,
      status: statusForPhase(normalized, current.status),
    }));
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const companyKey = companyId || "no-company";
    const onPhaseChange = (event: Event) => {
      const custom = event as CustomEvent<{ companyId?: string | null; phase?: unknown }>;
      const targetCompany = String(custom.detail?.companyId || "no-company");
      if (targetCompany !== companyKey) return;
      const normalized = normalizePhase(custom.detail?.phase);
      setState((current) => ({
        ...current,
        phase: normalized,
        status: statusForPhase(normalized, current.status),
      }));
    };

    window.addEventListener(CLIENT_PHASE_CHANGE_EVENT, onPhaseChange as EventListener);
    return () => window.removeEventListener(CLIENT_PHASE_CHANGE_EVENT, onPhaseChange as EventListener);
  }, [companyId]);

  const setConstraintBelief = (
    userId: string,
    userLabel: string,
    response: ConstraintBeliefResponse,
  ) => {
    const id = String(userId || "").trim();
    if (!id) return;
    const label = String(userLabel || "").trim() || "Unknown";
    setState((current) => ({
      ...current,
      constraintBeliefs: {
        ...current.constraintBeliefs,
        [id]: {
          userLabel: label,
          response,
        },
      },
    }));
  };

  const setConstraintConfidenceOverride = (level: ClientConfidenceLevel | null) => {
    setState((current) => ({
      ...current,
      constraintConfidenceOverride: level,
    }));
  };

  const setActionConfidenceOverride = (actionId: string, level: ClientConfidenceLevel | null) => {
    setState((current) => {
      const next = { ...current.actionConfidenceOverrides };
      if (!level) {
        delete next[actionId];
      } else {
        next[actionId] = level;
      }
      return {
        ...current,
        actionConfidenceOverrides: next,
      };
    });
  };

  const commitMap = (primaryOwner?: string | null) => {
    const now = new Date().toISOString();
    const cleanOwner = String(primaryOwner || "").trim();
    setState((current) => ({
      ...current,
      status: "committed",
      phase: "focus",
      committedAt: now,
      primaryOwner: cleanOwner || current.primaryOwner || null,
      users: cleanOwner ? normalizeUsers([...current.users, cleanOwner]) : current.users,
    }));
  };

  return {
    mapStatus: state.status,
    phase: state.phase,
    committedAt: state.committedAt,
    mapPrimaryOwner: state.primaryOwner,
    ownerOptions: state.users,
    constraintBeliefs: state.constraintBeliefs,
    constraintConfidenceOverride: state.constraintConfidenceOverride,
    actionConfidenceOverrides: state.actionConfidenceOverrides,
    actions: mappedActions,
    addOwnerOption,
    assignActionOwner,
    setActionStatus,
    setPhase,
    setConstraintBelief,
    setConstraintConfidenceOverride,
    setActionConfidenceOverride,
    commitMap,
  };
}
