#!/usr/bin/env bash
# THE TEXT-ONLY NOTE — IR6 (signed 2026-10-01). Needs no database and no server.
#
# WHY THIS GUARD EXISTS. Eight client-facing strings report an absence. Some are about THE COMPANY
# ("Nothing we've read so far speaks to this", "Scanned {date} — none found") and were honest only
# while nothing could read an image; some are about OUR OWN COLLECTION STATE ("No scan yet", "No
# outside signals collected yet") and are unaffected, because nothing was read at all. The note
# belongs on the first kind and must stay off the second — and it must appear ONCE per section, from
# ONE constant. Each of those is a check below, shown RED under a named plant and GREEN after, with
# the restore proven by md5.
#
# Checks:
#   (a) every site that renders a silence string also renders the note.
#   (b) the note text is IMPORTED, never copied.
#   (c) the note renders once per section — never per row.
#   (d) the note is absent from the collection-state strings (NO_SIGNALS_NOTE, InputsTab, "No scan yet").
#   (e) the note is not markable and carries no mark control.
#   (f) IR6 Finding 1 (2026-10-03): each of the preview read's FOUR looked-and-found-nothing lines
#       carries the note, gated on its OWN looked-none branch; the *_COULDNT lines stay bare.
#
# Plants (each undone by the EXIT trap, which then re-verifies by md5):
#   PLANT=sectionbare    the say-vs-see group drops the note                        => (a) red
#   PLANT=copiednote     the note text is hard-coded in the export                  => (b) red
#   PLANT=perrow         the note moves inside the row loop                         => (c) red
#   PLANT=collectionnote the note is added beside "No scan yet."                    => (d) red
#   PLANT=markable       the note gains a mark anchor                               => (e) red
#   PLANT=previewbare    one of the four preview-read lines loses its note          => (f) red
#   PLANT=couldntnote    a *_COULDNT line gains the note                            => (f) red
#   PLANT=previewungated the note renders on EVERY branch, not just looked-none     => (f) red
#   PLANT=signalsnote    the note is added beside NO_SIGNALS_NOTE                   => (d) red
#
# Run:  bash scripts/guards/silence-note-guard.sh
#       PLANT=perrow bash scripts/guards/silence-note-guard.sh
set -uo pipefail
HERE="$(cd "$(dirname "$0")/../.." && pwd)"
CONST="$HERE/src/lib/firstRead/sayVsSee.ts"
EXHIBIT="$HERE/src/components/client-view/story/check/SayVsSeeExhibit.tsx"
FEATURED="$HERE/src/components/client-view/story/check/FeaturedExhibitCard.tsx"
ROW="$HERE/src/components/client-view/story/check/DeltaItemRow.tsx"
EXPORT="$HERE/src/lib/firstRead/exportHtml.ts"
PANELS="$HERE/src/views/client/workshop/tabs/OutsidePanels.tsx"
ACTS="$HERE/src/views/client/firstReadPreview/acts.tsx"
INPUTS="$HERE/src/views/client/workshop/tabs/InputsTab.tsx"
ACTS_TSX="$ACTS"   # IR6 Finding 1 — the preview read's four looked-none lines
PLANT="${PLANT:-}"
fails=0
ok()  { printf '  ok   (%s) %s\n' "$1" "$2"; }
bad() { printf '  FAIL (%s) %s\n' "$1" "$2"; fails=$((fails+1)); }

for f in "$CONST" "$EXHIBIT" "$FEATURED" "$ROW" "$EXPORT" "$PANELS" "$ACTS" "$INPUTS"; do
  [ -f "$f" ] || { echo "guard: FAIL missing $f"; exit 1; }
done

# The signed note, held here ONCE so the guard itself cannot drift from the constant.
NOTE_TEXT="We read text only. Words inside images, such as flyers, aren't read yet."

