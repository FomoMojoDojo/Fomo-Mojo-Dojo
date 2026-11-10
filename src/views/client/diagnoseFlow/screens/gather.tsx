// DIAGNOSE · THE EIGHT GATHER SCREENS (W1, W2, W4–W9). One file because they are one shape: the
// WalkScreen shell with a different read behind it. NO STRING LITERALS — every word comes from
// strings.ts, which the census checks against docs/diagnose-slice1-spec.md.
//
// NO NUMBER IS TYPED. Every count on these screens is computed from useDiagnoseData's rows or
// omitted (spec's display-honesty line, G3).
import { useNavigate } from "react-router-dom";
import { OperatorControlsContext, type OperatorControls } from "@/views/client/firstReadPreview/operatorControls";
import { OPERATOR_MARK, OPERATOR_STRINGS } from "@/views/client/firstReadPreview/operatorStrings";
import { useContext, type ReactNode } from "react";
import { clientRefineDiagnosePath, type DiagnoseScreen } from "@/lib/clientRefinePreview";
import { CLIENT_REFINE_PREVIEW_FIRSTREAD_BASE } from "@/lib/clientRefinePreview";
import { Chip, ItemRow, SubLine } from "../items";
import { Composer, Headline, ScoreBlock, WalkScreen, usePageState } from "../walk";
import { W1, W2, W4, W5, W6, W7, W8, W9, WALK, joinList } from "../strings";
import {
  countSegments, formatDate,
  type DiagnoseData, type DiagnoseDocument, type DiagnoseMarketGroup,
} from "../useDiagnoseData";

/** The nine walk steps, in signed order. Welcome is step 1; there is no w3. */
export const WALK_ORDER: readonly DiagnoseScreen[] = ["welcome", "w1", "w2", "w4", "w5", "w6", "w7", "w8", "w9"];

export type ScreenProps = { data: DiagnoseData; companyId: string };

function useWalkNav(companyId: string, screen: DiagnoseScreen) {
  const navigate = useNavigate();
  const i = WALK_ORDER.indexOf(screen);
  return {
    index: i,
    total: WALK_ORDER.length,
    onBack: () => {
      if (i <= 0) { navigate(`${CLIENT_REFINE_PREVIEW_FIRSTREAD_BASE}/${companyId}`); return; }
      navigate(clientRefineDiagnosePath(companyId, WALK_ORDER[i - 1]));
    },
    onNext: () => {
      if (i >= WALK_ORDER.length - 1) { navigate(clientRefineDiagnosePath(companyId, "home")); return; }
      navigate(clientRefineDiagnosePath(companyId, WALK_ORDER[i + 1]));
    },
  };
}

/** Rows plus the operator-state plumbing every gather screen shares. */
function useRows(screen: string) {
  const page = usePageState(screen);
  return {
    page,
    rowProps: (id: string, index: number) => ({
      index,
      decision: page.state.decisions[id] ?? null,
      onKeep: () => page.decide(id, "keep"),
      onFix: () => { page.decide(id, "fix"); page.startFix(index); },
    }),
  };
}

/** Lines the operator added in page state, rendered with the signed source. */
function AddedRows({
  screen, startIndex, keepLabel, fixLabel,
}: { screen: string; startIndex: number; keepLabel: string; fixLabel: string }) {
  const { page, rowProps } = useRows(screen);
  return (
    <>
      {page.state.added.map((text, i) => (
        <ItemRow
          key={`added-${i}`}
          {...rowProps(`added-${i}`, startIndex + i + 1)}
          source={WALK.addedAtTheVisit}
          statement={text}
          keepLabel={keepLabel}
          fixLabel={fixLabel}
        />
      ))}
    </>
  );
}

// ── 1 of 8 · Documents ──────────────────────────────────────────────────────────────────────────

/** G5 / G6: what the accepted proposals added, or the signed nothing-yet line. */
function documentLine(doc: DiagnoseDocument, company: string): string {
  if (doc.failed) return W1.couldNotOpen;
  const parts = [
    doc.kinds.positioning ? W1.kindPositioning : null,
    doc.kinds.goals ? W1.kindGoals : null,
    doc.kinds.groups ? W1.kindGroups(company) : null,
    doc.kinds.routes ? W1.kindRoutes : null,
  ].filter((p): p is string => p !== null);
  if (parts.length === 0) return W1.addedNothingYet;
  return W1.addedList(joinList(parts));
}

