-- 'withheld' — the drift state for an assessment we DECLINED to make (SP-108, SP-111; 2026-11-12).
--
-- WHY. assess-surface-drift put every active signal of a company into an OpenAI prompt with no
-- band, voice or provenance filter and no router. Containment routes it: a surface whose new-signal
-- evidence contains one non-public row (an uploaded document's `organization` signal, say) is no
-- longer judged by an outside model. The function has no local lane to fall back to, so the model
-- step is WITHHELD — and a withheld assessment must say so rather than claim a verdict.
--
-- 'aligned' was the only state the old CHECK would have allowed such a row to carry, and writing
-- 'aligned' for an assessment nobody made is the silent partial that display honesty forbids.
--
-- Additive and reversible: no row is read, written or backfilled. Every existing row satisfies all
-- three constraints below (they all carry one of the original three states and a non-null score).
alter table public.surface_drift_assessments
  drop constraint check_drift_state,
  add constraint check_drift_state
    check (drift_state = any (array['aligned'::text, 'slight_drift'::text, 'material_drift'::text, 'withheld'::text]));

-- A withheld row carries NO score: there is no number, and 0 would read as "no drift".
alter table public.surface_drift_assessments
  alter column drift_score drop not null;

-- SP-111: the two facts are one fact. Only a withheld row may lack a score, and a withheld row may
-- never carry one — so no caller can smuggle a scoreless verdict in under another state, or a
-- withheld row in with a score that a reader would then plot.
alter table public.surface_drift_assessments
  add constraint check_withheld_has_no_score
    check ((drift_state = 'withheld') = (drift_score is null));
