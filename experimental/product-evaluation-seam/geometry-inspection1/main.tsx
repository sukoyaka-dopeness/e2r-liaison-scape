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
      <span className="geometry-inspection-note">Only stored coordinate values are replaced in an in-memory diagnostic clone. Routing, labels, drag behavior, and Product source remain unchanged. Node body overlap is a hard diagnostic rejection at the existing 76-unit initial-placement clearance. Compare Targeted local corridor refinement with Horizontal-canvas refinement and the new Horizontal canvas with balanced Edge length. Recheck Neil Armstrong / NASA / Lunar Module Eagle, Michael Collins / NASA, NASA / Saturn V, Saturn V / Command Module Columbia, and the crowded NASA corridor. These are diagnostic comparisons, not adoption decisions. Pointer-up side-flip behavior remains a separate open interactive-routing track.</span>
    </div>
    <CandidateMetrics />
    <App />
  </>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><GeometryInspection /></StrictMode>);
