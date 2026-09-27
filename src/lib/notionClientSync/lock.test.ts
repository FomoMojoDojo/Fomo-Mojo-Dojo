// B3 — R17/R18. The four cases the brief names, plus the ones that keep the conjunction honest.
import { describe, it, expect } from "vitest";
import { acquireLock, releaseLock, STALE_MS, type LockDeps, type LockInfo } from "./lock";

const DIR = "/repo/local-db-backups/.client-sync.lock";

/** A fake filesystem where mkdir throws on an existing directory, as fs.mkdirSync does. */
function fakeFs(opts: { existing?: LockInfo | "no-info"; alive?: number[]; now?: number } = {}) {
  let present = opts.existing !== undefined;
  let info: LockInfo | null = opts.existing && opts.existing !== "no-info" ? opts.existing : null;
  const alive = new Set(opts.alive ?? []);
  const log: string[] = [];
  const deps: LockDeps = {
    mkdir: (d) => {
      log.push(`mkdir ${d}`);
      if (present) throw new Error("EEXIST");
      present = true;
    },
    readInfo: () => (present ? info : null),
    writeInfo: (d, i) => {
      log.push(`write ${i.pid}`);
      info = i;
    },
    remove: (d) => {
      log.push(`remove ${d}`);
      present = false;
      info = null;
    },
    isAlive: (pid) => alive.has(pid),
    now: () => opts.now ?? Date.parse("2026-09-27T06:00:00.000Z"),
  };
  return { deps, log, state: () => ({ present, info }) };
}

const iso = (ms: number) => new Date(ms).toISOString();
const NOW = Date.parse("2026-09-27T06:00:00.000Z");

describe("acquire", () => {
  it("takes a free lock and records our pid and start time", () => {
    const f = fakeFs({ now: NOW });
    const r = acquireLock(DIR, f.deps, 4242);
    expect(r.kind).toBe("acquired");
    expect(r.kind === "acquired" && r.info.pid).toBe(4242);
    expect(f.state().info).toEqual({ pid: 4242, startedAt: iso(NOW) });
  });
});

describe("held — a second run exits without writing", () => {
  it("a LIVE pid holds the lock, however old it looks", () => {
    const f = fakeFs({
      existing: { pid: 111, startedAt: iso(NOW - 10 * STALE_MS) }, // ancient
      alive: [111],
      now: NOW,
    });
    const r = acquireLock(DIR, f.deps, 4242);
    expect(r.kind).toBe("held");
    expect(r.kind === "held" && r.reason).toMatch(/pid 111 is alive/);
    // nothing was removed and the holder's info is untouched — the lock was NOT stolen
    expect(f.log.filter((l) => l.startsWith("remove"))).toEqual([]);
    expect(f.state().info).toEqual({ pid: 111, startedAt: iso(NOW - 10 * STALE_MS) });
  });

  it("a DEAD pid inside the 30-minute window still holds it", () => {
    const f = fakeFs({ existing: { pid: 222, startedAt: iso(NOW - 60_000) }, alive: [], now: NOW });
    const r = acquireLock(DIR, f.deps, 4242);
    expect(r.kind).toBe("held");
    expect(r.kind === "held" && r.reason).toMatch(/too recent to reclaim/);
    expect(f.log.filter((l) => l.startsWith("remove"))).toEqual([]);
  });

  it("a lock with no readable pid is HELD, not reclaimed — R17's conjunction cannot be judged", () => {
    const f = fakeFs({ existing: "no-info", now: NOW });
    const r = acquireLock(DIR, f.deps, 4242);
    expect(r.kind).toBe("held");
    expect(r.kind === "held" && r.by).toBeNull();
    expect(r.kind === "held" && r.reason).toMatch(/no readable pid/);
    expect(r.kind === "held" && r.reason).toMatch(/by hand/);
    expect(f.log.filter((l) => l.startsWith("remove"))).toEqual([]);
  });

  it("a dead pid whose started_at is unparseable is held, not reclaimed", () => {
    const f = fakeFs({ existing: { pid: 333, startedAt: "not-a-date" }, alive: [], now: NOW });
    const r = acquireLock(DIR, f.deps, 4242);
    expect(r.kind).toBe("held");
    expect(r.kind === "held" && r.reason).toMatch(/could not be parsed/);
  });
});

describe("stale reclaim — dead AND old, both halves of R17", () => {
  it("reclaims a dead pid older than 30 minutes and takes the lock", () => {
    const started = NOW - STALE_MS - 1000;
    const f = fakeFs({ existing: { pid: 444, startedAt: iso(started) }, alive: [], now: NOW });
    const r = acquireLock(DIR, f.deps, 4242);
    expect(r.kind).toBe("reclaimed");
    expect(r.kind === "reclaimed" && r.from.pid).toBe(444);
    expect(r.kind === "reclaimed" && r.ageMs).toBeGreaterThan(STALE_MS);
    expect(f.state().info).toEqual({ pid: 4242, startedAt: iso(NOW) });
    expect(f.log).toContain(`remove ${DIR}`);
  });

  it("exactly at the threshold is NOT reclaimed — the rule is strictly older than", () => {
    const f = fakeFs({ existing: { pid: 555, startedAt: iso(NOW - STALE_MS) }, alive: [], now: NOW });
    expect(acquireLock(DIR, f.deps, 4242).kind).toBe("held");
  });

  it("dead and old is not enough if the pid is alive — aliveness is checked FIRST", () => {
    const f = fakeFs({ existing: { pid: 666, startedAt: iso(NOW - STALE_MS - 1) }, alive: [666], now: NOW });
    const r = acquireLock(DIR, f.deps, 4242);
    expect(r.kind).toBe("held");
    expect(r.kind === "held" && r.reason).toMatch(/alive/);
  });
});

describe("release", () => {
  it("removes our own lock", () => {
    const f = fakeFs({ now: NOW });
    acquireLock(DIR, f.deps, 4242);
    expect(releaseLock(DIR, f.deps, 4242)).toEqual({ released: true });
    expect(f.state().present).toBe(false);
  });

  it("never removes someone else's lock — ours was reclaimed while we ran", () => {
    const f = fakeFs({ existing: { pid: 999, startedAt: iso(NOW) }, alive: [999], now: NOW });
    const r = releaseLock(DIR, f.deps, 4242);
    expect(r.released).toBe(false);
    expect(r.reason).toMatch(/held by pid 999/);
    expect(f.state().present).toBe(true);
  });

  it("an already-gone lock is reported, not an error", () => {
    const f = fakeFs({ now: NOW });
    expect(releaseLock(DIR, f.deps, 4242)).toEqual({ released: false, reason: "the lock was already gone" });
  });
});
