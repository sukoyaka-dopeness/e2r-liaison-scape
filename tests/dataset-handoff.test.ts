import assert from "node:assert/strict";
import test from "node:test";
import { clearDatasetHandoffFragment, parseDatasetHandoffFragment, parseTargetedDatasetHandoffFragment, updateDatasetHandoffFragment } from "../src/dataset-handoff.ts";

test("parses absent and unrelated fragments as no handoff", () => {
  assert.deepEqual(parseDatasetHandoffFragment(""), { kind: "none" });
  assert.deepEqual(parseDatasetHandoffFragment("#"), { kind: "none" });
  assert.deepEqual(parseDatasetHandoffFragment("#foo=bar"), { kind: "none" });
});

test("accepts one absolute HTTPS dataset URL and ignores unknown parameters", () => {
  assert.deepEqual(
    parseDatasetHandoffFragment("#datasetUrl=https%3A%2F%2Fdata.example%2Fdataset.json"),
    { kind: "valid", datasetUrl: "https://data.example/dataset.json" },
  );
  assert.deepEqual(
    parseDatasetHandoffFragment("#foo=bar&datasetUrl=https%3A%2F%2Fdata.example%2Fdataset.json"),
    { kind: "valid", datasetUrl: "https://data.example/dataset.json" },
  );
});

test("rejects empty and duplicate datasetUrl parameters", () => {
  assert.deepEqual(parseDatasetHandoffFragment("#datasetUrl="), { kind: "invalid", reason: "empty-dataset-url" });
  assert.deepEqual(parseDatasetHandoffFragment("#datasetUrl=https%3A%2F%2Fa.example%2Fa&datasetUrl=https%3A%2F%2Fb.example%2Fb"), { kind: "invalid", reason: "duplicate-dataset-url" });
});

test("rejects relative, non-HTTPS, and credential-bearing URLs", () => {
  for (const [hash, reason] of [
    ["#datasetUrl=%2Fdataset.json", "invalid-url"],
    ["#datasetUrl=http%3A%2F%2Fdata.example%2Fdataset.json", "unsupported-scheme"],
    ["#datasetUrl=file%3A%2F%2F%2Fdataset.json", "unsupported-scheme"],
    ["#datasetUrl=data%3Aapplication%2Fjson%2C%257B%257D", "unsupported-scheme"],
    ["#datasetUrl=javascript%3Aalert(1)", "unsupported-scheme"],
    ["#datasetUrl=https%3A%2F%2Fuser%3Apass%40data.example%2Fdataset.json", "embedded-credentials"],
  ] as const) {
    assert.deepEqual(parseDatasetHandoffFragment(hash), { kind: "invalid", reason });
  }
});

test("removes datasetUrl while preserving unknown parameters", () => {
  assert.equal(updateDatasetHandoffFragment("#foo=bar&datasetUrl=https%3A%2F%2Fa.example%2Fa", null), "#foo=bar");
  assert.equal(updateDatasetHandoffFragment("#datasetUrl=https%3A%2F%2Fa.example%2Fa", null), "");
});

test("adds or replaces exactly one datasetUrl without erasing unrelated parameters", () => {
  assert.equal(updateDatasetHandoffFragment("#foo=bar", "https://data.example/dataset.json"), "#foo=bar&datasetUrl=https%3A%2F%2Fdata.example%2Fdataset.json");
  assert.equal(updateDatasetHandoffFragment("#foo=bar&datasetUrl=https%3A%2F%2Fa.example%2Fa&datasetUrl=https%3A%2F%2Fb.example%2Fb", "https://data.example/dataset.json"), "#foo=bar&datasetUrl=https%3A%2F%2Fdata.example%2Fdataset.json");
  assert.equal(updateDatasetHandoffFragment("#foo=bar&x=1", "https://data.example/a b.json"), "#foo=bar&x=1&datasetUrl=https%3A%2F%2Fdata.example%2Fa+b.json");
});

test("keeps ordinary v0 parsing unchanged when targeted metadata is absent", () => {
  assert.deepEqual(
    parseTargetedDatasetHandoffFragment("#locale=ja&foo=bar&datasetUrl=https%3A%2F%2Fdata.example%2Fdataset.json"),
    { kind: "valid", datasetUrl: "https://data.example/dataset.json" },
  );
});

test("parses a valid targeted Relation inspection request exactly once", () => {
  assert.deepEqual(
    parseTargetedDatasetHandoffFragment("#locale=ja&datasetUrl=https%3A%2F%2Fdata.example%2Fdataset.json&targetObjectId=relation%2F%E9%96%A2%E4%BF%82&targetObjectType=Relation&requiredCapability=relation.inspect&targetContractVersion=1"),
    {
      kind: "targeted",
      datasetUrl: "https://data.example/dataset.json",
      targetObjectId: "relation/関係",
      targetObjectType: "Relation",
      requiredCapability: "relation.inspect",
      targetContractVersion: "1",
    },
  );
});

test("rejects malformed, duplicate, missing, and unsupported targeted metadata", () => {
  const cases = [
    ["#targetObjectId=relation-1&requiredCapability=relation.inspect&targetContractVersion=1", "missing-dataset-url"],
    ["#datasetUrl=https%3A%2F%2Fdata.example%2Fdataset.json&targetObjectId=%E0%A4%A&requiredCapability=relation.inspect&targetContractVersion=1", "malformed-target-encoding"],
    ["#datasetUrl=https%3A%2F%2Fdata.example%2Fdataset.json&targetObjectId=relation-1&targetObjectId=relation-2&requiredCapability=relation.inspect&targetContractVersion=1", "duplicate-target-object-id"],
    ["#datasetUrl=https%3A%2F%2Fdata.example%2Fdataset.json&targetObjectId=&requiredCapability=relation.inspect&targetContractVersion=1", "empty-target-object-id"],
    ["#datasetUrl=https%3A%2F%2Fdata.example%2Fdataset.json&targetObjectId=relation-1&targetObjectType=relation&requiredCapability=relation.inspect&targetContractVersion=1", "unsupported-target-object-type"],
    ["#datasetUrl=https%3A%2F%2Fdata.example%2Fdataset.json&targetObjectId=relation-1&requiredCapability=relation.archive&targetContractVersion=1", "unsupported-capability"],
    ["#datasetUrl=https%3A%2F%2Fdata.example%2Fdataset.json&targetObjectId=relation-1&requiredCapability=relation.inspect", "missing-target-contract-version"],
    ["#datasetUrl=https%3A%2F%2Fdata.example%2Fdataset.json&targetObjectId=relation-1&requiredCapability=relation.inspect&targetContractVersion=2", "unsupported-target-contract-version"],
  ] as const;
  for (const [hash, reason] of cases) assert.deepEqual(parseTargetedDatasetHandoffFragment(hash), { kind: "invalid", reason });
});

test("accepts delete as a transport token without changing v0 cleanup", () => {
  assert.deepEqual(
    parseTargetedDatasetHandoffFragment("#datasetUrl=https%3A%2F%2Fdata.example%2Fdataset.json&targetObjectId=relation-1&requiredCapability=relation.delete&targetContractVersion=1"),
    {
      kind: "targeted",
      datasetUrl: "https://data.example/dataset.json",
      targetObjectId: "relation-1",
      requiredCapability: "relation.delete",
      targetContractVersion: "1",
    },
  );
  assert.equal(
    clearDatasetHandoffFragment("#locale=ja&foo=bar&datasetUrl=https%3A%2F%2Fdata.example%2Fa&targetObjectId=relation-1&requiredCapability=relation.inspect&targetContractVersion=1"),
    "#locale=ja&foo=bar",
  );
});
