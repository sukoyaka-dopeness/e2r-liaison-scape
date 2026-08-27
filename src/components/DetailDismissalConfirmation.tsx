import { useEffect, useRef } from "react";
import { translate, type Locale } from "../i18n";

type Props = { locale: Locale; onCancel: () => void; onDiscard: () => void };

export function DetailDismissalConfirmation({ locale, onCancel, onDiscard }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCancel(); }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel]);
  return <><button className="detail-backdrop confirmation-backdrop" type="button" aria-label={translate(locale, "cancelDetailDismissal")} onClick={onCancel} /><aside className="detail confirmation detail-dismissal-confirmation" role="dialog" aria-modal="true" aria-labelledby="detail-dismissal-title"><h3 id="detail-dismissal-title">{translate(locale, "detailDismissalTitle")}</h3><p>{translate(locale, "detailDismissalMessage")}</p><div className="detail-actions"><button ref={cancelRef} type="button" onClick={onCancel}>{translate(locale, "cancel")}</button><button type="button" className="danger-confirm" onClick={onDiscard}>{translate(locale, "discardDetailDraft")}</button></div></aside></>;
}
