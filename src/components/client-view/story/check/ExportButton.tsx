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
import { useFirstReadStatedProblem } from "@/hooks/useFirstReadStatedProblem";
import type { Proposal } from "@/hooks/useFirstReadProposal";
import { admitForSurface } from "@/lib/registerGuard";
import { KIND_LABEL } from "@/components/client-view/story/OutsideHeroAct";
import { orderOtherFindings } from "@/components/client-view/story/OutsideFindingsAct";
import { openQuestions } from "@/components/client-view/story/GapAct";
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
  const { score, loading: scoreLoading } = useMojoScore(companyId);
  const { data: findingsData, isLoading: findingsLoading } = useStandingFindings(companyId);
  const { preferredRun, loading: baselineLoading } = usePublicBaseline(companyId);
  const { maps, loading: mapsLoading } = useIndustryReferenceMaps();
  const { items, tally, loading: captureLoading } = useFirstReadCapture(companyId, sessionId);
  const { data: statedProblem, loading: statedProblemLoading } = useFirstReadStatedProblem(companyId);
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

  const dataReady =
    !captureLoading && scoreSettled && !findingsLoading && !baselineLoading && !mapsLoading &&
    !statedProblemLoading && session !== null;

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
      statedProblem: statedProblem
        ? { statement: statedProblem.statement, quote: statedProblem.quote, register: statedProblem.register, descriptive_fallback: statedProblem.descriptive_fallback }
        : null,
      standard: map
        ? { label: map.industry_label, taxonomyVersion: map.taxonomy_version, steps: map.steps }
        : null,
      mirror: { score: score?.total_score ?? null, bet, findings: mirrorFindings },
      check: { items, tally },
      gap: openQuestions(preferredRun),
      proposal,
      exportedAt: new Date().toISOString(),
    };

    download(firstReadExportFilename(data.company.name, startedAt), buildFirstReadExportHtml(data));
  };

  return (
    <button
      type="button"
      className="cvs-pill-ghost cvs-fr-export-btn"
      onClick={onExport}
      disabled={!dataReady}
    >
      {EXPORT_LABEL}
    </button>
  );
}
