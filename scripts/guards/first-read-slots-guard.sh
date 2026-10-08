#!/usr/bin/env bash
# ── SHORT-FORM SLOTS GUARD — slice 1 (rulings R1-R7, signed 2026-10-05) ─────────────────────────
#
# WHY THIS GUARD EXISTS. A slot is a SHORTER restatement of a read that a client is shown as the
# company's own commitment. Three things can go wrong, and none of them is visible in the UI:
#   * a slot says MORE than the read it compresses (an invented claim, presented as signed);
#   * a slot outlives the read it was checked against (the Edgewood 913b716a shape, one layer up);
#   * a slot reaches a reader who should not see it, or an unsigned slot renders as signed.
#
# Checks (affirmative, PLANT unset):
#   (s1) the ONLY writer of first_read_slots is the slot generator. No src/ file writes it, and the
#        grant layer makes that structural: authenticated holds SELECT only, so a browser client
#        cannot insert one even as an admin.
#   (s2) every CURRENT slot carries a judge_verdict whose every slot entry accepted.
#   (s3) every CURRENT slot's citations are a SUBSET of its source field's citations on the source
#        read — the deterministic check, re-run against live rows rather than trusted from the run.
#   (s4) no CURRENT slot points at a non-current source_read_id (the R6 rule).
#   (s4b) the R6 TRIGGER exists on public_reads and is ENABLED. The rule in (s4) is only ever true
#        because this trigger enforces it in the same transaction; without it (s4) passes right up
#        until the first read is superseded. (s4) is the invariant, (s4b) is its enforcement.
#   (s5) every CURRENT slot is SIGNED (signed_at and signed_by both present).
#   (s6) who-you-serve slots are LOCAL-ONLY — model_provider and judge model must never be external.
#        HOLDS VACUOUSLY TODAY (slice 3 is unbuilt, zero rows), so its plant inserts the row that
#        would break it: a who_you_serve slot stamped external_openai.
#   (s7) anon holds NOTHING on first_read_slots and authenticated holds at most SELECT, and the table
#        has RLS ON (so it never joins the 29-table RLS-off exemption that grants-guard g3 polices).
#   (s8) 1a-4 (2026-10-07): every CURRENT slot line carries a source_class. HOLDS VACUOUSLY TODAY
#        (zero current slots), so its plant stamps a current slot and strips one line's class.
#
# Plants. Every check has one, and each plant must make its OWN check red.
#   PLANT=srcwriter     a src/ file gains a first_read_slots write            => (s1) red
#   PLANT=judgereject   a current slot's verdict flips to accept:false        => (s2) red
#   PLANT=addcitation   a current slot gains a citation its source lacks      => (s3) red
#   PLANT=stalesource   the source read is superseded WITH THE TRIGGER OFF    => (s4) + (s4b) red
#   PLANT=unsigned      a current slot's signature is cleared                 => (s5) red
#   PLANT=wysexternal   a who_you_serve slot stamped external_openai          => (s6) red
#   PLANT=anongrant     anon gains SELECT on first_read_slots                 => (s7) red
#   PLANT=unclassedslot a seeded current slot line loses its source_class     => (s8) red
#
# Every DB plant runs inside ONE ROLLED-BACK transaction. The src/ plant is made on a byte-checked
# copy and restored md5-identical. No company's rows are changed.
#
# Run:  bash scripts/guards/first-read-slots-guard.sh
#       PLANT=stalesource bash scripts/guards/first-read-slots-guard.sh
set -uo pipefail
cd "$(dirname "$0")/../.."
PGC=${PGC:-supabase_db_dzlgyxcvuwiulgifbmew}
PLANT="${PLANT:-}"

psqlq() { docker exec -i "$PGC" psql -U postgres -d postgres -At -c "$1" </dev/null; }

# ── the src/ plant target and its restore contract ──────────────────────────────────────────────
SRCFILE="src/views/client/firstReadPreview/useFirstReadPreviewData.ts"
md5_of() { md5 -q "$1" 2>/dev/null || md5sum "$1" | cut -d' ' -f1; }
[ -f "$SRCFILE" ] || { echo "guard: FAIL missing $SRCFILE"; exit 1; }
MD5_SRC_BEFORE=$(md5_of "$SRCFILE")
TOUCHED=""
restore_src() {
  for f in $TOUCHED; do [ -f "$f.guardbak" ] && mv -f "$f.guardbak" "$f"; done
  local now; now=$(md5_of "$SRCFILE")
  if [ "$now" != "$MD5_SRC_BEFORE" ]; then
    echo "  FAIL (restore) $SRCFILE did not come back ($MD5_SRC_BEFORE -> $now) — FIX BY HAND"; return 1
  fi
  [ -z "$(find src -name '*.guardbak' 2>/dev/null)" ] || { echo "  FAIL (restore) a .guardbak was left behind"; return 1; }
  echo "  ok   (restore) $SRCFILE is md5-identical and no .guardbak was left behind"
  return 0
}
trap 'restore_src >/dev/null 2>&1' EXIT

