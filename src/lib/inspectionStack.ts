export type RouteInspectLens =
  | "overview"
  | "customer_reality"
  | "positioning"
  | "evidence"
  | "validation";

export type NeedInspectLens =
  | "overview"
  | "customer_reality"
  | "evidence"
  | "validation";

export type DirectionInspectLens =
  | "overview"
  | "strategy_cascade"
  | "positioning"
  | "evidence"
  | "validation";

export type RouteFrame = {
  kind: "route";
  objectId: string;
  lens: RouteInspectLens;
};

export type NeedFrame = {
  kind: "need";
  objectId: string;
  lens: NeedInspectLens;
};

export type DirectionFrame = {
  kind: "direction";
  /** The company ID — StrategicDirection is a per-company singleton. */
  objectId: string;
  lens: DirectionInspectLens;
};

export type InspectionFrame = RouteFrame | NeedFrame | DirectionFrame;
