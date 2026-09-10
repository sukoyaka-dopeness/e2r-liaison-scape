export type DependencyFingerprint = Readonly<{
  /** Exact identity used for invalidation comparisons. */
  serialized: string;
  /** Compact diagnostic digest; never used as the sole reuse authority. */
  digest: string;
  characterLength: number;
  buildMs: number;
}>;

export type PresentationDependencyTrace = Readonly<{
  stage: "route-selection" | "relation-label" | "node-label" | "feedback";
  pass: "label-free" | "first" | "feedback";
  input: DependencyFingerprint;
  output: DependencyFingerprint;
}>;

function stableEncode(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === undefined) return ["undefined"];
  if (typeof value === "number" && !Number.isFinite(value)) return ["number", String(value)];
  if (typeof value === "bigint") return ["bigint", value.toString()];
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return ["cycle"];
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => stableEncode(item, seen));
  if (value instanceof Map) return ["map", [...value.entries()].map(([key, item]) => [stableEncode(key, seen), stableEncode(item, seen)])];
  if (value instanceof Set) return ["set", [...value.values()].map((item) => stableEncode(item, seen))];
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableEncode((value as Record<string, unknown>)[key], seen)]));
}

function fnv1a64(value: string): string {
  let hash = 14695981039346656037n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return hash.toString(16).padStart(16, "0");
}

export function dependencyFingerprint(value: unknown): DependencyFingerprint {
  const startedAt = performance.now();
  const serialized = JSON.stringify(stableEncode(value));
  return {
    serialized,
    digest: fnv1a64(serialized),
    characterLength: serialized.length,
    buildMs: performance.now() - startedAt,
  };
}
