import { useEffect, useRef } from "react";
import type { Locale } from "../i18n";

type Props = {
  locale: Locale;
  requestedLocale: Locale;
  onUseSaved: () => void;
  onUseRequested: () => void;
};

function finishLocaleChoice(action: () => void) {
  action();
  window.requestAnimationFrame(() => {
    if (document.activeElement === document.body) document.querySelector<HTMLElement>("header a, header button")?.focus();
  });
}

export function LocaleConflictDialog({ locale, requestedLocale, onUseSaved, onUseRequested }: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const savedRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { savedRef.current?.focus(); }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); finishLocaleChoice(onUseSaved); return; }
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

  return <>
    <button className="detail-backdrop confirmation-backdrop" type="button" tabIndex={-1} aria-hidden="true" onClick={() => finishLocaleChoice(onUseSaved)} />
    <aside ref={dialogRef} className="detail confirmation locale-conflict" role="alertdialog" aria-modal="true" aria-labelledby="locale-conflict-title" aria-describedby="locale-conflict-detail">
      <h3 id="locale-conflict-title"><span lang="en">Which language would you like to use?</span><span lang="ja">どちらの言語で表示しますか？</span></h3>
      <p id="locale-conflict-detail" className="locale-conflict-help"><span lang="en">Your choice applies to this visit only. Your saved language will not change.</span><span lang="ja">この選択は今回の表示にのみ適用されます。保存済みの言語は変更されません。</span></p>
      <div className="detail-actions">
        {(["en", "ja"] as const).map(language => <button key={language} ref={language === locale ? savedRef : undefined} type="button" lang={language} onClick={() => finishLocaleChoice(language === requestedLocale ? onUseRequested : onUseSaved)}>{language === "en" ? "English" : "日本語"}</button>)}
      </div>
    </aside>
  </>;
}
