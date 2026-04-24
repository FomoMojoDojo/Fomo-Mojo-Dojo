import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageShell from "@/components/layout/PageShell";
import { useCompany } from "@/hooks/useCompany";
import { useClientViewData } from "@/hooks/useClientViewData";
import "@/styles/client-refine-preview.css";

type LayerState = "command" | "map" | "narrative" | "drawer";
type CommitState = "idle" | "committing" | "committed" | "next-revealed" | "branching" | "waiting";
type DrawerKey = "why" | "blocking" | "signals" | "progress";

type AccessModes = {
  pills: boolean;
  inline: boolean;
  edge: boolean;
  footer: boolean;
};

type DrawerRow = {
  key: string;
  value: string;
};

type DrawerSection = {
  title: string;
  headline: string;
  big?: string;
  rows: DrawerRow[];
};

const MODE_STORAGE_KEY = "phase5-modes";

const DEFAULT_ACCESS_MODES: AccessModes = {
  pills: true,
  inline: true,
  edge: false,
  footer: false,
};

const EDGE_DRAWERS: Array<{ key: DrawerKey; label: string }> = [
  { key: "why", label: "Why" },
  { key: "blocking", label: "Blocking" },
  { key: "signals", label: "Signals" },
  { key: "progress", label: "Progress" },
];

const BRANCH_OPTIONS = [
  {
    id: "branch-research",
    title: "Desk Research Sprint",
    description: "Quick evidence pass before interviews.",
    lift: 9,
    duration: "1wk",
  },
  {
    id: "branch-pilot",
    title: "Pilot with Two Accounts",
    description: "Run a live pilot and collect verbatims.",
    lift: 17,
    duration: "4wk",
  },
  {
    id: "branch-reframe",
    title: "Reframe Target Segment",
    description: "Tighten who this decision is really for.",
    lift: 4,
    duration: "3d",
  },
] as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toSentence(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseAccessModes(raw: string | null): AccessModes {
  if (!raw) return DEFAULT_ACCESS_MODES;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      pills: Boolean(parsed["mode-pills"]),
      inline: Boolean(parsed["mode-inline"]),
      edge: Boolean(parsed["mode-edge"]),
      footer: Boolean(parsed["mode-footer"]),
    };
  } catch {
    return DEFAULT_ACCESS_MODES;
  }
}

function confidenceBase(level: "Low" | "Medium" | "High") {
  if (level === "High") return 68;
  if (level === "Medium") return 52;
  return 38;
}

function statusLabel(value: string) {
  if (value === "in_progress") return "In progress";
  if (value === "planned") return "Planned";
  if (value === "parked") return "Parked";
  if (value === "done") return "Done";
  return "Planned";
}

function stageLabel(value: string) {
  if (value === "outside") return "Learn";
  if (value === "diagnosis") return "Focus";
  if (value === "focus") return "Plan";
  if (value === "execution") return "Execute";
  return "Focus";
}

function stateLabel(layer: LayerState) {
  if (layer === "map") return "Map";
  if (layer === "narrative") return "Narrative";
  if (layer === "drawer") return "Context drawer";
  return "Command";
}

