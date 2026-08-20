/*
 * First Read Gate 5 — the export control.
 *
 * Gathers the SAME hook outputs the acts render from, hands them to the pure
 * serializer (buildFirstReadExportHtml), and downloads a self-contained HTML
 * leave-behind. Rendered only on a proposal_issued (or later) session — the
 * artifact contains the proposal, so an open session has nothing to export.
 */

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useMojoScore } from "@/hooks/useMojoScore";
import { useStandingFindings } from "@/hooks/useStandingFindings";
import { usePublicBaseline } from "@/hooks/usePublicBaseline";
import { useIndustryReferenceMaps } from "@/hooks/useIndustryReferenceMaps";
import { useFirstReadCapture } from "@/hooks/useFirstReadCapture";
import type { Proposal } from "@/hooks/useFirstReadProposal";
import { admitForSurface } from "@/lib/registerGuard";
import { KIND_LABEL } from "@/components/client-view/story/OutsideHeroAct";
import { orderOtherFindings } from "@/components/client-view/story/OutsideFindingsAct";
import { useFirstReadOpenQuestions } from "@/hooks/useFirstReadOpenQuestions";
import { useSetAsideIdentities } from "@/hooks/useSetAsideIdentities";
import { partitionByShrink } from "@/lib/firstRead/gapShrink";
import { useOutsidePerception } from "@/hooks/useOutsidePerception";
import { isPublicProvenance } from "@/lib/registerGuard";
import { splitPerception } from "@/lib/firstRead/perceptionGuard";
import { dedupeByContainment } from "@/lib/firstRead/outsideCollapse";
import {
  buildFirstReadExportHtml,
  firstReadExportFilename,
  type FirstReadExportData,
  type ExportMirrorFinding,
} from "@/lib/firstRead/exportHtml";

const EXPORT_LABEL = "Export leave-behind"; // OPERATOR-SIGNED 2026-07-23 (Gate 5)

