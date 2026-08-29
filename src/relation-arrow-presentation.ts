import { getArrowheadGeometry, type ArrowheadGeometry, type Point } from "./viewport.ts";
import type { RelationArrowDisplay } from "./presentation-extension.ts";

export function getRelationArrowheadGeometries(
  samples: Point[],
  mode: RelationArrowDisplay,
  strokeWidth: number,
): ArrowheadGeometry[] {
  if (mode === "undirected") return [];

  const targetArrowhead = getArrowheadGeometry(samples, strokeWidth);
  if (mode === "normal") return [targetArrowhead];

  const sourceArrowhead = getArrowheadGeometry([...samples].reverse(), strokeWidth);
  if (mode === "reverse") return [sourceArrowhead];
  return [sourceArrowhead, targetArrowhead];
}