export function W1Screen({ data, companyId }: ScreenProps) {
  const company = data.company ?? "";
  const nav = useWalkNav(companyId, "w1");
  const { rowProps } = useRows("w1");
  const docs = data.documents;
  // G3: a zero segment is dropped; all zero → no line.
  const segments = countSegments([
    { n: docs.length, text: W1.countDocuments(docs.length) },
    { n: docs.filter((d) => d.added).length, text: W1.countAdded(docs.filter((d) => d.added).length) },
    { n: docs.filter((d) => d.failed).length, text: W1.countFailed(docs.filter((d) => d.failed).length) },
  ]);
  return (
    <WalkScreen
      company={company} tone="base" screen="w1" score={data.score?.total_score ?? null}
      index={nav.index} total={nav.total} onBack={nav.onBack} onNext={nav.onNext}
      eyebrow={W1.eyebrow} headline={<Headline text={W1.h(company)} />} lede={W1.why(company)}
      sourceLabel={WALK.whereTheseComeFrom} sourceText={W1.source}
      patternLabel={WALK.writeItAs} pattern={W1.pattern} exampleLabel={WALK.example} example={W1.example}
      onTheMapLabel={WALK.onTheMap} countLine={segments.length > 0 ? segments.join(" · ") : null}
      backLabel={WALK.back} nextLabel={W1.next}
      composerPlaceholder={W1.composer} noneYetLabel={W1.noneYet}
    >
      {docs.map((doc, i) => (
        <ItemRow
          key={doc.id}
          {...rowProps(doc.id, i + 1)}
          source={doc.fileName}
          chips={doc.failed ? <Chip kind="need">{W1.notAdded}</Chip> : null}
          statement={documentLine(doc, company)}
          keepLabel={W1.keep} fixLabel={W1.fix}
        />
      ))}
      <AddedRows screen="w1" startIndex={docs.length} keepLabel={W1.keep} fixLabel={W1.fix} />
    </WalkScreen>
  );
}

// ── 2 of 8 · Base ───────────────────────────────────────────────────────────────────────────────

export function W2Screen({ data, companyId }: ScreenProps) {
  const company = data.company ?? "";
  const nav = useWalkNav(companyId, "w2");
  const { rowProps } = useRows("w2");
  const LABELS: Record<string, string> = {
    promise: W2.partPromise,
    positioning: W2.partPositioning,
    strategy: W2.partStrategy,
    serves: W2.partServes(company),
  };
  return (
    <WalkScreen
      company={company} tone="base" screen="w2" score={data.score?.total_score ?? null}
      index={nav.index} total={nav.total} onBack={nav.onBack} onNext={nav.onNext}
      eyebrow={W2.eyebrow} headline={<Headline text={W2.h(company)} />} lede={W2.why(company)}
      sourceLabel={WALK.whereTheseComeFrom} sourceText={W2.source(company)}
      patternLabel={WALK.writeItAs} pattern={W2.pattern(company)} exampleLabel={WALK.example} example={W2.example}
      onTheMapLabel={WALK.onTheMap}
      backLabel={WALK.back} nextLabel={W2.next}
      composerPlaceholder={W2.composer} noneYetLabel={W2.noneYet(company)}
    >
      {data.baseParts.map((part, i) => {
        // No declared side → the outside side carries the item, in the none-yet state (Stage B note).
        const statement = part.declared ?? part.outside;
        return (
          <ItemRow
            key={part.key}
            {...rowProps(part.key, i + 1)}
            source={LABELS[part.key]}
            statement={statement ?? null}
            keepLabel={W2.keep(company)} fixLabel={W2.fix}
          >
            {/* P4: both sides render, with NO mark line between them. */}
            {part.declared !== null && part.outside !== null
              ? <p className="dg-small">{part.outside}</p>
              : null}
          </ItemRow>
        );
      })}
      <AddedRows screen="w2" startIndex={data.baseParts.length} keepLabel={W2.keep(company)} fixLabel={W2.fix} />
    </WalkScreen>
  );
}

