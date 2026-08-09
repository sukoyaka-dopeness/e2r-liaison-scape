export const MIN_SCALE = 0.5;
export const MAX_SCALE = 2.5;

export function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

export function zoomScale(current: number, direction: "in" | "out"): number {
  return clampScale(current * (direction === "in" ? 1.1 : 0.9));
}
