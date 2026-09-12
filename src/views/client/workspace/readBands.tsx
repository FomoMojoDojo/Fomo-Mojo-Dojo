// Read-page band contents (comp port 2b): numbered cells in 1–3 columns — a lime numeral above a
// bold title with an optional body (P:227-236, P:279-288), or a compact numbered list row with a
// faint numeral and hairline (P:243-252, P:347-356). Numerals are display-only CSS counters (the
// same law as the hanging list) — never DOM text.
import type { ReactNode } from "react";

export function NumberedCells({ items, columns, compact = false }: {
  items: ReadonlyArray<string | { title: string; body?: string | null }>;
  columns: 1 | 2 | 3;
  compact?: boolean;
}) {
  return (
    <ol className={`fr-ws-cells${compact ? " fr-ws-cells--compact" : ""}`} data-fr-cols={columns}>
      {items.map((it, i) => {
        const title = typeof it === "string" ? it : it.title;
        const body = typeof it === "string" ? null : it.body;
        return (
          <li key={`${title}-${i}`} className="fr-ws-cell">
            <span className="fr-ws-cell-num fr-mono" aria-hidden="true" />
            <div className="fr-ws-cell-body">
              <p className="fr-ws-cell-title">{title}</p>
              {body ? <p className="fr-ws-cell-text">{body}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function ReadFoot({ children }: { children: ReactNode }) {
  return <p className="fr-ws-readfoot fr-mono">{children}</p>;
}
