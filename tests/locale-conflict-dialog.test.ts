import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { createDomTestEnvironment } from "./helpers/dom-test-environment.ts";
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


test('locale dismissal restores the brand after the resolving commit, including delayed choices', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
  try {
    const { LocaleConflictDialog } = await server.ssrLoadModule('/src/components/LocaleConflictDialog.tsx');
    for (const saved of ['en', 'ja'] as const) for (const action of ['en', 'ja', 'escape', 'backdrop']) {
      const env = createDomTestEnvironment();
      env.installGlobal("IS_REACT_ACT_ENVIRONMENT", true);
      const container = env.document.createElement('div'); env.document.body.append(container);
      const root = createRoot(container), frames: FrameRequestCallback[] = [], choices: string[] = [];
      env.window.requestAnimationFrame = (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; };
      const drainFrames = () => { for (const frame of frames.splice(0)) frame(0); };
      const header = () => React.createElement('header', null, React.createElement('a', { className: 'app-brand', href: '/' }, 'App'), React.createElement('button', null, 'Locale'));
      const requested = saved === 'en' ? 'ja' : 'en';
      const props = { locale: saved, requestedLocale: requested, onUseSaved: () => choices.push(saved), onUseRequested: () => choices.push(requested) };
      try {
        await act(async () => root.render(React.createElement(React.StrictMode, null, header(), React.createElement(LocaleConflictDialog, props))));
        drainFrames();
        assert.equal(env.document.activeElement?.getAttribute("lang"), saved);
        const buttons = [...container.querySelectorAll<HTMLButtonElement>('[role=alertdialog] button')];
        buttons[1].focus();
        env.document.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
        assert.equal(env.document.activeElement, buttons[0]);
        env.document.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
        assert.equal(env.document.activeElement, buttons[1]);
        await act(async () => {
          if (action === 'escape') env.document.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          else if (action === 'backdrop') container.querySelector<HTMLButtonElement>('.confirmation-backdrop')!.click();
          else buttons[action === 'en' ? 0 : 1].click();
        });
        assert.deepEqual(choices, [action === 'en' || action === 'ja' ? action : saved]);
        // The language render may be delayed: an early frame must not be the only restoration chance.
        drainFrames();
        await act(async () => root.render(React.createElement(React.StrictMode, null, header())));
        drainFrames();
        assert.equal(env.document.activeElement, container.querySelector('header a.app-brand'));
      } finally { await act(async () => root.unmount()); drainFrames(); await env.cleanup(); }
    }
  } finally { await server.close(); }
});
