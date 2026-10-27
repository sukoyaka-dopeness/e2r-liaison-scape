import type { Dataset, Diagnostic } from "./models";
import { reviewedPayloads } from "./reviewed-sample-payloads.ts";

const extensionId = "draft.github.sukoyaka-dopeness.dimension-assessment";
const specificationId = "draft.github.sukoyaka-dopeness.specification";

/** Informational recognition only; the installed Validator owns the diagnostic result. */
export function isKnownDimensionAssessmentNotice(dataset: Dataset | null, diagnostics: Diagnostic[]): boolean {
  if (!dataset || diagnostics.length !== 2) return false;
  const expected = new Map([
    ["unknown_extension", `/extensions/${extensionId}`],
    ["specification_unavailable", `/extensions/${specificationId}/uses/3/extension`],
  ]);
  if (!diagnostics.every(({ code, path, severity }) => severity === "warning" && expected.get(code) === path)
    || new Set(diagnostics.map(({ code }) => code)).size !== 2) return false;
  const extensions = dataset.extensions;
  if (!extensions || typeof extensions !== "object" || Array.isArray(extensions)) return false;
  const payload = (extensions as Record<string, unknown>)[extensionId];
  const specification = (extensions as Record<string, unknown>)[specificationId];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)
    || !specification || typeof specification !== "object" || Array.isArray(specification)) return false;
  const { specVersion, dimensions, assessments } = payload as Record<string, unknown>;
  const uses = (specification as Record<string, unknown>).uses;
  const declaration = Array.isArray(uses) ? uses.filter((item) => item && typeof item === "object"
    && (item as Record<string, unknown>).extension === extensionId) : [];
  return specVersion === "0.2.0" && Array.isArray(dimensions) && Array.isArray(assessments)
    && (specification as Record<string, unknown>).specVersion === "0.1.0"
    && declaration.length === 1 && (declaration[0] as Record<string, unknown>).version === "0.2.0"
    && reviewedPayloads.includes(JSON.stringify(payload));
}
