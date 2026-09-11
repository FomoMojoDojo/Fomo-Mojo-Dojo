// Shell ↔ page contract. The keyed <Outlet/> wrapper remounts on `stageKey` and carries the stage
// direction as data-fr-stage, so a page with internal stages (Job Map) can ask for a directional
// remount without owning the wrapper. Nothing here persists.
import { createContext, useContext } from "react";

export type StageDirection = "fwd" | "back";

export type WorkspaceStage = {
  readonly direction: StageDirection;
  readonly stageKey: string;
  /** Request a remount of the page wrapper with the given direction and stage key. */
  readonly setStage: (direction: StageDirection, stageKey: string) => void;
};

export const WorkspaceStageContext = createContext<WorkspaceStage | null>(null);

export function useWorkspaceStage(): WorkspaceStage | null {
  return useContext(WorkspaceStageContext);
}