// ── 3 of 8 · Problems ───────────────────────────────────────────────────────────────────────────

export function W4Screen({ data, companyId }: ScreenProps) {
  const company = data.company ?? "";
  const nav = useWalkNav(companyId, "w4");
  const { rowProps } = useRows("w4");
  return (
    <WalkScreen
      company={company} tone="goal" screen="w4" score={data.score?.total_score ?? null}
      index={nav.index} total={nav.total} onBack={nav.onBack} onNext={nav.onNext}
      eyebrow={W4.eyebrow} headline={<Headline text={W4.h} />} lede={W4.why(company)}
      sourceLabel={WALK.whereTheseComeFrom} sourceText={W4.source}
      patternLabel={WALK.writeItAs} pattern={W4.pattern} exampleLabel={WALK.example} example={W4.example}
      onTheMapLabel={WALK.onTheMap}
      backLabel={WALK.back} nextLabel={W4.next}
      composerPlaceholder={W4.composer} noneYetLabel={W4.noneYet}
    >
      {data.problems.map((p, i) => (
        <ItemRow
          key={p.id}
          {...rowProps(p.id, i + 1)}
          source={p.source ?? ""}
          statement={p.statement}
          keepLabel={W4.keep} fixLabel={W4.fix}
        />
      ))}
      <AddedRows screen="w4" startIndex={data.problems.length} keepLabel={W4.keep} fixLabel={W4.fix} />
    </WalkScreen>
  );
}

// ── 4 of 8 · Goals ──────────────────────────────────────────────────────────────────────────────

export function W5Screen({ data, companyId }: ScreenProps) {
  const company = data.company ?? "";
  const nav = useWalkNav(companyId, "w5");
  const { rowProps } = useRows("w5");
  const fixed = data.goals.map((g) => g.fixed).filter((f): f is string => f !== null);
  return (
    <WalkScreen
      company={company} tone="goal" screen="w5" score={data.score?.total_score ?? null}
      index={nav.index} total={nav.total} onBack={nav.onBack} onNext={nav.onNext}
      eyebrow={W5.eyebrow} headline={<Headline text={W5.h(company)} />} lede={W5.why(company)}
      sourceLabel={WALK.whereTheseComeFrom} sourceText={W5.source}
      patternLabel={WALK.writeItAs} pattern={W5.pattern} exampleLabel={WALK.example} example={W5.example}
      onTheMapLabel={WALK.onTheMap}
      backLabel={WALK.back} nextLabel={W5.next}
      composerPlaceholder={W5.composer} noneYetLabel={W5.noneYet}
      extra={
        <div className="dg-walk-group dg-hairline-top">
          <span className="dg-mono">{W5.knowItWorked(company)}</span>
          <textarea className="dg-composer-input" rows={3} placeholder={W5.knowItWorkedPlaceholder} />
        </div>
      }
    >
      {data.goals.map((g, i) => (
        <ItemRow
          key={g.id}
          {...rowProps(g.id, i + 1)}
          source=""
          statement={g.statement}
          keepLabel={W5.keep} fixLabel={W5.fix}
        >
          {/* The "Today:" sub-line renders only when a start value exists — never invented. */}
          {g.todayValue ? <SubLine mark="today" label={W5.today} text={g.todayValue} /> : null}
        </ItemRow>
      ))}
      {fixed.length > 0 ? (
        <ItemRow
          {...rowProps("fixed", data.goals.length + 1)}
          source=""
          statement={W5.whatsFixed}
          keepLabel={W5.keep} fixLabel={W5.fix}
        >
          {fixed.map((f, i) => <SubLine key={i} mark="fixed" label={W5.fixedLabel} text={f} />)}
        </ItemRow>
      ) : null}
      <AddedRows screen="w5" startIndex={data.goals.length + (fixed.length > 0 ? 1 : 0)} keepLabel={W5.keep} fixLabel={W5.fix} />
    </WalkScreen>
  );
}

