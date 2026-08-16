import type { Locale } from "../i18n";
import { translate } from "../i18n";

export function CreditsDialog({ locale, onClose }: { locale: Locale; onClose: () => void }) {
  return <>
    <button className="detail-backdrop credits-backdrop" type="button" aria-label={translate(locale, "closeCredits")} onClick={onClose} />
    <aside className="detail credits-dialog" role="dialog" aria-modal="true" aria-labelledby="credits-title">
      <h2 id="credits-title">{translate(locale, "credits")}</h2>
      <p>LiaisonScape 0.1.0</p>
      <p>Created by sukoyaka-dopeness</p>
      <p>Released {translate(locale, "releaseDatePending")}</p>
      <p>{translate(locale, "aiAcknowledgement")}</p>
      <nav className="credits-links" aria-label={translate(locale, "creditsLinks")}>
        <a href="https://github.com/sukoyaka-dopeness/e2r-liaison-scape" target="_blank" rel="noreferrer">{translate(locale, "liaisonScapeRepository")}</a>
        <a href="https://github.com/sukoyaka-dopeness/e2r-spec" target="_blank" rel="noreferrer">{translate(locale, "e2rSpecificationRepository")}</a>
      </nav>
      <div className="credits-actions"><button type="button" onClick={onClose}>{translate(locale, "close")}</button></div>
    </aside>
  </>;
}
