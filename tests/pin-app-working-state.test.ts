import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
import { hasPendingUserWork } from "../src/dataset-replacement-safety.ts";

const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const detailSource = await readFile(new URL("../src/components/EntityDetailDialog.tsx", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const i18nSource = await readFile(new URL("../src/i18n.ts", import.meta.url), "utf8");

test("App owns Pin state separately and routes Pin-only work through safety state", () => {
  assert.match(appSource, /useState<WorkingPinState>\(emptyWorkingPinState\)/);
  assert.match(appSource, /setWorkingPinState\(createWorkingPinState\(nextDataset\)\.state\)/);
  assert.match(appSource, /setWorkingPinState\(\(state\) => reconcileWorkingPinState\(state, nextDataset\)\)/);
  assert.match(appSource, /unsavedPins,/);
  assert.match(appSource, /buildAtomicPinSaveCandidate\(\{ dataset, coordinatePositions: persistablePositions, workingPins: workingPinState \}\)/);
});

test("Pin-only changes are pending user work even when coordinates are clean", () => {
  assert.equal(hasPendingUserWork({
    unsavedCoordinates: false,
    unsavedPins: true,
    manualRelationRoute: false,
    manualRelationLabel: false,
    manualNodeLabel: false,
    meaningfulCreationDraft: false,
    meaningfulEntityDetailDraft: false,
    meaningfulRelationDetailDraft: false,
}), true);
});

test("Pin UI keeps working-state actions in Context Menu and Entity Detail without persistent Node decoration", () => {
  assert.match(appSource, /toggleEntityPin\(entityId: string\)/);
  assert.match(appSource, /contextMenu\.kind === "entity" \|\| contextMenu\.kind === "node-label"/);
  assert.match(appSource, /workingPins\[contextMenu\.entityId\] !== undefined \? translate\(locale, "unpinEntity"\) : translate\(locale, "pinEntity"\)/);
  assert.match(appSource, /pinned=\{workingPins\[selectedDetail\.entity\.id\] !== undefined\}/);
  assert.match(appSource, /onPinToggle=\{\(\) => toggleEntityPin\(selectedDetail\.entity\.id\)\}/);
  assert.match(detailSource, /className="detail-pin-section"/);
  assert.match(detailSource, /data-pin-state=\{pinned \? "pinned" : "unpinned"\}/);
  assert.match(detailSource, /onClick=\{onPinToggle\}/);
  assert.match(detailSource, /disabled=\{readOnly\}/);
  assert.match(appSource, /readOnly=\{readOnlyPreview\}/);
  assert.doesNotMatch(appSource, /node-pin-indicator/);
  assert.doesNotMatch(appSource, /node-pinned|node-unpinned/);
  assert.doesNotMatch(stylesSource, /node-pin-indicator|node-pinned|node-unpinned/);
  assert.match(stylesSource, /\.node \.entity-body \{[^}]*filter: drop-shadow/);
  assert.match(i18nSource, /pinEntity: "Pin"/);
  assert.match(i18nSource, /unpinEntity: "Unpin"/);
  assert.match(i18nSource, /pinState: "\\u30d4\\u30f3"/);
  assert.match(i18nSource, /entityPinned: "\\u30d4\\u30f3\\u7559\\u3081\\u6e08\\u307f"/);
  assert.match(i18nSource, /entityUnpinned: "\\u30d4\\u30f3\\u7559\\u3081\\u306a\\u3057"/);
  assert.match(i18nSource, /pinEntity: "\\u30d4\\u30f3\\u7559\\u3081"/);
  assert.match(i18nSource, /unpinEntity: "\\u30d4\\u30f3\\u7559\\u3081\\u3092\\u89e3\\u9664"/);
});
