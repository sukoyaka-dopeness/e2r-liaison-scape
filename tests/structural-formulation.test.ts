import test from 'node:test';
import assert from 'node:assert/strict';
import { structuralFormulations } from '../tools/structural-formulation.mjs';
import { structuralFormulations2 } from '../tools/structural-formulation2.mjs';

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

test('guarded crossing grid is deterministic, compact, and preserves structural inputs', () => {
  const nodes=Array.from({length:14},(_,i)=>({id:String(i)}));
  const edges=nodes.slice(0,7).flatMap(a=>nodes.slice(7).map(b=>({sourceId:a.id,targetId:b.id})));
  const before=JSON.stringify({nodes,edges});
  const first=structuralFormulations2(nodes,edges);
  assert.equal(first.length,12);
  assert.deepEqual(first,structuralFormulations2(nodes.toReversed(),edges.toReversed()));
  assert.equal(JSON.stringify({nodes,edges}),before);
  for(const candidate of first) {
    const points=Object.values(candidate.positions) as {x:number;y:number}[];
    assert.equal(points.length,nodes.length);
    const xs=points.map(({x})=>x), ys=points.map(({y})=>y);
    assert.ok(Math.max(...xs)-Math.min(...xs)<=750);
    assert.ok(Math.max(...ys)-Math.min(...ys)<=450);
    assert.ok(candidate.cheap.objectiveCalls<=768);
  }
});

test('guarded crossing grid ignores self and duplicate edges and keeps bounded controls', () => {
  const nodes=[{id:'a'},{id:'b'},{id:'c'}];
  const edges=[{sourceId:'a',targetId:'b'}];
  assert.deepEqual(structuralFormulations2(nodes,edges),structuralFormulations2(nodes,edges.concat(edges,{sourceId:'a',targetId:'a'})));
  assert.throws(()=>structuralFormulations2(Array.from({length:65},(_,i)=>({id:String(i)})),[]));
  assert.throws(()=>structuralFormulations2([{id:'a'},{id:'a'}],[]));
});
