// READ PAGE frame (comp port 1 — S:238-280): a slate full-bleed page; lime eyebrow; the statement
// title at the .fr-display statement scale with the lime full stop (withStop); children are ReadBand
// rows (a 10rem mono label column + content) built on the Labeled primitive. No lede slot (ruling 1).
// Reserves the cluster zone at the bottom (ruling 5).
import type { ReactNode } from "react";
import { Eyebrow } from "@/views/client/firstReadPreview/primitives";
import { Labeled, withStop } from "@/views/client/firstReadPreview/primitives-editorial";

export function ReadBand({ label, children }: { label: ReactNode; children: ReactNode }) {
  return <Labeled label={label} className="fr-ws-band">{children}</Labeled>;
}

export function WorkspaceReadPage({ eyebrow, statement, children }: {
  eyebrow: string;
  /** The page's statement — company content from the read path, or null when the read is empty. */
  statement: string | null;
  children?: ReactNode;
}) {
  return (
    <main className="fr-ws-read" data-testid="ws-read">
      <div className="fr-ws-read-inner">
        <Eyebrow>{eyebrow}</Eyebrow>
        {statement ? <h1 className="fr-display fr-ws-statement">{withStop(statement)}</h1> : null}
        {children}
      </div>
    </main>
  );
}
