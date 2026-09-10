import { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";
import App from "../../../src/App";
import { buildEntityGraph } from "../../../src/dataset";
import { solveAutoLayout } from "../../../src/auto-layout";
import "../../../src/styles.css";
import "./main.css";

const diagnosticDatasetUrl = "https://diagnostic.liaisonscape.invalid/apollo-11-product-inspection.en.e2r.json";
const fixtureUrl = `${import.meta.env.BASE_URL}experimental/product-evaluation-seam/actual-inspection/fixtures/apollo-11-spacing-220.en.e2r.json`;
const localSearchPositions = {
  armstrong: { x: 31.342, y: 373.958 },
  aldrin: { x: 222.011, y: 508.891 },
  collins: { x: -42.185, y: 159.000 },
  nasa: { x: 167.263, y: 316.949 },
  columbia: { x: 172.797, y: 73.267 },
  eagle: { x: 359.027, y: 191.533 },
  "saturn-v": { x: 11.156, y: -25.818 },
  moon: { x: 380.534, y: -64.622 },
  hornet: { x: 156.701, y: -168.251 },
};
const targetedLocalCorridorPositions = {
  armstrong: { x: -59.717, y: 357.208 },
  aldrin: { x: 222.011, y: 508.891 },
  collins: { x: -42.185, y: 159.000 },
  nasa: { x: 145.196, y: 337.480 },
  columbia: { x: 172.797, y: 73.267 },
  eagle: { x: 327.422, y: 158.709 },
  "saturn-v": { x: 11.156, y: -25.818 },
  moon: { x: 380.534, y: -64.622 },
  hornet: { x: 156.701, y: -168.251 },
};
const crossingAwarePositions = {
  armstrong: { x: 81.52195178196578, y: 353.2847031633761 },
  aldrin: { x: 259.7062286929358, y: 430.1699006272331 },
  collins: { x: 76.32957767356187, y: 138.12092444915325 },
  nasa: { x: 130.49487076849863, y: 312.98512095043066 },
  columbia: { x: 221.9353670498617, y: 119.05140035670064 },
  eagle: { x: 343.39085336332016, y: 262.924370141413 },
  "saturn-v": { x: -31.796044546104158, y: -3.1044108905196204 },
  moon: { x: 359.18434549022095, y: -92.58917084520496 },
  hornet: { x: 92.39689847726747, y: -114.41400735836851 },
};
const labelAccommodationAwarePositions = {
  armstrong: { x: -16.800818856626748, y: 401.9538301018924 },
  aldrin: { x: 222.011, y: 508.891 },
  collins: { x: -42.185, y: 159 },
  nasa: { x: 200.31500974535382, y: 456.76359694681133 },
  columbia: { x: 172.797, y: 73.267 },
  eagle: { x: 373.4656226719991, y: 216.58198437142744 },
  "saturn-v": { x: 11.156, y: -25.818 },
  moon: { x: 380.534, y: -64.622 },
  hornet: { x: 156.701, y: -168.251 },
};
const presentationAwareRelaxationPositions = {
  armstrong: { x: -5.716999999999999, y: 423.208 },
  aldrin: { x: 222.011, y: 508.891 },
  collins: { x: 17.814999999999998, y: 183 },
  nasa: { x: 127.196, y: 343.48 },
  columbia: { x: 160.797, y: 61.266999999999996 },
  eagle: { x: 315.422, y: 170.709 },
  "saturn-v": { x: 35.156, y: -1.8180000000000014 },
  moon: { x: 332.534, y: -40.622 },
  hornet: { x: 156.701, y: -138.251 },
};
const topologyAwareRelaxationPositions = {
  armstrong: { x: -17.717, y: 357.208 },
  aldrin: { x: 216.011, y: 472.891 },
  collins: { x: -0.18500000000000022, y: 189 },
  nasa: { x: 151.196, y: 331.48 },
  columbia: { x: 160.797, y: 97.267 },
  eagle: { x: 303.422, y: 182.709 },
  "saturn-v": { x: 35.156, y: -1.8180000000000014 },
  moon: { x: 368.534, y: -58.622 },
  hornet: { x: 156.701, y: -108.251 },
};
const labelLengthAwarePositions = {
  armstrong: { x: -152.717, y: 363.208 },
  aldrin: { x: 261.011, y: 595.891 },
  collins: { x: -135.185, y: 141 },
  nasa: { x: 238.196, y: 322.48 },
  columbia: { x: 139.797, y: 136.267 },
  eagle: { x: 327.422, y: 158.709 },
  "saturn-v": { x: 5.156, y: -52.818 },
  moon: { x: 401.534, y: -151.622 },
  hornet: { x: 183.701, y: -255.251 },
};
const horizontalCanvasAwarePositions = {
  armstrong: { x: -116.717, y: 312.208 },
  aldrin: { x: 204.011, y: 490.891 },
  collins: { x: -6.185, y: 177 },
  nasa: { x: 145.196, y: 337.48 },
  columbia: { x: 151.797, y: 31.267 },
  eagle: { x: 321.422, y: 164.709 },
  "saturn-v": { x: 11.156, y: -25.818 },
  moon: { x: 452.534, y: -37.622 },
  hornet: { x: 174.701, y: -96.251 },
};
const balancedEdgeLengthPositions = {
  armstrong: { x: -116.717, y: 312.208 },
  aldrin: { x: 204.011, y: 490.891 },
  collins: { x: -102.185, y: 153 },
  nasa: { x: 139.196, y: 325.48 },
  columbia: { x: 145.797, y: 55.267 },
  eagle: { x: 336.422, y: 158.709 },
  "saturn-v": { x: -33.844, y: -43.818 },
  moon: { x: 407.534, y: -64.622 },
  hornet: { x: 156.701, y: -87.251 },
};
const safeVerticalCompactionPositions = {
  armstrong: { x: -116.717, y: 294.208 },
  aldrin: { x: 204.011, y: 475.891 },
  collins: { x: -102.185, y: 126 },
  nasa: { x: 139.196, y: 325.48 },
  columbia: { x: 145.797, y: 64.267 },
  eagle: { x: 336.422, y: 167.709 },
  "saturn-v": { x: -33.844, y: -43.818 },
  moon: { x: 407.534, y: -64.622 },
  hornet: { x: 156.701, y: -60.251 },
};
const crossingAfterCompactionPositions = {
  armstrong: { x: -104.717, y: 300.208 },
  aldrin: { x: 204.011, y: 475.891 },
  collins: { x: -108.185, y: 114 },
  nasa: { x: 139.196, y: 325.48 },
  columbia: { x: 151.797, y: 58.267 },
  eagle: { x: 336.422, y: 167.709 },
  "saturn-v": { x: -33.844, y: -43.818 },
  moon: { x: 407.534, y: -52.622 },
  hornet: { x: 168.701, y: -48.251 },
};
const globalHorizontalTopologyPositions = {
  armstrong: { x: -134.0465391339618, y: 45.09264205164071 },
  aldrin: { x: -96.97798947530262, y: 398.36791305033864 },
  collins: { x: 15.2778960549082, y: -66.2072202282605 },
  nasa: { x: -12.48795861293533, y: 258.06150610156027 },
  columbia: { x: 212.03663646862498, y: 112.63015193932537 },
  eagle: { x: 230.64408039010652, y: 326.44714148811903 },
  "saturn-v": { x: 186.85772011104916, y: -97.72656955313896 },
  moon: { x: 451.15162688523276, y: 255.88448816711832 },
  hornet: { x: 308.45952731227834, y: 64.31394698329733 },
};
const topologyAwareHorizontalRecompositionPositions = {
  armstrong: { x: -92.0465391339618, y: 63.09264205164071 },
  aldrin: { x: -78.97798947530262, y: 374.36791305033864 },
  collins: { x: 15.2778960549082, y: -66.2072202282605 },
  nasa: { x: -12.48795861293533, y: 258.06150610156027 },
  columbia: { x: 182.03663646862498, y: 142.63015193932537 },
  eagle: { x: 218.64408039010652, y: 326.44714148811903 },
  "saturn-v": { x: 174.85772011104916, y: -61.72656955313896 },
  moon: { x: 415.15162688523276, y: 279.8844881671183 },
  hornet: { x: 308.45952731227834, y: 64.31394698329733 },
};
const verticalSpaceRebalancePositions = {
  armstrong: { x: -116.717, y: 256.3466666666667 },
  aldrin: { x: 204.011, y: 392.6089166666667 },
  collins: { x: -102.185, y: 130.1906666666667 },
  nasa: { x: 139.196, y: 279.8006666666667 },
  columbia: { x: 145.797, y: 83.89091666666667 },
  eagle: { x: 336.422, y: 161.47241666666667 },
  "saturn-v": { x: -33.844, y: 2.827166666666699 },
  moon: { x: 407.534, y: -12.775833333333338 },
  hornet: { x: 156.701, y: -9.497583333333324 },
};
const genericCrossingSearchPositions = {
  armstrong: { x: 392, y: 328 },
  aldrin: { x: 229.94112549695427, y: 441.94112549695427 },
  collins: { x: 392, y: 164 },
  nasa: { x: 0, y: 304 },
  columbia: { x: 448.5685424949238, y: -56.56854249492382 },
  eagle: { x: 588, y: 328 },
  "saturn-v": { x: 56.56854249492379, y: 107.43145750507618 },
  moon: { x: 670.0243866176395, y: 82.02438661763951 },
  hornet: { x: 196, y: 0 },
};
const postStructuralRelaxationPositions = {
  armstrong: { x: 392, y: 328 },
  aldrin: { x: 247.94112549695427, y: 408.94112549695427 },
  collins: { x: 392, y: 164 },
  nasa: { x: 0, y: 319 },
  columbia: { x: 451.2045814642449, y: -10.47665940288703 },
  eagle: { x: 588, y: 328 },
  "saturn-v": { x: 69.29646455628165, y: 120.15937956643404 },
  moon: { x: 622.3259018078045, y: 86.2670273047588 },
  hornet: { x: 196, y: 0 },
};
const fp1NgpPositions = {
  aldrin: { x: 0, y: 0 },
  armstrong: { x: 52.5, y: 6.5625 },
  collins: { x: 105, y: 26.25 },
  columbia: { x: 157.5, y: 59.0625 },
  eagle: { x: 210, y: 105 },
  hornet: { x: 262.5, y: 164.0625 },
  moon: { x: 315, y: 236.25 },
  nasa: { x: 367.5, y: 321.5625 },
  "saturn-v": { x: 420, y: 420 },
};
const candidateDescriptions = {
  current: "Stored Apollo 220 baseline",
  "local-search-v1": "Deterministic local geometry candidate",
  "local-search-v1-plus": "Targeted local corridor refinement",
  "crossing-aware-v1": "Crossing-aware refinement (mixed control)",
  "label-accommodation-v1": "Label-accommodation-aware refinement (mixed control)",
  "presentation-aware-relaxation-v1": "Presentation-aware bounded relaxation (diagnostic)",
  "topology-aware-relaxation-v1": "Topology-aware bounded relaxation (diagnostic)",
  "label-length-aware-v1": "Label-length-aware refinement (mixed control)",
  "horizontal-canvas-v1": "Horizontal-canvas refinement (mixed control)",
  "balanced-edge-length-v1": "Horizontal canvas with balanced Edge length (diagnostic)",
  "safe-vertical-compaction-v1": "Balanced Edge length with safe vertical compaction (diagnostic)",
  "crossing-after-compaction-v1": "Bounded crossing refinement after compaction (diagnostic)",
  "global-horizontal-topology-v1": "Global horizontal recomposition (topology-first)",
  "topology-aware-horizontal-recomposition-v1": "Topology-aware horizontal recomposition (label-aware)",
  "vertical-space-rebalance-v1": "Horizontal topology rebalance (vertical-space only)",
  "generic-crossing-search-v1": "Generic crossing-first structural search (diagnostic)",
  "post-structural-relaxation-v1": "Post-structural constrained relaxation (diagnostic)",
  "source-f0-160": "Source F0 solver, clearance 160",
  "fp1-ngp-420": "FP1-NGP negative control",
} as const;
type CandidateId = keyof typeof candidateDescriptions;
const queryCandidate = new URL(window.location.href).searchParams.get("candidate") as CandidateId | null;
const selectedCandidate: CandidateId = queryCandidate && queryCandidate in candidateDescriptions ? queryCandidate : "current";

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function coordinateMap(dataset: any, candidate: CandidateId) {
  if (candidate === "local-search-v1") return localSearchPositions;
  if (candidate === "local-search-v1-plus") return targetedLocalCorridorPositions;
  if (candidate === "crossing-aware-v1") return crossingAwarePositions;
  if (candidate === "label-accommodation-v1") return labelAccommodationAwarePositions;
  if (candidate === "presentation-aware-relaxation-v1") return presentationAwareRelaxationPositions;
  if (candidate === "topology-aware-relaxation-v1") return topologyAwareRelaxationPositions;
  if (candidate === "label-length-aware-v1") return labelLengthAwarePositions;
  if (candidate === "horizontal-canvas-v1") return horizontalCanvasAwarePositions;
  if (candidate === "balanced-edge-length-v1") return balancedEdgeLengthPositions;
  if (candidate === "safe-vertical-compaction-v1") return safeVerticalCompactionPositions;
  if (candidate === "crossing-after-compaction-v1") return crossingAfterCompactionPositions;
  if (candidate === "global-horizontal-topology-v1") return globalHorizontalTopologyPositions;
  if (candidate === "topology-aware-horizontal-recomposition-v1") return topologyAwareHorizontalRecompositionPositions;
  if (candidate === "vertical-space-rebalance-v1") return verticalSpaceRebalancePositions;
  if (candidate === "generic-crossing-search-v1") return genericCrossingSearchPositions;
  if (candidate === "post-structural-relaxation-v1") return postStructuralRelaxationPositions;
  if (candidate === "fp1-ngp-420") return fp1NgpPositions;
  const graph = buildEntityGraph(dataset);
  if (candidate === "source-f0-160") {
    return solveAutoLayout({
      entities: graph.nodes.map(({ id }) => ({ id })),
      relations: graph.edges.map(({ id, sourceId, targetId }) => ({ id, sourceId, targetId })),
    }, { nodeClearance: 160, iterations: 3 });
  }
  return Object.fromEntries(dataset.entities.map((entity: any) => {
    const values = entity.extensions?.["draft.github.sukoyaka-dopeness.coordinate"]?.coordinates?.[0]?.values;
    return [entity.id, values ? { x: values.x, y: values.y } : undefined];
  }).filter((entry: [string, unknown]) => entry[1]));
}

function materializeCandidate(dataset: any, candidate: CandidateId) {
  const next = cloneValue(dataset);
  const positions = coordinateMap(next, candidate);
  for (const entity of next.entities) {
    const position = positions[entity.id];
    const values = entity.extensions?.["draft.github.sukoyaka-dopeness.coordinate"]?.coordinates?.[0]?.values;
    if (position && values) {
      values.x = position.x;
      values.y = position.y;
    }
  }
  return next;
}

const originalFetch = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const requestedUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (requestedUrl === diagnosticDatasetUrl) {
    const response = await originalFetch(fixtureUrl, init);
    const dataset = await response.json();
    return new Response(JSON.stringify(materializeCandidate(dataset, selectedCandidate)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return originalFetch(input, init);
}) as typeof window.fetch;

if (!window.location.hash.includes("datasetUrl=")) window.location.hash = `datasetUrl=${encodeURIComponent(diagnosticDatasetUrl)}`;

function candidateUrl(candidate: CandidateId) {
  const url = new URL(window.location.href);
  url.searchParams.set("candidate", candidate);
  return `${url.pathname}${url.search}${url.hash}`;
}

function CandidateMetrics() {
  const rows = useMemo(() => [
    ["current", "3", "2", "187.9", "364.6", "510 × 677", "0.753", "0.416", "—"],
    ["local-search-v1", "3", "0", "177.9", "319.9", "423 × 677", "0.625", "0.416", "—"],
    ["local-search-v1-plus", "3", "0", "163.8", "363.3", "440 × 677", "0.650", "0.416", "3043"],
    ["crossing-aware-v1", "1", "2", "116.1", "305.4", "391 × 545", "0.718", "0.506", "—"],
    ["label-accommodation-v1", "3", "1", "177.9", "464.4", "423 × 677", "0.624", "0.416", "—"],
    ["presentation-aware-relaxation-v1", "2", "0", "123.3", "382.5", "338 × 647", "0.523", "0.433", "15338"],
    ["topology-aware-relaxation-v1", "3", "0", "127.4", "292.8", "386 × 581", "0.665", "0.477", "9453"],
    ["label-length-aware-v1", "3", "0", "185.9", "394.6", "485 × 653", "0.727", "0.365", "0"],
    ["horizontal-canvas-v1", "3", "0", "140.1", "394.8", "569 × 587", "0.970", "0.473", "4624"],
    ["balanced-edge-length-v1", "3", "0", "192.4", "410.9", "524 × 578", "0.907", "0.480", "15"],
    ["safe-vertical-compaction-v1", "3", "0", "189.6", "404.0", "524 × 541", "0.970", "0.510", "6"],
    ["crossing-after-compaction-v1", "3", "0", "180.9", "393.8", "516 × 529", "0.976", "0.520", "6"],
    ["global-horizontal-topology-v1", "3", "0", "171.5", "381.6", "585 × 496", "1.180", "0.550", "10322"],
    ["topology-aware-horizontal-recomposition-v1", "3", "0", "141.5", "327.4", "507 × 441", "1.151", "0.610", "5502"],
    ["vertical-space-rebalance-v1", "3", "0", "187.2", "397.6", "524 × 405", "1.293", "0.656", "20"],
    ["generic-crossing-search-v1", "0", "0", "194.0", "356.9", "670 × 499", "1.344", "0.548", "149"],
    ["post-structural-relaxation-v1", "0", "0", "195.7", "352.9", "622 × 419", "1.484", "0.596", "0"],
    ["source-f0-160", "6", "0", "205.0", "413.7", "484 × 542", "0.893", "0.508", "—"],
    ["fp1-ngp-420", "11", "0", "214.7", "466.8", "420 × 420", "1.000", "0.636", "—"],
  ], []);
  return <section className="geometry-inspection-metrics" aria-label="Diagnostic geometry metrics">
    <strong>Diagnostic metrics only — not Product adoption</strong>
    <table><thead><tr><th>candidate</th><th>crossings</th><th>label hits</th><th>route median</th><th>route max</th><th>node extent</th><th>aspect</th><th>fit scale</th><th>usable span penalty</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row[0]}><td><code>{row[0]}</code></td>{row.slice(1).map((value) => <td key={value}>{value}</td>)}</tr>)}</tbody>
    </table>
  </section>;
}

