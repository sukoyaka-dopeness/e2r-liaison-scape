import { useEffect, useRef } from "react";
import { replacementActions, type ReplacementAction } from "../dataset-replacement-safety";
import type { Diagnostic } from "../dataset";
import { translate, type Locale } from "../i18n";

type Props = { locale: Locale; datasetModified: boolean; pendingUserWork: boolean; diagnostics: Diagnostic[]; onCancel: () => void; onDiscard: () => void; onExportAndContinue: () => void; onExportDataset: () => void };

export function DatasetReplacementDialog({ locale, datasetModified, pendingUserWork, diagnostics, onCancel, onDiscard, onExportAndContinue, onExportDataset }: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  const actions = replacementActions(datasetModified, pendingUserWork);
  useEffect(() => {
    const initialFocus = dialogRef.current?.querySelector<HTMLElement>(".candidate-diagnostics summary") ?? firstRef.current;
    initialFocus?.focus();
  }, [diagnostics]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCancel(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), summary"));
      if (focusable.length === 0) return;
      const index = focusable.indexOf(document.activeElement as HTMLElement);
      const nextIndex = index === -1
        ? (event.shiftKey ? focusable.length - 1 : 0)
        : (index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
      event.preventDefault();
      focusable[nextIndex]?.focus();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onCancel, diagnostics]);
  const button = (action: ReplacementAction) => action === "cancel"
    ? <button key={action} ref={firstRef} type="button" onClick={onCancel}>{translate(locale, "cancel")}</button>
    : action === "discard-and-continue"
      ? <button key={action} type="button" className="danger-confirm" onClick={onDiscard}>{translate(locale, pendingUserWork ? "discardWorkAndContinue" : "discardAndContinue")}</button>
      : action === "export-and-continue"
        ? <button key={action} type="button" onClick={onExportAndContinue}>{translate(locale, "exportAndContinue")}</button>
        : <button key={action} type="button" onClick={onExportDataset}>{translate(locale, "exportDatasetOnly")}</button>;
  const warnings = diagnostics.filter(({ severity }) => severity === "warning");
  return <><button className="detail-backdrop confirmation-backdrop" type="button" aria-label={translate(locale, "cancelReplacement")} onClick={onCancel} /><aside ref={dialogRef} className="detail confirmation replacement-confirmation" role="dialog" aria-modal="true" aria-labelledby="dataset-replacement-title"><h3 id="dataset-replacement-title">{translate(locale, "datasetReplacementTitle")}</h3><p>{translate(locale, "datasetReplacementMessage")}</p>{warnings.length > 0 && <details className="candidate-diagnostics"><summary>{translate(locale, "replacementCandidateWarnings")}</summary><ul aria-label={translate(locale, "replacementCandidateWarnings")}>{warnings.map((diagnostic, index) => <li key={`${diagnostic.code}-${index}`}><span>{translate(locale, "diagnosticCodeLabel")}: {diagnostic.code}</span><span>{translate(locale, "diagnosticPathLabel")}: {diagnostic.path}</span></li>)}</ul></details>}<div className="detail-actions">{actions.map(button)}</div></aside></>;
}