if [ "$PLANT" = "srcwriter" ]; then
  cp -p "$SRCFILE" "$SRCFILE.guardbak"; TOUCHED="$SRCFILE"
  printf '\n// guard plant\nexport async function __plantSlotWrite(s: { from: (t: string) => { insert: (v: unknown) => unknown } }) {\n  return s.from("first_read_slots").insert({});\n}\n' >> "$SRCFILE"
fi

fails=0
ok()  { printf '  ok   (%s) %s\n' "$1" "$2"; }
bad() { printf '  FAIL (%s) %s\n' "$1" "$2"; fails=$((fails+1)); }

# ── (s1) no src/ writer — grep for a write verb on the table in src/ ────────────────────────────
S1_HITS=$(grep -rn 'from("first_read_slots")' src/ 2>/dev/null | grep -E '\.insert\(|\.update\(|\.upsert\(|\.delete\(' || true)
if [ -n "$S1_HITS" ]; then
  bad "s1" "a src/ file writes first_read_slots: $(echo "$S1_HITS" | head -2 | tr '\n' ' ')"
else
  # and the grant layer makes it structural, not just a convention
  W=$(psqlq "select count(*) from information_schema.role_table_grants where table_schema='public' and table_name='first_read_slots' and grantee in ('anon','authenticated') and privilege_type <> 'SELECT'")
  if [ "$W" != "0" ]; then bad "s1" "anon/authenticated hold $W non-SELECT privilege(s) — a browser client could write a slot"
  else ok "s1" "no src/ file writes first_read_slots, and anon/authenticated hold no write privilege on it"; fi
fi

# ── the DB checks, in ONE rolled-back transaction ────────────────────────────────────────────────
P=""
case "$PLANT" in
  # Every plant that must corrupt a CURRENT slot runs INSIDE the DO block: with zero slot rows a
  # bare "update ... where is_current" matches nothing and the check it targets passes VACUOUSLY.
  # Each of those plants SEEDS one current, signed, verdict-bearing slot first, then breaks it —
  # the same reason (s6) inserts the row it needs rather than updating one.
  judgereject|addcitation|unsigned|wysexternal|stalesource|unclassedslot) P="";;
  anongrant)   P="grant select on table public.first_read_slots to anon;";;
  srcwriter|"") P="";;
  *) echo "guard: FAIL unknown PLANT=$PLANT"; exit 1;;
esac

