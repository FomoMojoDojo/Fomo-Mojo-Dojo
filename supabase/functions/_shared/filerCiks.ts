// ── SEC FILER CIKs OF RELATED ENTITIES (E1a, signed 2026-10-21; read at mint by ruling 12, 2026-10-22) ─────────────────
//
// The signed filer CIK of a related entity, keyed by the ENTITY's host — the one table. The related-entity writer
// (scripts/related-entities/core.ts, E1a source rule) and the mint authority (voiceClassAtMint, ruling 12) both read it,
// so a CIK is signed once. Keyed by host, not by company: any company whose CONFIRMED related entity sits on a host here
// gets the rule; a host absent here has no filer CIK and its filings stay outside.
//
// Why not the entity's source_url: a related entity's cited source may be a filing by ANOTHER filer — Cox
// Communications' row cites an exhibit filed under Charter's CIK (the parent filed the merger 8-K). Reading a CIK off
// the source URL would give Cox Charter's CIK. Only a signed value names who files under a CIK.

/** E1a: SEC filer CIKs by entity host — signed values only (operator ruling 2026-10-21). */
export const FILER_CIKS: Readonly<Record<string, number>> = { "charter.com": 1091667 };

/** The filer CIK an EDGAR archive URL is filed under (https://[www.]sec.gov/Archives/edgar/data/<CIK>/…), leading zeros
 *  ignored (0001091667 ≡ 1091667); null for any other URL. */
export function edgarCikOf(u: string): number | null {
  try {
    const url = new URL(u);
    if (url.protocol !== "https:" || url.hostname.replace(/^www\./i, "").toLowerCase() !== "sec.gov") return null;
    const m = url.pathname.match(/^\/Archives\/edgar\/data\/(\d{1,10})(\/|$)/);
    return m ? Number(m[1]) : null;
  } catch { return null; }
}

/** The signed CIK of an entity host (www-stripped, lowercased), or null. */
export function filerCikOfHost(host: string | null | undefined): number | null {
  const h = String(host ?? "").trim().replace(/^www\./i, "").toLowerCase();
  return Object.prototype.hasOwnProperty.call(FILER_CIKS, h) ? FILER_CIKS[h] : null;
}