md5_of() { md5 -q "$1" 2>/dev/null || md5sum "$1" | cut -d' ' -f1; }
MANIFEST="$(mktemp -t silence-note-guard)"
TOUCHED=""
for f in "$CONST" "$EXHIBIT" "$FEATURED" "$ROW" "$EXPORT" "$PANELS" "$ACTS" "$INPUTS"; do
  printf '%s  %s\n' "$(md5_of "$f")" "$f" >> "$MANIFEST"
done
restore() {
  printf '%s\n' "$TOUCHED" | while IFS= read -r f; do
    [ -n "$f" ] && [ -f "$f.guardbak" ] && mv -f "$f.guardbak" "$f"
  done
  local drift=0
  while read -r want path; do
    [ -n "$path" ] || continue
    [ "$(md5_of "$path")" = "$want" ] || drift=1
  done < "$MANIFEST"
  local strays; strays="$(find "$HERE/src" "$HERE/scripts" -name '*.guardbak' 2>/dev/null | wc -l | tr -d ' ')"
  rm -f "$MANIFEST"
  if [ "$drift" = 0 ] && [ "$strays" = 0 ]; then
    ok "restore" "every file in the manifest is md5-identical to the start of the run; no .guardbak left behind"
  else
    bad "restore" "a plant outlived the run (md5 drift=$drift strays=$strays) — FIX BY HAND"
  fi
}
trap restore EXIT
plant() { cp -p "$1" "$1.guardbak"; TOUCHED="$TOUCHED
$1"; perl -0777 -pi -e "$2" "$1"; }

case "$PLANT" in
  sectionbare)    plant "$EXHIBIT" 's{\{groupShowsSilence\(g\.key.*?\n.*?\n\s*\)\}}{}s' ;;
  copiednote)     plant "$EXPORT"  's{\$\{esc\(TEXT_ONLY_NOTE\)\}}{We read text only. Words inside images, such as flyers, aren\x27t read yet.}' ;;
  perrow)         plant "$ROW"     's{(import \{ SAY_LABEL, SEE_LABEL, SILENT_SEE_LINE \} from "\@/lib/firstRead/sayVsSee";)}{import { SAY_LABEL, SEE_LABEL, SILENT_SEE_LINE, TEXT_ONLY_NOTE } from "\@/lib/firstRead/sayVsSee";}; s{(<p className="cvs-delta-text is-silent">\{SILENT_SEE_LINE\}</p>)}{$1<p data-text-only-note>{TEXT_ONLY_NOTE}</p>}' ;;
  collectionnote) plant "$PANELS"  's{(<p>No scan yet\.</p>)}{$1<p data-text-only-note>{TEXT_ONLY_NOTE}</p>}' ;;
  markable)       plant "$EXHIBIT" 's{(<p className="cvs-saysee-bridge") (data-text-only-note>\{TEXT_ONLY_NOTE\})}{$1 data-fr-mark-kind="delta" data-fr-mark-key="note" $2}' ;;
  # IR6 Finding 1 plants — the preview read.
  previewbare)    plant "$ACTS"    's{\n\s*<TextOnlyNote show=\{read\.gapIntegrity === "looked_none"\} />}{}' ;;
  couldntnote)    plant "$ACTS"    's{(\? GAP_COULDNT_CHECK_NOTE)}{$1 /* plant */}; s{(show=\{read\.gapIntegrity === )"looked_none"(\})}{$1"couldnt_check"$2}' ;;
  previewungated) plant "$ACTS"    's{if \(!show\) return null;}{if (false) return null;}' ;;
  signalsnote)    plant "$ACTS"    's{<Absent>\{NO_SIGNALS_NOTE\}</Absent>}{<Absent>{NO_SIGNALS_NOTE}<TextOnlyNote show={true} /></Absent>}' ;;
  "") : ;;
  *) echo "guard: FAIL unknown PLANT=$PLANT"; exit 1 ;;
esac

