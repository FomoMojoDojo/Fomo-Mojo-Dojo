// The workspace's empty state: the Absent primitive with NO text. No signed empty-state string exists
// for these pages yet (the First Read's are beat-specific), and no new client-visible string may be
// introduced here — so an empty read is marked structurally (data-fr-absent) and the box stands empty.
import { Absent } from "@/views/client/firstReadPreview/primitives";

export function WorkspaceAbsent({ what }: { what: string }) {
  return (
    <Absent>
      <span data-fr-absent={what} aria-hidden="true" />
    </Absent>
  );
}
