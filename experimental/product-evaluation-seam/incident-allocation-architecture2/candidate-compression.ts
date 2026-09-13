export type CompressibleIncidentCandidate = {
  id: string;
  gap: number;
  center: number;
  ordinaryPolicy: string;
  hardFailures: readonly string[];
  score: number;
};

export const COMPRESSED_GAP_FAMILY = [40, 56, 72, 88, 176] as const;
export const COMPRESSED_CENTER_FAMILY = [-96, -64, 0, 64, 96] as const;
export function isCompressedGeometryFamilyMember(gap: number, center: number) {
  return (COMPRESSED_GAP_FAMILY as readonly number[]).includes(gap)
    && (COMPRESSED_CENTER_FAMILY as readonly number[]).includes(center);
}

/** Keep a small geometry family; feasibility remains an audit result, not a pruning signal. */
export function compressIncidentCandidates<T extends CompressibleIncidentCandidate>(candidates: readonly T[], maxCandidates = 30): T[] {
  if (candidates.length <= maxCandidates) return [...candidates];
  const selected = candidates.filter(({ gap, center }) => isCompressedGeometryFamilyMember(gap, center));
  const bestPerPolicy = new Map<string, T>();
  for (const candidate of candidates) {
    const prior = bestPerPolicy.get(candidate.ordinaryPolicy);
    if (!prior || candidate.score < prior.score || candidate.score === prior.score && candidate.id < prior.id) bestPerPolicy.set(candidate.ordinaryPolicy, candidate);
  }
  const output = [...selected, ...bestPerPolicy.values()].filter(({ id }, index, values) => values.findIndex((candidate) => candidate.id === id) === index);
  return output.length <= maxCandidates
    ? output.sort((left, right) => left.id.localeCompare(right.id))
    : output.sort((left, right) => left.hardFailures.length - right.hardFailures.length || left.score - right.score || left.id.localeCompare(right.id)).slice(0, maxCandidates).sort((left, right) => left.id.localeCompare(right.id));
}
