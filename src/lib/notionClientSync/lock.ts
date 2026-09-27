// B3 — R17/R18: the single-run lock for every --live sync, manual or scheduled.
//
// R18 puts the lock HERE rather than in the launchd wrapper, and that placement is the whole point: a
// lock the wrapper owns protects only runs that go through the wrapper, so a hand-typed
// `npx vite-node … --live` would sail past it and two runs could interleave. In sync.ts it covers both.
// Dry runs take no lock — they cannot write, so there is nothing to serialise.
//
// mkdir is the primitive because it is atomic: the directory either did not exist and is now ours, or
// it existed and is someone else's. A test-then-touch has a window between the test and the touch;
// mkdir has none. The pid and the start time go INSIDE the directory, so a crashed run leaves enough
// evidence to judge it.
//
// R17's staleness rule is a CONJUNCTION and is deliberately conservative: a lock is broken only when
// the recorded pid is dead AND it started more than 30 minutes ago. A live pid is never stolen however
// old it looks — a genuinely slow run is not a crashed one — and a dead pid inside the window is left
// alone too, because a process that just died may have a successor mid-cleanup.
//
// Everything is injected so the guard and the tests can drive it without a filesystem or a clock.
export const STALE_MS = 30 * 60 * 1000;

export type LockInfo = { pid: number; startedAt: string };

export type LockDeps = {
  /** Must throw when the directory already exists (fs.mkdirSync does). */
  mkdir: (dir: string) => void;
  /** null when the directory has no readable info file. */
  readInfo: (dir: string) => LockInfo | null;
  writeInfo: (dir: string, info: LockInfo) => void;
  remove: (dir: string) => void;
  /** process.kill(pid, 0) succeeds for a live process. */
  isAlive: (pid: number) => boolean;
  now: () => number;
};

export type AcquireResult =
  | { kind: "acquired"; info: LockInfo }
  | { kind: "reclaimed"; info: LockInfo; from: LockInfo; ageMs: number }
  | { kind: "held"; by: LockInfo | null; reason: string };

/**
 * Take the lock, or report who holds it. A `held` result is NOT an error: the caller exits 0 having
 * written nothing, because being politely skipped is not a failure and must not raise an alarm.
 */
export function acquireLock(dir: string, deps: LockDeps, pid: number): AcquireResult {
  const mine = (): LockInfo => ({ pid, startedAt: new Date(deps.now()).toISOString() });

  try {
    deps.mkdir(dir);
    const info = mine();
    deps.writeInfo(dir, info);
    return { kind: "acquired", info };
  } catch {
    // the directory exists — someone else's, or a corpse
  }

  const held = deps.readInfo(dir);
  if (held === null) {
    // R17 cannot be satisfied: with no readable pid we cannot establish that the holder is dead, so
    // the lock stands. This is the one case needing a human, and the message says so.
    return {
      kind: "held",
      by: null,
      reason: `the lock directory exists but holds no readable pid — R17 breaks a lock only when the pid is dead AND older than ${Math.round(STALE_MS / 60000)} min, and neither can be judged here. Remove ${dir} by hand once you are sure no sync is running.`,
    };
  }

  if (deps.isAlive(held.pid)) {
    return { kind: "held", by: held, reason: `pid ${held.pid} is alive (started ${held.startedAt})` };
  }

  const ageMs = deps.now() - Date.parse(held.startedAt);
  if (!Number.isFinite(ageMs)) {
    return { kind: "held", by: held, reason: `pid ${held.pid} is dead but its started_at (${held.startedAt}) could not be parsed, so its age cannot be judged` };
  }
  if (ageMs <= STALE_MS) {
    return {
      kind: "held",
      by: held,
      reason: `pid ${held.pid} is dead but the lock is only ${Math.round(ageMs / 1000)}s old (< ${Math.round(STALE_MS / 60000)} min) — too recent to reclaim`,
    };
  }

  // dead AND old: both halves of R17 hold.
  deps.remove(dir);
  deps.mkdir(dir);
  const info = mine();
  deps.writeInfo(dir, info);
  return { kind: "reclaimed", info, from: held, ageMs };
}

/**
 * Release only OUR lock. If the directory now holds someone else's pid we leave it: that means ours
 * was reclaimed as stale while we were still running, and deleting theirs would compound the error.
 */
export function releaseLock(dir: string, deps: LockDeps, pid: number): { released: boolean; reason?: string } {
  const held = deps.readInfo(dir);
  if (held === null) return { released: false, reason: "the lock was already gone" };
  if (held.pid !== pid) return { released: false, reason: `the lock is now held by pid ${held.pid}, not ours (${pid}) — leaving it` };
  deps.remove(dir);
  return { released: true };
}
