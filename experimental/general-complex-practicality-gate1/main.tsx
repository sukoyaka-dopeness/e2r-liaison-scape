import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import result from "./result-summary.json";

function GatePage() {
  return <main style={{ padding: 24, fontFamily: "sans-serif" }}><h1>General / Complex Dataset Practicality Gate 1</h1><p>Diagnostic-only source benchmark. Actual Product smoke is performed on the Product surface separately.</p><pre>{JSON.stringify(result, null, 2)}</pre></main>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><GatePage /></StrictMode>);
