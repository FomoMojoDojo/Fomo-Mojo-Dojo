// The revisit prompt (commit 4 of 4, ruling FM12 revised, 2026-09-22). OPERATOR ONLY — the caller renders this
// solely when operatorControls is non-null, and the wrapper carries the operator attribute, so the default
// (client) render of the first read is unchanged and still holds zero [data-fr-operator] nodes (R1, R2).
//
// One prompt per read, at page level. It lists every mark whose row no longer matches and has not already been
// reconciled against this very state (the fire rule lives in ./revisit, pure and unit-tested). Grouped by beat in
// beat order; each entry names its beat, says why it fired, shows the words AS MARKED and — when the row is still
// there — the words it NOW READS, and offers Keep or Remove for that one mark. Keep all / Remove all sit on top.
// An entry leaves the moment it resolves; the prompt leaves when the last one does.
//
// Keep  → keep_first_read_mark(mark, against): remembered, so the same question is not asked again until the row
//         changes AGAIN. Remove → the existing permanent withdraw, with the revisit reason (R5). No other write.
import { useCallback, useMemo, useState } from "react";
import { MARK_STRINGS, WITHDRAW_REASON_REVISIT } from "./strings";
import type { MarkWrite } from "./useFirstReadMarks";
import type { RevisitEntry } from "./revisit";

export type RevisitPromptProps = {
  entries: readonly RevisitEntry[];
  /** The beat's own nav label and its reading position — no new string, no new order. */
  beatLabel: (key: string) => string;
  beatIndex: (key: string) => number;
  keep: (markId: string, against: string) => Promise<MarkWrite>;
  withdraw: (markId: string, reason: string) => Promise<MarkWrite>;
  /** The operator attribute this page marks its operator nodes with. */
  markAttr: string;
  markValue: string;
};

export function RevisitPrompt({ entries, beatLabel, beatIndex, keep, withdraw, markAttr, markValue }: RevisitPromptProps) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const groups = useMemo(() => {
    const byBeat = new Map<string, RevisitEntry[]>();
    for (const e of entries) byBeat.set(e.mark.beat_key, [...(byBeat.get(e.mark.beat_key) ?? []), e]);
    return [...byBeat.entries()]
      .sort(([a], [b]) => beatIndex(a) - beatIndex(b))
      .map(([key, list]) => ({ key, label: beatLabel(key), entries: list }));
  }, [entries, beatIndex, beatLabel]);

  // One resolution, or a run of them. A failure stops the run and shows S6 — nothing half-done is hidden.
  const run = useCallback(async (jobs: ReadonlyArray<() => Promise<MarkWrite>>) => {
    if (busy) return;
    setBusy(true); setFailed(false);
    for (const job of jobs) {
      const r = await job();
      if (!r.ok) { setFailed(true); break; }
    }
    setBusy(false);
  }, [busy]);

  const keepJob = (e: RevisitEntry) => () => keep(e.mark.id, e.against);
  const removeJob = (e: RevisitEntry) => () => withdraw(e.mark.id, WITHDRAW_REASON_REVISIT);

  if (entries.length === 0) return null;
  return (
    <aside className="fr-revisit" data-testid="revisit-prompt" {...{ [markAttr]: markValue }}>
      <div className="fr-revisit-head">
        <p className="fr-eyebrow" data-testid="revisit-title">{MARK_STRINGS.revisitTitle}</p>
        <div className="fr-revisit-allactions">
          <button type="button" className="fr-ws-control fr-mono" disabled={busy} data-testid="revisit-keep-all"
            onClick={() => { void run(entries.map(keepJob)); }}>{MARK_STRINGS.keepAll}</button>
          <button type="button" className="fr-ws-control fr-mono" data-fr-tone="danger" disabled={busy} data-testid="revisit-remove-all"
            onClick={() => { void run(entries.map(removeJob)); }}>{MARK_STRINGS.removeAll}</button>
        </div>
      </div>
      {failed ? <p className="fr-revisit-failed" data-testid="revisit-failed">{MARK_STRINGS.saveFailed}</p> : null}
      {groups.map((g) => (
        <section key={g.key} className="fr-revisit-group" data-fr-revisit-beat={g.key}>
          <p className="fr-revisit-beat fr-mono">{g.label}</p>
          <ol className="fr-revisit-list">
            {g.entries.map((e) => (
              <li key={e.mark.id} className="fr-revisit-entry" data-testid="revisit-entry" data-fr-revisit-entry={e.mark.id} data-fr-revisit-state={e.state}>
                <p className="fr-revisit-why">{e.state === "row_gone" ? MARK_STRINGS.rowGone : MARK_STRINGS.wordingChanged}</p>
                <p className="fr-revisit-label fr-mono">{MARK_STRINGS.asMarked}</p>
                <p className="fr-revisit-text" data-testid="revisit-as-marked">{e.mark.anchor_text}</p>
                {e.state === "wording_changed" && e.currentText !== null ? (
                  <>
                    <p className="fr-revisit-label fr-mono">{MARK_STRINGS.nowReads}</p>
                    <p className="fr-revisit-text" data-testid="revisit-now-reads">{e.currentText}</p>
                  </>
                ) : null}
                <div className="fr-revisit-actions">
                  <button type="button" className="fr-ws-control fr-mono" disabled={busy} data-testid="revisit-keep"
                    onClick={() => { void run([keepJob(e)]); }}>{MARK_STRINGS.keep}</button>
                  <button type="button" className="fr-ws-control fr-mono" data-fr-tone="danger" disabled={busy} data-testid="revisit-remove"
                    onClick={() => { void run([removeJob(e)]); }}>{MARK_STRINGS.remove}</button>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </aside>
  );
}
