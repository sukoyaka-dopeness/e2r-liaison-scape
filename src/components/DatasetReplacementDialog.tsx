import { useEffect, useRef } from "react";
import { replacementActions, type ReplacementAction } from "../dataset-replacement-safety";
import { translate, type Locale } from "../i18n";

type Props = { locale: Locale; datasetModified: boolean; pendingUserWork: boolean; onCancel: () => void; onDiscard: () => void; onExportAndContinue: () => void; onExportDataset: () => void };

export function DatasetReplacementDialog({ locale, datasetModified, pendingUserWork, onCancel, onDiscard, onExportAndContinue, onExportDataset }: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  const actions = replacementActions(datasetModified, pendingUserWork);
  useEffect(() => {
    firstRef.current?.focus();
  }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCancel(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button"));
      if (focusable.length === 0) return;
      const index = focusable.indexOf(document.activeElement as HTMLElement);
      if (index === -1 || (event.shiftKey && index === 0) || (!event.shiftKey && index === focusable.length - 1)) {
        event.preventDefault(); focusable[event.shiftKey ? focusable.length - 1 : 0]?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onCancel]);
  const button = (action: ReplacementAction) => action === "cancel"
    ? <button key={action} ref={firstRef} type="button" onClick={onCancel}>{translate(locale, "cancel")}</button>
    : action === "discard-and-continue"
      ? <button key={action} type="button" className="danger-confirm" onClick={onDiscard}>{translate(locale, pendingUserWork ? "discardWorkAndContinue" : "discardAndContinue")}</button>
      : action === "export-and-continue"
        ? <button key={action} type="button" onClick={onExportAndContinue}>{translate(locale, "exportAndContinue")}</button>
        : <button key={action} type="button" onClick={onExportDataset}>{translate(locale, "exportDatasetOnly")}</button>;
  return <><button className="detail-backdrop confirmation-backdrop" type="button" aria-label={translate(locale, "cancelReplacement")} onClick={onCancel} /><aside ref={dialogRef} className="detail confirmation replacement-confirmation" role="dialog" aria-modal="true" aria-labelledby="dataset-replacement-title"><h3 id="dataset-replacement-title">{translate(locale, "datasetReplacementTitle")}</h3><p>{translate(locale, "datasetReplacementMessage")}</p><div className="detail-actions">{actions.map(button)}</div></aside></>;
}
