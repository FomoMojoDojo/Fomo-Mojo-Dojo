// Reads for the interview capture form (gate 4, 2026-09-16): the company's LIVE interview records (for
// "Reuse an interview") and the signed-in user's display name (the interviewer default). Reads only.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type InterviewRecordRow = {
  id: string;
  speaker_role: "client_stakeholder" | "market_participant" | string;
  person_name: string;
  person_role: string | null;
  journey_key: string | null;
  interviewed_at: string;
};

const loose = () => supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export function useInterviewRecords(companyId: string | null | undefined, refreshKey = 0): { records: InterviewRecordRow[]; loading: boolean; refetch: () => Promise<void> } {
  const [records, setRecords] = useState<InterviewRecordRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const refetch = useCallback(async () => { setTick((k) => k + 1); }, []);
  useEffect(() => {
    if (!companyId) { setRecords([]); return; }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data } = await loose().from("interview_records")
        .select("id, speaker_role, person_name, person_role, journey_key, interviewed_at")
        .eq("company_id", companyId).is("retracted_at", null)
        .order("interviewed_at", { ascending: false });
      if (cancelled) return;
      setRecords((data ?? []) as InterviewRecordRow[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [companyId, refreshKey, tick]);
  return { records, loading, refetch };
}

/** profiles.display_name for the signed-in user, else "" (the form leaves the interviewer empty). */
export function useSignedInDisplayName(): string {
  const [name, setName] = useState("");
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await loose().from("profiles").select("display_name").eq("user_id", user.id).maybeSingle();
      if (!cancelled) setName(String((data as { display_name?: string | null } | null)?.display_name ?? "").trim());
    })();
    return () => { cancelled = true; };
  }, []);
  return name;
}
