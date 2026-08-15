import assert from "node:assert/strict";
import test from "node:test";
import {
  LOCALE_STORAGE_KEY,
  applyLocale,
  detectLocale,
  getInitialLocale,
  readStoredLocale,
  saveLocale,
  translate,
} from "../src/i18n.ts";

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
  };
}

test("detects Japanese browser languages and defaults other languages to English", () => {
  assert.equal(detectLocale("ja-JP"), "ja");
  assert.equal(detectLocale("ja"), "ja");
  assert.equal(detectLocale("en-US"), "en");
  assert.equal(detectLocale(undefined), "en");
});

test("stored locale takes precedence over browser language", () => {
  const saved = storage({ [LOCALE_STORAGE_KEY]: "en" });
  assert.equal(readStoredLocale(saved), "en");
  assert.equal(getInitialLocale(saved, "ja-JP"), "en");
  assert.equal(getInitialLocale(storage(), "ja-JP"), "ja");
});

test("invalid stored locale is ignored", () => {
  const saved = storage({ [LOCALE_STORAGE_KEY]: "fr" });
  assert.equal(readStoredLocale(saved), null);
  assert.equal(getInitialLocale(saved, "en-US"), "en");
});

test("saves an Application locale preference without Dataset involvement", () => {
  const saved = storage();
  saveLocale(saved, "ja");
  assert.equal(saved.getItem(LOCALE_STORAGE_KEY), "ja");
});

test("applies the locale to document language", () => {
  const target = { documentElement: { lang: "en" } };
  applyLocale("ja", target);
  assert.equal(target.documentElement.lang, "ja");
});

test("dictionary contains the foundation messages for both locales", () => {
  assert.equal(translate("en", "newDataset"), "New Dataset");
  assert.equal(translate("en", "home"), "Home");
  assert.equal(translate("en", "languageJapanese"), "日本語");
  assert.equal(translate("ja", "newDataset"), "新しいDataset");
  assert.equal(translate("ja", "openDataset"), "E2R Datasetを開く");
  assert.equal(translate("ja", "continueEditing"), "編集を続ける");
  assert.equal(translate("ja", "home"), "ホーム");
  assert.equal(translate("ja", "languageEnglish"), "English");
  assert.equal(translate("en", "userGuide"), "English user guide");
  assert.equal(translate("ja", "userGuide"), "日本語ユーザーガイド");
  assert.equal(translate("ja", "footerDescriptor"), "E2Rリレーションシップエディター");
  assert.equal(translate("en", "saveRelation"), "Save Relation");
  assert.equal(translate("ja", "saveRelation"), "つながりを作成");
});
