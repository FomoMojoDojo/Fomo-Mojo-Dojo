#!/usr/bin/env bash
# ── SOURCE CLASS GUARD — 1a-4 (operator rulings signed 2026-10-07) ──────────────────────────────
#
# WHY THIS GUARD EXISTS. The base is meant to spark discussion, so our own analysis belongs in it —
# but LABELLED as ours. The label is the whole safety property: without it an analysis row reads as
# the record, and "the sole level 14 facility in Northern California" reaches a client as a fact when
# it is our reading of a 2023 donation-platform page. Three things can go wrong invisibly:
#   * a pool row reaches a read with no class, so nothing downstream can hold it to anything;
#   * a field inherits a class and then asserts past it, and the judge's refusal is not acted on;
#   * a SLOT outlives or over-claims its source field's class (the slot layer is shown as signed).
#
# Checks (affirmative, PLANT unset):
#   (c1) every CURRENT read's input_ledger carries a `classes` map. RED ON ARRIVAL: every read in the
#        fleet predates 1a-4, so this is red until the regeneration in brief 2 — that is correct, and
#        PLANT=classesok proves the check is not stuck red.
#   (c2) in a read that HAS a classes map, every id in `ids` carries a class — no row slips through
#        half-stamped. Vacuous until (c1) is green; its plant inserts the half-stamped shape.
#   (c3) no field of a CURRENT read was refused by the judge's class check: zero entries in
#        judge_verdict->class->fields with class_ok false. Judge verdicts ONLY — rulings 3A and 3B
#        refused a deterministic phrase list and a mandatory question form, so this guard never
#        scans wording. Vacuous until (c1) is green.
#   (c4) every PROMOTABLE slot line (a row that is current or staged — not superseded) carries a
#        source_class, and that class is never STRONGER than its source field's class on the source
#        read. An unclassed promotable slot is red: it cannot be shown under 1a-4 and must be
#        regenerated. RED ON ARRIVAL on the staged Edgewood strategy slot.
#   (c5) the ledger and slot state are md5-identical after the ROLLBACK.
#
# Plants. Each makes its OWN check change colour; the two already-red checks get a GREEN plant, which
# is the only plant that proves anything about a check that is red on arrival.
#   PLANT=classesok    every current ledger gains a complete classes map   => (c1) GREEN
#   PLANT=slotclassok  the promotable slot's lines gain their source class => (c4) GREEN
#   PLANT=missingclass a classed ledger loses one id from `classes`        => (c2) red
#   PLANT=classnotok   a current read's verdict carries class_ok false     => (c3) red
#
# Every plant runs inside ONE ROLLED-BACK transaction. No company's rows are changed. No file is
# touched, so there is no .guardbak contract here.
#
# Run:  bash scripts/guards/source-class-guard.sh
#       PLANT=classesok bash scripts/guards/source-class-guard.sh
set -uo pipefail
cd "$(dirname "$0")/../.."
PGC=${PGC:-supabase_db_dzlgyxcvuwiulgifbmew}
PLANT="${PLANT:-}"

psqlq() { docker exec -i "$PGC" psql -U postgres -d postgres -At -c "$1" </dev/null; }

case "$PLANT" in
  classesok|slotclassok|missingclass|classnotok|"") ;;
  *) echo "guard: FAIL unknown PLANT=$PLANT"; exit 1;;
esac

# ── the before fingerprint, for (c5) ─────────────────────────────────────────────────────────────
FP_BEFORE=$(psqlq "select md5(string_agg(x,'|' order by x)) from (
  select id::text||coalesce(input_ledger->>'classes','-')||coalesce(judge_verdict->>'class','-') as x from public.public_reads
  union all
  select id::text||coalesce(slots::text,'-')||coalesce(superseded_reason,'-') from public.first_read_slots) z")

TMPSQL=$(mktemp -t source-class-guard)
trap 'rm -f "$TMPSQL"' EXIT
cat > "$TMPSQL" <<'GUARDSQL'
BEGIN;
DO $guard$
DECLARE
  v_n int; v_list text; v_plant text := '__PLANT__'; v_fail int := 0; v_id uuid;
