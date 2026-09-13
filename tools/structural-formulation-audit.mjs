import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { structuralFormulations } from './structural-formulation.mjs';
const scaling=process.argv.includes('--scaling');
const small=process.argv.includes('--small')||scaling;
const g3=process.argv.includes('--g3');
const cells=scaling?['synthetic:k10-10','synthetic:k12-12']:['lighthouse-restoration-demo','titanic-final-voyage','apollo-11-mission'].flatMap(f=>['en','ja'].map(l=>`../e2r-spec/examples/${f}.${l}.e2r.json`)).concat(['synthetic:k7-7','synthetic:k6-8','synthetic:k8-8','synthetic:k5-9','synthetic:k7-7-minus-one']);
const rows=[];
for(const fixture of cells) for(const arm of (g3?['off']:small?['structural-native-small']:['structural-native-audit',fixture.startsWith('synthetic:')?'frontier-adaptive-12':'frontier-12'])) {
  const p=spawnSync(process.execPath,['tools/generic-crossing-search.mjs',fixture],{encoding:'utf8',maxBuffer:100*1024*1024,env:{...process.env,E2R_GLOBAL_PLACEMENT_ABLATION:arm,E2R_GLOBAL_PLACEMENT_MODE:'viewport-anisotropic',E2R_GLOBAL_SPACING_SCALE:'.88',E2R_GLOBAL_SPACING_Y:'1.12',E2R_GLOBAL_SPACING_STAGE2:'off',E2R_RELAXATION_FINAL_CANONICALIZATION:'round-once',E2R_PRESENTATION_GEOMETRY_CACHE:'1',E2R_PRESENTATION_EXACT_CANDIDATE_REUSE:'1',E2R_PRESENTATION_COST_PROFILE:'0'}});
  if(p.status!==0)throw new Error(p.stderr||String(p.error));
  const o=JSON.parse(p.stdout);
  const small=c=>({family:c.family,metrics:Object.fromEntries(['score','crossings','labelRouteHits','labelNear20','labelOverlap','overlapPairs','minimumSeparation','extent','aspectRatio','fitScale','routeMedian','routeMax'].map(k=>[k,c.metrics[k]]))});
  const row={fixture,arm,graph:o.graph,elapsedMs:o.elapsedMs,full:o.profile.fullPresentationEvaluations,selected:small(o.selected),fingerprint:o.selectedPositionFingerprint,digest:o.selectedPresentation.digest,candidates:o.candidates.map(small)};
  rows.push(row); console.log(JSON.stringify({...row,candidates:undefined}));
}
fs.mkdirSync('experimental/structural-formulation1',{recursive:true});
fs.writeFileSync(`experimental/structural-formulation1/${g3?'g3':scaling?'scaling':small?'small':'audit'}.json`,JSON.stringify(rows,null,2)+'\n');
const files=['tools/structural-formulation.mjs','tools/generic-crossing-search.mjs','src/graph-presentation.ts','src/viewport.ts',...['lighthouse-restoration-demo','titanic-final-voyage','apollo-11-mission'].flatMap(f=>['en','ja'].map(l=>`../e2r-spec/examples/${f}.${l}.e2r.json`))];
fs.writeFileSync('experimental/structural-formulation1/provenance.json',JSON.stringify({node:process.version,files:Object.fromEntries(files.map(f=>[f,createHash('sha256').update(fs.readFileSync(f)).digest('hex')])),roundOnce:true,geometryCache:true,exactMetadataReuse:true,productDefaultChanged:false},null,2)+'\n');
if(small&&!scaling) {
  const audit=JSON.parse(fs.readFileSync('experimental/structural-formulation1/audit.json','utf8'));
  const comparisons=rows.map(row=>{const previous=audit.find(r=>r.fixture===row.fixture&&r.arm==='structural-native-audit');return {fixture:row.fixture,sameFingerprint:previous.fingerprint===row.fingerprint,sameDigest:previous.digest===row.digest,sameMetrics:JSON.stringify(previous.selected.metrics)===JSON.stringify(row.selected.metrics)};});
  fs.writeFileSync('experimental/structural-formulation1/comparison.json',JSON.stringify(comparisons,null,2)+'\n');
  if(comparisons.some(r=>!r.sameFingerprint||!r.sameDigest||!r.sameMetrics))throw new Error('small portfolio changed audited selection');
  const generation=[];
  for(const [n,dense] of [[16,true],[24,true],[32,true],[64,false]]) {
    const nodes=Array.from({length:n},(_,i)=>({id:String(i)}));
    const edges=dense?nodes.slice(0,n/2).flatMap(a=>nodes.slice(n/2).map(b=>({sourceId:a.id,targetId:b.id}))):nodes.slice(1).map((b,i)=>({sourceId:nodes[i].id,targetId:b.id}));
    const ms=[];for(let r=0;r<3;r++){const t=performance.now();structuralFormulations(nodes,edges);ms.push(performance.now()-t);}
    generation.push({nodes:n,edges:edges.length,ms});
  }
  fs.writeFileSync('experimental/structural-formulation1/generation-scaling.json',JSON.stringify(generation,null,2)+'\n');
}
