// Home view interaction-spec panel — relocated verbatim from ClientRefinePreviewView (strand 3b batch 5).
export function SpecPanel({ specOpen }: { specOpen: boolean }) {
  return (
            <aside className={`crpv-spec-panel ${specOpen ? "open" : ""}`}>
              <h4>Layer stack</h4>
              <p>Command defaults. Map and Narrative are progressive disclosure layers. Drawers expose context on demand.</p>
              <h4>Keyboard</h4>
              <p>M map · N narrative · Esc command · 1-4 open context.</p>
            </aside>
  );
}
