// Inputs (Hero frame): inputs + files via useInputs — the same read InputsTab makes. Body: brief 2.
import { useCompany } from "@/hooks/useCompany";
import { useInputs } from "@/hooks/useInputs";
import { NumberedList } from "@/views/client/firstReadPreview/primitives";
import { HangingItem } from "@/views/client/firstReadPreview/primitives-editorial";
import { WorkspaceAbsent } from "./absent";
import { WorkspaceHeroPage } from "./WorkspaceHeroPage";
import { WORKSPACE_STRINGS, pageLabel } from "./workspaceNav";

export default function InputsPage() {
  const { activeCompany } = useCompany();
  const { query } = useInputs(activeCompany?.id);
  const inputs = query.data ?? [];
  return (
    <WorkspaceHeroPage eyebrow={pageLabel("inputs")} title={WORKSPACE_STRINGS.heroInputs} accent={WORKSPACE_STRINGS.heroInputsAccent}>
      {query.isLoading ? null : inputs.length === 0 ? (
        <WorkspaceAbsent what="inputs" />
      ) : (
        <ol className="fr-hanging-list fr-stagger">
          {inputs.map((it) => (
            <HangingItem key={it.id} title={it.input_label} muted={it.status === "not_started"} meta={it.files.length > 0 ? String(it.files.length) : undefined}>
              <span data-fr-group-key={it.group_key} data-fr-status={it.status} aria-hidden="true" />
              {it.files.length > 0 ? <NumberedList items={it.files.map((f) => f.file_name)} className="mt-3" /> : null}
            </HangingItem>
          ))}
        </ol>
      )}
    </WorkspaceHeroPage>
  );
}