# ── (a) every silence site renders the note ───────────────────────────────────────────────────────
# The three sites that render a silence string about the COMPANY, each of which must carry the note.
missing=""
grep -q 'data-text-only-note' "$EXHIBIT"  || missing="$missing SayVsSeeExhibit"
grep -q 'data-text-only-note' "$FEATURED" || missing="$missing FeaturedExhibitCard"
grep -q 'data-text-only-note' "$EXPORT"   || missing="$missing exportHtml"
grep -q 'data-text-only-note' "$PANELS"   || missing="$missing OutsidePanels"
if [ -z "$missing" ]; then
  ok "a" "every site that renders a silence string about the company also renders the note"
else
  bad "a" "silence rendered with no note in:$missing"
fi

# ── (b) one constant, imported everywhere ─────────────────────────────────────────────────────────
# The literal may appear ONCE in the repo — in the constant's own declaration. Anywhere else is a copy.
LITERAL_HITS="$(grep -rF "$NOTE_TEXT" "$HERE/src" | grep -v '\.test\.' | wc -l | tr -d ' ')"
DECL_OK=0; grep -q "export const TEXT_ONLY_NOTE" "$CONST" && DECL_OK=1
IMPORTERS="$(grep -rl 'TEXT_ONLY_NOTE' "$HERE/src" --include='*.ts' --include='*.tsx' | grep -v 'firstRead/sayVsSee.ts' | grep -v '\.test\.' | wc -l | tr -d ' ')"
if [ "$LITERAL_HITS" = "1" ] && [ "$DECL_OK" = "1" ] && [ "$IMPORTERS" -ge 4 ]; then
  ok "b" "the note text appears once (its declaration) and $IMPORTERS site(s) import it — never copied"
else
  bad "b" "note text literal appears $LITERAL_HITS time(s) outside tests (expected 1); declaration=$DECL_OK importers=$IMPORTERS"
fi

# ── (c) once per section, never per row ───────────────────────────────────────────────────────────
# The row components render ONE item each; a note there would repeat per row.
rowleak=""
grep -q 'TEXT_ONLY_NOTE' "$ROW" && rowleak="$rowleak DeltaItemRow"
# The exhibit and the export each hold ONE group template rendered per group, so exactly one note
# occurrence each means one per section. (OutsidePanels is NOT counted here: its empty states are
# separate return branches, not sections of one render, so a note in the wrong branch is (d)'s job.)
for f in "$EXHIBIT" "$EXPORT"; do
  n="$(grep -c 'data-text-only-note' "$f")"
  [ "$n" -gt 1 ] && rowleak="$rowleak $(basename "$f")(x$n)"
done
if [ -z "$rowleak" ]; then
  ok "c" "the note renders once per section — not in the per-row component, and never twice in a section"
else
  bad "c" "the note repeats per row or per section in:$rowleak"
fi

# ── (d) collection-state strings take no note ─────────────────────────────────────────────────────
# acts.tsx (NO_SIGNALS_NOTE) and InputsTab must not carry it at all; OutsidePanels carries it ONLY in
# the scanned-none-found branch, never beside "No scan yet." or the didn't-complete branch.
dleak=""
# acts.tsx DOES carry the note now (IR6 Finding 1, the four looked-none lines) — so the test is not
# "absent from the file" but "never beside a collection-state line". NO_SIGNALS_NOTE must stay a
# single-child <Absent>: nothing was read there, so "text only" is not the limitation.
NS_TOTAL="$(grep -c 'NO_SIGNALS_NOTE}' "$ACTS")"
NS_BARE="$(grep -c '<Absent>{NO_SIGNALS_NOTE}</Absent>' "$ACTS")"
[ "$NS_TOTAL" = "$NS_BARE" ] || dleak="$dleak acts.tsx(NO_SIGNALS_NOTE: $NS_BARE of $NS_TOTAL still bare)"
grep -q 'TEXT_ONLY_NOTE' "$INPUTS" && dleak="$dleak InputsTab"
# the note must sit AFTER "none found" and BEFORE the "No scan yet" branch in the file
if grep -q 'TEXT_ONLY_NOTE' "$PANELS"; then
  # Match the JSX, not the prose: this file's header comment names all three empty states, and a
  # bare grep picks the comment line instead of the branch it describes.
  # EVERY note occurrence must sit inside the scanned-none-found branch — after its sentence and
  # before the next branch's "No scan yet." — and there must be exactly one.
  NONE_LINE="$(grep -n '<p>Scanned {when} — none found\.</p>' "$PANELS" | head -1 | cut -d: -f1)"
  NOSCAN_LINE="$(grep -n '<p>No scan yet\.</p>' "$PANELS" | head -1 | cut -d: -f1)"
  NOTE_N="$(grep -c 'data-text-only-note' "$PANELS")"
  [ "$NOTE_N" = "1" ] || dleak="$dleak OutsidePanels($NOTE_N notes, expected 1)"
  for L in $(grep -n 'data-text-only-note' "$PANELS" | cut -d: -f1); do
    if [ "$L" -lt "$NONE_LINE" ] || [ "$L" -gt "$NOSCAN_LINE" ]; then
      dleak="$dleak OutsidePanels(note at line $L is outside the scanned-none-found branch)"
    fi
  done
