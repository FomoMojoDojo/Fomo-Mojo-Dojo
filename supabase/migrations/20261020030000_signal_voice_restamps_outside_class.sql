-- R45 (operator ruling 2026-10-20): the speaker judge can send a first-person row BACK to outside_voice_about_client
-- (a third party saying "we"). The restamp audit's new-class check, written for demotions toward client / competitor
-- voice only, gains outside_voice_about_client. Reversible: re-create the constraint without it once no row carries it.
alter table public.signal_voice_restamps drop constraint signal_voice_restamps_new_voice_class_check;
alter table public.signal_voice_restamps add constraint signal_voice_restamps_new_voice_class_check
  check (new_voice_class = any (array['client_voice'::text, 'competitor_voice'::text, 'outside_voice_about_client'::text]));
