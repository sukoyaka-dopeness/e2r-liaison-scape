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
    ["current", "3", "2", "187.9", "364.6", "510 × 677"],
    ["local-search-v1", "3", "0", "177.9", "319.9", "423 × 677"],
    ["source-f0-160", "6", "0", "205.0", "413.7", "484 × 542"],
    ["fp1-ngp-420", "11", "0", "214.7", "466.8", "420 × 420"],
  ], []);
  return <section className="geometry-inspection-metrics" aria-label="Diagnostic geometry metrics">
    <strong>Diagnostic metrics only — not Product adoption</strong>
    <table><thead><tr><th>candidate</th><th>crossings</th><th>label hits</th><th>route median</th><th>route max</th><th>node extent</th></tr></thead>
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
      <span className="geometry-inspection-note">Only stored coordinate values are replaced in an in-memory diagnostic clone. Routing, labels, drag behavior, and Product source remain unchanged.</span>
    </div>
    <CandidateMetrics />
    <App />
  </>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><GeometryInspection /></StrictMode>);
