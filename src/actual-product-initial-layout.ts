import { deriveBoundedInitialLayout, type InitialLayoutProviderResult } from "./initial-layout-provider.ts";
import { canonicalizeAutomaticPositions, settleInitialPlacement, type LayoutPoint } from "./auto-layout.ts";
import { placeInitialEntities } from "./entity-placement.ts";
import type { GraphEdge, GraphNode } from "./dataset.ts";

export type ActualProductInitialLayoutOptIn = "coarse-objective-prototype-v1";

export type ActualProductInitialLayoutResult = {
  positions: Record<string, LayoutPoint>;
  authority: "stored" | "mixed-completion" | "current" | "bounded-provider";
  provider: "stored-coordinates" | "current-product" | InitialLayoutProviderResult["provider"];
  strategy?: ActualProductInitialLayoutOptIn;
  status?: InitialLayoutProviderResult["status"];
  reason?: InitialLayoutProviderResult["reason"];
};

/** Selects only the initial placement authority; routing and presentation remain Product-owned. */
export function deriveActualProductInitialLayout({
  nodes,
  edges,
  storedPositions,
  optIn,
}: {
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
  storedPositions: Record<string, LayoutPoint>;
  optIn?: ActualProductInitialLayoutOptIn;
}): ActualProductInitialLayoutResult {
  const storedIds = new Set(Object.keys(storedPositions));
  if (storedIds.size === nodes.length && nodes.every((node) => storedIds.has(node.id))) {
    return { positions: placeInitialEntities(nodes, edges, storedPositions), authority: "stored", provider: "stored-coordinates" };
  }
  if (storedIds.size > 0) {
    return { positions: placeInitialEntities(nodes, edges, storedPositions), authority: "mixed-completion", provider: "current-product" };
  }
  if (optIn === "coarse-objective-prototype-v1") {
    const result = deriveBoundedInitialLayout({
      entities: nodes.map(({ id, label, description }) => ({ id, label, description })),
      relations: edges.map(({ id, sourceId, targetId }) => ({ id, sourceId, targetId })),
      strategy: optIn,
    });
    return { positions: canonicalizeAutomaticPositions(result.positions), authority: "bounded-provider", provider: result.provider, strategy: optIn, status: result.status, reason: result.reason };
  }
  return {
    positions: settleInitialPlacement({ entities: nodes.map(({ id }) => ({ id })), relations: edges.map(({ id, sourceId, targetId }) => ({ id, sourceId, targetId })) }),
    authority: "current",
    provider: "current-product",
  };
}
