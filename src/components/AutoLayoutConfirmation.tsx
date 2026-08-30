import { useEffect, useRef } from "react";
import type { Locale } from "../i18n";
import { translate } from "../i18n";
type Props = { locale: Locale; onCancel: () => void; onConfirm: () => void };
export function AutoLayoutConfirmation({ locale, onCancel, onConfirm }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancelRef.current?.focus(); }, []);
  return <>
    <button className="detail-backdrop confirmation-backdrop" type="button" aria-label={translate(locale, "cancelAutoLayout")} onClick={onCancel} />
    <aside className="detail confirmation confirmation-auto-layout" role="dialog" aria-modal="true" aria-labelledby="auto-layout-confirmation-title">
      <h3 id="auto-layout-confirmation-title">{translate(locale, "autoLayoutConfirmationTitle")}</h3>
      <p>{translate(locale, "autoLayoutConfirmationMessage")}</p>
      <div className="detail-actions"><button ref={cancelRef} type="button" onClick={onCancel}>{translate(locale, "cancel")}</button><button type="button" onClick={onConfirm}>{translate(locale, "replacePositions")}</button></div>
    </aside>
  </>;
}