function download(filename: string, html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ExportButton({
  companyId,
  sessionId,
  proposal,
}: {
  companyId: string;
  sessionId: string;
  proposal: Proposal | null;
}) {
  const { activeCompany } = useCompany();
  // GATE D — read the `error` each hook now exposes (Gates B/C), including useFirstReadCapture's
  // AGGREGATE `readError`. These feed the REFUSAL below; loading is NOT bounded (a hang must keep
  // export disabled, never flip to a false success).
  const { score, loading: scoreLoading, error: scoreError } = useMojoScore(companyId);
  const { data: findingsData, isLoading: findingsLoading, error: findingsError } = useStandingFindings(companyId);
  const { preferredRun, loading: baselineLoading, error: baselineError } = usePublicBaseline(companyId);
  const { maps, loading: mapsLoading, error: mapsError } = useIndustryReferenceMaps();
  const { items, tally, loading: captureLoading, readError: captureError } = useFirstReadCapture(companyId, sessionId);
  // PUBLIC-ONLY ruling (2026-08-20): curated tension UNMOUNTED from the First Read
  // export (follows the screen — the exhibit no longer renders on the rail).
  const curatedTension = null;
  // PUBLIC-ONLY ruling (2026-08-20): stated problem UNMOUNTED from the First Read
  // export (told-us content; follows the screen). Hook/data untouched elsewhere.
  const statedProblemLoading = false;
  const statedProblemError = null;
  // V2-4 — the Gap section reads the SAME open-question table the on-screen Gap does,
  // so the leave-behind can never diverge from the meeting.
  const { rows: openQuestionRows, loading: openQuestionsLoading, error: openQuestionsError } = useFirstReadOpenQuestions(companyId);
  // V2-8 — the leave-behind reflects the issuance-time shrink: set-aside questions are
  // demoted (never dropped), via the SAME partition the screen (GapAct) uses.
  const { identities: setAsideIdentities } = useSetAsideIdentities(sessionId);
  // V2-5 — the Act 3 "Message" band: register-locked at the source (public_observed only).
  const { claims: perceptionClaims, loading: perceptionLoading, error: perceptionError } = useOutsidePerception(companyId);
  const [session, setSession] = useState<{ started_at: string | null; presenter: string | null } | null>(null);

  // The export must match the meeting exactly — never capture a not-yet-loaded
  // hook as honest-empty. useMojoScore starts loading=false (flips true only once
  // its effect runs), so !scoreLoading alone is true too early; track that the
  // score fetch actually completed (true->false) before allowing export.
  const [scoreSettled, setScoreSettled] = useState(false);
  const sawScoreLoading = useRef(false);
  useEffect(() => {
    if (scoreLoading) sawScoreLoading.current = true;
    else if (sawScoreLoading.current) setScoreSettled(true);
  }, [scoreLoading]);

  // GATE D — REFUSE while ANY consumed read has failed (operator ruling: the export is the one
  // artifact where nothing beats something wrong). Every section-feeding read is covered — an
  // omitted read would let its section reach the permanent leave-behind. Labels are the
  // OPERATOR-facing section names (never client copy; never reach the document). Loading is NOT
  // in this list — bounding it would flip a hang into a false success (Gate B invariant).
  const failedSections: string[] = ([
    ["Stated problem", statedProblemError],
    ["Standard job map", mapsError],
    ["Mojo Score", scoreError],
    ["Outside findings", findingsError],
    ["Outside signals", baselineError],
    ["The Check", captureError],
    ["The Gap", openQuestionsError],
    ["How the outside describes you", perceptionError],
  ] as Array<[string, string | null]>).filter(([, e]) => e).map(([label]) => label);

  const dataReady =
    !captureLoading && scoreSettled && !findingsLoading && !baselineLoading && !mapsLoading &&
    !statedProblemLoading && !openQuestionsLoading && !perceptionLoading && session !== null &&
    failedSections.length === 0;

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("first_read_sessions")
      .select("started_at, presenter")
      .eq("id", sessionId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setSession(data as { started_at: string | null; presenter: string | null } | null);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const onExport = () => {
    const findings = findingsData?.findings ?? [];
    const primaryId = findingsData?.primaryId ?? null;
    const primary = primaryId ? findings.find((f) => f.id === primaryId) : undefined;

    const bet =
      primary && admitForSurface(primary, "outside")
        ? { label: KIND_LABEL[primary.kind], text: primary.body }
        : null;

    const mirrorFindings: ExportMirrorFinding[] = orderOtherFindings(findings, primaryId).map((f) => ({
      label: KIND_LABEL[f.kind],
      text: f.body,
    }));

    const key = activeCompany?.industry_key ?? null;
    const map = key && maps.has(key) ? maps.get(key)! : null;

    const startedAt = session?.started_at ?? "";
    const sessionDate = (() => {
      try {
        return startedAt ? new Date(startedAt).toLocaleDateString() : "";
      } catch {
        return startedAt;
      }
    })();

    const data: FirstReadExportData = {
      company: { name: activeCompany?.name ?? "Company" },
      session: { id: sessionId, date: sessionDate, presenter: session?.presenter ?? null },
      statedProblem: null, // PUBLIC-ONLY (2026-08-20): unmounted from the leave-behind.
      standard: map
        ? { label: map.industry_label, taxonomyVersion: map.taxonomy_version, steps: map.steps }
        : null,
      mirror: { score: score?.total_score ?? null, bet, findings: mirrorFindings },
      // V2-5b — mirror the Message band exactly: register lock → framework/analytic guard
      // → containment dedupe, single-sourced so the leave-behind can't diverge.
      perception: dedupeByContainment(
        splitPerception(perceptionClaims.filter((c) => isPublicProvenance(c.provenance)), (c) => c.statement).admitted,
        (c) => c.statement,
      ).map((c) => c.statement.trim()),
      check: { items, tally },
      curatedTension: curatedTension ?? null,
      gap: partitionByShrink(openQuestionRows, setAsideIdentities).active.map((q) => q.question_text),
      gapSetAside: partitionByShrink(openQuestionRows, setAsideIdentities).demoted.map((q) => q.question_text),
      proposal,
      exportedAt: new Date().toISOString(),
    };

    download(firstReadExportFilename(data.company.name, startedAt), buildFirstReadExportHtml(data));
  };

  return (
    <>
      <button
        type="button"
        className="cvs-pill-ghost cvs-fr-export-btn"
        onClick={onExport}
        disabled={!dataReady}
      >
        {EXPORT_LABEL}
      </button>
      {/* GATE D — OPERATOR-facing reason (a disabled button with no reason is its own defect;
          the operator must know which read failed rather than click a dead button mid-meeting).
          NEVER reaches the leave-behind or any client surface. Straight ASCII apostrophe +
          em-dash U+2014 space-padded, matching the neighbouring signed strings' house style. */}
      {failedSections.length > 0 && (
        <p className="cvs-fr-export-reason" role="alert">
          Export unavailable — couldn't load: {failedSections.join(", ")}. Reload and try again.
        </p>
      )}
    </>
  );
}
