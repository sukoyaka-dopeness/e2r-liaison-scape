import { useEffect, useRef } from "react";
import type { Locale } from "../i18n";
import { formatDeleteConfirmation, translate } from "../i18n";
type ConfirmationDialogProps = { locale: Locale; subject: "Entity" | "Relation"; onCancel: () => void; onConfirm: () => void };
export function ConfirmationDialog({ locale, subject, onCancel, onConfirm }: ConfirmationDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);
  return <><button className="detail-backdrop confirmation-backdrop" type="button" aria-label={translate(locale, "cancelDeletion")} onClick={onCancel} /><aside className={`detail confirmation confirmation-${subject.toLowerCase()}`} role="dialog" aria-modal="true" aria-label={translate(locale, "confirmDeletion")}><h3>{translate(locale, "confirmDeletion")}</h3><p>{formatDeleteConfirmation(locale, subject)}</p><div className="detail-actions"><button ref={cancelRef} type="button" onClick={onCancel}>{translate(locale, "cancel")}</button><button type="button" className="danger-confirm" onClick={onConfirm}>{translate(locale, "delete")}</button></div></aside></>;
}
