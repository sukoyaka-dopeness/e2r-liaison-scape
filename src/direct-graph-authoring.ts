export type GraphPoint = { x: number; y: number };
export type PointerPosition = { clientX: number; clientY: number };
export type SvgRect = { left: number; top: number; width: number; height: number };
export type ViewBoxSize = { width: number; height: number };
export type Pan = { x: number; y: number };
export type RelationDrop = { sourceId: string; targetId: string };
export type ContextMenuTarget =
  | { kind: "canvas"; point: GraphPoint }
  | { kind: "entity"; entityId: string }
  | { kind: "node-label"; entityId: string }
  | { kind: "relation-path"; relationId: string }
  | { kind: "relation-label"; relationId: string };
export type ContextMenu = ContextMenuTarget & { clientX: number; clientY: number };
export type CanvasContextMenu = Extract<ContextMenuTarget, { kind: "canvas" }>;

export function createCanvasContextMenu(point: GraphPoint): CanvasContextMenu {
  return { kind: "canvas", point };
}

export function createObjectContextMenu(
  target: Exclude<ContextMenuTarget, CanvasContextMenu>,
): Exclude<ContextMenuTarget, CanvasContextMenu> {
  return target;
}

export function dismissContextMenu(_menu: ContextMenu | CanvasContextMenu | null): null {
  return null;
}

export function shouldSuppressNativeContextMenu(applicationClaimedGesture: boolean): boolean {
  return applicationClaimedGesture;
}

export function graphPointFromPointer(
  pointer: PointerPosition,
  rect: SvgRect,
  viewBox: ViewBoxSize,
  scale: number,
  pan: Pan,
): GraphPoint {
  if (rect.width <= 0 || rect.height <= 0) throw new RangeError("SVG rect must have positive dimensions");
  if (viewBox.width <= 0 || viewBox.height <= 0) throw new RangeError("ViewBox must have positive dimensions");
  if (!Number.isFinite(scale) || scale <= 0) throw new RangeError("Scale must be positive and finite");
  const viewX = (pointer.clientX - rect.left) * viewBox.width / rect.width;
  const viewY = (pointer.clientY - rect.top) * viewBox.height / rect.height;
  return {
    x: viewBox.width / 2 + (viewX - viewBox.width / 2 - pan.x) / scale,
    y: viewBox.height / 2 + (viewY - viewBox.height / 2 - pan.y) / scale,
  };
}

export function graphPointFromViewportCenter(
  viewBox: ViewBoxSize,
  scale: number,
  pan: Pan,
): GraphPoint {
  if (viewBox.width <= 0 || viewBox.height <= 0) throw new RangeError("ViewBox must have positive dimensions");
  if (!Number.isFinite(scale) || scale <= 0) throw new RangeError("Scale must be positive and finite");
  return {
    x: viewBox.width / 2 - pan.x / scale,
    y: viewBox.height / 2 - pan.y / scale,
  };
}

export function placeTemporaryEntity(
  positions: Record<string, GraphPoint>,
  entityId: string,
  point: GraphPoint | null,
): Record<string, GraphPoint> {
  return point === null ? positions : { ...positions, [entityId]: point };
}

export function isLongPress(durationMs: number, movementPx: number): boolean {
  return durationMs >= 500 && movementPx <= 8;
}

export function canCompleteLongPress(hasSinglePointer: boolean, canceled: boolean): boolean {
  return hasSinglePointer && !canceled;
}

export function resolveRelationDrop(
  sourceId: string | null,
  targetId: string | null,
  entityIds: ReadonlySet<string>,
): RelationDrop | null {
  if (sourceId === null || targetId === null) return null;
  if (!entityIds.has(sourceId) || !entityIds.has(targetId)) return null;
  return { sourceId, targetId };
}
