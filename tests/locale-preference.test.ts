import assert from "node:assert/strict";
import test from "node:test";
import {
  clearTemporaryLocaleResolution,
  parseRequestedLocale,
  readExplicitLocale,
  readTemporaryLocaleResolution,
  resolveStartupLocale,
  setLocaleFragment,
  TEMPORARY_LOCALE_RESOLUTION_KEY,
  writeTemporaryLocaleResolution,
} from "../src/locale-preference.ts";

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

test("parses only one exact locale request and ignores malformed or duplicate requests", () => {
  assert.deepEqual(parseRequestedLocale("#datasetUrl=https%3A%2F%2Fx.test%2Fd.json&locale=ja"), { kind: "valid", locale: "ja" });
  assert.deepEqual(parseRequestedLocale("#locale=en"), { kind: "valid", locale: "en" });
  for (const hash of ["#locale=ja-JP", "#locale=", "#locale=en&locale=ja", "#locale=%E0%A4%A"]) {
    assert.deepEqual(parseRequestedLocale(hash), { kind: "invalid" });
  }
  assert.deepEqual(parseRequestedLocale("#datasetUrl=https%3A%2F%2Fx.test%2Fd.json"), { kind: "none" });
});

test("valid legacy storage is explicit preference and wins over browser fallback", () => {
  assert.equal(readExplicitLocale(storage({ "liaisonscape.locale": "ja" })), "ja");
  assert.equal(readExplicitLocale(storage({ "liaisonscape.locale": "fr" })), undefined);
  assert.deepEqual(resolveStartupLocale({ requested: { kind: "none" }, saved: "en", browserLanguage: "ja-JP" }), { locale: "en", conflict: false });
  assert.deepEqual(resolveStartupLocale({ requested: { kind: "none" }, browserLanguage: "ja-JP" }), { locale: "ja", conflict: false });
});

test("conflict is limited to differing valid explicit request and saved preference", () => {
  assert.deepEqual(resolveStartupLocale({ requested: { kind: "valid", locale: "ja" }, saved: "en" }), { locale: "en", conflict: true });
  assert.deepEqual(resolveStartupLocale({ requested: { kind: "valid", locale: "ja" }, saved: "ja" }), { locale: "ja", conflict: false });
  assert.deepEqual(resolveStartupLocale({ requested: { kind: "invalid" }, saved: "en" }), { locale: "en", conflict: false });
  assert.deepEqual(resolveStartupLocale({ requested: { kind: "valid", locale: "ja" }, browserLanguage: "en-US" }), { locale: "ja", conflict: false });
});

test("temporary choice suppresses same-request reload conflict without becoming durable preference", () => {
  const session = storage();
  const resolution = { requestedLocale: "ja" as const, effectiveLocale: "en" as const };
  writeTemporaryLocaleResolution(session, resolution);
  assert.deepEqual(readTemporaryLocaleResolution(session), resolution);
  assert.deepEqual(resolveStartupLocale({ requested: { kind: "valid", locale: "ja" }, saved: "en", temporary: readTemporaryLocaleResolution(session) }), { locale: "en", conflict: false });
  assert.equal(session.getItem("liaisonscape.locale"), null);
  clearTemporaryLocaleResolution(session);
  assert.equal(session.getItem(TEMPORARY_LOCALE_RESOLUTION_KEY), null);
  assert.deepEqual(resolveStartupLocale({ requested: { kind: "valid", locale: "ja" }, saved: "en" }), { locale: "en", conflict: true });
});

test("explicit fragment synchronization changes only locale and preserves raw handoff data", () => {
  assert.equal(setLocaleFragment("#datasetUrl=https%3A%2F%2Fx.test%2Fd.json&x=%2F&locale=ja&x=2", "en"), "#datasetUrl=https%3A%2F%2Fx.test%2Fd.json&x=%2F&x=2&locale=en");
  assert.equal(setLocaleFragment("#locale=%E0%A4%A&datasetUrl=x", "ja"), "#datasetUrl=x&locale=ja");
});