export default function ClientRefinePreviewView() {
  const { companies, setActiveCompanyId, loading: companiesLoading } = useCompany();
  const {
    activeCompany,
    hasCompany,
    topActions,
    allActions,
    primaryConstraint,
    nextMove,
    confidence,
    evidence,
    inputCoverage,
    signalStrength,
    phase,
    primaryDesiredOutcome,
  } = useClientViewData({ actionLimit: 5 });

  const [layer, setLayer] = useState<LayerState>("command");
  const [commitState, setCommitState] = useState<CommitState>("idle");
  const [mapPeek, setMapPeek] = useState(false);
  const [drawerKey, setDrawerKey] = useState<DrawerKey | null>(null);
  const [systemLine, setSystemLine] = useState("");
  const [systemLineOn, setSystemLineOn] = useState(false);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [specOpen, setSpecOpen] = useState(false);
  const [accessModes, setAccessModes] = useState<AccessModes>(DEFAULT_ACCESS_MODES);
  const [confidenceFrom, setConfidenceFrom] = useState(42);
  const [confidenceTo, setConfidenceTo] = useState(42);
  const [evidenceChecks, setEvidenceChecks] = useState<boolean[]>([false, false, false]);

  const timersRef = useRef<number[]>([]);
  const typingRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const actionHeadline = useMemo(() => {
    const detail = toSentence(nextMove?.detail);
    if (detail) return detail;
    return "Validate the top two customer needs through 8 to 10 customer interviews in two weeks.";
  }, [nextMove?.detail]);

  const impactValue = useMemo(() => {
    const lift = Math.round((signalStrength.proof.value + signalStrength.execution.value) / 12);
    return `CONF +${Math.max(6, lift)}`;
  }, [signalStrength.execution.value, signalStrength.proof.value]);

  const effortValue = useMemo(() => {
    const detail = toSentence(nextMove?.detail).toLowerCase();
    if (detail.includes("week")) {
      const match = detail.match(/\b\d+\s*(?:-|to)?\s*\d*\s*weeks?\b/);
      if (match) return match[0].replace(/\s+/g, " ");
      return "2 weeks";
    }
    return "2 weeks";
  }, [nextMove?.detail]);

  const baseConfidence = useMemo(() => confidenceBase(confidence.level), [confidence.level]);

  const confidenceTarget = useMemo(() => {
    const projected = Number(activeCompany?.projected_score ?? activeCompany?.potential_score ?? 0);
    const candidate = Number.isFinite(projected) && projected > 0 ? projected : baseConfidence + 22;
    return clamp(Math.round(candidate), baseConfidence + 8, 95);
  }, [activeCompany?.potential_score, activeCompany?.projected_score, baseConfidence]);

  const confidenceLift = useMemo(
    () => clamp(confidenceTarget - baseConfidence, 8, 30),
    [baseConfidence, confidenceTarget],
  );

  const certaintyValue = useMemo(() => {
    const mojo = Number(activeCompany?.mojo_score ?? 0);
    if (mojo > 0) return `Mojo ${Math.round(mojo)}`;
    return `Mojo ${baseConfidence}`;
  }, [activeCompany?.mojo_score, baseConfidence]);

  const stageIndex = useMemo(() => {
    if (phase === "outside") return 0;
    if (phase === "diagnosis") return 1;
    if (phase === "focus") return 2;
    return 3;
  }, [phase]);

  const stageStrip = useMemo(
    () => ["Learn", "Focus", "Plan", "Execute"],
    [],
  );

  const strongestAction = topActions[0] ?? null;
  const secondAction = topActions[1] ?? null;

  const strongestSignal = useMemo(() => {
    const rows = [signalStrength.proof, signalStrength.ownership, signalStrength.execution];
    return rows.sort((a, b) => b.value - a.value)[0];
  }, [signalStrength.execution, signalStrength.ownership, signalStrength.proof]);

  const evidencePresentLabels = useMemo(
    () => evidence.sources.filter((source) => source.present).map((source) => source.label),
    [evidence.sources],
  );

  const drawerSections = useMemo<Record<DrawerKey, DrawerSection>>(
    () => ({
      why: {
        title: "WHY THIS MOVE",
        headline: "It is the one move all follow-on moves depend on.",
        big:
          toSentence(strongestAction?.whyItMatters) ||
          "Every path forward depends on validating this decision before execution scales.",
        rows: [
          { key: "Paths this unblocks", value: `${Math.max(1, Math.min(3, allActions.length))} of 3` },
          { key: "Confidence lift", value: `+${confidenceLift}` },
          {
            key: "Owner",
            value: toSentence(strongestAction?.primaryOwner) || "Unassigned",
          },
        ],
      },
      blocking: {
        title: "WHAT IS BLOCKING",
        headline: toSentence(primaryConstraint?.title) || "Core blocker is still unresolved.",
        big: toSentence(primaryConstraint?.detail) || "No validated blocker statement has been captured yet.",
        rows: [
          {
            key: "Open assumptions",
            value: String(Math.max(1, strongestAction?.assumptions.length ?? 0)),
          },
          {
            key: "Critical actions without owner",
            value: String(allActions.filter((item) => !item.isOwned).length),
          },
          {
            key: "Execution risk",
            value: confidence.level === "High" ? "LOW" : confidence.level === "Medium" ? "MEDIUM" : "HIGH",
          },
        ],
      },
      signals: {
        title: "SIGNALS",
        headline: "Three signal streams, one operating verdict.",
        big:
          evidencePresentLabels.length > 0
            ? `Active evidence: ${evidencePresentLabels.join(", ")}.`
            : "No evidence streams are currently present.",
        rows: [
          { key: "Proof", value: `${Math.round(signalStrength.proof.value)} · ${signalStrength.proof.level.toUpperCase()}` },
          {
            key: "Ownership",
            value: `${Math.round(signalStrength.ownership.value)} · ${signalStrength.ownership.level.toUpperCase()}`,
          },
          {
            key: "Execution",
            value: `${Math.round(signalStrength.execution.value)} · ${signalStrength.execution.level.toUpperCase()}`,
          },
        ],
      },
      progress: {
        title: "PROGRESS",
        headline: `${baseConfidence} now → ${confidenceTarget} target`,
        big:
          toSentence(primaryDesiredOutcome?.statement) ||
          "Desired outcome is not fully defined yet. Capture it before moving stages.",
        rows: [
          { key: "Now", value: String(baseConfidence) },
          { key: "After this move", value: String(baseConfidence + confidenceLift) },
          { key: "Target", value: String(confidenceTarget) },
        ],
      },
    }),
    [
      allActions,
      baseConfidence,
      confidence.level,
      confidenceLift,
      confidenceTarget,
      evidencePresentLabels,
      primaryConstraint?.detail,
      primaryConstraint?.title,
      primaryDesiredOutcome?.statement,
      signalStrength.execution.level,
      signalStrength.execution.value,
      signalStrength.ownership.level,
      signalStrength.ownership.value,
      signalStrength.proof.level,
      signalStrength.proof.value,
      strongestAction?.assumptions.length,
      strongestAction?.isOwned,
      strongestAction?.primaryOwner,
      strongestAction?.whyItMatters,
    ],
  );

  const narrativeRows = useMemo(
    () => [
      {
        step: "01",
        label: "Context",
        body: `${toSentence(activeCompany?.name) || "This company"} is currently operating in ${stageLabel(phase)} with ${Math.round(
          inputCoverage.overallCoverage,
        )}% usable input coverage.`,
      },
      {
        step: "02",
        label: "Blocking",
        body: toSentence(primaryConstraint?.detail) || "No clear blocker statement has been captured yet.",
      },
      {
        step: "03",
        label: "Decision",
        body: actionHeadline,
      },
      {
        step: "04",
        label: "Execution",
        body:
          toSentence(strongestAction?.ifSolved?.[0]) ||
          "Owner assignment and evidence capture need to happen in the same sprint.",
      },
      {
        step: "05",
        label: "Outcome",
        body:
          toSentence(primaryDesiredOutcome?.statement) ||
          toSentence(nextMove?.title) ||
          "Define outcome criteria so the next commitment can be measured.",
      },
    ],
    [
      actionHeadline,
      activeCompany?.name,
      inputCoverage.overallCoverage,
      nextMove?.title,
      phase,
      primaryConstraint?.detail,
      primaryDesiredOutcome?.statement,
      strongestAction?.ifSolved,
    ],
  );

  const clearAsync = useCallback(() => {
    if (typingRef.current !== null) {
      window.clearInterval(typingRef.current);
      typingRef.current = null;
    }

    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  const typeSystemLine = useCallback(
    (text: string, onDone?: () => void) => {
      if (typingRef.current !== null) {
        window.clearInterval(typingRef.current);
        typingRef.current = null;
      }

      setSystemLineOn(true);
      setSystemLine("");
      let index = 0;

      typingRef.current = window.setInterval(() => {
        index += 1;
        setSystemLine(text.slice(0, index));
        if (index >= text.length) {
          if (typingRef.current !== null) {
            window.clearInterval(typingRef.current);
            typingRef.current = null;
          }

          if (onDone) {
            later(onDone, 300);
          }
        }
      }, 22);
    },
    [later],
  );

  const animateConfidenceTo = useCallback((from: number, to: number, ms: number, onDone?: () => void) => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const start = performance.now();

    const tick = (now: number) => {
      const progress = clamp((now - start) / ms, 0, 1);
      const eased = 1 - (1 - progress) ** 3;
      setConfidenceTo(Math.round(from + (to - from) * eased));

      if (progress < 1) {
        rafRef.current = window.requestAnimationFrame(tick);
        return;
      }

      rafRef.current = null;
      if (onDone) onDone();
    };

    rafRef.current = window.requestAnimationFrame(tick);
  }, []);

  const resetCommit = useCallback(() => {
    clearAsync();
    setCommitState("idle");
    setSystemLine("");
    setSystemLineOn(false);
    setConfidenceFrom(baseConfidence);
    setConfidenceTo(baseConfidence);
    setEvidenceChecks([false, false, false]);
  }, [baseConfidence, clearAsync]);

  const commitAgree = useCallback(
    (targetOverride?: number, messageOverride?: string) => {
      clearAsync();
      setCommitState("committing");
      setLayer("command");
      setDrawerKey(null);
      setMapPeek(false);
      setEvidenceChecks([false, false, false]);
      setConfidenceFrom(baseConfidence);
      setConfidenceTo(baseConfidence);

      const target = clamp(targetOverride ?? baseConfidence + confidenceLift, baseConfidence + 1, 98);

      typeSystemLine("LOGGING COMMIT · RECOMPUTING", () => {
        animateConfidenceTo(baseConfidence, target, 900, () => {
          setCommitState("committed");
          const message = messageOverride || `CONFIDENCE ${baseConfidence} → ${target} · STAGE ${stageLabel(phase).toUpperCase()} ADVANCING`;
          typeSystemLine(message, () => {
            later(() => {
              setCommitState("next-revealed");
              setSystemLineOn(false);
            }, 700);
          });
        });
      });
    },
    [
      animateConfidenceTo,
      baseConfidence,
      clearAsync,
      confidenceLift,
      later,
      phase,
      typeSystemLine,
    ],
  );

  const commitDisagree = useCallback(() => {
    clearAsync();
    setCommitState("branching");
    setLayer("command");
    setDrawerKey(null);
    setMapPeek(false);
    setEvidenceChecks([false, false, false]);
    setConfidenceFrom(baseConfidence);
    setConfidenceTo(baseConfidence);
    typeSystemLine("PATH BRANCHED · AWAITING ALTERNATIVE");
  }, [baseConfidence, clearAsync, typeSystemLine]);

  const commitNeedEvidence = useCallback(() => {
    clearAsync();
    setCommitState("waiting");
    setLayer("command");
    setDrawerKey(null);
    setMapPeek(false);
    setConfidenceFrom(baseConfidence);
    setConfidenceTo(baseConfidence);
    setEvidenceChecks([false, false, false]);
    typeSystemLine("DECISION PAUSED · 3 CONDITIONS REQUESTED");
  }, [baseConfidence, clearAsync, typeSystemLine]);

  const resolveEvidence = useCallback(() => {
    if (commitState !== "waiting") return;

    [0, 1, 2].forEach((index) => {
      later(() => {
        setEvidenceChecks((current) => {
          const next = [...current];
          next[index] = true;
          return next;
        });

        if (index === 2) {
          later(() => {
            commitAgree(undefined, "EVIDENCE SATISFIED · COMMITTING NEXT MOVE");
          }, 500);
        }
      }, 500 + index * 600);
    });
  }, [commitAgree, commitState, later]);

  const selectBranch = useCallback(
    (lift: number) => {
      commitAgree(baseConfidence + lift, `ALT PATH COMMITTED · +${lift} CONF`);
    },
    [baseConfidence, commitAgree],
  );

  const openDrawer = useCallback((key: DrawerKey) => {
    setDrawerKey(key);
    setLayer("drawer");
  }, []);

  const closeDrawer = useCallback(() => {
    if (layer !== "drawer") return;
    setLayer("command");
    setDrawerKey(null);
  }, [layer]);

  const onHotPhraseActivate = useCallback(
    (hint: DrawerKey) => {
      if (accessModes.inline) {
        openDrawer(hint);
        return;
      }
      setLayer("map");
    },
    [accessModes.inline, openDrawer],
  );

  const onMapHoverEnter = useCallback(() => {
    if (layer === "command") setMapPeek(true);
  }, [layer]);

  const onMapHoverLeave = useCallback(() => {
    setMapPeek(false);
  }, []);

  useEffect(() => {
    try {
      const loaded = parseAccessModes(window.localStorage.getItem(MODE_STORAGE_KEY));
      setAccessModes(loaded);
    } catch {
      setAccessModes(DEFAULT_ACCESS_MODES);
    }
  }, []);

  useEffect(() => {
    const stored = {
      "mode-pills": accessModes.pills,
      "mode-inline": accessModes.inline,
      "mode-edge": accessModes.edge,
      "mode-footer": accessModes.footer,
    };

    window.localStorage.setItem(MODE_STORAGE_KEY, JSON.stringify(stored));
  }, [accessModes]);

  useEffect(() => {
    if (commitState === "idle") {
      setConfidenceFrom(baseConfidence);
      setConfidenceTo(baseConfidence);
    }
  }, [baseConfidence, commitState]);

  useEffect(() => {
    setLayer("command");
    setDrawerKey(null);
    setMapPeek(false);
    resetCommit();
  }, [activeCompany?.id, resetCommit]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const lower = event.key.toLowerCase();

      if (event.key === "Escape") {
        if (layer === "drawer") {
          closeDrawer();
          return;
        }
        setLayer("command");
        setMapPeek(false);
        resetCommit();
        return;
      }

      if (lower === "m") {
        setLayer("map");
        setDrawerKey(null);
        setMapPeek(false);
        return;
      }

      if (lower === "n") {
        setLayer("narrative");
        setDrawerKey(null);
        setMapPeek(false);
        return;
      }

      if (event.key === "1") openDrawer("why");
      if (event.key === "2") openDrawer("blocking");
      if (event.key === "3") openDrawer("signals");
      if (event.key === "4") openDrawer("progress");
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeDrawer, layer, openDrawer, resetCommit]);

  useEffect(() => () => clearAsync(), [clearAsync]);

  const currentDrawer = drawerKey ? drawerSections[drawerKey] : null;

  const stageClassName = [
    "crpv-stage",
    layer === "map" ? "state-map" : "",
    layer === "narrative" ? "state-narrative" : "",
    layer === "drawer" ? "state-drawer" : "",
    layer === "command" && mapPeek ? "state-map-peek" : "",
    commitState !== "idle" ? commitState : "",
    accessModes.pills ? "mode-pills" : "",
    accessModes.inline ? "mode-inline" : "",
    accessModes.edge ? "mode-edge" : "",
    accessModes.footer ? "mode-footer" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const showStageStrip = commitState !== "idle";

  return (
    <PageShell bare tone="neutral" mainClassName="max-w-none px-0 pb-0 pt-0">
      <section className="crpv-page">
        {!hasCompany ? (
          <article className="crpv-empty-state">
            <p className="cap">Client Refine Preview · Read-only</p>
            <h1>Select a company to preview the strict refine design.</h1>
            {companiesLoading ? (
              <p className="crpv-muted">Loading companies…</p>
            ) : companies.length > 0 ? (
              <div className="crpv-company-grid">
                {companies.map((company) => (
                  <button
                    key={company.id}
                    type="button"
                    className="crpv-company-button"
                    onClick={() => setActiveCompanyId(company.id)}
                  >
                    <span>{company.name}</span>
                    <small>
                      {company.quarter || "Quarter"} · {company.archetype || "Archetype"}
                    </small>
                  </button>
                ))}
              </div>
            ) : (
              <p className="crpv-muted">No companies available.</p>
            )}
          </article>
        ) : (
          <div className={stageClassName}>
            <header className="crpv-header">
              <div className="left">
                <b>Mojo</b>
                <span className="cap">[{toSentence(activeCompany?.name) || "COMPANY"}] · DAY 52 · {stageLabel(phase).toUpperCase()}</span>
              </div>
              <div className="cap" aria-live="polite">
                {stateLabel(layer)}
              </div>
            </header>

            {showStageStrip ? (
              <div className="crpv-stage-strip" aria-hidden>
                {stageStrip.map((item, index) => (
                  <span
                    key={item}
                    className={`s ${index < stageIndex ? "done" : ""} ${index === stageIndex ? "current" : ""}`.trim()}
                  >
                    {String(index + 1).padStart(2, "0")} · {item}
                  </span>
                ))}
              </div>
            ) : null}

            <section className="crpv-command-layer">
              {!commitState || commitState !== "next-revealed" ? (
                <>
                  <p className="cap">THE NEXT MOVE</p>

                  <p className="crpv-action" role="status">
                    Validate the <span className="hot" onClick={() => onHotPhraseActivate("signals")}>top two customer needs</span> through <span className="hot" onClick={() => onHotPhraseActivate("why")}>8 to 10 customer interviews</span> in <span className="hot" onClick={() => onHotPhraseActivate("progress")}>two weeks</span>.
                  </p>

                  <div className="crpv-meta-row">
                    <button
                      type="button"
                      className="meta"
                      onClick={() => (accessModes.inline ? openDrawer("progress") : undefined)}
                    >
                      <span className="cap">Impact</span>
                      <span className="v">{impactValue}</span>
                    </button>
                    <button
                      type="button"
                      className="meta"
                      onClick={() => (accessModes.inline ? openDrawer("blocking") : undefined)}
                    >
                      <span className="cap">Effort</span>
                      <span className="v">{effortValue}</span>
                    </button>
                    <button
                      type="button"
                      className="meta"
                      onClick={() => (accessModes.inline ? openDrawer("signals") : undefined)}
                    >
                      <span className="cap">Certainty</span>
                      <span className="v">{certaintyValue}</span>
                    </button>
                  </div>

                  {accessModes.pills ? (
                    <div className="crpv-pill-row">
                      <button type="button" className="pill" onClick={() => openDrawer("why")}>
                        <span className="dot" /> Why this <span className="count">3</span>
                      </button>
                      <button type="button" className="pill" onClick={() => openDrawer("blocking")}>
                        <span className="dot" /> What is blocking <span className="count">2</span>
                      </button>
                      <button type="button" className="pill" onClick={() => openDrawer("signals")}>
                        <span className="dot" /> Signals <span className="count">5</span>
                      </button>
                      <button type="button" className="pill" onClick={() => openDrawer("progress")}>
                        <span className="dot" /> Progress <span className="count">{baseConfidence}/{confidenceTarget}</span>
                      </button>
                    </div>
                  ) : null}

                  <div className="crpv-primary-cta-row">
                    <button type="button" className="btn primary" data-commit="agree" onClick={() => commitAgree()}>
                      ✓ Agree — do this
                    </button>
                    <button type="button" className="btn" data-commit="disagree" onClick={commitDisagree}>
                      Disagree
                    </button>
                    <button type="button" className="btn" data-commit="evidence" onClick={commitNeedEvidence}>
                      Need more evidence
                    </button>
                  </div>

                  <div className="crpv-secondary-cta-row">
                    <button
                      type="button"
                      className="btn ghost"
                      data-go="map"
                      onMouseEnter={onMapHoverEnter}
                      onMouseLeave={onMapHoverLeave}
                      onClick={() => {
                        setLayer("map");
                        setDrawerKey(null);
                        setMapPeek(false);
                      }}
                    >
                      ◎ View map
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      data-go="narrative"
                      onClick={() => {
                        setLayer("narrative");
                        setDrawerKey(null);
                        setMapPeek(false);
                      }}
                    >
                      ✎ Explain this decision
                    </button>
                    <button type="button" className="btn ghost" onClick={() => setLayer("narrative")}>
                      ↗ Share with team
                    </button>
                  </div>
                </>
              ) : null}

              {showStageStrip ? (
                <div className="crpv-confidence-morph" aria-live="polite">
                  <span>{confidenceFrom}</span>
                  <span className="arrow">→</span>
                  <span>{confidenceTo}</span>
                  <small>{commitState === "waiting" ? "confidence · paused" : "confidence"}</small>
                </div>
              ) : null}

              {commitState === "committed" ? (
                <div className="crpv-commit-stamp">✓ COMMITTED · DAY 52 · 14:22</div>
              ) : null}

              {commitState === "branching" ? (
                <div className="crpv-branch-cards">
                  {BRANCH_OPTIONS.map((option) => (
                    <button key={option.id} type="button" className="crpv-branch-card" onClick={() => selectBranch(option.lift)}>
                      <h4>{option.title}</h4>
                      <p>{option.description}</p>
                      <div className="lift">
                        <span>+{option.lift} CONF</span>
                        <span>{option.duration}</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}

              {commitState === "waiting" ? (
                <div className="crpv-evidence-prompt">
                  <h4>Evidence conditions requested</h4>
                  {[
                    "Interview evidence linked to top need",
                    "Decision-owner confirmation captured",
                    "Execution support plan documented",
                  ].map((label, index) => (
                    <div key={label} className="check">
                      <div className={`box ${evidenceChecks[index] ? "on" : ""}`}>{evidenceChecks[index] ? "✓" : ""}</div>
                      <span className={evidenceChecks[index] ? "done" : ""}>{label}</span>
                      <span className="note">{evidenceChecks[index] ? "SATISFIED" : "REQUESTED"}</span>
                    </div>
                  ))}
                  <div className="actions">
                    <button type="button" className="btn" data-ev-resolve onClick={resolveEvidence}>
                      Resolve all
                    </button>
                    <button type="button" className="btn ghost" data-go="command-reset" onClick={resetCommit}>
                      Start over
                    </button>
                  </div>
                </div>
              ) : null}

              {commitState === "next-revealed" ? (
                <div className="crpv-next-move-reveal">
                  <p className="cap">NOW · THE NEXT MOVE AFTER THAT</p>
                  <p className="n">{toSentence(nextMove?.title) || "Run the next execution checkpoint."}</p>
                  <div className="meta">
                    <span>Owner · {toSentence(strongestAction?.primaryOwner) || "Unassigned"}</span>
                    <span>Timeline · {effortValue}</span>
                    <span>Lift · +{confidenceLift}</span>
                  </div>
                  <div className="actions">
                    <button
                      type="button"
                      className="btn primary"
                      data-commit="agree2"
                      onClick={() => {
                        typeSystemLine("SECOND MOVE LOGGED · ROUTE UPDATED", () => {
                          later(() => {
                            setSystemLineOn(false);
                            setLayer("map");
                          }, 900);
                        });
                      }}
                    >
                      ✓ Do this next
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setLayer("map");
                        setDrawerKey(null);
                      }}
                    >
                      ◎ Show on map
                    </button>
                    <button type="button" className="btn ghost" onClick={resetCommit}>
                      ← Start over
                    </button>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="crpv-map-layer">
              <div className="crpv-map-wrap">
                <svg viewBox="0 0 1440 620" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Decision map">
                  <defs>
                    <pattern id="crpv-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                      <line x1="0" y1="0" x2="0" y2="8" stroke="#111" strokeWidth="1" opacity="0.08" />
                    </pattern>
                  </defs>

                  {[120, 165, 210, 255, 300].map((radius) => (
                    <ellipse key={radius} cx="1050" cy="240" rx={radius} ry={radius * 0.58} fill="none" stroke="#e5e1d6" />
                  ))}
                  {[140, 190, 240].map((radius) => (
                    <ellipse key={`left-${radius}`} cx="380" cy="460" rx={radius} ry={radius * 0.58} fill="none" stroke="#e5e1d6" />
                  ))}

                  <polygon points="820,70 1440,0 1440,380 1120,300" fill="url(#crpv-hatch)" />

                  <path d="M 160 515 C 320 505, 420 450, 560 420 S 760 320, 880 300" fill="none" stroke="#111" strokeWidth="3" />
                  <path
                    d="M 880 300 C 960 280, 1040 230, 1120 200 S 1320 120, 1380 100"
                    fill="none"
                    stroke="#999"
                    strokeWidth="2"
                    strokeDasharray="2 10"
                    strokeLinecap="round"
                  />

                  <g className="wp wp-start" onClick={() => setLayer("narrative")}>
                    <circle cx="160" cy="515" r="7" fill="#111" />
                    <text x="178" y="518" className="wp-label">Start</text>
                  </g>

                  <g className={`wp wp-current ${commitState !== "idle" ? "pulse" : ""}`} onClick={() => setLayer("narrative")}>
                    <circle cx="880" cy="300" r="26" fill="none" stroke="#111" strokeWidth="2" />
                    <circle cx="880" cy="300" r="9" fill="#111" />
                    <text x="815" y="268" className="wp-label">You are here</text>
                    <text x="842" y="338" className="wp-cap">CONF {confidenceTo}</text>
                  </g>

                  <g className="wp wp-next" onClick={() => setLayer("narrative")}>
                    <circle cx="1120" cy="200" r="26" fill="none" stroke="#777" strokeWidth="1.5" strokeDasharray="4 5" />
                    <line x1="1120" y1="186" x2="1120" y2="214" stroke="#111" strokeWidth="2" />
                    <line x1="1106" y1="200" x2="1134" y2="200" stroke="#111" strokeWidth="2" />
                    <text x="1080" y="170" className="wp-label">Next move →</text>
                  </g>

                  <g className="wp wp-desired" onClick={() => setLayer("narrative")}>
                    <rect x="1368" y="88" width="24" height="24" fill="#111" />
                    <text x="1310" y="78" className="wp-label">Desired</text>
                    <text x="1308" y="126" className="wp-cap">DESIRED {confidenceTarget}</text>
                  </g>
                </svg>
              </div>

              <div className="crpv-map-pin">
                <p>{actionHeadline}</p>
                <div className="actions">
                  <button type="button" className="btn primary" onClick={() => commitAgree()}>
                    ✓ Agree
                  </button>
                  <button type="button" className="btn" onClick={commitDisagree}>
                    Disagree
                  </button>
                  <button type="button" className="btn" onClick={() => setLayer("command") }>
                    ← Back
                  </button>
                  <button type="button" className="btn ghost" onClick={() => setLayer("narrative") }>
                    ✎ Explain
                  </button>
                </div>
              </div>
            </section>

            <section className="crpv-narrative-layer">
              <div className="crpv-narrative-inner">
                {narrativeRows.map((item) => (
                  <div key={item.step} className="step">
                    <div className="n">{item.step} · {item.label}</div>
                    <p>
                      {item.body.includes("validate") ? (
                        <>
                          {item.body.split(/(validate[^.]*\.)/i).map((part) =>
                            /validate[^.]*\./i.test(part) ? <em key={part}>{part}</em> : <span key={part}>{part}</span>,
                          )}
                        </>
                      ) : (
                        item.body
                      )}
                    </p>
                  </div>
                ))}
                <div className="actions">
                  <button type="button" className="btn primary" onClick={() => commitAgree()}>
                    ✓ Commit
                  </button>
                  <button type="button" className="btn" onClick={() => setLayer("map") }>
                    ◎ Show on map
                  </button>
                  <button type="button" className="btn ghost" onClick={() => setLayer("command") }>
                    ← Back to command
                  </button>
                </div>
              </div>
            </section>

            {accessModes.edge ? (
              <div className="crpv-edge-tabs">
                {EDGE_DRAWERS.map((item) => (
                  <button key={item.key} type="button" onClick={() => openDrawer(item.key)}>
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}

            {accessModes.footer ? (
              <div className="crpv-footer-drawers">
                <div className="left cap">WHY · 2 OF 5 RESPONDED</div>
                <div className="right">
                  {EDGE_DRAWERS.map((item) => (
                    <button key={item.key} type="button" className="btn ghost" onClick={() => openDrawer(item.key)}>
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <button type="button" className="crpv-spec-toggle" onClick={() => setSpecOpen((value) => !value)}>
              {specOpen ? "▾ HIDE SPEC" : "▸ INTERACTION SPEC"}
            </button>
            <aside className={`crpv-spec-panel ${specOpen ? "open" : ""}`}>
              <h4>Layer stack</h4>
              <p>Command defaults. Map and Narrative are progressive disclosure layers. Drawers expose context on demand.</p>
              <h4>Keyboard</h4>
              <p>M map · N narrative · Esc command · 1-4 drawers.</p>
              <h4>Commit model</h4>
              <p>Agree logs commit, Disagree branches alternatives, Need evidence pauses until checks are satisfied.</p>
            </aside>

            <div className="crpv-legend">
              <span><span className="k">M</span> MAP</span>
              <span className="sep">·</span>
              <span><span className="k">N</span> NARRATIVE</span>
              <span className="sep">·</span>
              <span><span className="k">1-4</span> DRAWERS</span>
              <span className="sep">·</span>
              <span><span className="k">Esc</span> BACK</span>
            </div>

            <aside className={`crpv-tweaks ${tweaksOpen ? "open" : ""}`}>
              <div className="hdr">
                <span>Tweaks · Drawer Access</span>
                <button type="button" className="x" onClick={() => setTweaksOpen(false)}>
                  ✕
                </button>
              </div>
              <div className="section">
                <div className="sect-title">Access patterns</div>
                <label className="tweak-toggle">
                  <span className="lbl">Pill row<span className="sub">Explicit chips under meta row</span></span>
                  <input
                    type="checkbox"
                    checked={accessModes.pills}
                    onChange={(event) =>
                      setAccessModes((prev) => ({ ...prev, pills: event.target.checked }))
                    }
                  />
                  <span className="sw" />
                </label>
                <label className="tweak-toggle">
                  <span className="lbl">Inline hot-phrase<span className="sub">Dashes open related drawer</span></span>
                  <input
                    type="checkbox"
                    checked={accessModes.inline}
                    onChange={(event) =>
                      setAccessModes((prev) => ({ ...prev, inline: event.target.checked }))
                    }
                  />
                  <span className="sw" />
                </label>
                <label className="tweak-toggle">
                  <span className="lbl">Right-edge tabs<span className="sub">Pinned vertical access</span></span>
                  <input
                    type="checkbox"
                    checked={accessModes.edge}
                    onChange={(event) =>
                      setAccessModes((prev) => ({ ...prev, edge: event.target.checked }))
                    }
                  />
                  <span className="sw" />
                </label>
                <label className="tweak-toggle">
                  <span className="lbl">Footer row<span className="sub">Bottom context strip</span></span>
                  <input
                    type="checkbox"
                    checked={accessModes.footer}
                    onChange={(event) =>
                      setAccessModes((prev) => ({ ...prev, footer: event.target.checked }))
                    }
                  />
                  <span className="sw" />
                </label>
              </div>
            </aside>

            <button type="button" className={`crpv-tweaks-fab ${tweaksOpen ? "hidden" : "visible"}`} onClick={() => setTweaksOpen(true)}>
              ⚙
            </button>

            <div className="crpv-scrim" onClick={closeDrawer} />

            <aside className="crpv-side-drawer" aria-hidden={layer !== "drawer"}>
              <button type="button" className="close" onClick={closeDrawer}>
                ✕ CLOSE
              </button>
              {currentDrawer ? (
                <>
                  <p className="cap">{currentDrawer.title}</p>
                  <h3>{currentDrawer.headline}</h3>
                  {currentDrawer.big ? <p className="big">{currentDrawer.big}</p> : null}
                  <div className="rows">
                    {currentDrawer.rows.map((row) => (
                      <div key={`${row.key}-${row.value}`} className="row">
                        <span>{row.key}</span>
                        <span>{row.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </aside>

            <div className={`crpv-system-line ${systemLineOn ? "on" : ""}`}>
              {systemLine}
              <span className="cursor" />
            </div>

            <div className="crpv-readonly-tag cap">READ-ONLY PREVIEW · NO WRITE ACTIONS</div>

            <div className="crpv-inline-status">
              <span>Top action: {toSentence(strongestAction?.title) || "No action mapped"}</span>
              <span>Secondary: {toSentence(secondAction?.title) || "No secondary action"}</span>
              <span>Strongest signal: {strongestSignal.label} {Math.round(strongestSignal.value)}</span>
            </div>
          </div>
        )}
      </section>
    </PageShell>
  );
}
