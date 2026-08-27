import { useEffect, useRef } from "react";
import { translate, type Locale } from "../i18n";

type Props = { locale: Locale; onCancel: () => void; onDiscard: () => void };

export function CreationDismissalConfirmation({ locale, onCancel, onDiscard }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCancel(); }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel]);
  return <><button className="detail-backdrop confirmation-backdrop" type="button" aria-label={translate(locale, "cancelCreationDismissal")} onClick={onCancel} /><aside className="detail confirmation creation-dismissal-confirmation" role="dialog" aria-modal="true" aria-labelledby="creation-dismissal-title"><h3 id="creation-dismissal-title">{translate(locale, "creationDismissalTitle")}</h3><p>{translate(locale, "creationDismissalMessage")}</p><div className="detail-actions"><button ref={cancelRef} type="button" onClick={onCancel}>{translate(locale, "cancel")}</button><button type="button" className="danger-confirm" onClick={onDiscard}>{translate(locale, "discardCreationDraft")}</button></div></aside></>;
}
