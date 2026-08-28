import type { Dataset, E2RObject } from "./models";
import type { TargetObjectType } from "./dataset-handoff";

export type RelationTargetResolution =
  | { kind: "resolved"; relation: E2RObject }
  | { kind: "target-not-found" }
  | { kind: "target-type-mismatch"; actualType: TargetObjectType };

function objectType(dataset: Dataset, id: string): TargetObjectType | null {
  if (dataset.entities.some((object) => object.id === id)) return "Entity";
  if (dataset.events.some((object) => object.id === id)) return "Event";
  if (dataset.relations.some((object) => object.id === id)) return "Relation";
  return null;
}

export function resolveRelationTarget(
  dataset: Dataset,
  targetObjectId: string,
  targetObjectType?: TargetObjectType,
): RelationTargetResolution {
  const actualType = objectType(dataset, targetObjectId);
  if (!actualType) return { kind: "target-not-found" };
  if (targetObjectType && targetObjectType !== actualType) return { kind: "target-type-mismatch", actualType };
  if (actualType !== "Relation") return { kind: "target-type-mismatch", actualType };
  const relation = dataset.relations.find((object) => object.id === targetObjectId);
  return relation ? { kind: "resolved", relation } : { kind: "target-not-found" };
}
