-- Interview parser 4e (rulings N11 + N12, signed 2026-09-24) — RETRACTION IS FINAL, AND THE
-- OBJECTIONS ARE FIXED AT LANDING.
--
-- WHAT THIS CLOSES. The trigger guarded the words, the speaker side, the scope, the pointer, the
-- identity and the rules version, and it refused a DELETE outright — but it never mentioned
-- retracted_at or retracted_reason in either direction. A retraction could therefore be UNDONE by an
-- ordinary UPDATE, for any reason, leaving no trace: the supersession that retracted a set was
-- audited on a run row, its reversal was not. That happened on 2026-09-24 and is what N12 forbids.
--
-- N12: once retracted_at is set, neither it nor retracted_reason may go back to NULL. Nothing else
-- about retraction changes — landing a retraction is still an ordinary UPDATE, and the
-- interview_items_retraction_pair CHECK still requires the pair to move together with a reason. An
-- item that was retracted in error is superseded by a new landing, never un-retracted.
--
-- N11: judge_objections joins the guarded columns.
create or replace function public.interview_items_immutable()
returns trigger
language plpgsql
as $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = OLD.company_id) THEN
      RETURN OLD; -- the company cascade
    END IF;
    RAISE EXCEPTION 'interview items are retracted, never deleted — item %', OLD.id;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.interview_record_id IS DISTINCT FROM OLD.interview_record_id
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.raw_words IS DISTINCT FROM OLD.raw_words
     OR NEW.speaker_label IS DISTINCT FROM OLD.speaker_label
     OR NEW.speaker_side IS DISTINCT FROM OLD.speaker_side
     OR NEW.scope IS DISTINCT FROM OLD.scope
     OR NEW.pointer::text IS DISTINCT FROM OLD.pointer::text
     OR NEW.record_text_sha256 IS DISTINCT FROM OLD.record_text_sha256
     OR NEW.content_identity IS DISTINCT FROM OLD.content_identity
     OR NEW.rules_version IS DISTINCT FROM OLD.rules_version
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     -- N11: the judge's typed objections are evidence of what happened at landing.
     OR NEW.judge_objections::text IS DISTINCT FROM OLD.judge_objections::text THEN
    RAISE EXCEPTION 'interview_items: the words, the speaker side, the scope, the pointer, the identity, the judge objections and the rules version are fixed at landing — item %', OLD.id;
  END IF;
  IF NEW.validated IS DISTINCT FROM OLD.validated THEN
    RAISE EXCEPTION 'interview_items: validated is set only by its own RPC, never by an UPDATE — item %', OLD.id;
  END IF;
  -- N12: retraction is FINAL. Once set, it never returns to NULL — for any reason.
  IF OLD.retracted_at IS NOT NULL AND NEW.retracted_at IS NULL THEN
    RAISE EXCEPTION 'interview_items: a retraction is final — retracted_at never returns to NULL; supersede the item instead — item %', OLD.id;
  END IF;
  IF OLD.retracted_reason IS NOT NULL AND NEW.retracted_reason IS NULL THEN
    RAISE EXCEPTION 'interview_items: a retraction is final — retracted_reason never returns to NULL — item %', OLD.id;
  END IF;
  RETURN NEW;
END;
$function$;
