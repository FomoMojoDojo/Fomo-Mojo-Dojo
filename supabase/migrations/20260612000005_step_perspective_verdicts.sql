-- Model-experiment gate (operator-approved): executor-perspective verdict store.
-- Verdict-store law: content identity keying, first-verdict-wins (insert-ignore),
-- unresolved verdicts are NEVER persisted. A declared step must be provably
-- buyer-side; uncertain resolves to 'seller' at judge time (fail-safe direction)
-- but only resolved verdicts land here.
create table if not exists public.step_perspective_verdicts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  content_hash text not null,
  verdict text not null check (verdict in ('buyer','seller')),
  judge_model text not null,
  step_label_excerpt text not null default '',
  judged_at timestamptz not null default now(),
  unique (company_id, content_hash)
);
