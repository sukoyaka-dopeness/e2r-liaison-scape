export type PlacementOwnership = "automatic" | "user";
export type PlacementTarget = "relation-route" | "relation-label" | "node-label";
export type HoverPresentation = { kind: PlacementTarget | "entity"; title?: string; description?: string; ownership?: PlacementOwnership };

export function placementOwnership(isManual: boolean): PlacementOwnership {
  return isManual ? "user" : "automatic";
}

export function boundedHoverDescription(value: string, maxLength = 120): string {
  const normalized = value.trim().replace(/\s+/gu, " ");
  return normalized.length > maxLength ? `${Array.from(normalized).slice(0, maxLength - 1).join("")}…` : normalized;
}

export function composeHoverLines(
  kind: "entity" | "node-label" | "relation-label" | "relation-route",
  values: { name?: string; description?: string; source?: string; target?: string; ownership: string; self?: boolean },
): string[] {
  const bound = (value: string | undefined, max = 56) => boundedHoverDescription(value ?? "", max);
  if (kind === "entity") return bound(values.name) ? [bound(values.name)] : [];
  if (kind === "node-label") {
    const description = bound(values.description, 96);
    return description ? [description, values.ownership] : [values.ownership];
  }
  if (kind === "relation-label") {
    const name = bound(values.name);
    return name ? [name, values.ownership] : [values.ownership];
  }
  if (values.self) return [bound(values.source), values.ownership].filter(Boolean);
  return [bound(values.source), bound(values.target), values.ownership].filter(Boolean);
}
