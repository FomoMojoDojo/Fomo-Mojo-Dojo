// Inputs (comp port 2b + Tier 1 controls, 2026-09-11, fr tokens). Reads:
//   Signal basis     signals by band — useSignalLandscape (byBand.outside/organization/customer.count),
//                    the home's chips verbatim: "PUBLIC n / TEAM n / CUSTOMERS n" (HomepageHierarchyFR:187-189)
//   integration      input_files (useCompanyFiles) + their __area:* tags (readAreaSupportTags) → assigned
//                    files / all files; "Partially integrated" renders only when 0 < assigned < all
//   counters         Evidence files = useCompanyFiles count; Customer tensions mapped = odi_needs count
//                    (useOdiNeeds, company-wide); Directional routes = routes level=route (useRoutes)
//   table            Type / snippet = file_name; Areas = foundation labels read back from the file's tags
//                    (the InputsTab map); Analysis = the tab's vocabulary from file_proposals (useFileProposals);
//                    View file ↗ = getFileSignedUrl(file_path) (useInputs.ts:510)
// Tier 1 controls — every one operator-gated (OperatorControlsContext) AND capability-gated exactly as the
// tab (evidence.manage; governance.proposal.apply on Accept), and every write goes through the SAME hook /
// lifted function the tab uses (no new path — Option B holds):
//   Upload file      FileUploadDialog (src/components/FileUploadDialog.tsx) — the tab's dialog, as-is
//   Run analysis     runDifyAnalyzeFile (lifted from InputsTab.handleDifyAnalyze) — dify-analyze-file invoke;
//                    a failed run renders the tab's "Analysis failed — retry →" (failedIds, parity with the
//                    tab's difyFailedIds, 2026-09-12); a size refusal renders the signed reason instead
//   Review proposal  ProposalReviewPanel (moved from InputsTab) with acceptFileProposal / rejectFileProposal /
//                    dismissFileProposal (lifted) — file_proposals + input_files tag writes
//   View analysis    the same panel on an ACCEPTED row, in its status-aware read mode (2026-09-13): the decision
//                    record + Close, no Accept/Reject — opening it issues no write
//   sync poll        useProposalSync (moved from the tab): dify-analyze-file {mode:"sync"} per active row while
//                    gated; the server-side sweep (pg_cron) is the authority when no page is open
//   filters          type (the tab's row.type derivation: Intake tag → intake, else file) and foundation
//   Archive ×        DeleteConfirmPanel (moved) → useArchiveInputFile (+ unlinkNeedsFromFilePath, lifted)
//   Archived · Restore  useArchivedInputFiles / useRestoreInputFile
import { Fragment, useMemo, useState } from "react";
import { useCompany } from "@/hooks/useCompany";
import { useCapability } from "@/hooks/useCapability";
import { useCompanyFiles, type CompanyFileRow } from "@/hooks/useCompanyFiles";
import { useFileProposals, type FileProposalRow } from "@/hooks/useFileProposals";
import { getFileSignedUrl, useArchiveInputFile, useArchivedInputFiles, useRestoreInputFile } from "@/hooks/useInputs";
import { acceptFileProposal, dismissFileProposal, rejectFileProposal, runDifyAnalyzeFile, unlinkNeedsFromFilePath } from "@/hooks/useInputActions";
import { FileTooLargeError, fileTooLargeMessage, type FileTooLargeRefusal } from "@/lib/fileTooLarge";
import { useProposalSync } from "@/hooks/useProposalSync";
import { useOdiNeeds } from "@/hooks/useOdiNeeds";
import { useRoutes } from "@/hooks/useRoutes";
import { useSignalLandscape } from "@/hooks/useSignalLandscape";
import { readAreaSupportTags } from "@/lib/fileTags";
import FileUploadDialog from "@/components/FileUploadDialog";
import { DeleteConfirmPanel, ProposalReviewPanel, fileProposalProcessingBadgeText, proposalPriority, type FoundationArea, type SourceRow } from "@/views/client/workshop/inputsShared";
import { Chip, type ChipTone } from "@/views/client/firstReadPreview/primitives";
import { useOperatorControls } from "@/views/client/firstReadPreview/operatorControls";
import { OPERATOR_MARK } from "@/views/client/firstReadPreview/operatorStrings";
import { WorkspaceAbsent } from "./absent";
import { WorkspaceHeroPage } from "./WorkspaceHeroPage";
import { WORKSPACE_AREA_LABELS, WORKSPACE_STRINGS, pageLabel } from "./workspaceNav";