OUT=$(docker exec -i "$PGC" psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 <<SQL 2>&1
BEGIN;
$P
DO \$guard\$
DECLARE
  v_n int; v_list text; v_co uuid; v_read uuid; v_slot uuid;
  v_plant text := '${PLANT}';
  v_fail int := 0;
BEGIN
  -- ── SEED: every plant that corrupts a current slot needs one to exist first ─────────────────
  IF v_plant IN ('judgereject','addcitation','unsigned','stalesource','unclassedslot') THEN
    SELECT company_id, id INTO v_co, v_read
      FROM public.public_reads WHERE is_current AND kind='strategy' LIMIT 1;
    IF v_co IS NULL THEN RAISE EXCEPTION 'guard setup: no current strategy read to seed a slot against'; END IF;
    INSERT INTO public.first_read_slots
      (company_id, kind, slots, source_read_id, model_provider, model_name, judge_model, judge_verdict, is_current, signed_at, signed_by)
    VALUES (v_co, 'strategy',
      '{"where_to_play_line":{"text":"a seeded line long enough to pass the floor","citations":[]},"how_to_win_line":{"text":"a seeded line long enough to pass the floor","citations":[]}}'::jsonb,
      v_read, 'external_openai', 'gpt-4.1-mini', 'gpt-4.1-mini',
      '{"slots":{"where_to_play_line":{"entailed":true,"vocab_ok":true,"accept":true},"how_to_win_line":{"entailed":true,"vocab_ok":true,"accept":true}}}'::jsonb,
      true, now(), '00000000-0000-4000-8000-000000000001')
    RETURNING id INTO v_slot;
  END IF;

  -- ── the per-plant corruption ────────────────────────────────────────────────────────────────
  IF v_plant = 'judgereject' THEN
    UPDATE public.first_read_slots
       SET judge_verdict = jsonb_set(judge_verdict, '{slots,how_to_win_line,accept}', 'false'::jsonb)
     WHERE id = v_slot;
  ELSIF v_plant = 'addcitation' THEN
    UPDATE public.first_read_slots
       SET slots = jsonb_set(slots, '{where_to_play_line,citations}', '["00000000-0000-4000-8000-00000000dead"]'::jsonb)
     WHERE id = v_slot;
  ELSIF v_plant = 'unsigned' THEN
    ALTER TABLE public.first_read_slots DROP CONSTRAINT first_read_slots_current_signed_check;
    UPDATE public.first_read_slots SET signed_at = NULL, signed_by = NULL WHERE id = v_slot;
  ELSIF v_plant = 'stalesource' THEN
    -- disable the R6 trigger, then supersede the seeded slot source read. (s4) sees the orphan and
    -- (s4b) sees the disabled trigger: the invariant AND its enforcement, both red from one plant.
    ALTER TABLE public.public_reads DISABLE TRIGGER first_read_slots_supersede_on_read_change;
    UPDATE public.public_reads SET is_current = false WHERE id = v_read;
  ELSIF v_plant = 'wysexternal' THEN
    SELECT company_id INTO v_co FROM public.public_reads WHERE is_current LIMIT 1;
    INSERT INTO public.first_read_slots
      (company_id, kind, slots, source_read_id, model_provider, model_name, judge_model, is_current)
    VALUES (v_co, 'who_you_serve', '{"groups":[]}'::jsonb, NULL, 'external_openai', 'gpt-4.1-mini', 'gpt-4.1-mini', false);
  END IF;

  -- ── (s2) the containment verdict on every current slot accepted every slot ───────────────────
  SELECT count(*), coalesce(string_agg(DISTINCT kind||':'||e.key, ', '),'-') INTO v_n, v_list
    FROM public.first_read_slots s, jsonb_each(coalesce(s.judge_verdict->'slots','{}'::jsonb)) e
   WHERE s.is_current AND coalesce((e.value->>'accept')::boolean, false) IS NOT TRUE;
  IF v_n <> 0 THEN
    RAISE NOTICE '  FAIL (s2) % current slot entr(y/ies) were not accepted by the containment judge: %', v_n, left(v_list,300);
    v_fail := v_fail + 1;
  ELSE
    SELECT count(*) INTO v_n FROM public.first_read_slots WHERE is_current AND judge_verdict IS NULL;
    IF v_n <> 0 THEN
      RAISE NOTICE '  FAIL (s2) % current slot(s) carry NO judge_verdict at all', v_n; v_fail := v_fail + 1;
    ELSE
      SELECT count(*) INTO v_n FROM public.first_read_slots WHERE is_current;
      RAISE NOTICE '  ok   (s2) all % current slot(s) carry a containment verdict that accepted every slot', v_n;
    END IF;
  END IF;

  -- ── (s3) a slot cites only what its own source field cites ───────────────────────────────────
  SELECT count(*), coalesce(string_agg(DISTINCT s.kind||':'||f.field, ', '),'-') INTO v_n, v_list
    FROM public.first_read_slots s
    JOIN public.public_reads r ON r.id = s.source_read_id
    CROSS JOIN LATERAL (VALUES
      ('category_context','market_category_citations'),
      ('where_to_play_line','where_to_play_citations'),
      ('how_to_win_line','how_to_win_citations')) AS f(field, srccit)
    CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(s.slots->f.field->'citations','[]'::jsonb)) c(cit)
   WHERE s.is_current
     AND NOT (c.cit IN (SELECT jsonb_array_elements_text(coalesce(r.payload->f.srccit,'[]'::jsonb))));
  IF v_n <> 0 THEN
    RAISE NOTICE '  FAIL (s3) % slot citation(s) are not held by the source field: % -- a slot may cite fewer than its source, never more', v_n, left(v_list,300);
    v_fail := v_fail + 1;
  ELSE
    SELECT count(*) INTO v_n
      FROM public.first_read_slots s
      JOIN public.public_reads r ON r.id = s.source_read_id
      CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.slots->'differentiators','[]'::jsonb)) WITH ORDINALITY d(line, ord)
      CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(d.line->'citations','[]'::jsonb)) c(cit)
     WHERE s.is_current AND s.kind='positioning'
       AND NOT (c.cit IN (SELECT jsonb_array_elements_text(coalesce(r.payload->'unique_attributes'->(d.ord::int-1)->'citations','[]'::jsonb))));
    IF v_n <> 0 THEN
      RAISE NOTICE '  FAIL (s3) % differentiator citation(s) are not held by their own unique_attributes entry', v_n; v_fail := v_fail + 1;
    ELSE
      SELECT count(*), coalesce(string_agg(DISTINCT s.kind||':'||e.key, ', '),'-') INTO v_n, v_list
        FROM public.first_read_slots s, jsonb_each(s.slots) e
       WHERE s.is_current
         AND e.key NOT IN ('differentiators','category_context','where_to_play_line','how_to_win_line','groups');
      IF v_n <> 0 THEN
        RAISE NOTICE '  FAIL (s3) % unrecognised slot field(s) on a current slot: % -- an undeclared field is unchecked by definition', v_n, left(v_list,300);
        v_fail := v_fail + 1;
      ELSE
        RAISE NOTICE '  ok   (s3) every current slot cites only what its own source field cites, and carries no undeclared field';
      END IF;
    END IF;
  END IF;

  -- ── (s4) no current slot points at a non-current read (the R6 rule) ──────────────────────────
  SELECT count(*), coalesce(string_agg(DISTINCT s.kind, ', '),'-') INTO v_n, v_list
    FROM public.first_read_slots s LEFT JOIN public.public_reads r ON r.id = s.source_read_id
   WHERE s.is_current AND s.kind <> 'who_you_serve' AND coalesce(r.is_current, false) IS NOT TRUE;
  IF v_n <> 0 THEN
    RAISE NOTICE '  FAIL (s4) % current slot(s) point at a non-current source read (%) -- the slot layer outlived its source', v_n, left(v_list,300);
    v_fail := v_fail + 1;
  ELSE
    RAISE NOTICE '  ok   (s4) no current slot points at a superseded or missing source read';
  END IF;

  -- ── (s4b) the R6 trigger exists AND is enabled (the enforcement behind s4) ───────────────────
  SELECT count(*) INTO v_n FROM pg_trigger
   WHERE tgrelid = 'public.public_reads'::regclass
     AND tgname = 'first_read_slots_supersede_on_read_change' AND NOT tgisinternal;
  IF v_n <> 1 THEN
    RAISE NOTICE '  FAIL (s4b) the R6 supersede trigger is MISSING from public_reads -- (s4) would pass until the first read is superseded';
    v_fail := v_fail + 1;
  ELSE
    SELECT count(*) INTO v_n FROM pg_trigger
     WHERE tgrelid = 'public.public_reads'::regclass
       AND tgname = 'first_read_slots_supersede_on_read_change' AND NOT tgisinternal AND tgenabled <> 'D';
    IF v_n <> 1 THEN
      RAISE NOTICE '  FAIL (s4b) the R6 supersede trigger is DISABLED on public_reads'; v_fail := v_fail + 1;
    ELSE
      RAISE NOTICE '  ok   (s4b) the R6 supersede trigger exists on public_reads and is enabled';
    END IF;
  END IF;

  -- ── (s5) a current slot is a signed slot ─────────────────────────────────────────────────────
  SELECT count(*) INTO v_n FROM public.first_read_slots
   WHERE is_current AND (signed_at IS NULL OR signed_by IS NULL);
  IF v_n <> 0 THEN
    RAISE NOTICE '  FAIL (s5) % current slot(s) are UNSIGNED -- an unsigned slot must never render as a signed short form', v_n;
    v_fail := v_fail + 1;
  ELSE
    RAISE NOTICE '  ok   (s5) every current slot carries both signature columns';
  END IF;

  -- ── (s6) who-you-serve slots are local-only ──────────────────────────────────────────────────
  SELECT count(*) INTO v_n FROM public.first_read_slots
   WHERE kind = 'who_you_serve'
     AND (model_provider = 'external_openai' OR judge_model = 'gpt-4.1-mini' OR model_name = 'gpt-4.1-mini');
  IF v_n <> 0 THEN
    RAISE NOTICE '  FAIL (s6) % who_you_serve slot(s) were produced on the EXTERNAL lane -- their inputs are internal signal content and must never reach OpenAI', v_n;
    v_fail := v_fail + 1;
  ELSE
    SELECT count(*) INTO v_n FROM public.first_read_slots WHERE kind='who_you_serve';
    RAISE NOTICE '  ok   (s6) all % who_you_serve slot(s) are local-only (slice 3 unbuilt; the rule holds for the rows that exist)', v_n;
  END IF;

  -- ── (s7) grants + RLS ────────────────────────────────────────────────────────────────────────
  SELECT count(*), coalesce(string_agg(grantee||':'||privilege_type, ', '),'-') INTO v_n, v_list
    FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='first_read_slots'
     AND (grantee='anon' OR (grantee='authenticated' AND privilege_type <> 'SELECT'));
  IF v_n <> 0 THEN
    RAISE NOTICE '  FAIL (s7) first_read_slots grants are wrong (%): % -- anon must hold nothing and authenticated at most SELECT', v_n, left(v_list,300);
    v_fail := v_fail + 1;
  ELSE
    SELECT count(*) INTO v_n FROM pg_class WHERE oid='public.first_read_slots'::regclass AND relrowsecurity;
    IF v_n <> 1 THEN
      RAISE NOTICE '  FAIL (s7) first_read_slots has RLS OFF -- it would join the RLS-off set grants-guard (g3) polices'; v_fail := v_fail + 1;
    ELSE
      RAISE NOTICE '  ok   (s7) anon holds nothing, authenticated holds at most SELECT, and RLS is ON';
    END IF;
  END IF;

  -- ── (s8) 1a-4: every CURRENT slot line carries a source class ────────────────────────
  -- A line with no class cannot be rendered under 1a-4: the reader would be shown a commitment with
  -- no statement of whose words it is. Source-class-guard (c4) polices the wider PROMOTABLE set
  -- (current + staged) and the no-stronger-than-source rule; this one is the current-only invariant
  -- that belongs beside the rest of the slot layer.
  SELECT count(*), coalesce(string_agg(left(x.slot_id::text,8)||':'||x.field, ', '),'-') INTO v_n, v_list
    FROM (SELECT s.id AS slot_id, t.k AS field
            FROM public.first_read_slots s CROSS JOIN LATERAL jsonb_each(s.slots) t(k,v)
           WHERE s.is_current AND jsonb_typeof(t.v)='object' AND NOT (t.v ? 'source_class')) x;
  IF v_n <> 0 THEN
    RAISE NOTICE '  FAIL (s8) % current slot line(s) carry no source_class -- %', v_n, left(v_list,300);
    v_fail := v_fail + 1;
  ELSE
    SELECT count(*) INTO v_n FROM public.first_read_slots WHERE is_current;
    IF v_n = 0 THEN RAISE NOTICE '  ok   (s8) vacuous -- no current slot row exists (the rule holds for the rows that exist)';
    ELSE RAISE NOTICE '  ok   (s8) every line of all % current slot row(s) carries a source class', v_n; END IF;
  END IF;

  IF v_fail = 0 THEN RAISE NOTICE 'GUARD DB GREEN'; END IF;
