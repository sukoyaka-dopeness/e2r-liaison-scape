import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("Locale Conflict has fixed bilingual questions and English/Japanese actions", async () => {
  const server = await createServer({
    root: process.cwd(),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
  });
  try {
    const { LocaleConflictDialog } = await server.ssrLoadModule("/src/components/LocaleConflictDialog.tsx");
    const cases = [
      { saved: "en", requested: "ja" },
      { saved: "ja", requested: "en" },
    ] as const;

    for (const { saved, requested } of cases) {
      const html = renderToStaticMarkup(React.createElement(LocaleConflictDialog, {
        locale: saved,
        requestedLocale: requested,
        onUseSaved: () => {},
        onUseRequested: () => {},
      }));
      const actionButtons = [...html.matchAll(/<button\b[^>]*>.*?<\/button>/gs)]
        .map(([button]) => button)
        .filter((button) => /\blang="(?:en|ja)"/.test(button));

      assert.equal(actionButtons.length, 2);
      assert.ok(actionButtons[0].endsWith('lang="en">English</button>'));
      assert.ok(actionButtons[1].endsWith('lang="ja">日本語</button>'));
      assert.match(html, /<span lang="en">Which language would you like to use\?<\/span>/);
      assert.match(html, /<span lang="ja">どちらの言語で表示しますか？<\/span>/);
      assert.match(html, /aria-describedby="locale-conflict-detail"/);
      assert.doesNotMatch(actionButtons.join(" "), /saved language|requested by link|保存済みの言語|リンクで指定された言語/);
    }
  } finally {
    await server.close();
  }
});
