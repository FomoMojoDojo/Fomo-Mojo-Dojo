#!/usr/bin/env bash
# ── DISCOVERY E3 GUARD — E3 + rulings 1, 2, 4 (operator rulings 2026-10-21) ───────────────────────────────────────────
#
# probe: scripts/guards/discovery-e3-probe.ts — a SEEDED subject only (a guard checks invariants, never a live company's
# rows); the one database step (a real model_calls row via the web_search ledger) inside ONE rolled-back transaction; no
# network, no model. The guard ends by proving model_calls and signals are what they were.
#
#   d1  parity: the seed alone ⇒ no crawl filter, no extra crawl, no entity pass, no prompt line; the domain prompt is the
#       ruling-1 citations fixture (2026-10-21) byte-for-byte; the query plan is A–H
#   d2  the crawl's set filter admits the related hosts (subdomains included) and nothing else
#   d3  the site mint stamps raw_payload.entity + voice_authority own_domain_related on a related page; a seed page's row is
#       byte-identical to the mint without an entity resolver
#   d4  one `site:<host> "<name>"` pass per entity, 16 results each
#   d5  the prompt names the entities exactly once, right after the anchor line, as the SAME business (never "exclude")
#   d6  the date rule: a merged_into 2026-08-20 host is not own on 2026-08-01, is from 2026-08-20
#   d7  ruling 2: spectrum.dev is refused on a domain plan as a fallback origin and as a guessed profile's link; public-
#       baseline gates both (the fallback origin filter, the slug-guess fetch)
#   d8  ruling 1: each web_search call site (public-baseline-search, competitor-discovery, generate-normative-jobmap)
#       requires a ledger, writes its row before parse and on a failed request; a real model_calls row (rolled back)
#       carries web_search_requests and usd; an unwritable row refuses
#   d9  ruling 4: a summary excerpt is blanked (claim_text kept, basis websearch_cited_text), an excerpt inside a cited span
#       becomes that span, an analysis row keeps its text; public-baseline hands the spans to ingest
#   d10 ruling 2 (fill brief): a guessed profile counts zero at the early ambiguous check on a domain plan; wired
#   d11 the spend cap: an unpriced model under a cap is refused before any request (stubbed fetch: 0 calls); an affordable
#       call passes, an over-cap one refuses; public-baseline checks before each web_search attempt, the lane, the OpenAI path
#   d12 the seed-host lane runs only when the own-site crawl read 0 seed pages; wired on that count
#   d13 ruling 3: gpt-4.1 priced — the routed beats call is sent under a cap when it fits (stubbed fetch: 1 call)
#   d14 ruling 1: citations become the rows — uncited sentences and excluded hosts mint nothing; the stored excerpt is the
#       citation's cited_text byte-for-byte end to end (mapper + mint guard), and on the seed lane; both lanes wired
#   d15 re-run 2 ruling 1: citation entries are never capped (the rest keep 24); public-baseline caps through capEvidenceLedger
#   d16 ruling 2: a placeholder profile snippet is refused, never appended
#   d17 ruling 4: 40k/search projection covers run 83's $1.4597 call; its lane is refused after it under $1.50; ceiling $2.25
#   d18 ruling 3: the lane-only entry runs the lane alone (no main call, crawl, search, ingest), before the query plan
#
# Plants (each injected live, the guard RED with the measured value moved, restored md5-identical, GREEN):
#   Q1  crawlHostFilter always null (the set filter → single host)      => d2 filter_set true → false
#   Q2  the site mint drops the entity spread                           => d3 related_entity "ZZ Parent Holdings" → null
#   Q3  entityQueryPasses emits a pass with no entity                   => d1 entity_passes 0 → 1
#   Q4  entityPromptLine emits a line with no entity                    => d1 prompt_is_fixture true → false
#   Q5  discoveryHostsFor ignores the run's date                        => d6 before gains zz-merged.test
#   Q6  public-baseline's domain-plan fallback gate removed             => d7 gate_fallback true → false
#   Q7  callClaudeWebSearch's pre-parse ledger removed                  => d8 public-baseline-search ledger_before_parse → false
#   Q8  the ruling-4 branch keeps the summary as the excerpt            => d9 summary_excerpt "" → the summary
#   F1  countsAtEarlyAmbiguousCheck counts a guess                       => d10 guess_domain false → true
#   F2  assertSpendable's unpriced refusal removed                       => d11 fetches_made 0 → 1
#   F3  seedLaneShouldRun ignores the seed page count                    => d12 seed_page_read false → true
#   R1  the gpt-4.1 price removed                                        => d13 gpt41_sent_under_cap 1 → 0 (refused)
#   R2  citationEntries mints an uncited sentence                        => d14 uncited_rows 0 → >0
#   R3  the entry's cited_text replaced by the model's sentence           => d14 byte_equal true → false
#   R4  citationEntries' excluded-host check removed                     => d14 excluded_rows 0 → 1
#   S1  capEvidenceLedger caps citation entries                          => d15 cited_kept 42 → 24
#   S2  isPlaceholderProfileSnippet admits the default line              => d16 default_refused true → false
#   S3  WEB_SEARCH_INPUT_TOKENS_PER_SEARCH back to 10k                   => d17 projection_covers_actual true → false
#   S4  the lane-only block makes the main web_search call               => d18 forbidden [] → [callClaudeWebSearch(]
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.deno/bin:$PATH"
DB=supabase_db_dzlgyxcvuwiulgifbmew
psql() { docker exec -i "$DB" psql -U postgres -d postgres -Atc "$1"; }
fail() { echo "FAIL step $1: $2"; exit 1; }
counts() { psql "select (select count(*) from model_calls)||'|'||(select count(*) from signals)"; }
C0=$(counts)
J=$(NO_COLOR=1 deno run --allow-all --no-check scripts/guards/discovery-e3-probe.ts 2>/dev/null | tail -1)
q() { echo "$J" | python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
[ -n "$J" ] || fail probe "no output"

[ "$(q "d['d1']==dict(has_related=False,crawl_filter_null=True,related_seeds=0,entity_passes=0,prompt_line_empty=True,prompt_is_fixture=True,plan_keys=8)")" = True ] || fail d1 "parity: $(q "d['d1']")"
echo "d1. seed alone: no crawl filter, no extra crawl, 0 entity passes, no prompt line; domain prompt = the ruling-1 citations fixture; plan A–H"
[ "$(q "d['d2']['filter_set'] and d['d2']['admits']==[True,True,True] and d['d2']['refuses']==[False,False,False]")" = True ] || fail d2 "set filter: $(q "d['d2']")"
echo "d2. the crawl's set filter admits www.zz-parent.test, news.zz-merged.test, the seed; refuses zz-subject.dev, evil.test, zz-parent.test.evil.test"
[ "$(q "d['d3']['minted']==2 and d['d3']['related_entity']=='ZZ Parent Holdings' and d['d3']['related_authority']=='own_domain_related' and d['d3']['seed_row_identical']")" = True ] || fail d3 "mint stamp: $(q "d['d3']")"
echo "d3. site mint: the related page carries entity $(q "d['d3']['related_entity']") / $(q "d['d3']['related_authority']"); the seed page's row is byte-identical to the no-resolver mint"
[ "$(q "d['d4']['passes']==[['site:zz-parent.test \"ZZ Parent Holdings\"',16],['site:zz-merged.test \"ZZ Merged Cable\"',16]]")" = True ] || fail d4 "passes: $(q "d['d4']")"
echo "d4. one site: pass per entity, 16 results each"
[ "$(q "d['d5']==dict(inserted_once_after_anchor=True,says_same_business=True,says_exclude=False)")" = True ] || fail d5 "prompt: $(q "d['d5']")"
echo "d5. the prompt names the entities once, after the anchor line, as the same business"
[ "$(q "d['d6']['before']==['zz-subject.test','zz-parent.test'] and d['d6']['on']==['zz-subject.test','zz-parent.test','zz-merged.test']")" = True ] || fail d6 "date rule: $(q "d['d6']")"
echo "d6. merged_into 2026-08-20: not own on 2026-08-01, own from 2026-08-20"
[ "$(q "d['d7']==dict(fallback_spectrum_dev=False,guessed_profile_spectrum_dev=False,guessed_profile_own=True,gate_fallback=True,gate_guess=True)")" = True ] || fail d7 "ruling 2: $(q "d['d7']")"
echo "d7. ruling 2: spectrum.dev refused as a fallback origin and as a guessed profile's link; public-baseline gates both"
[ "$(q "all(v==dict(tools=1,required=True,ledger_before_parse=True,refuses_failed_http=True) for v in d['d8']['sites'].values()) and len(d['d8']['sites'])==3 and d['d8']['row']['web_search_requests']==9 and d['d8']['row']['usd']=='0.300000' and d['d8']['row']['call_site']=='public-baseline-search' and d['d8']['refused_unledgered']")" = True ] || fail d8 "ruling 1: $(q "d['d8']")"
echo "d8. ruling 1: 3 web_search sites ledger before parse and on a failed request; a real row (rolled back): 9 searches, usd 0.30; unwritable ⇒ refused"
[ "$(q "d['d9']['summary_excerpt']=='' and d['d9']['summary_claim_kept'] and d['d9']['summary_basis']=='websearch_cited_text' and d['d9']['in_span']=='ZZ Subject serves 41 towns and prices plans from \$30 a month.' and d['d9']['analysis_kept'] and d['d9']['wired']")" = True ] || fail d9 "ruling 4: $(q "d['d9']")"
echo "d9. ruling 4: a summary excerpt blanked (claim kept), an excerpt inside a cited span becomes the span, analysis kept; wired into ingest"
[ "$(q "d['d10']==dict(guess_domain=False,guess_name_only=True,searx_domain=True,wired=True)")" = True ] || fail d10 "early check: $(q "d['d10']")"
echo "d10. a guessed profile counts zero at the early ambiguous check on a domain plan (name-only unchanged); wired"
[ "$(q "d['d11']==dict(unpriced_refused=True,fetches_made=0,affordable_passes=True,over_refused=True,wired_search=True,wired_lane=True,wired_openai=True)")" = True ] || fail d11 "spend cap: $(q "d['d11']")"
echo "d11. spend cap: an unpriced model refused before any request (0 fetches); \$0.40 + \$0.96 ≤ \$1.50 passes, \$0.60 + \$0.96 refused; wired at web_search, lane, OpenAI"
[ "$(q "d['d12']==dict(zero_seed_pages=True,seed_page_read=False,no_public_site=False,wired=True)")" = True ] || fail d12 "seed lane gate: $(q "d['d12']")"
echo "d12. the seed-host lane runs only on 0 seed pages read (a related host's pages are not seed pages); wired"
[ "$(q "d['d13']==dict(gpt41_sent_under_cap=1)")" = True ] || fail d13 "gpt-4.1 price: $(q "d['d13']")"
echo "d13. gpt-4.1 priced (ruling 3): the routed beats call is sent under the cap when it fits"
[ "$(q "d['d14']==dict(rows=1,uncited_rows=0,excluded_rows=0,byte_equal=True,lane_rows=1,lane_byte_equal=True,wired_main=True,wired_lane=True)")" = True ] || fail d14 "citation rows: $(q "d['d14']")"
echo "d14. ruling 1: citations become the rows — uncited and excluded mint nothing; cited_text byte-equal end to end and on the lane; both lanes wired"
[ "$(q "d['d15']==dict(cited_kept=42,others_kept=24,wired=True)")" = True ] || fail d15 "citation cap: $(q "d['d15']")"
echo "d15. citation entries never capped (42 kept; the other 30 keep 24); wired"
[ "$(q "d['d16']==dict(default_refused=True,empty_refused=True,linked_refused=True,page_words_kept=True,wired=True)")" = True ] || fail d16 "placeholder: $(q "d['d16']")"
echo "d16. placeholder profile snippets refused, page words kept; wired before the append"
[ "$(q "d['d17']['projection_covers_actual'] and d['d17']['main_refused_under_1_50'] and d['d17']['lane_refused_after_main'] and d['d17']['clamp']==[2.25,0.5]")" = True ] || fail d17 "projection: $(q "d['d17']")"
echo "d17. 40k/search projection covers run 83's \$1.4597 call; the lane after it refused under \$1.50; caps clamp to \$2.25"
[ "$(q "d['d18']==dict(found=True,runs_lane=True,forbidden=[],before_plan=True,gate=True,cap_required=True)")" = True ] || fail d18 "lane-only: $(q "d['d18']")"
echo "d18. the lane-only entry runs the lane alone (no main call, crawl, search or ingest), gated on 0 seed pages, cap required"
[ "$(q "d['rolled_back']")" = True ] && [ "$(counts)" = "$C0" ] || fail end "model_calls or signals changed across the guard"
echo "end. model_calls / signals unchanged ($C0)"
echo "GUARD OK"