function areasOf(file: CompanyFileRow): string[] {
  const out = new Set<string>();
  for (const k of readAreaSupportTags(file.tags)) { const m = WORKSPACE_AREA_LABELS[k]; if (m) out.add(m); }
  return [...out];
}
/** The tab's row.type derivation (InputsTab fileRows): the 'Intake' tag discriminates intake from file. */
function typeOf(file: CompanyFileRow): "file" | "intake" {
  return (file.tags ?? []).includes("Intake") ? "intake" : "file";
}
/** The tab's SourceRow shape for the moved panels — the fields they read. */
function toSourceRow(file: CompanyFileRow, areas: string[]): SourceRow {
  return {
    id: file.id, type: typeOf(file), title: file.file_name, source: file.file_type ? file.file_type.toUpperCase() : "—",
    date: "", status: "internal input", areas: areas as FoundationArea[], inFoundation: areas.length > 0, rawTags: file.tags,
    workshopTag: null, suggestedTag: "General", processingStatus: "uploaded", linkedNeeds: [], filePath: file.file_path, fileType: file.file_type,
  } as SourceRow;
}
/** The tab's vocabulary for a ready proposal or none; other states show the tab's badge text (Tier 2). */
function readyStatus(p: FileProposalRow | undefined): { label: string; tone: ChipTone } | null {
  if (!p) return null;
  if (p.processing_state !== "ready") return { label: fileProposalProcessingBadgeText(p), tone: "neutral" };
  if (p.status === "accepted") return { label: WORKSPACE_STRINGS.analysisReady, tone: "good" }; // ungated badge; gated → View analysis →
  return null; // ready + pending → the Review proposal control
}

