import assert from "node:assert/strict";
import test from "node:test";
import { fingerprintPreviewPositions, operationLocalProductPreviewContract, validateOperationLocalProductPreview } from "../src/operation-local-product-preview.ts";

const positions = { a: { x: 10, y: 20 }, b: { x: 30, y: 40 } };
const preview = { operationId: 7, generation: 3, snapshotIdentity: "snapshot", candidateFingerprint: fingerprintPreviewPositions(positions), positions };
const expected = { operationId: 7, generation: 3, snapshotIdentity: "snapshot", entityIds: ["a", "b"] };

test("operation-local preview accepts only the exact operation and complete candidate", () => {
  assert.equal(validateOperationLocalProductPreview(preview, expected), true);
  assert.equal(validateOperationLocalProductPreview({ ...preview, operationId: 6 }, expected), false);
  assert.equal(validateOperationLocalProductPreview({ ...preview, generation: 4 }, expected), false);
  assert.equal(validateOperationLocalProductPreview({ ...preview, snapshotIdentity: "stale" }, expected), false);
  assert.equal(validateOperationLocalProductPreview({ ...preview, candidateFingerprint: "other" }, expected), false);
  assert.equal(validateOperationLocalProductPreview({ ...preview, positions: { a: positions.a } }, expected), false);
});

test("preview contract is non-adopting, disposable, and Product-authority preserving", () => {
  assert.match(operationLocalProductPreviewContract.storage, /never session positions or Dataset/);
  assert.equal(operationLocalProductPreviewContract.interaction, "read-only");
  assert.match(operationLocalProductPreviewContract.authority, /Product presentation/);
  assert.deepEqual(positions, { a: { x: 10, y: 20 }, b: { x: 30, y: 40 } });
});
