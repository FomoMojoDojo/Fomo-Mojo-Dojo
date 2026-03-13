// Seed Edgewood verified inputs — evaluated from edgewood.org (March 2026)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EDGEWOOD_INPUTS } from "./edgewood-data.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No auth header" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get company_id from request body
    let company_id: string | null = null;
    try {
      const body = await req.json();
      company_id = body.company_id || null;
    } catch { /* no body */ }

    // Get existing input IDs for this user + company
    let query = supabase.from("inputs").select("id").eq("user_id", user.id);
    if (company_id) query = query.eq("company_id", company_id);
    const { data: existingInputs } = await query;
    const existingIds = existingInputs?.map((r: any) => r.id) ?? [];

    // Delete existing subitems and files, then inputs
    if (existingIds.length > 0) {
      await supabase.from("input_subitems").delete().in("input_id", existingIds);
      await supabase.from("input_files").delete().in("input_id", existingIds);
      await supabase.from("inputs").delete().in("id", existingIds);
    }

    // Insert fresh inputs and subitems
    for (const input of EDGEWOOD_INPUTS) {
      const { subitems, ...inputData } = input;
      const insertPayload: any = { ...inputData, user_id: user.id };
      if (company_id) insertPayload.company_id = company_id;

      const { data: inserted, error: insertErr } = await supabase
        .from("inputs")
        .insert(insertPayload)
        .select("id")
        .single();

      if (insertErr) throw insertErr;

      if (subitems.length > 0) {
        const subRows = subitems.map((s: any) => ({ ...s, input_id: inserted.id }));
        const { error: subErr } = await supabase.from("input_subitems").insert(subRows);
        if (subErr) throw subErr;
      }
    }

    return new Response(JSON.stringify({ message: "Seeded", count: EDGEWOOD_INPUTS.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
