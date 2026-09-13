import test from 'node:test';
import assert from 'node:assert/strict';
import { structuralFormulations } from '../tools/structural-formulation.mjs';

test('structural research preserves inputs and is invariant to node/edge enumeration', () => {
  const nodes=Array.from({length:8},(_,i)=>({id:String(i)}));
  const edges=nodes.slice(0,4).flatMap(a=>nodes.slice(4).map(b=>({sourceId:a.id,targetId:b.id})));
  const before=JSON.stringify({nodes,edges});
  const a=structuralFormulations(nodes,edges);
  assert.equal(a.length,10);
  assert.deepEqual(a,structuralFormulations(nodes.slice().reverse(),edges.slice().reverse()));
  assert.deepEqual(a,structuralFormulations(nodes,edges.concat(edges, [{sourceId:'0',targetId:'0'}])));
  assert.equal(JSON.stringify({nodes,edges}),before);
  for(const arm of a) {
    assert.deepEqual(Object.keys(arm.positions),nodes.map(n=>n.id));
    for(const p of Object.values(arm.positions) as {x:number;y:number}[])assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
  }
});

test('bounded structural research handles disconnected, empty and singleton graphs and rejects excess size', () => {
  for(const nodes of [[],[{id:'a'}],[{id:'a'},{id:'b'},{id:'c'}]]) {
    for(const arm of structuralFormulations(nodes,[]))for(const p of Object.values(arm.positions) as {x:number;y:number}[])assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
  }
  assert.throws(()=>structuralFormulations(Array.from({length:65},(_,i)=>({id:String(i)})),[]));
  assert.throws(()=>structuralFormulations([{id:'a'},{id:'a'}],[]));
});
