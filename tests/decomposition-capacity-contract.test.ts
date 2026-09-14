import test from 'node:test';
import assert from 'node:assert/strict';
import { decompositionCapacityAudit } from '../tools/decomposition-capacity-contract.mjs';

const decomposable = () => ({
  nodes: Array.from({ length: 7 }, (_, i) => ({ id: String(i) })),
  edges: [
    { id: 'a', sourceId: '0', targetId: '1', label: 'alpha' },
    { id: 'b', sourceId: '0', targetId: '2', label: 'beta' },
    { id: 'c', sourceId: '0', targetId: '3', label: 'gamma' },
    { id: 'd', sourceId: '3', targetId: '4', label: 'delta' },
    { id: 'e', sourceId: '3', targetId: '5', label: 'epsilon' },
    { id: 'f', sourceId: '3', targetId: '6', label: 'zeta' },
  ],
});

const dense = () => ({
  nodes: Array.from({ length: 14 }, (_, i) => ({ id: String(i) })),
  edges: Array.from({ length: 7 }, (_, left) => Array.from({ length: 7 }, (_, right) => ({ id: `${left}-${right}`, sourceId: String(left), targetId: String(7 + right), label: '' }))).flat(),
});

test('decomposition is deterministic and preserves explicit shared-endpoint demand', () => {
  const input = decomposable();
  const before = JSON.stringify(input);
  const first = decompositionCapacityAudit(input.nodes, input.edges);
  const second = decompositionCapacityAudit([...input.nodes].reverse(), [...input.edges].reverse());
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(input), before);
  assert.ok(first.decomposition.componentCount >= 4);
  assert.equal(first.capacityContract.boundaryCount, 2);
  assert.ok(first.capacityContract.contracts.every((contract) => contract.relationCount > 0));
  assert.equal(first.capacityContract.status, 'global-coupling-remains');
  assert.ok(first.capacityContract.globalBottleneckCount > 0);
});

test('dense biconnected input remains a global core instead of being falsely decomposed', () => {
  const result = decompositionCapacityAudit(dense().nodes, dense().edges);
  assert.equal(result.decomposition.componentCount, 1);
  assert.equal(result.decomposition.hasGlobalCore, true);
  assert.equal(result.decomposition.topologySignal, 'global-core-retained');
  assert.equal(result.capacityContract.boundaryCount, 0);
  assert.ok(result.boundedness.maxLocalStates >= 25_000);
  assert.ok(result.boundedness.stateCapHits > 0);
});
