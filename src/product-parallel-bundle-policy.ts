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
  const multiplicitySpacing = 8 + Math.max(0, maxParallelCount - 2) * 4;
  const reverseSpacing = hasReverseDirectionPair ? 8 : 0;
  const labelSpacing = Math.min(8, Math.max(0, Math.ceil((maximumLabelWidth - 48) / 32) * 4));
  const spacing = Math.min(32, multiplicitySpacing + reverseSpacing + labelSpacing);
  return { spacing, mode: "bundle", maxParallelCount, hasReverseDirectionPair, maximumLabelWidth, reason: "bounded-demand" };
}
