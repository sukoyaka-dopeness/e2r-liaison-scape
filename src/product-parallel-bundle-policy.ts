import { relationLabelDisplayWidth } from "./viewport.ts";

export type ProductParallelBundlePolicyInput = Readonly<{
  sourceId: string;
  targetId: string;
  parallelCount: number;
  label: string;
}>;

export type ProductParallelBundlePolicy = Readonly<{
  spacing: number;
  mode: "bundle";
  maxParallelCount: number;
  hasReverseDirectionPair: boolean;
  maximumLabelWidth: number;
  reason: "no-parallel" | "bounded-demand";
}>;

export type ProductParallelBundleLocalDemand = Readonly<{
  key: string;
  spacing: number;
  relationCount: number;
  maxDirectionalCount: number;
  directionCount: number;
  maximumLabelWidth: number;
}>;

function spacingForDemand(parallelCount: number, directionCount: number, maximumLabelWidth: number): number {
  const multiplicitySpacing = 8 + Math.max(0, parallelCount - 2) * 4;
  const reverseSpacing = directionCount > 1 ? 8 : 0;
  const labelSpacing = Math.min(8, Math.max(0, Math.ceil((maximumLabelWidth - 48) / 32) * 4));
  return Math.min(32, multiplicitySpacing + reverseSpacing + labelSpacing);
}

/** Derives independent bounded demand signals without deciding joint feasibility. */
export function deriveProductParallelBundleLocalDemands(
  edges: readonly ProductParallelBundlePolicyInput[],
): ProductParallelBundleLocalDemand[] {
  const groups = new Map<string, {
    relationCount: number;
    maxDirectionalCount: number;
    directions: Set<string>;
    maximumLabelWidth: number;
  }>();
  for (const edge of edges) {
    if (edge.sourceId === edge.targetId || edge.parallelCount <= 1) continue;
    const key = [edge.sourceId, edge.targetId].sort().join("\u0000");
    const group = groups.get(key) ?? { relationCount: 0, maxDirectionalCount: 0, directions: new Set<string>(), maximumLabelWidth: 0 };
    group.relationCount += 1;
    group.maxDirectionalCount = Math.max(group.maxDirectionalCount, edge.parallelCount);
    group.directions.add(`${edge.sourceId}\u0000${edge.targetId}`);
    group.maximumLabelWidth = Math.max(group.maximumLabelWidth, relationLabelDisplayWidth(edge.label));
    groups.set(key, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, group]) => ({
      key,
      spacing: spacingForDemand(group.maxDirectionalCount, group.directions.size, group.maximumLabelWidth),
      relationCount: group.relationCount,
      maxDirectionalCount: group.maxDirectionalCount,
      directionCount: group.directions.size,
      maximumLabelWidth: group.maximumLabelWidth,
    }));
}

/**
 * Diagnostic-only Product presentation policy. It widens parallel lanes from
 * bounded graph-local demand signals while leaving route arbitration,
 * occupied-path safety, and final label placement in their existing authority.
 */
export function deriveProductParallelBundlePolicy(edges: readonly ProductParallelBundlePolicyInput[]): ProductParallelBundlePolicy {
  const directionalGroups = new Map<string, Set<string>>();
  let maxParallelCount = 0;
  let maximumLabelWidth = 0;
  for (const edge of edges) {
    if (edge.sourceId === edge.targetId || edge.parallelCount <= 1) continue;
    const undirected = [edge.sourceId, edge.targetId].sort().join("\u0000");
    const directional = `${edge.sourceId}\u0000${edge.targetId}`;
    const group = directionalGroups.get(undirected) ?? new Set<string>();
    group.add(directional);
    directionalGroups.set(undirected, group);
    maxParallelCount = Math.max(maxParallelCount, edge.parallelCount);
    maximumLabelWidth = Math.max(maximumLabelWidth, relationLabelDisplayWidth(edge.label));
  }
  if (maxParallelCount === 0) return { spacing: 0, mode: "bundle", maxParallelCount, hasReverseDirectionPair: false, maximumLabelWidth, reason: "no-parallel" };
  const hasReverseDirectionPair = [...directionalGroups.values()].some((directions) => directions.size > 1);
  const spacing = spacingForDemand(maxParallelCount, hasReverseDirectionPair ? 2 : 1, maximumLabelWidth);
  return { spacing, mode: "bundle", maxParallelCount, hasReverseDirectionPair, maximumLabelWidth, reason: "bounded-demand" };
}
