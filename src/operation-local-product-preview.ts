export type PreviewPoint = Readonly<{ x: number; y: number }>;
export type OperationLocalProductPreview = Readonly<{
  operationId: string | number;
  generation: number;
  snapshotIdentity: string;
  candidateFingerprint: string;
  positions: Readonly<Record<string, PreviewPoint>>;
}>;

export function fingerprintPreviewPositions(positions: Readonly<Record<string, PreviewPoint>>): string {
  return Object.keys(positions).sort().map((id) => `${id}:${positions[id]!.x.toFixed(3)},${positions[id]!.y.toFixed(3)}`).join("|");
}

export function validateOperationLocalProductPreview(
  preview: OperationLocalProductPreview | null | undefined,
  expected: Readonly<{ operationId: string | number; generation: number; snapshotIdentity: string; entityIds: readonly string[] }>,
): preview is OperationLocalProductPreview {
  if (!preview || preview.operationId !== expected.operationId || preview.generation !== expected.generation || preview.snapshotIdentity !== expected.snapshotIdentity) return false;
  const ids = Object.keys(preview.positions).sort(); const expectedIds = [...expected.entityIds].sort();
  return ids.length === expectedIds.length
    && ids.every((id, index) => id === expectedIds[index] && Number.isFinite(preview.positions[id]?.x) && Number.isFinite(preview.positions[id]?.y))
    && preview.candidateFingerprint === fingerprintPreviewPositions(preview.positions);
}

export const operationLocalProductPreviewContract = Object.freeze({
  ownership: "temporary Node geometry input only",
  storage: "isolated React memory; never session positions or Dataset",
  disposal: ["explicit-end", "Home/navigation", "Dataset open/replacement", "stale identity"],
  interaction: "read-only",
  authority: "existing Product presentation and viewport pipeline",
});