export default function InputsPage() {
  const { activeCompany } = useCompany();
  const companyId = activeCompany?.id;
  const files = useCompanyFiles(companyId);
  const proposals = useFileProposals(companyId);
  const { landscape } = useSignalLandscape(companyId);
  const { needs } = useOdiNeeds(companyId);
  const { items: routes } = useRoutes(companyId);
  const operator = useOperatorControls();
  const canEvidence = useCapability("evidence.manage", companyId);
  const canApply = useCapability("governance.proposal.apply", companyId);
  const gated = Boolean(operator) && canEvidence;
  // Sync poll (2026-09-13, moved from the tab into useProposalSync): while a proposal is queued/running
  // and the cell is gated, the page reconciles it against Dify every 5 s — so a run completes promptly
  // while watched. The pg_cron sweep remains the authority when nothing is watching.
  useProposalSync(proposals.data, gated, proposals.refetch);
  const archive = useArchiveInputFile();
  const restore = useRestoreInputFile();
  const archivedQuery = useArchivedInputFiles(gated ? companyId : null);
  const archived = archivedQuery.data ?? [];

  const [openUpload, setOpenUpload] = useState(false);
  const [typeFilter, setTypeFilter] = useState<"all" | "file" | "intake">("all");
  const [foundationFilter, setFoundationFilter] = useState<"all" | "yes" | "no">("all");
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  /** The tab's difyFailedIds: a run that threw; cleared on the next attempt for that file. */
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(new Set());
  /** A size refusal for a file (413 file_too_large) — the signed reason, not a retry. */
  const [refusedById, setRefusedById] = useState<ReadonlyMap<string, FileTooLargeRefusal>>(new Map());
  const [panelId, setPanelId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const rows = files.data ?? [];
  // The tab's proposal-per-file choice (proposalPriority, newest wins ties).
  const proposalByFile = useMemo(() => {
    const m = new Map<string, FileProposalRow>();
    for (const p of proposals.data ?? []) {
      const cur = m.get(p.file_id);
      if (!cur || proposalPriority(p) > proposalPriority(cur) || (proposalPriority(p) === proposalPriority(cur) && Date.parse(p.created_at) > Date.parse(cur.created_at))) m.set(p.file_id, p);
    }
    return m;
  }, [proposals.data]);
  const assigned = rows.filter((f) => areasOf(f).length > 0).length;
  const routeCount = routes.filter((r) => (r.level ?? "route") === "route").length;
  const counts = landscape ? { pub: landscape.byBand.outside.count, team: landscape.byBand.organization.count, cust: landscape.byBand.customer.count } : null;
  const visible = rows.filter((f) => (typeFilter === "all" || typeOf(f) === typeFilter) && (foundationFilter === "all" || (foundationFilter === "yes") === (areasOf(f).length > 0)));

  const refetchAll = async () => { await files.refetch(); await proposals.refetch(); await archivedQuery.refetch(); };
  const openFile = async (f: CompanyFileRow) => { window.open(await getFileSignedUrl(f.file_path), "_blank", "noopener"); };
  const analyze = async (f: CompanyFileRow) => {
    if (!gated || !companyId) return;
    setAnalyzingId(f.id);
    setFailedIds((prev) => { const next = new Set(prev); next.delete(f.id); return next; });
    setRefusedById((prev) => { if (!prev.has(f.id)) return prev; const next = new Map(prev); next.delete(f.id); return next; });
    try {
      await runDifyAnalyzeFile({ fileId: f.id, filePath: f.file_path, fileName: f.file_name, fileType: f.file_type ?? "", companyId, sourceType: typeOf(f) === "file" ? "uploaded_file" : typeOf(f) });
      await proposals.refetch();
      setPanelId(f.id);
    } catch (err) {
      // the tab's fail-closed: no proposal is written; the failure is shown in the analysis cell
      if (err instanceof FileTooLargeError) setRefusedById((prev) => new Map(prev).set(f.id, err.refusal));
      else setFailedIds((prev) => new Set([...prev, f.id]));
    } finally { setAnalyzingId(null); }
  };
  const archiveFile = async (f: CompanyFileRow, mode: "file-only" | "file-and-unlink") => {
    if (!gated) return;
    setConfirmId(null); setDeletingId(f.id);
    try {
      await archive.mutateAsync({ id: f.id, reason: "user_removed", source: "ui" });
      if (mode === "file-and-unlink" && f.file_path) await unlinkNeedsFromFilePath(f.file_path);
    } finally { setDeletingId(null); await refetchAll(); }
  };

  return (
    <WorkspaceHeroPage
      eyebrow={pageLabel("inputs")}
      title={WORKSPACE_STRINGS.heroInputs}
      accent={WORKSPACE_STRINGS.heroInputsAccent}
      actions={counts ? (
        <div className="fr-ws-signals" data-fr-region="signal-basis" data-testid="inputs-signals">
          <span className="fr-ws-signals-label fr-mono">{WORKSPACE_STRINGS.signalBasis}</span>
          <Chip tone={counts.pub > 0 ? "accent-2" : "neutral"}>{WORKSPACE_STRINGS.signalPublic} {counts.pub}</Chip>
          <Chip tone={counts.team > 0 ? "accent-4" : "neutral"}>{WORKSPACE_STRINGS.signalTeam} {counts.team}</Chip>
          <Chip tone={counts.cust > 0 ? "accent-1" : "neutral"}>{WORKSPACE_STRINGS.signalCustomers} {counts.cust}</Chip>
        </div>
      ) : undefined}
    >
      {files.isLoading ? null : (
        <>
          {activeCompany?.no_public_site ? (
            <p className="fr-ws-band-eyebrow fr-mono" data-fr-state="no-public-site" data-testid="inputs-no-public-site">{WORKSPACE_STRINGS.noPublicSiteState}</p>
          ) : null}
          {rows.length > 0 && assigned > 0 && assigned < rows.length ? (
            <div className="fr-ws-integration" data-fr-region="integration" data-testid="inputs-integration">
              <p className="fr-ws-band-eyebrow fr-mono">{WORKSPACE_STRINGS.partiallyIntegrated}</p>
              <p className="fr-ws-integration-count"><span data-testid="inputs-assigned">{assigned}</span> / {rows.length}</p>
            </div>
          ) : null}

          <div className="fr-ws-counters" data-fr-region="counters" data-testid="inputs-counters">
            <span><span className="fr-ws-counter-label">{WORKSPACE_STRINGS.evidenceFiles}</span><b>{rows.length}</b></span>
            <span><span className="fr-ws-counter-label">{WORKSPACE_STRINGS.customerTensionsMapped}</span><b>{needs.length}</b></span>
            <span><span className="fr-ws-counter-label">{WORKSPACE_STRINGS.directionalRoutes}</span><b>{routeCount}</b></span>
          </div>

          {gated ? (
            <div className="fr-ws-addinput" {...{ [OPERATOR_MARK.attr]: "upload" }} data-testid="inputs-upload">
              <p className="fr-ws-sectionlabel fr-mono">
                <span className="fr-ws-sectionlabel-num">{WORKSPACE_STRINGS.add}</span>
                <span className="fr-ws-sectionlabel-slash">/</span>
                <span>{WORKSPACE_STRINGS.input}</span>
              </p>
              <button type="button" className="fr-ws-control fr-mono" onClick={() => setOpenUpload(true)} data-testid="inputs-upload-open">{WORKSPACE_STRINGS.uploadFile}</button>
              <FileUploadDialog open={openUpload} onOpenChange={(o) => { setOpenUpload(o); if (!o) void refetchAll(); }} companyId={companyId} companyName={activeCompany?.name} />
            </div>
          ) : null}

          <div className="fr-ws-tablewrap" data-fr-region="files">
            {gated && rows.length > 0 ? (
              <div className="fr-ws-filterrow fr-ws-filterrow--inputs" {...{ [OPERATOR_MARK.attr]: "filters" }} data-testid="inputs-filters">
                <select className="fr-ws-select fr-mono" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)} data-testid="inputs-type-filter">
                  <option value="all">{WORKSPACE_STRINGS.filterAllTypes}</option>
                  <option value="file">{WORKSPACE_STRINGS.filterFile}</option>
                  <option value="intake">{WORKSPACE_STRINGS.filterIntake}</option>
                </select>
                <select className="fr-ws-select fr-mono" value={foundationFilter} onChange={(e) => setFoundationFilter(e.target.value as typeof foundationFilter)} data-testid="inputs-area-filter">
                  <option value="all">{WORKSPACE_STRINGS.filterFoundationAll}</option>
                  <option value="yes">{WORKSPACE_STRINGS.filterFoundationYes}</option>
                  <option value="no">{WORKSPACE_STRINGS.filterFoundationNo}</option>
                </select>
              </div>
            ) : null}
            {rows.length === 0 ? (
              <WorkspaceAbsent what="files" />
            ) : (
              <table className="fr-ws-table" data-testid="inputs-table">
                <thead className="fr-mono">
                  <tr>
                    <th>{WORKSPACE_STRINGS.colTypeSnippet}</th>
                    <th>{WORKSPACE_STRINGS.colAreas}</th>
                    <th>{WORKSPACE_STRINGS.colAnalysis}</th>
                    {gated ? <th aria-hidden="true" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((f) => {
                    const areas = areasOf(f);
                    const proposal = proposalByFile.get(f.id);
                    const badge = readyStatus(proposal);
                    const reviewable = Boolean(proposal && proposal.processing_state === "ready" && proposal.status === "pending");
                    const row = toSourceRow(f, areas);
                    return (
                      <Fragment key={f.id}>
                        <tr data-testid="inputs-file-row" data-fr-type={typeOf(f)} data-fr-file-id={f.id}>
                          <td>
                            <span className="fr-ws-table-name">{f.file_name}</span>
                            <button type="button" className="fr-ws-table-link fr-mono" onClick={() => { void openFile(f); }}>{WORKSPACE_STRINGS.viewFile}</button>
                          </td>
                          <td className="fr-ws-table-areas">{areas.join(" · ")}</td>
                          <td className="fr-ws-table-analysis">
                            {!proposal ? (
                              gated ? (
                                refusedById.has(f.id) && analyzingId !== f.id ? (
                                  <span className="fr-ws-analysis-refused fr-mono" data-testid="inputs-analysis-refused">{fileTooLargeMessage(refusedById.get(f.id)!)}</span>
                                ) : failedIds.has(f.id) && analyzingId !== f.id ? (
                                  <button type="button" className="fr-ws-control fr-mono" data-fr-failed="" onClick={() => { void analyze(f); }} {...{ [OPERATOR_MARK.attr]: "run-analysis" }} data-testid="inputs-analysis-retry">
                                    {WORKSPACE_STRINGS.analysisFailedRetry}
                                  </button>
                                ) : (
                                  <button type="button" className="fr-ws-control fr-mono" disabled={analyzingId === f.id} onClick={() => { void analyze(f); }} {...{ [OPERATOR_MARK.attr]: "run-analysis" }} data-testid="inputs-run-analysis">
                                    {analyzingId === f.id ? WORKSPACE_STRINGS.analyzing : WORKSPACE_STRINGS.runAnalysis}
                                  </button>
                                )
                              ) : <Chip tone="neutral">{WORKSPACE_STRINGS.runAnalysis}</Chip>
                            ) : reviewable ? (
                              gated ? (
                                <button type="button" className="fr-ws-control fr-mono" onClick={() => setPanelId(panelId === f.id ? null : f.id)} aria-expanded={panelId === f.id} {...{ [OPERATOR_MARK.attr]: "review-proposal" }} data-testid="inputs-review-proposal">
                                  {WORKSPACE_STRINGS.reviewProposal}
                                </button>
                              ) : <Chip tone="warn">{WORKSPACE_STRINGS.reviewProposal}</Chip>
                            ) : proposal.processing_state === "ready" && proposal.status === "accepted" && gated ? (
                              // Accepted (2026-09-13): the completed analysis is readable — the panel mounts in its decided mode (no Accept/Reject).
                              <button type="button" className="fr-ws-control fr-mono" onClick={() => setPanelId(panelId === f.id ? null : f.id)} aria-expanded={panelId === f.id} {...{ [OPERATOR_MARK.attr]: "view-analysis" }} data-testid="inputs-view-analysis">
                                {WORKSPACE_STRINGS.viewAnalysis}
                              </button>
                            ) : badge ? <Chip tone={badge.tone}>{badge.label}</Chip> : null}
                            {/* Ruling 9 (2026-09-14): Dify's proposal-level confidence, visible before the panel is opened. Same string as the panel chip. */}
                            {proposal && proposal.processing_state === "ready" && proposal.confidence ? (
                              <span className="fr-ws-analysis-confidence fr-mono" data-testid="inputs-analysis-confidence" data-fr-confidence={proposal.confidence}>{proposal.confidence} confidence</span>
                            ) : null}
                          </td>
                          {gated ? (
                            <td className="fr-ws-table-actions">
                              <button type="button" className="fr-ws-table-x" title={WORKSPACE_STRINGS.archiveTitle} aria-label={WORKSPACE_STRINGS.archiveTitle} disabled={deletingId === f.id} onClick={() => { if (areas.length === 0) void archiveFile(f, "file-only"); else setConfirmId(confirmId === f.id ? null : f.id); }} {...{ [OPERATOR_MARK.attr]: "archive" }} data-testid="inputs-archive">
                                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2 2 L10 10 M10 2 L2 10" fill="none" stroke="currentColor" strokeWidth="1.25" /></svg>
                              </button>
                            </td>
                          ) : null}
                        </tr>
                        {gated && panelId === f.id && proposal ? (
                          <tr key={`${f.id}-panel`} data-testid="inputs-review-panel" {...{ [OPERATOR_MARK.attr]: "review-panel" }}>
                            <td colSpan={4}>
                              <ProposalReviewPanel
                                proposal={proposal}
                                canAccept={canApply}
                                onClose={() => setPanelId(null)}
                                onAccept={async (payload) => { setPanelId(null); await acceptFileProposal({ fileId: f.id, rawTags: f.tags, proposalId: proposal.id, areas: payload.areas }); await refetchAll(); }}
                                onReject={async () => { setPanelId(null); if (proposal.processing_state === "ready") await rejectFileProposal(proposal.id); else await dismissFileProposal(proposal); await proposals.refetch(); }}
                                onDismiss={async () => { setPanelId(null); await dismissFileProposal(proposal); await proposals.refetch(); }}
                              />
                            </td>
                          </tr>
                        ) : null}
                        {gated && confirmId === f.id ? (
                          <tr key={`${f.id}-confirm`} data-testid="inputs-archive-confirm" {...{ [OPERATOR_MARK.attr]: "archive-confirm" }}>
                            <td colSpan={4}>
                              <DeleteConfirmPanel row={row} deleting={deletingId === f.id} onClose={() => setConfirmId(null)} onConfirm={(mode) => { void archiveFile(f, mode); }} />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {gated && archived.length > 0 ? (
            <div className="fr-ws-archived" {...{ [OPERATOR_MARK.attr]: "archived" }} data-testid="inputs-archived">
              <button type="button" className="fr-ws-table-link fr-mono" aria-expanded={showArchived} onClick={() => setShowArchived((v) => !v)} data-testid="inputs-archived-toggle">
                {archived.length} {archived.length === 1 ? WORKSPACE_STRINGS.archivedFilesSingular : WORKSPACE_STRINGS.archivedFilesPlural}
              </button>
              {showArchived ? (
                <ul className="fr-ws-archived-list">
                  {archived.map((f) => (
                    <li key={f.id} data-testid="inputs-archived-row">
                      <span className="fr-ws-table-name">{f.file_name}</span>
                      <button type="button" className="fr-ws-control fr-mono" onClick={async () => { await restore.mutateAsync({ id: f.id }); await refetchAll(); }} data-testid="inputs-restore">{WORKSPACE_STRINGS.restore}</button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </WorkspaceHeroPage>
  );
}
