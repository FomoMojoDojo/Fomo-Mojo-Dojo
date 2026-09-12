// Inputs (comp port 2b — P:71-106, fr tokens). Reads:
//   Signal basis     signals by band — useSignalLandscape (byBand.outside/organization/customer.count),
//                    the home's chips verbatim: "PUBLIC n / TEAM n / CUSTOMERS n" (HomepageHierarchyFR:187-189)
//   integration      input_files (useCompanyFiles) + their __area:* tags (readAreaSupportTags) → assigned
//                    files / all files; "Partially integrated" renders only when 0 < assigned < all (the
//                    other states have no signed word)
//   counters         Evidence files = useCompanyFiles count; Customer tensions mapped = odi_needs count
//                    (useOdiNeeds, company-wide); Directional routes = routes level=route (useRoutes)
//   Upload file      InputsTab's upload writes (useUploadInputFile) and is inline there — operator-gated
//                    link to that surface
//   table            Type / snippet = file_name (useCompanyFiles); Areas = foundation labels read back from
//                    the file's __area:* tags, the InputsTab map (AREA_KEY_TO_FOUNDATION); Analysis = the
//                    InputsTab vocabulary from file_proposals (useFileProposals): no proposal → Run analysis;
//                    ready + pending → Review proposal; accepted → Analysis ready; queued/running/failed have
//                    no signed word → no chip. Source column: no read path — omitted (and the type filter).
//   View file        getFileSignedUrl(file_path) — the InputsTab read (useInputs.ts:510)
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useCompany } from "@/hooks/useCompany";
import { useCompanyFiles, type CompanyFileRow } from "@/hooks/useCompanyFiles";
import { useFileProposals, type FileProposalRow } from "@/hooks/useFileProposals";
import { getFileSignedUrl } from "@/hooks/useInputs";
import { useOdiNeeds } from "@/hooks/useOdiNeeds";
import { useRoutes } from "@/hooks/useRoutes";
import { useSignalLandscape } from "@/hooks/useSignalLandscape";
import { readAreaSupportTags } from "@/lib/fileTags";
import { CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE } from "@/lib/clientRefinePreview";
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
/** The InputsTab vocabulary for a file's analysis state; null when no signed word applies. */
function analysisStatus(p: FileProposalRow | undefined): { label: string; tone: ChipTone } | null {
  if (!p) return { label: WORKSPACE_STRINGS.runAnalysis, tone: "neutral" };
  if (p.processing_state !== "ready") return null;
  if (p.status === "accepted") return { label: WORKSPACE_STRINGS.analysisReady, tone: "good" };
  return { label: WORKSPACE_STRINGS.reviewProposal, tone: "warn" };
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

  const rows = files.data ?? [];
  const proposalByFile = useMemo(() => {
    const m = new Map<string, FileProposalRow>();
    for (const p of proposals.data ?? []) if (!m.has(p.file_id)) m.set(p.file_id, p); // newest first (hook order)
    return m;
  }, [proposals.data]);
  const assigned = rows.filter((f) => areasOf(f).length > 0).length;
  const routeCount = routes.filter((r) => (r.level ?? "route") === "route").length;
  const counts = landscape ? { pub: landscape.byBand.outside.count, team: landscape.byBand.organization.count, cust: landscape.byBand.customer.count } : null;

  const openFile = async (f: CompanyFileRow) => {
    const url = await getFileSignedUrl(f.file_path);
    window.open(url, "_blank", "noopener");
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

          {operator ? (
            <div className="fr-ws-addinput" {...{ [OPERATOR_MARK.attr]: "upload" }}>
              <p className="fr-ws-sectionlabel fr-mono">
                <span className="fr-ws-sectionlabel-num">{WORKSPACE_STRINGS.add}</span>
                <span className="fr-ws-sectionlabel-slash">/</span>
                <span>{WORKSPACE_STRINGS.input}</span>
              </p>
              <Link to={`${CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE}?tab=inputs`} className="fr-ws-control fr-mono">{WORKSPACE_STRINGS.uploadFile}</Link>
            </div>
          ) : null}

          <div className="fr-ws-tablewrap" data-fr-region="files">
            {rows.length === 0 ? (
              <WorkspaceAbsent what="files" />
            ) : (
              <table className="fr-ws-table" data-testid="inputs-table">
                <thead className="fr-mono">
                  <tr>
                    <th>{WORKSPACE_STRINGS.colTypeSnippet}</th>
                    <th>{WORKSPACE_STRINGS.colAreas}</th>
                    <th>{WORKSPACE_STRINGS.colAnalysis}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((f) => {
                    const status = analysisStatus(proposalByFile.get(f.id));
                    const areas = areasOf(f);
                    return (
                      <tr key={f.id} data-testid="inputs-file-row">
                        <td>
                          <span className="fr-ws-table-name">{f.file_name}</span>
                          <button type="button" className="fr-ws-table-link fr-mono" onClick={() => { void openFile(f); }}>{WORKSPACE_STRINGS.viewFile}</button>
                        </td>
                        <td className="fr-ws-table-areas">{areas.join(" · ")}</td>
                        <td>{status ? <Chip tone={status.tone}>{status.label}</Chip> : null}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </WorkspaceHeroPage>
  );
}