// ── 5 of 8 · Market ─────────────────────────────────────────────────────────────────────────────

const ROLE_CHIP: Record<string, { kind: "recipients" | "referrers" | "funders" | "partners" | "users"; label: string }> = {
  recipient: { kind: "recipients", label: W6.roleRecipients },
  referrer: { kind: "referrers", label: W6.roleReferrers },
  funder: { kind: "funders", label: W6.roleFunders },
  partner: { kind: "partners", label: W6.rolePartners },
  user: { kind: "users", label: W6.roleUsers },
};

/** OPERATOR ONLY: a market row whose relationship_kind is NULL or unmapped gets no client chip, so
 *  the operator needs to see which rows those are. Null without the context, which is what makes the
 *  default render carry zero [data-fr-operator] nodes. The word is OPERATOR_STRINGS.kindUntyped,
 *  already signed 2026-09-04 and never shown to a client. */
function OperatorRoleFlag({ row }: { row: DiagnoseMarketGroup }) {
  const ctx = useContext(OperatorControlsContext);
  if (!ctx || !row.roleUnknown) return null;
  return (
    <span className="dg-chip" data-kind="plain" {...{ [OPERATOR_MARK.attr]: "market-role-null" }}>
      {OPERATOR_STRINGS.kindUntyped}
    </span>
  );
}

export function W6Screen({ data, companyId }: ScreenProps) {
  const company = data.company ?? "";
  const nav = useWalkNav(companyId, "w6");
  const { rowProps } = useRows("w6");
  return (
    <WalkScreen
      company={company} tone="market" screen="w6" score={data.score?.total_score ?? null}
      index={nav.index} total={nav.total} onBack={nav.onBack} onNext={nav.onNext}
      eyebrow={W6.eyebrow} headline={<Headline text={W6.h(company)} />} lede={W6.why(company)}
      sourceLabel={WALK.whereTheseComeFrom} sourceText={W6.source}
      patternLabel={WALK.writeItAs} pattern={W6.pattern} exampleLabel={WALK.example} example={W6.example}
      onTheMapLabel={WALK.onTheMap}
      backLabel={WALK.back} nextLabel={W6.next}
      composerPlaceholder={W6.composer} noneYetLabel={W6.noneYet}
    >
      {data.market.map((m, i) => {
        const chip = m.role ? ROLE_CHIP[m.role] : null;
        return (
          <ItemRow
            key={m.id}
            {...rowProps(m.id, i + 1)}
            source={m.fromOutside ? W6.sourceOutside : W6.sourceDocuments(company)}
            chips={<>{chip ? <Chip kind={chip.kind}>{chip.label}</Chip> : null}<OperatorRoleFlag row={m} /></>}
            statement={m.group}
            keepLabel={W6.keep} fixLabel={W6.fix}
          >
            {m.job ? <SubLine mark="job" label={W6.tryingTo} text={m.job} /> : null}
          </ItemRow>
        );
      })}
      <AddedRows screen="w6" startIndex={data.market.length} keepLabel={W6.keep} fixLabel={W6.fix} />
    </WalkScreen>
  );
}

// ── 6 of 8 · Initiatives ────────────────────────────────────────────────────────────────────────

// N3 (Nov 9) — W7 LISTS NOTHING THE DATA CANNOT CALL UNDERWAY. The rows here were the generated
// route ideas, and Stage A measured what they are: all 15 route-level routes across both companies
// carry provenance_type public_research, no document link and no intake row, and the whole fleet
// holds zero client_attested rows. Nothing marks any of them as the company's OWN initiative, so
// the screen renders its signed empty state and waits for P8. The ideas still appear on the Ahead
// cone, where the legend says where they came from.
export function W7Screen({ data, companyId }: ScreenProps) {
  const company = data.company ?? "";
  const nav = useWalkNav(companyId, "w7");
  return (
    <WalkScreen
      company={company} tone="goal" screen="w7" score={data.score?.total_score ?? null}
      index={nav.index} total={nav.total} onBack={nav.onBack} onNext={nav.onNext}
      eyebrow={W7.eyebrow} headline={<Headline text={W7.h(company)} />} lede={W7.why(company)}
      sourceLabel={WALK.whereTheseComeFrom} sourceText={W7.source}
      patternLabel={WALK.writeItAs} pattern={W7.pattern} exampleLabel={WALK.example} example={W7.example}
      onTheMapLabel={WALK.onTheMap}
      backLabel={WALK.back} nextLabel={W7.next}
      composerPlaceholder={W7.composer} noneYetLabel={W7.noneYet}
    >
      {/* N3 — the signed empty state, until P8 marks the company's own initiatives. */}
      <span className="dg-rows-empty" data-dg-empty="w7">{W7.noneYet}</span>
      <AddedRows screen="w7" startIndex={0} keepLabel={W7.keep} fixLabel={W7.fix} />
    </WalkScreen>
  );
}

