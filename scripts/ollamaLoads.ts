// ── SP-637 (2026-11-24): THE BATCH SIZE OF EVERY MODEL LOAD, FROM THE MODEL SERVER'S OWN LOG ─────────
//
// Brief 17 found that one (claim, quote) pair gave two answers under two batch sizes, and that the
// server picks the batch size from free memory at the moment it loads the model — it is not set by
// this repo. Until it is pinned (not ruled), every run prints what each load got. Read-only.
export type ModelLoad = { time: string; ms: number; freeGiB: number | null; batch: number | null; mode: string; nCtx: number | null;
  /** the first 8 characters of the model file's sha256 — `d372de8e` is qwen3.6:35b on this machine */
  model: string;
  /** SP-647: true for the one load that began BEFORE the run and was still in memory when it started */
  beforeRun?: boolean };

export const OLLAMA_SERVER_LOG = `${Deno.env.get("HOME") ?? ""}/.ollama/logs/server.log`;

/** Every model load in `text` at or after `sinceMs`. A load begins at the server's
 *  "starting llama-server" line; its free memory, context, batch size and load mode follow it. */
export function parseModelLoads(text: string, sinceMs = 0, includePrior = false): ModelLoad[] {
  const loads: ModelLoad[] = [];
  let cur: ModelLoad | null = null;
  // SP-647: the last load that began before `sinceMs`. A run's first call can be served by a model a
  // previous script left in memory; without this that call sat under no load (run 11: 23 printed, 24 true).
  let prior: ModelLoad | null = null;
  for (const line of text.split("\n")) {
    const tm = line.match(/^time=(\S+)/);
    if (tm && line.includes('msg="starting llama-server"')) {
      const ms = Date.parse(tm[1]);
      const b = line.match(/\s-b (\d+)\b/), lm = line.match(/--load-mode (\w+)/), c = line.match(/\s-c (\d+)\b/), md = line.match(/--model \S*sha256-(\w{8})/);
      // The server names the load mode only when it is not the default; the default is mmap.
      cur = { time: tm[1], ms, freeGiB: null, batch: null, mode: lm ? lm[1] : "mmap", nCtx: null, model: md ? md[1] : "" };
      if (b) cur.batch = Number(b[1]);
      if (c) cur.nCtx = Number(c[1]);
      if (ms >= sinceMs) loads.push(cur); else prior = cur;
      continue;
    }
    if (!cur) continue;
    let m: RegExpMatchArray | null;
    if (cur.freeGiB === null && line.includes('msg="system memory"') && (m = line.match(/ free="([\d.]+) GiB"/))) cur.freeGiB = Number(m[1]);
    else if ((m = line.match(/llama_context: n_ctx\s+= (\d+)/))) cur.nCtx = Number(m[1]);
    else if ((m = line.match(/llama_context: n_batch\s+= (\d+)/))) cur.batch = Number(m[1]);
  }
  if (includePrior && prior) { prior.beforeRun = true; loads.unshift(prior); }
  return loads;
}

/** The loads since `sinceMs`, or null when the log cannot be read (the run does not depend on it). */
export async function readModelLoads(sinceMs: number, path = OLLAMA_SERVER_LOG, includePrior = false): Promise<ModelLoad[] | null> {
  try {
    const f = await Deno.open(path, { read: true });
    try {
      const size = (await f.stat()).size;
      // The log is ~130 MB; a run's loads are in its tail. 24 MB covers several hours of calls.
      const span = Math.min(size, 24 * 1024 * 1024);
      await f.seek(size - span, Deno.SeekMode.Start);
      const buf = new Uint8Array(span);
      let off = 0;
      while (off < span) { const n = await f.read(buf.subarray(off)); if (n === null) break; off += n; }
      return parseModelLoads(new TextDecoder().decode(buf.subarray(0, off)), sinceMs, includePrior);
    } finally { f.close(); }
  } catch { return null; }
}

/** Each call under the load it ran on: the last load that began before the call ended. */
export function callsByLoad(loads: readonly ModelLoad[], calls: ReadonlyArray<{ role: string; endMs: number }>): Array<{ load: ModelLoad; byRole: Record<string, number> }> {
  const out = loads.map((load) => ({ load, byRole: {} as Record<string, number> }));
  for (const c of calls) {
    let idx = -1;
    for (let i = 0; i < loads.length; i++) if (loads[i].ms <= c.endMs) idx = i;
    if (idx >= 0) out[idx].byRole[c.role] = (out[idx].byRole[c.role] ?? 0) + 1;
  }
  return out;
}

export function loadLine(l: ModelLoad): string {
  return `${l.time.slice(11, 19)}${l.beforeRun ? " (loaded before the run)" : ""}  model ${l.model || "?"}  free ${l.freeGiB === null ? "?" : l.freeGiB.toFixed(1)} GiB  batch ${l.batch ?? "?"}  load mode ${l.mode || "?"}  n_ctx ${l.nCtx ?? "?"}`;
}
