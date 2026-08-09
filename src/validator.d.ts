declare module "@sukoyaka-dopeness/e2r-validator" {
  export type ValidatorDiagnostic = {
    severity: "error" | "warning";
    code: string;
    path: string;
    relatedIds?: string[];
  };

  export function validateDataset(value: unknown): {
    valid: boolean;
    diagnostics: ValidatorDiagnostic[];
  };
}
