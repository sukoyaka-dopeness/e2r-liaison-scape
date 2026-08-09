import { useState } from "react";
import { loadDataset, serializeDataset, type Dataset, type Diagnostic } from "./dataset";

const emptyDataset: Dataset = { version: "1.0", entities: [], events: [], relations: [] };

export default function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [message, setMessage] = useState("Import an E2R Dataset to begin.");

  function open(raw: string) {
    const result = loadDataset(raw);
    setDiagnostics(result.diagnostics);
    if (result.parseError) {
      setDataset(null);
      setMessage(`Import failed: ${result.parseError}`);
      return;
    }
    if (!result.dataset) {
      setDataset(null);
      setMessage("Dataset is invalid according to the Core or supported Extensions.");
      return;
    }
    setDataset(result.dataset);
    setMessage(`Loaded ${result.dataset.entities.length} Entities and ${result.dataset.relations.length} Relations.`);
  }

  function exportDataset() {
    if (!dataset) return;
    const blob = new Blob([serializeDataset(dataset)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "e2r-dataset.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main>
      <h1>Linkscape</h1>
      <p>Entity-first E2R relationship graph.</p>
      <input
        type="file"
        accept="application/json,.json,.e2r.json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void file.text().then(open);
        }}
      />
      <button type="button" disabled={!dataset} onClick={exportDataset}>Export E2R JSON</button>
      <p role="status">{message}</p>
      {diagnostics.length > 0 && (
        <ul aria-label="Validation diagnostics">
          {diagnostics.map((diagnostic, index) => (
            <li key={`${diagnostic.code}-${index}`}>{diagnostic.severity}: {diagnostic.code} ({diagnostic.path})</li>
          ))}
        </ul>
      )}
      {dataset && <p>{dataset.entities.length} Entity nodes loaded. Graph rendering is the next MVP step.</p>}
    </main>
  );
}
