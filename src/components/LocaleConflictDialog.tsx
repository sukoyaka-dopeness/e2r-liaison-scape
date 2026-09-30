import { useEffect, useRef } from "react";
import { translate, type Locale } from "../i18n";

type Props = {
  locale: Locale;
  requestedLocale: Locale;
  onUseSaved: () => void;
  onUseRequested: () => void;
};

export function LocaleConflictDialog({ locale, requestedLocale, onUseSaved, onUseRequested }: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const savedRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { savedRef.current?.focus(); }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onUseSaved(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const buttons = Array.from(dialogRef.current.querySelectorAll<HTMLButtonElement>("button"));
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (index === -1 || (event.shiftKey && index === 0) || (!event.shiftKey && index === buttons.length - 1)) {
        event.preventDefault();
        buttons[event.shiftKey ? buttons.length - 1 : 0]?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onUseSaved]);

  const requestedLabel = translate(requestedLocale, requestedLocale === "ja" ? "languageJapanese" : "languageEnglish");
  return <>
    <button className="detail-backdrop confirmation-backdrop" type="button" aria-label={translate(locale, "useSavedLocale")} onClick={onUseSaved} />
    <aside ref={dialogRef} className="detail confirmation locale-conflict" role="alertdialog" aria-modal="true" aria-labelledby="locale-conflict-title">
      <h3 id="locale-conflict-title">{translate(locale, "localeConflictTitle")}</h3>
      <p>{translate(locale, "localeConflictMessage")}</p>
      <div className="detail-actions">
        <button ref={savedRef} type="button" onClick={onUseSaved}>{translate(locale, "useSavedLocale")} ({translate(locale, locale === "ja" ? "languageJapanese" : "languageEnglish")})</button>
        <button type="button" onClick={onUseRequested}>{translate(locale, "useRequestedLocale")} ({requestedLabel})</button>
      </div>
    </aside>
  </>;
}
