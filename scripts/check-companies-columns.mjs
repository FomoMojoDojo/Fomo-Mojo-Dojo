#!/usr/bin/env node

/**
 * Verify required columns exist on public.companies using Supabase REST.
 *
 * Usage:
 *   SUPABASE_URL="https://<project>.supabase.co" \
 *   SUPABASE_KEY="<anon-or-service-key>" \
 *   node scripts/check-companies-columns.mjs
 *
 * Optional overrides:
 *   TABLE_NAME=companies
 *   TABLE_SCHEMA=public
 *   REQUIRED_COLUMNS=human_decision,review_status,review_source
 */

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const SUPABASE_KEY = String(process.env.SUPABASE_KEY || "").trim();
const TABLE_NAME = String(process.env.TABLE_NAME || "companies").trim();
const TABLE_SCHEMA = String(process.env.TABLE_SCHEMA || "public").trim();
const REQUIRED_COLUMNS = String(
  process.env.REQUIRED_COLUMNS || "human_decision,review_status,review_source",
)
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

function fail(message, code = 1) {
  console.error(`\n[check-companies-columns] ${message}\n`);
  process.exit(code);
}

async function callRpcGetTableColumns() {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_table_columns`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({
      p_table: TABLE_NAME,
      p_schema: TABLE_SCHEMA,
    }),
  });

  const payload = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, payload };
}

function printRpcBootstrapHint() {
  console.log("RPC helper missing. Create it once in Supabase SQL editor:");
  console.log("");
  console.log("create or replace function public.get_table_columns(p_table text, p_schema text default 'public')");
  console.log("returns table(column_name text)");
  console.log("language sql");
  console.log("security definer");
  console.log("set search_path = public");
  console.log("as $$");
  console.log("  select c.column_name::text");
  console.log("  from information_schema.columns c");
  console.log("  where c.table_schema = p_schema");
  console.log("    and c.table_name = p_table");
  console.log("  order by c.ordinal_position;");
  console.log("$$;");
  console.log("");
  console.log("grant execute on function public.get_table_columns(text, text) to anon, authenticated;");
  console.log("");
  console.log("You can also use: sql/create_rpc_get_table_columns.sql");
}

async function main() {
  if (!SUPABASE_URL) fail("SUPABASE_URL is required.");
  if (!SUPABASE_KEY) fail("SUPABASE_KEY is required.");

  const { ok, status, payload } = await callRpcGetTableColumns();

  if (!ok) {
    const errorCode = String(payload?.code || "");
    const message = String(payload?.message || "");
    const isMissingRpc =
      errorCode === "PGRST202" ||
      /could not find the function/i.test(message) ||
      /get_table_columns/i.test(message);

    if (isMissingRpc) {
      console.log("");
      printRpcBootstrapHint();
      console.log("");
      fail("RPC get_table_columns is not available yet.", 2);
    }

    fail(`Supabase request failed (${status}): ${JSON.stringify(payload)}`, 3);
  }

  if (!Array.isArray(payload)) {
    fail(`Unexpected RPC payload: ${JSON.stringify(payload)}`, 4);
  }

  const columns = payload
    .map((row) => String(row?.column_name || "").trim())
    .filter(Boolean);

  console.log(`\n=== ALL COLUMNS IN ${TABLE_SCHEMA}.${TABLE_NAME} ===`);
  console.log(columns);

  console.log("\n=== REQUIRED CHECK ===");
  let missingCount = 0;
  for (const col of REQUIRED_COLUMNS) {
    if (columns.includes(col)) {
      console.log(`✅ ${col} exists`);
    } else {
      missingCount += 1;
      console.log(`❌ ${col} MISSING`);
    }
  }

  if (missingCount > 0) {
    fail(`${missingCount} required column(s) missing.`, 5);
  }

  console.log("\nAll required columns are present.\n");
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error), 9);
});