function GeometryInspection() {
  const changeCandidate = (event: React.ChangeEvent<HTMLSelectElement>) => {
    window.location.href = candidateUrl(event.target.value as CandidateId);
  };
  return <>
    <div className="geometry-inspection-seam" aria-label="Geometry candidate controls">
      <span>Actual Product geometry candidate inspection</span>
      <label>Candidate <select value={selectedCandidate} onChange={changeCandidate} aria-label="Geometry candidate">
        {Object.entries(candidateDescriptions).map(([id, description]) => <option key={id} value={id}>{description}</option>)}
      </select></label>
      <span className="geometry-inspection-note">Only stored coordinate values are replaced in an in-memory diagnostic clone. Routing, labels, drag behavior, and Product source remain unchanged. Node body overlap is a hard diagnostic rejection at the existing 76-unit initial-placement clearance. Compare Generic crossing-first structural search with Post-structural constrained relaxation, Balanced Edge length with safe vertical compaction, and Horizontal topology rebalance (vertical-space only). The post-structural candidate makes only small local movements around the user-inspected generic solution; it is a diagnostic result, not Product adoption. Recheck Neil Armstrong / NASA / Lunar Module Eagle, Michael Collins / NASA, NASA / Saturn V, Saturn V / Command Module Columbia, and the crowded NASA corridor. These are diagnostic comparisons, not adoption decisions; pointer-up side-flip behavior remains a separate open interactive-routing track.</span>
    </div>
    <CandidateMetrics />
    <App />
  </>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><GeometryInspection /></StrictMode>);
