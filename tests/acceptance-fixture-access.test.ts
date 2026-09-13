import test from "node:test";
import assert from "node:assert/strict";
import { acceptanceFixturePath, acceptanceLayoutPath, parseAcceptanceFixture } from "../src/acceptance-fixture-access.ts";

test("acceptance fixture access permits only named canonical fixtures and locales", () => {
  assert.deepEqual(parseAcceptanceFixture("titanic", "en"), { name: "titanic", locale: "en" });
  assert.deepEqual(parseAcceptanceFixture("apollo-11", "ja"), { name: "apollo-11", locale: "ja" });
  assert.equal(parseAcceptanceFixture("../e2r-spec/examples/titanic", "en"), null);
  assert.equal(parseAcceptanceFixture("titanic", "fr"), null);
});

test("fixture URL remains a server endpoint and does not duplicate fixture content", () => {
  assert.equal(acceptanceFixturePath({ name: "titanic", locale: "en" }), "/__acceptance-fixtures/titanic.en.e2r.json");
  assert.equal(acceptanceLayoutPath({ name: "titanic", locale: "en", arm: "global-placement3" }), "/__acceptance-layouts?fixture=titanic&locale=en&arm=global-placement3");
  assert.equal(acceptanceLayoutPath({ name: "titanic", locale: "ja", arm: "frontier-12" }), "/__acceptance-layouts?fixture=titanic&locale=ja&arm=frontier-12");
});
