import type { Diagnostic } from "../models";
import { translate, type Locale } from "../i18n";

export function SampleExtensionNotice({ locale, diagnostics, scope }: {
  locale: Locale;
  diagnostics: Diagnostic[];
  scope: "current" | "candidate";
}) {
  return <details className="sample-extension-notice">
    <summary>{locale === "ja" ? "追加情報" : "Additional information"}</summary>
    <p>{locale === "ja"
      ? `この${scope === "candidate" ? "置き換え候補" : "Dataset"}には、Dimension Assessment 0.2.0という追加データがあります。LiaisonScapeにはその内容を表示・編集する機能はありません。`
      : `This ${scope === "candidate" ? "replacement candidate" : "Dataset"} contains Dimension Assessment 0.2.0 additional data. LiaisonScape cannot display or edit its contents.`}</p>
    <p>{locale === "ja"
      ? "公式Lighthouse JAサンプルでは、限定的なグラフ編集と書き出しで追加データの保持を確認しています。このDatasetの内容の正しさや、すべての編集経路での保持は保証されません。グラフの表示・編集は続けられます。"
      : "The official Lighthouse JA sample retained this additional data in tested graph edits and Export. This does not guarantee its validity or preservation through every edit. You can continue viewing and editing the graph."}</p>
    <details className="sample-extension-technical">
      <summary>{locale === "ja" ? "診断詳細" : "Diagnostic details"}</summary>
      <ul aria-label={translate(locale, "validationDiagnostics")}>
        {diagnostics.map((diagnostic, index) => <li key={`${diagnostic.code}-${index}`}>
          <span>{translate(locale, "diagnosticCodeLabel")}: <code>{diagnostic.code}</code></span>{" · "}
          <span>{locale === "ja" ? "重要度" : "Severity"}: <code>{diagnostic.severity}</code></span>{" · "}
          <span>{translate(locale, "diagnosticPathLabel")}: <code>{diagnostic.path}</code></span>
        </li>)}
      </ul>
    </details>
  </details>;
}
