// Pure, browser-compatible research generator. No presentation or Dataset writes.
// Fixed iteration/size bounds; returned coordinates are floats until caller finalization.
export function structuralFormulations(nodes, edges) {
  const ids = nodes.map(n => n.id).sort();
  if (ids.length > 64 || edges.length > 256 || new Set(ids).size !== ids.length) throw new Error('structural research input bound');
  const n = ids.length, index = new Map(ids.map((id, i) => [id, i]));
  const adj = ids.map(() => new Set());
  for (const e of edges) {
    const a = index.get(e.sourceId), b = index.get(e.targetId);
    if (a !== undefined && b !== undefined && a !== b) { adj[a].add(b); adj[b].add(a); }
  }
  const neighbors = adj.map(a => [...a].sort((a,b) => a-b));
  const distance = ids.map((_, start) => {
    const d = ids.map(() => Infinity), queue = [start]; d[start] = 0;
    for (let q=0; q<queue.length; q++) for (const j of neighbors[queue[q]]) if (!Number.isFinite(d[j])) { d[j]=d[queue[q]]+1; queue.push(j); }
    return d;
  });
  const root = ids.map((_,i)=>i).sort((a,b)=>adj[b].size-adj[a].size || a-b)[0] ?? 0;
  const layers = new Map();
  for(let i=0;i<n;i++) { const k=Number.isFinite(distance[root][i])?distance[root][i]:n+i; const layer=layers.get(k)??[];layer.push(i);layers.set(k,layer); }
  const ranks=[...layers.values()];
  for(let sweep=0;sweep<12;sweep++) {
    const rank=new Map(ranks.flatMap(layer=>layer.map((id,i)=>[id,i])));
    for(const layer of (sweep%2?ranks.slice().reverse():ranks)) layer.sort((a,b)=>{
      const mean=i=>neighbors[i].reduce((s,j)=>s+rank.get(j),0)/Math.max(1,neighbors[i].length);
      return mean(a)-mean(b)||a-b;
    });
  }
  const layered=ids.map(()=>({x:0,y:0}));
  ranks.forEach((layer,k)=>layer.forEach((id,i)=>layered[id]={x:k*240,y:(i-(layer.length-1)/2)*180}));
  // Graph-distance stress: bounded simultaneous majorization, with deterministic
  // circle initialization to avoid collapsed symmetric eigenvector coordinates.
  let stress=ids.map((_,i)=>({x:240*Math.cos(2*Math.PI*i/Math.max(1,n)),y:240*Math.sin(2*Math.PI*i/Math.max(1,n))}));
  for(let step=0;step<160;step++) stress=stress.map((p,i)=>{
    let x=0,y=0,wSum=0;
    for(let j=0;j<n;j++) if(i!==j) {
      const target=180*(Number.isFinite(distance[i][j])?distance[i][j]:4);
      const w=1/(target*target), dx=p.x-stress[j].x,dy=p.y-stress[j].y, length=Math.hypot(dx,dy)||1;
      x+=w*(stress[j].x+target*dx/length);y+=w*(stress[j].y+target*dy/length);wSum+=w;
    }
    return wSum?{x:x/wSum,y:y/wSum}:p;
  });
  // Structural twins share an ordinary-neighbor signature. Split each class
  // across opposite spokes rather than place every bipartite vertex on two rails.
  const twins=new Map();
  for(let i=0;i<n;i++){const key=neighbors[i].join(',');const group=twins.get(key)??[];group.push(i);twins.set(key,group);}
  const groups=[...twins.values()].sort((a,b)=>b.length-a.length||a[0]-b[0]);
  const spoke=ids.map(()=>({x:0,y:0}));
  groups.forEach((group,k)=>group.forEach((id,i)=>{
    const angle=Math.PI*k/Math.max(2,groups.length)+(i%2)*Math.PI;
    const radius=120+Math.floor(i/2)*170;
    spoke[id]={x:radius*Math.cos(angle),y:radius*Math.sin(angle)};
  }));
  const result=[];
  // One deterministic circular ordering optimized only for interleaved ordinary
  // endpoint pairs. No routed paths or label geometry enter this objective.
  let order=ids.map((_,i)=>i);
  const pairs=neighbors.flatMap((ns,i)=>ns.filter(j=>i<j).map(j=>[i,j]));
  let calls=0;
  const crossingScore=o=>{
    calls++; const at=new Map(o.map((id,i)=>[id,i]));let score=0;
    for(let i=0;i<pairs.length;i++)for(let j=i+1;j<pairs.length;j++){
      const [a,b]=pairs[i], [c,d]=pairs[j];if(a===c||a===d||b===c||b===d)continue;
      const low=Math.min(at.get(a),at.get(b)),high=Math.max(at.get(a),at.get(b));
      if((at.get(c)>low&&at.get(c)<high)!==(at.get(d)>low&&at.get(d)<high))score++;
    }return score;
  };
  let best=crossingScore(order);
  for(let pass=0;pass<8&&calls<2048;pass++){
    let changed=false;
    for(let i=0;i<n&&calls<2048;i++)for(let j=i+1;j<n&&calls<2048;j++){
      const next=order.slice();[next[i],next[j]]=[next[j],next[i]];const score=crossingScore(next);
      if(score<best){order=next;best=score;changed=true;}
    }if(!changed)break;
  }
  const ring=ids.map(()=>({x:0,y:0}));
  order.forEach((id,i)=>ring[id]={x:Math.max(150,n*30)*Math.cos(2*Math.PI*i/Math.max(1,n)),y:Math.max(150,n*30)*Math.sin(2*Math.PI*i/Math.max(1,n))});
  let ringStress=ring;
  for(let step=0;step<160;step++) ringStress=ringStress.map((p,i)=>{
    let x=0,y=0,wSum=0;
    for(let j=0;j<n;j++)if(i!==j){const target=180*(Number.isFinite(distance[i][j])?distance[i][j]:4),w=1/(target*target),dx=p.x-ringStress[j].x,dy=p.y-ringStress[j].y,length=Math.hypot(dx,dy)||1;x+=w*(ringStress[j].x+target*dx/length);y+=w*(ringStress[j].y+target*dy/length);wSum+=w;}
    return wSum?{x:x/wSum,y:y/wSum}:p;
  });
  for(const [family,points] of [['layered-barycenter',layered],['distance-stress',stress],['twin-spokes',spoke],['crossing-ring',ring],['ordered-stress',ringStress]]) {
    // Enforce a minimum center clearance using only node geometry.
    let minimum=Infinity;
    for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)minimum=Math.min(minimum,Math.hypot(points[i].x-points[j].x,points[i].y-points[j].y));
    const scale=Math.max(1,110/Math.max(1e-6,minimum));
    for(const rotate of [false,true]) result.push({family:family+(rotate?'-rotated':''),positions:Object.fromEntries(ids.map((id,i)=>[id,rotate?{x:points[i].y*scale*.88,y:points[i].x*scale*1.12}:{x:points[i].x*scale*.88,y:points[i].y*scale*1.12}]))});
  }
  return result;
}