BEGIN
  -- ── the plants ──────────────────────────────────────────────────────────────────────────────
  IF v_plant = 'classesok' THEN
    -- a COMPLETE map: every id in the ledger gets a class, so (c1) and (c2) both go green
    UPDATE public.public_reads pr
       SET input_ledger = jsonb_set(pr.input_ledger, '{classes}', (
             SELECT coalesce(jsonb_object_agg(e.value #>> '{}', 'record'), '{}'::jsonb)
               FROM jsonb_array_elements(pr.input_ledger->'ids') e(value)))
     WHERE pr.is_current;
  ELSIF v_plant = 'missingclass' THEN
    -- a HALF-stamped map: every id but the first
    UPDATE public.public_reads pr
       SET input_ledger = jsonb_set(pr.input_ledger, '{classes}', (
             SELECT coalesce(jsonb_object_agg(e.value #>> '{}', 'record'), '{}'::jsonb)
               FROM jsonb_array_elements(pr.input_ledger->'ids') WITH ORDINALITY e(value, n)
              WHERE e.n > 1))
     WHERE pr.is_current;
  ELSIF v_plant = 'classnotok' THEN
    SELECT id INTO v_id FROM public.public_reads WHERE is_current LIMIT 1;
    UPDATE public.public_reads
       SET input_ledger = jsonb_set(input_ledger, '{classes}', (
             SELECT coalesce(jsonb_object_agg(e.value #>> '{}', 'our_read'), '{}'::jsonb)
               FROM jsonb_array_elements(input_ledger->'ids') e(value))),
           judge_verdict = coalesce(judge_verdict,'{}'::jsonb) || jsonb_build_object('class',
             jsonb_build_object('class_ok', false, 'fields', jsonb_build_array(
               jsonb_build_object('field','how_to_win','class','our_read','class_ok',false,
                                  'reason','states our reading as an established fact'))))
     WHERE id = v_id;
  ELSIF v_plant = 'slotclassok' THEN
    -- stamp each promotable slot line with the SOURCE field class, and give the source read one
    UPDATE public.public_reads pr
       SET input_ledger = jsonb_set(pr.input_ledger, '{classes}', (
             SELECT coalesce(jsonb_object_agg(e.value #>> '{}', 'record'), '{}'::jsonb)
               FROM jsonb_array_elements(pr.input_ledger->'ids') e(value)))
     WHERE pr.id IN (SELECT source_read_id FROM public.first_read_slots WHERE superseded_reason IS NULL);
    UPDATE public.public_reads pr SET payload = pr.payload
      || jsonb_build_object('where_to_play_class','record','how_to_win_class','record','market_category_class','record')
     WHERE pr.id IN (SELECT source_read_id FROM public.first_read_slots WHERE superseded_reason IS NULL);
    UPDATE public.first_read_slots s
       SET slots = (SELECT jsonb_object_agg(k, CASE WHEN jsonb_typeof(v)='object' THEN v || '{"source_class":"record"}'::jsonb ELSE v END)
                      FROM jsonb_each(s.slots) t(k,v))
     WHERE s.superseded_reason IS NULL;
  END IF;

  -- ── (c1) every current read carries a classes map in its ledger ──────────────────────────────────
  SELECT count(*), string_agg(left(id::text,8), ', ' ORDER BY left(id::text,8))
    INTO v_n, v_list
    FROM public.public_reads
   WHERE is_current AND NOT (input_ledger ? 'classes');
  IF v_n > 0 THEN
    RAISE NOTICE '  FAIL (c1) % of % current read(s) carry NO classes map in input_ledger (predate 1a-4; regenerate) -- %',
      v_n, (SELECT count(*) FROM public.public_reads WHERE is_current),
      (SELECT count(DISTINCT company_id) FROM public.public_reads WHERE is_current AND NOT (input_ledger ? 'classes')) || ' companies';
    v_fail := v_fail + 1;
  ELSE
    RAISE NOTICE '  ok   (c1) all % current read(s) carry a classes map', (SELECT count(*) FROM public.public_reads WHERE is_current);
  END IF;

  -- ── (c2) a classed ledger classes EVERY id it read ──────────────────────────────────────────
  SELECT count(*), string_agg(DISTINCT left(pr.id::text,8), ', ')
    INTO v_n, v_list
    FROM public.public_reads pr, jsonb_array_elements(pr.input_ledger->'ids') e(value)
   WHERE pr.is_current AND pr.input_ledger ? 'classes'
     AND NOT (pr.input_ledger->'classes' ? (e.value #>> '{}'));
  IF v_n > 0 THEN
    RAISE NOTICE '  FAIL (c2) % pool row(s) in a CLASSED ledger carry no class -- read(s) %', v_n, v_list; v_fail := v_fail + 1;
  ELSE
    SELECT count(*) INTO v_n FROM public.public_reads WHERE is_current AND input_ledger ? 'classes';
    IF v_n = 0 THEN RAISE NOTICE '  ok   (c2) vacuous -- no current read carries a classes map yet (see c1)';
    ELSE RAISE NOTICE '  ok   (c2) every pool row in all % classed ledger(s) carries a class', v_n; END IF;
  END IF;

  -- ── (c3) no field was refused by the class check of the judge ────────────────────────────────────
  SELECT count(*), string_agg(DISTINCT left(pr.id::text,8)||':'||coalesce(f.value->>'field','?'), ', ')
    INTO v_n, v_list
    FROM public.public_reads pr,
         jsonb_array_elements(coalesce(pr.judge_verdict->'class'->'fields','[]'::jsonb)) f(value)
   WHERE pr.is_current AND f.value->>'class_ok' = 'false';
  IF v_n > 0 THEN
    RAISE NOTICE '  FAIL (c3) % field(s) of current read(s) were REFUSED by the class check and are stored anyway -- %', v_n, v_list; v_fail := v_fail + 1;
  ELSE
    SELECT count(*) INTO v_n FROM public.public_reads WHERE is_current AND judge_verdict ? 'class';
    IF v_n = 0 THEN RAISE NOTICE '  ok   (c3) vacuous -- no current read carries a class verdict yet (see c1)';
    ELSE RAISE NOTICE '  ok   (c3) every class-judged field of all % read(s) cleared', v_n; END IF;
  END IF;

  -- ── (c4) every PROMOTABLE slot line is classed, and never stronger than its source ──────────
  WITH rank AS (SELECT * FROM (VALUES ('our_read',0),('you',1),('record',2)) r(cls, n)),
  lines AS (
    SELECT s.id AS slot_id, s.kind, s.source_read_id, t.k AS field, t.v->>'source_class' AS line_class,
           CASE s.kind WHEN 'positioning' THEN
             CASE t.k WHEN 'differentiators' THEN NULL WHEN 'category_context' THEN pr.payload->>'market_category_class' END
           WHEN 'strategy' THEN
             CASE t.k WHEN 'where_to_play_line' THEN pr.payload->>'where_to_play_class'
                      WHEN 'how_to_win_line' THEN pr.payload->>'how_to_win_class' END END AS src_class
      FROM public.first_read_slots s
      JOIN public.public_reads pr ON pr.id = s.source_read_id
      CROSS JOIN LATERAL jsonb_each(s.slots) t(k,v)
     WHERE s.superseded_reason IS NULL AND jsonb_typeof(t.v) = 'object'
  )
  SELECT count(*), string_agg(left(slot_id::text,8)||':'||field||' ('||coalesce(line_class,'unclassed')||' vs source '||coalesce(src_class,'unclassed')||')', ', ')
    INTO v_n, v_list
    FROM lines l
   WHERE l.line_class IS NULL
      OR (l.src_class IS NOT NULL AND (SELECT n FROM rank WHERE cls = l.line_class) > (SELECT n FROM rank WHERE cls = l.src_class));
  IF v_n > 0 THEN
    RAISE NOTICE '  FAIL (c4) % promotable slot line(s) unclassed or stronger than their source -- %', v_n, v_list; v_fail := v_fail + 1;
  ELSE
    SELECT count(*) INTO v_n FROM public.first_read_slots WHERE superseded_reason IS NULL;
    IF v_n = 0 THEN RAISE NOTICE '  ok   (c4) vacuous -- no promotable slot row exists';
    ELSE RAISE NOTICE '  ok   (c4) every line of all % promotable slot row(s) is classed and no stronger than its source', v_n; END IF;
  END IF;

  IF v_fail = 0 THEN RAISE NOTICE 'GUARD DB GREEN'; ELSE RAISE NOTICE 'GUARD DB RED (% check(s))', v_fail; END IF;
END
$guard$;
ROLLBACK;
GUARDSQL
# the one substitution the block needs, applied to the file rather than scanned by the shell
perl -pi -e "s/__PLANT__/$PLANT/g" "$TMPSQL"
OUT=$(docker exec -i "$PGC" psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < "$TMPSQL" 2>&1)
echo "$OUT" | sed 's/^NOTICE:  //' | grep -E '^( +(ok|FAIL)|GUARD DB)' || { echo "guard: FAIL the DB block did not run"; echo "$OUT" | tail -20; exit 1; }

fails=$(echo "$OUT" | grep -c 'FAIL (c' || true)

# ── (c5) nothing was changed ─────────────────────────────────────────────────────────────────────
FP_AFTER=$(psqlq "select md5(string_agg(x,'|' order by x)) from (
  select id::text||coalesce(input_ledger->>'classes','-')||coalesce(judge_verdict->>'class','-') as x from public.public_reads
  union all
  select id::text||coalesce(slots::text,'-')||coalesce(superseded_reason,'-') from public.first_read_slots) z")
if [ "$FP_BEFORE" = "$FP_AFTER" ]; then
  echo "  ok   (c5) ledger classes, class verdicts and slot lines are md5-identical after the ROLLBACK"
else
  echo "  FAIL (c5) state changed ($FP_BEFORE -> $FP_AFTER) — FIX BY HAND"; fails=$((fails+1))
fi

if [ "$fails" = 0 ]; then echo "guard: PASS"; else echo "guard: RED ($fails check(s)) — see above"; fi
