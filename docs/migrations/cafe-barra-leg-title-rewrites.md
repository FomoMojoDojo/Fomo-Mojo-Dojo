# Cafe Barra — Leg Title Rewrites

**Status:** Proposed — awaiting sign-off before any DB update.

**Voice target:** Smart friend. Direct, slightly informal, zero jargon.
Reads as "here's what we're actually doing" not "here's the workstream title."

---

## Route A — Earn the right to make the exceptional claim

| Current Title | Proposed Title |
|---|---|
| Make margin tradeoffs visible before pricing changes | See how price changes actually hit your margins |
| Reduce reorder friction caused by unclear supplier terms | Fix your supplier terms — the ambiguity is creating stock-outs |
| Reduce stock-out risk before manual counts fail | Track inventory properly so you stop finding out too late |
| Shift preparation quality from manager-dependent to system-supported | Make prep quality consistent without one person holding it together |

---

## Route B — Make the Barra Process visible and transferable

| Current Title | Proposed Title |
|---|---|
| Externalize one Barra roasting template into observable, partner-communicable criteria | Turn one roasting template into something a partner can actually verify |
| Design the seasonal origin transition so partner cafes experience it as a methodology feature, not a supply disruption | Make seasonal transitions feel intentional to partners, not like a supply problem |
| Build a seasonal consistency signal partner cafes can observe independently | Give partners a way to check your consistency themselves |
| Test whether the exceptional positioning holds under direct comparison with premium craft alternatives | Find out if your positioning survives a head-to-head with Blue Bottle or Stumptown |

---

## Route C — Win the right partners through evidence, not pitch

| Current Title | Proposed Title |
|---|---|
| Add a lightweight pre-qualification tier before the full partner interview | Screen partners earlier — save the full interview for the ones already showing fit |
| Test whether operational proof changes repeat purchasing confidence | Find out if documented proof actually changes how partners decide to come back |

---

## Notes

- All 10 titles are client-facing display strings only — no schema changes
- Update the `title` column in `routes` for the 10 leg-level rows
- IDs: A1–A4 = `ecf0b2e3`, `f0fac021`, `6dacee4b`, `111d3d7f`; B1–B4 = `e3000001`, `e4000001`, `e1000001`, `e5000001`; C1–C2 = `e2000001`, `49318645`
- Run SQL updates only after human sign-off on this doc
