import test from "node:test";
import assert from "node:assert/strict";
import { readAcceptancePayload, storeAcceptancePayload } from "../src/acceptance-payload-reopen.ts";

test("acceptance payload bridge round-trips the exact serialized Dataset", () => {
  const values = new Map<string, string>();
  const storage = { setItem: (key: string, value: string) => values.set(key, value), getItem: (key: string) => values.get(key) ?? null };
  const raw = '{"version":"1.0","entities":[{"id":"saved"}],"events":[],"relations":[]}';
  storeAcceptancePayload(storage, raw);
  assert.equal(readAcceptancePayload(storage), raw);
});
