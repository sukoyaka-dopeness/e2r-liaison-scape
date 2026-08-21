export type DatasetHandoffInvalidReason =
  | "empty-dataset-url"
  | "duplicate-dataset-url"
  | "invalid-url"
  | "unsupported-scheme"
  | "embedded-credentials";

export type DatasetHandoffFragment =
  | { kind: "none" }
  | { kind: "valid"; datasetUrl: string }
  | { kind: "invalid"; reason: DatasetHandoffInvalidReason };

function fragmentParameters(hash: string): URLSearchParams {
  return new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
}

function validateDatasetUrl(value: string): DatasetHandoffFragment {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { kind: "invalid", reason: "invalid-url" };
  }
  if (url.protocol !== "https:") return { kind: "invalid", reason: "unsupported-scheme" };
  if (url.username || url.password) return { kind: "invalid", reason: "embedded-credentials" };
  return { kind: "valid", datasetUrl: url.href };
}

export function parseDatasetHandoffFragment(hash: string): DatasetHandoffFragment {
  const parameters = fragmentParameters(hash);
  const values = parameters.getAll("datasetUrl");
  if (values.length === 0) return { kind: "none" };
  if (values.length > 1) return { kind: "invalid", reason: "duplicate-dataset-url" };
  if (values[0] === "") return { kind: "invalid", reason: "empty-dataset-url" };
  return validateDatasetUrl(values[0]);
}

export function updateDatasetHandoffFragment(hash: string, datasetUrl: string | null): string {
  const parameters = fragmentParameters(hash);
  parameters.delete("datasetUrl");
  if (datasetUrl !== null) parameters.append("datasetUrl", datasetUrl);
  const serialized = parameters.toString();
  return serialized ? `#${serialized}` : "";
}
