import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("Locale Conflict actions match NarrativeLine copy in each target language", async () => {
  const server = await createServer({
    root: process.cwd(),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
  });
  try {
    const { LocaleConflictDialog } = await server.ssrLoadModule("/src/components/LocaleConflictDialog.tsx");
    const cases = [
      { saved: "en", requested: "ja", expected: ['lang="en">Continue in English</button>', 'lang="ja">日本語で表示</button>'], savedLabel: "Continue in English" },
      { saved: "ja", requested: "en", expected: ['lang="ja">日本語で続ける</button>', 'lang="en">Show in English</button>'], savedLabel: "日本語で続ける" },
    ] as const;

    for (const { saved, requested, expected, savedLabel } of cases) {
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
      assert.ok(actionButtons[0].endsWith(expected[0]));
      assert.ok(actionButtons[1].endsWith(expected[1]));
      assert.match(html, new RegExp(`aria-label="${savedLabel}"`));
      assert.doesNotMatch(actionButtons.join(" "), /saved language|requested by link|保存済みの言語|リンクで指定された言語/);
    }
  } finally {
    await server.close();
  }
});
