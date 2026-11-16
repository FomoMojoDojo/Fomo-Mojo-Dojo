// D4 (2026-11-16): Edgewood is a real client and no spec may change it. The global setup snapshots every
// row it owns (scripts/edgewood-unchanged.sh); this re-takes the snapshot after the last spec and fails
// the run, naming each table that moved, if anything differs.
import { execFileSync } from "node:child_process";
import { EDGEWOOD_SNAPSHOT } from "./global-setup";

export default async function globalTeardown() {
  try {
    const out = execFileSync("bash", ["scripts/edgewood-unchanged.sh", "compare", EDGEWOOD_SNAPSHOT], { encoding: "utf8" });
    console.log(out.trim());
  } catch (err) {
    const out = (err as { stdout?: string }).stdout ?? String(err);
    throw new Error(`Edgewood changed during the Playwright run:\n${out}`);
  }
}