fi
if [ -z "$dleak" ]; then
  ok "d" "collection-state strings carry no note — nothing was read, so 'text only' is not the limit"
else
  bad "d" "the note reached a collection-state string:$dleak"
fi

# ── (e) not markable, no mark control ─────────────────────────────────────────────────────────────
# A marked node carries data-fr-mark-kind / data-fr-mark-key or .fr-mark-target (FM15).
mleak=""
for f in "$EXHIBIT" "$FEATURED" "$PANELS" "$EXPORT"; do
  if perl -0777 -ne 'exit 1 unless /data-text-only-note/; my @l = /([^\n]*data-text-only-note[^\n]*)/g; for (@l) { exit 0 if /data-fr-mark|fr-mark-target|CheckControl/ } exit 1' "$f"; then
    mleak="$mleak $(basename "$f")"
  fi
done
if [ -z "$mleak" ]; then
  ok "e" "the note carries no mark anchor and no mark control — it is not markable (FM15)"
else
  bad "e" "the note is markable in:$mleak"
fi

# ── (f) IR6 Finding 1 — the preview read's four looked-and-found-nothing lines ────────────────────
# Each line gets the note, gated on ITS OWN looked-none branch. The four gates are spelled out so a
# copy-paste that points two sections at one integrity field cannot pass.
fleak=""
for g in 'read\.findingsIntegrity === "looked_none"' \
         'read\.gapIntegrity === "looked_none"' \
         'read\.openQuestionsIntegrity === "looked_none"' \
         'read\.ownWordsWriteCompleted'; do
  n="$(grep -cE "<TextOnlyNote show=\{$g\} />" "$ACTS_TSX")"
  [ "$n" = "1" ] || fleak="$fleak [${g%% *}=$n]"
done
# The helper must stay gated — a note that renders on every branch would qualify the COULDNT lines
# too. Scoped to the helper's OWN body: `if (!show) return null;` also appears elsewhere in this
# file, and a file-wide grep passed while the helper itself was ungated.
HELPER="$(perl -0777 -ne 'print $1 if /(function TextOnlyNote\(.*?\n\})/s' "$ACTS_TSX")"
printf '%s' "$HELPER" | grep -q 'if (!show) return null;' || fleak="$fleak [helper-ungated]"
# and no *_COULDNT line may sit on a note-bearing gate
if grep -nE 'show=\{read\.[a-zA-Z]+ === "couldnt_check"\}' "$ACTS_TSX" | grep -q .; then
  fleak="$fleak [couldnt-gated]"
fi
if [ -z "$fleak" ]; then
  ok "f" "all four preview-read looked-none lines carry the note on their own gate; the COULDNT lines stay bare"
else
  bad "f" "preview-read note coverage wrong:$fleak"
fi

if [ "$fails" -eq 0 ]; then echo "guard: PASS"; else echo "guard: FAIL"; fi
[ "$fails" -eq 0 ]