// ── 7 of 8 · Hypotheses ─────────────────────────────────────────────────────────────────────────

export function W8Screen({ data, companyId }: ScreenProps) {
  const company = data.company ?? "";
  const nav = useWalkNav(companyId, "w8");
  const { rowProps } = useRows("w8");
  return (
    <WalkScreen
      company={company} tone="market" screen="w8" score={data.score?.total_score ?? null}
      index={nav.index} total={nav.total} onBack={nav.onBack} onNext={nav.onNext}
      eyebrow={W8.eyebrow} headline={<Headline text={W8.h(company)} />} lede={W8.why(company)}
      sourceLabel={WALK.whereTheseComeFrom} sourceText={W8.source}
      patternLabel={WALK.writeItAs} pattern={W8.pattern} exampleLabel={WALK.example} example={W8.example}
      onTheMapLabel={WALK.onTheMap}
      backLabel={WALK.back} nextLabel={W8.next}
      composerPlaceholder={W8.composer} noneYetLabel={W8.noneYet}
    >
      {data.hypotheses.map((h, i) => (
        <ItemRow
          key={h.id}
          {...rowProps(h.id, i + 1)}
          source=""
          statement={h.statement}
          keepLabel={W8.keep} fixLabel={W8.fix}
        >
          <SubLine mark="wrong" label={W8.wrongIf} text={W8.wrongIfBody} />
        </ItemRow>
      ))}
      <AddedRows screen="w8" startIndex={data.hypotheses.length} keepLabel={W8.keep} fixLabel={W8.fix} />
    </WalkScreen>
  );
}

// ── 8 of 8 · Who to hear ────────────────────────────────────────────────────────────────────────

export function W9Screen({ data, companyId }: ScreenProps) {
  const company = data.company ?? "";
  const nav = useWalkNav(companyId, "w9");
  const { rowProps } = useRows("w9");
  return (
    <WalkScreen
      company={company} tone="base" screen="w9" score={data.score?.total_score ?? null}
      index={nav.index} total={nav.total} onBack={nav.onBack} onNext={nav.onNext}
      eyebrow={W9.eyebrow} headline={<Headline text={W9.h} />} lede={W9.why(company)}
      sourceLabel={WALK.whereTheseComeFrom} sourceText={W9.source(company)}
      patternLabel={WALK.writeItAs} pattern={W9.pattern} exampleLabel={WALK.example} example={W9.example}
      onTheMapLabel={WALK.onTheMap}
      backLabel={WALK.back} nextLabel={W9.next}
      composerPlaceholder={W9.composer} noneYetLabel={W9.noneYet}
    >
      {data.people.map((p, i) => {
        const date = formatDate(p.interviewedAt);
        return (
          <ItemRow
            key={p.id}
            {...rowProps(p.id, i + 1)}
            source={date ? W9.interviewSource(date) : ""}
            chips={p.name === null ? <Chip kind="need">{W9.nameNeeded}</Chip> : null}
            statement={p.name ?? p.role ?? null}
            keepLabel={W9.keep} fixLabel={W9.fix}
          />
        );
      })}
      <AddedRows screen="w9" startIndex={data.people.length} keepLabel={W9.keep} fixLabel={W9.fix} />
    </WalkScreen>
  );
}

/** Re-exported so the route table and the tests reach the same shell pieces. */
export { Composer, ScoreBlock };
export type { ReactNode };
