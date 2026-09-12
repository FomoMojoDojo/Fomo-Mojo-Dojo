// INPUT ACTIONS — the write bodies MOVED from InputsTab.tsx (Inputs Tier 1 lift, 2026-09-11): the
// analyze invoke and the proposal accept / reject / dismiss updates. Same edge function, same tables,
// same payloads as before — InputsTab now calls these from its state wrappers (InputsTab.lift.test.tsx
// proves the arguments are unchanged) and the workspace Inputs page calls the same functions. No new
// write path exists (Option B holds per control).
import { supabase } from "@/integrations/supabase/client";
import type { FileProposalRow } from "@/hooks/useFileProposals";
import { applyAreaTags, FOUNDATION_AREA_TO_AREA_KEY, type FoundationArea } from "@/views/client/workshop/inputsShared";

export type DifyAnalyzeInput = {
  fileId: string;
  filePath: string;
  fileName: string;
  fileType: string;
  companyId: string;
  /** "uploaded_file" for a plain file row, else the row's own type (e.g. "intake"). */
  sourceType: string;
};

/** InputsTab.handleDifyAnalyze's invoke, verbatim: dify-analyze-file with the same body; throws on failure. */
export async function runDifyAnalyzeFile(input: DifyAnalyzeInput): Promise<void> {
  const { data, error } = await supabase.functions.invoke("dify-analyze-file", {
    body: {
      fileId:     input.fileId,
      filePath:   input.filePath,
      fileName:   input.fileName,
      fileType:   input.fileType,
      companyId:  input.companyId,
      sourceType: input.sourceType,
    },
  });
  if (error || (data as Record<string, unknown> | null)?.error) {
    throw new Error("Dify analysis failed");
  }
}

/** InputsTab.handleAcceptProposal's writes, verbatim: area tags onto the file, then the proposal accepted. */
export async function acceptFileProposal(args: { fileId: string; rawTags: string[] | null; proposalId: string; areas: FoundationArea[] }): Promise<void> {
  // Apply area tags to the source file. Structured proposal items remain
  // review-only until full apply flows exist for the expanded schema.
  if (args.areas.length > 0) {
    const newTags = applyAreaTags(args.rawTags, args.areas);
    await supabase.from("input_files").update({ tags: newTags }).eq("id", args.fileId);
  }
  await supabase.from("file_proposals").update({
    status:        "accepted",
    applied_areas: args.areas.map((a) => FOUNDATION_AREA_TO_AREA_KEY[a]),
    reviewed_at:   new Date().toISOString(),
  }).eq("id", args.proposalId);
}

/** InputsTab.handleRejectProposal's write for a ready proposal, verbatim. */
export async function rejectFileProposal(proposalId: string): Promise<void> {
  await supabase.from("file_proposals").update({
    status:      "rejected",
    reviewed_at: new Date().toISOString(),
  }).eq("id", proposalId);
}

/** InputsTab.handleDismissProposal's writes, verbatim (queued/running → failed + rejected; else rejected). */
export async function dismissFileProposal(proposal: FileProposalRow): Promise<void> {
  if (proposal.processing_state === "queued" || proposal.processing_state === "running") {
    await supabase.from("file_proposals").update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      processing_state: "failed",
      processing_error: proposal.processing_error || "Dismissed after timeout/stale run.",
      processing_completed_at: new Date().toISOString(),
    }).eq("id", proposal.id);
  } else {
    await supabase.from("file_proposals").update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
    }).eq("id", proposal.id);
  }
}

/** InputsTab.handleDeleteFile's unlink write, verbatim ("Remove file and unlink"): needs sourced from the
 *  archived file lose their source_path. The archive itself is useArchiveInputFile (useInputs). */
export async function unlinkNeedsFromFilePath(filePath: string): Promise<void> {
  await supabase.from("odi_needs").update({ source_path: "" }).eq("source_path", filePath);
}
