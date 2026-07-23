// FR-V2-1 — the lazy-mint session ensurer, extracted so the single-flight guarantee
// (no double-mint on rapid taps) is unit-testable in isolation.
//
// Returns an `ensureSession()` that: (1) returns the current session id if one exists;
// (2) otherwise mints ONE — a mint-in-progress promise is memoized in a closure, so
// concurrent callers share it and exactly one session is ever created; (3) re-resolves
// an existing open|proposal_issued session before inserting, so it never duplicates a
// session another surface just created.

interface MinimalClient {
  from: (table: string) => {
    // deno-lint-ignore no-explicit-any
    select: (cols: string) => any;
    // deno-lint-ignore no-explicit-any
    insert: (row: Record<string, unknown>) => any;
  };
}

export function createSessionEnsurer(deps: {
  supabase: MinimalClient;
  companyId: string | null | undefined;
  getSessionId: () => string;
  setSessionId: (id: string) => void;
}): () => Promise<string> {
  let mint: Promise<string> | null = null;

  return async function ensureSession(): Promise<string> {
    const current = deps.getSessionId();
    if (current) return current;
    if (mint) return mint; // an in-flight mint → every caller shares it (single-flight)

    const p = (async () => {
      const { data: existing } = await deps.supabase
        .from("first_read_sessions")
        .select("id")
        .eq("company_id", deps.companyId)
        .in("status", ["open", "proposal_issued"])
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      let id = (existing as { id: string } | null)?.id ?? "";
      if (!id) {
        const { data } = await deps.supabase
          .from("first_read_sessions")
          .insert({ company_id: deps.companyId, status: "open" })
          .select("id")
          .single();
        id = (data as { id: string }).id;
      }
      deps.setSessionId(id);
      return id;
    })();

    mint = p;
    try {
      return await p;
    } finally {
      mint = null;
    }
  };
}