END
\$guard\$;
ROLLBACK;
SQL
)

echo "$OUT" | sed -n 's/^NOTICE:  //p'
if ! echo "$OUT" | grep -q 'GUARD DB GREEN'; then
  echo "$OUT" | grep -E 'GUARD-FAIL|ERROR|FATAL' | head -6
  fails=$((fails+1))
fi

# the rolled-back transaction must have put everything back
TRIG=$(psqlq "select tgenabled from pg_trigger where tgrelid='public.public_reads'::regclass and tgname='first_read_slots_supersede_on_read_change'")
[ "$TRIG" = "O" ] || bad "z" "the R6 trigger did not come back enabled after the ROLLBACK (tgenabled=$TRIG)"
ANONG=$(psqlq "select count(*) from information_schema.role_table_grants where table_schema='public' and table_name='first_read_slots' and grantee='anon'")
[ "$ANONG" = "0" ] || bad "z" "anon holds $ANONG grant(s) on first_read_slots after the ROLLBACK"
[ "$fails" != 0 ] || ok "z" "the R6 trigger is enabled and anon holds nothing after the ROLLBACK"

trap - EXIT
restore_src || fails=$((fails+1))
[ "$fails" = 0 ] || { echo "guard: FAIL"; exit 1; }
echo "guard: PASS"
