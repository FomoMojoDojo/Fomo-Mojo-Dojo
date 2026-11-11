// U6-52 (2026-11-10): this file used to carry 340 lines of a REAL CLIENT's material — Edgewood's
// name, its value proposition verbatim, its channel inventory including give.edgewood.org, its job
// steps, its strategy cascade and its positioning canvas — as mock fixtures.
//
// Nothing rendered any of it. Fifteen exports, and exactly one had an importer outside this file:
// TopNav.tsx takes MOCK_NAV_CONFIG, which is five booleans. The other fourteen were unreferenced.
//
// They are removed rather than left to be found. Unreferenced is not the same as unreachable: a file
// in src/ is one import away from a surface, and the landing census (2026-11-10) had just finished
// showing how a literal nobody meant to render ends up on a page. A client's own words do not belong
// in the bundle as scaffolding.
//
// If mock fixtures are needed again, generate them — do not reinstate a client's content.
import type { ClientNavConfig } from './types';

export const MOCK_NAV_CONFIG: ClientNavConfig = {
  show_job_steps: true,
  show_strategy: true,
  show_opps_map: true,
  show_positioning: true,
  show_analytics: false,
};
