import {
  buildNormalizedLayoutGraph,
  settleNormalizedLayoutFromInitialPositions,
  type AutoLayoutInput,
  type AutoLayoutOptions,
  type LayoutPoint,
} from "../../../src/auto-layout.ts";

export const EXPLICIT_SEED_ADAPTER_VERSION = "VSR-SEED-ADAPTER-v1";

export type ExplicitSeedEvaluationInput = {
  layoutInput: AutoLayoutInput;
  initialPositions: Readonly<Record<string, LayoutPoint>>;
  options?: AutoLayoutOptions;
};

export type ExplicitSeedFailureCode =
  | "INVALID_POSITION_SHAPE"
  | "MISSING_NODE_POSITION"
  | "EXTRA_NODE_POSITION"
  | "NON_FINITE_POSITION"
  | "PRODUCT_LAYOUT_FAILURE";

export type ExplicitSeedEvaluationResult =
  | { ok: true; positions: Record<string, LayoutPoint>; coverage: "EXACT_NODE_ID_COVERAGE" }
  | { ok: false; code: ExplicitSeedFailureCode };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isLayoutInput(value: unknown): value is AutoLayoutInput {
  if (!isRecord(value) || !Array.isArray(value.entities) || !Array.isArray(value.relations)) return false;
  return value.entities.every((entity) => isRecord(entity) && typeof entity.id === "string")
    && value.relations.every((relation) => isRecord(relation)
      && typeof relation.id === "string"
      && typeof relation.sourceId === "string"
      && typeof relation.targetId === "string");
}

function failure(code: ExplicitSeedFailureCode): ExplicitSeedEvaluationResult {
  return { ok: false, code };
}

export function settleExplicitSeedEvaluation(input: unknown): ExplicitSeedEvaluationResult {
  if (!isRecord(input) || !isLayoutInput(input.layoutInput) || !isRecord(input.initialPositions)) {
    return failure("INVALID_POSITION_SHAPE");
  }

  let layoutGraph;
  try {
    layoutGraph = buildNormalizedLayoutGraph(input.layoutInput);
  } catch {
    return failure("PRODUCT_LAYOUT_FAILURE");
  }

  const suppliedIds = Object.keys(input.initialPositions);
  const suppliedIdSet = new Set(suppliedIds);
  if (layoutGraph.ids.some((id) => !suppliedIdSet.has(id))) return failure("MISSING_NODE_POSITION");
  const normalizedIdSet = new Set(layoutGraph.ids);
  if (suppliedIds.some((id) => !normalizedIdSet.has(id))) return failure("EXTRA_NODE_POSITION");

  for (const id of layoutGraph.ids) {
    const point = input.initialPositions[id];
    if (!isRecord(point) || typeof point.x !== "number" || typeof point.y !== "number") return failure("INVALID_POSITION_SHAPE");
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return failure("NON_FINITE_POSITION");
  }

  try {
    return {
      ok: true,
      positions: settleNormalizedLayoutFromInitialPositions(layoutGraph, input.initialPositions, input.options),
      coverage: "EXACT_NODE_ID_COVERAGE",
    };
  } catch {
    return failure("PRODUCT_LAYOUT_FAILURE");
  }
}
