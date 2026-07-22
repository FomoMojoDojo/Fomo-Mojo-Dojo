-- First Read Gate 4 — proposal persistence.
--
-- The generated one-screen proposal object is stored on the session (1:1, issued
-- exactly once) so a proposal_issued session re-renders ITS proposal
-- deterministically on reload — never regenerated silently. Written together with
-- the open -> proposal_issued transition (governed by the Gate 1 transition
-- trigger) and the cached tally counts.
--
-- jsonb, nullable, no default: an open (un-issued) session has no proposal. The
-- generator is the only writer.

alter table public.first_read_sessions add column proposal_json jsonb;

comment on column public.first_read_sessions.proposal_json is
  'Generated one-screen proposal object (blocks + per-block sources manifest + trace). Written by generate-first-read-proposal at issuance, alongside status=proposal_issued and the cached counts. Null while open.';
