export type DatasetHandoffInvalidReason =
  | "empty-dataset-url"
  | "duplicate-dataset-url"
  | "invalid-url"
  | "unsupported-scheme"
  | "embedded-credentials";

export type TargetObjectType = "Entity" | "Event" | "Relation";
export type RequiredCapability = "relation.inspect" | "relation.delete";

export type TargetedDatasetHandoffInvalidReason =
  | DatasetHandoffInvalidReason
  | "missing-dataset-url"
  | "malformed-target-encoding"
  | "duplicate-target-object-id"
  | "empty-target-object-id"
  | "duplicate-target-object-type"
  | "unsupported-target-object-type"
  | "duplicate-required-capability"
  | "missing-required-capability"
  | "unsupported-capability"
  | "duplicate-target-contract-version"
  | "missing-target-contract-version"
  | "invalid-target-contract-version"
  | "unsupported-target-contract-version";

export type DatasetHandoffFragment =
  | { kind: "none" }
  | { kind: "valid"; datasetUrl: string }
  | { kind: "targeted"; datasetUrl: string; targetObjectId: string; targetObjectType?: TargetObjectType; requiredCapability: RequiredCapability; targetContractVersion: "1" }
  | { kind: "invalid"; reason: DatasetHandoffInvalidReason | TargetedDatasetHandoffInvalidReason };

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

const targetedFields = ["targetContractVersion", "targetObjectId", "targetObjectType", "requiredCapability"] as const;
type TargetedField = typeof targetedFields[number];

function decodeFragmentComponent(value: string): string | null {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return null;
  }
}

function controlledValues(hash: string, field: TargetedField): { values: string[]; malformed: boolean } {
  const body = hash.startsWith("#") ? hash.slice(1) : hash;
  const values: string[] = [];
  let malformed = false;
  for (const pair of body.split("&")) {
    const separator = pair.indexOf("=");
    const rawKey = separator < 0 ? pair : pair.slice(0, separator);
    const key = decodeFragmentComponent(rawKey);
    if (key !== field) continue;
    const rawValue = separator < 0 ? "" : pair.slice(separator + 1);
    const value = decodeFragmentComponent(rawValue);
    if (value === null) malformed = true;
    else values.push(value);
  }
  return { values, malformed };
}

function hasTargetedField(parameters: URLSearchParams): boolean {
  return targetedFields.some((field) => parameters.has(field));
}

function targetedValue(hash: string, parameters: URLSearchParams, field: TargetedField): { values: string[]; malformed: boolean } {
  const parsed = controlledValues(hash, field);
  if (parsed.values.length > 0 || parsed.malformed) return parsed;
  return { values: parameters.getAll(field), malformed: false };
}

export function parseTargetedDatasetHandoffFragment(hash: string): DatasetHandoffFragment {
  const parameters = fragmentParameters(hash);
  if (!hasTargetedField(parameters)) return parseDatasetHandoffFragment(hash);

  const datasetUrls = parameters.getAll("datasetUrl");
  if (datasetUrls.length === 0) return { kind: "invalid", reason: "missing-dataset-url" };
  if (datasetUrls.length > 1) return { kind: "invalid", reason: "duplicate-dataset-url" };
  if (datasetUrls[0] === "") return { kind: "invalid", reason: "empty-dataset-url" };

  const datasetUrl = validateDatasetUrl(datasetUrls[0]);
  if (datasetUrl.kind !== "valid") return datasetUrl;

  const targetId = targetedValue(hash, parameters, "targetObjectId");
  if (targetId.malformed) return { kind: "invalid", reason: "malformed-target-encoding" };
  if (targetId.values.length === 0) return { kind: "invalid", reason: "empty-target-object-id" };
  if (targetId.values.length > 1) return { kind: "invalid", reason: "duplicate-target-object-id" };
  if (targetId.values[0] === "") return { kind: "invalid", reason: "empty-target-object-id" };

  const targetType = targetedValue(hash, parameters, "targetObjectType");
  if (targetType.malformed) return { kind: "invalid", reason: "malformed-target-encoding" };
  if (targetType.values.length > 1) return { kind: "invalid", reason: "duplicate-target-object-type" };
  if (targetType.values.length === 1
    && !["Entity", "Event", "Relation"].includes(targetType.values[0])) {
    return { kind: "invalid", reason: "unsupported-target-object-type" };
  }

  const capability = targetedValue(hash, parameters, "requiredCapability");
  if (capability.malformed) return { kind: "invalid", reason: "malformed-target-encoding" };
  if (capability.values.length === 0) return { kind: "invalid", reason: "missing-required-capability" };
  if (capability.values.length > 1) return { kind: "invalid", reason: "duplicate-required-capability" };
  if (!["relation.inspect", "relation.delete"].includes(capability.values[0])) {
    return { kind: "invalid", reason: "unsupported-capability" };
  }

  const version = targetedValue(hash, parameters, "targetContractVersion");
  if (version.malformed) return { kind: "invalid", reason: "malformed-target-encoding" };
  if (version.values.length === 0) return { kind: "invalid", reason: "missing-target-contract-version" };
  if (version.values.length > 1) return { kind: "invalid", reason: "duplicate-target-contract-version" };
  if (version.values[0] !== "1") {
    return { kind: "invalid", reason: /^\d+$/.test(version.values[0]) ? "unsupported-target-contract-version" : "invalid-target-contract-version" };
  }

  return {
    kind: "targeted",
    datasetUrl: datasetUrl.datasetUrl,
    targetObjectId: targetId.values[0],
    ...(targetType.values.length === 1 ? { targetObjectType: targetType.values[0] as TargetObjectType } : {}),
    requiredCapability: capability.values[0] as RequiredCapability,
    targetContractVersion: "1",
  };
}

export function clearDatasetHandoffFragment(hash: string): string {
  const parameters = fragmentParameters(hash);
  parameters.delete("datasetUrl");
  for (const field of targetedFields) parameters.delete(field);
  const serialized = parameters.toString();
  return serialized ? `#${serialized}` : "";
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
