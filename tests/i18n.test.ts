import assert from "node:assert/strict";
import test from "node:test";
import {
  LOCALE_STORAGE_KEY,
  applyLocale,
  formatDiagnosticSeverity,
  formatDeleteConfirmation,
  formatEntityIncidentWarning,
  formatEntityDeletionRefusal,
  formatGraphSummary,
  formatLoadedDataset,
  formatSelectedEntity,
  formatSelectedRelation,
  formatUnsupportedEventRelations,
  formatRelationCreationRefusal,
  formatRelationDeletionRefusal,
  formatRelationUpdateRefusal,
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
  assert.equal(translate("en", "browserBackDatasetNotice"), "Your Dataset is still open. Continue to return to the workspace.");
  assert.equal(translate("ja", "browserBackDatasetNotice"), "Datasetは開いたままです。「続ける」を選ぶと作業画面に戻れます。");
  assert.equal(translate("ja", "home"), "ホーム");
  assert.equal(translate("ja", "languageEnglish"), "English");
  assert.equal(translate("en", "userGuide"), "English user guide");
  assert.equal(translate("ja", "userGuide"), "日本語ユーザーガイド");
  assert.equal(translate("ja", "footerDescriptor"), "E2Rリレーションシップエディター");
  assert.equal(translate("en", "saveRelation"), "Save Relation");
  assert.equal(translate("en", "relationDetail"), "Relation Detail");
  assert.equal(translate("en", "closeRelationDetail"), "Close Relation Detail");
  assert.equal(translate("en", "cancelDeletion"), "Cancel deletion");
  assert.equal(translate("en", "confirmDeletion"), "Confirm deletion");
  assert.equal(translate("en", "delete"), "Delete");
  assert.equal(translate("ja", "cancelDeletion"), "削除を取り消す");
  assert.equal(translate("ja", "confirmDeletion"), "削除の確認");
  assert.equal(translate("ja", "delete"), "削除");
  assert.equal(formatDeleteConfirmation("en", "Entity"), "Delete this Entity?");
  assert.equal(formatDeleteConfirmation("en", "Relation"), "Delete this Relation?");
  assert.equal(formatDeleteConfirmation("ja", "Entity"), "この Entity を削除しますか？");
  assert.equal(formatDeleteConfirmation("ja", "Relation"), "この Relation を削除しますか？");
  assert.equal(translate("en", "relationDeleteAction"), "Delete Relation");
  assert.equal(translate("ja", "relationDeleteAction"), "つながりを削除");
  assert.equal(translate("ja", "entityShownRelations"), "表示中のつながり");
  assert.equal(translate("ja", "entityDatasetRelations"), "Datasetのつながり");
  assert.equal(translate("ja", "entityDeleteAction"), "エンティティを削除");
  assert.equal(translate("en", "entityDetailTitle"), "Entity Detail");
  assert.equal(translate("en", "relationDetailTitle"), "Relation Detail");
  assert.equal(translate("en", "detailSaveChanges"), "Save Entity");
  assert.equal(translate("ja", "entityDetailTitle"), "エンティティの詳細");
  assert.equal(translate("ja", "relationDetailTitle"), "つながりの詳細");
  assert.equal(translate("ja", "detailSaveChanges"), "変更を保存");
  assert.equal(formatEntityIncidentWarning("ja", 1), "このエンティティには 1 件のつながりがあります。エンティティを削除する前につながりを削除してください。");
  assert.equal(formatEntityIncidentWarning("ja", 2), "このエンティティには 2 件のつながりがあります。エンティティを削除する前につながりを削除してください。");
  assert.equal(translate("en", "automaticRoute"), "Use automatic route");
  assert.equal(translate("en", "automaticLabelPosition"), "Use automatic label position");
  assert.equal(translate("ja", "automaticRoute"), "自動ルートに戻す");
  assert.equal(translate("ja", "automaticLabelPosition"), "ラベル位置を自動に戻す");
  assert.equal(translate("ja", "selectEntityOrRelation"), "エンティティまたはつながりを選択");
  assert.equal(translate("ja", "movedCoordinatesTemporary"), "移動した座標は、保存するまで一時的です。");
  assert.equal(translate("ja", "storedCoordinatesRestored"), "保存済みの座標がある場合は復元されます。");
  assert.equal(translate("ja", "automaticLabelPlacement"), "ラベル位置を自動配置に戻す");
  assert.equal(translate("ja", "movedCoordinatesTemporaryDetail"), "移動した座標は、「座標を保存」ボタンを押すまでの一時的なものです。");
  assert.equal(translate("en", "coordinateDraftMigrationRefusal"), "Could not migrate the Coordinate data to Coordinate Draft. This Dataset cannot be migrated safely.");
  assert.equal(translate("ja", "coordinateDraftMigrationRefusal"), "CoordinateデータをCoordinate Draft（座標仕様ドラフト）へ移行できませんでした。このDatasetは安全に移行できません。");
  assert.equal(translate("en", "coordinateDraftMigrationSuccess"), "Coordinate Prototype migrated to Coordinate Draft 0.1.0.");
  assert.equal(translate("ja", "coordinateDraftMigrationSuccess"), "Coordinate PrototypeからCoordinate Draft 0.1.0（座標仕様ドラフト）へ移行しました。");
  assert.equal(translate("en", "spaceMigrationRefusal"), "Could not migrate the Linkscape coordinates to LiaisonScape. This Dataset cannot be migrated safely.");
  assert.equal(translate("ja", "spaceMigrationRefusal"), "Linkscapeの座標をLiaisonScapeへ移行できませんでした。このDatasetは安全に移行できません。");
  assert.equal(translate("en", "spaceMigrationSuccess"), "Linkscape coordinates migrated to LiaisonScape.");
  assert.equal(translate("ja", "spaceMigrationSuccess"), "Linkscapeの座標をLiaisonScapeへ移行しました。");
  assert.equal(translate("en", "legacyMigrationRefusal"), "Could not migrate the legacy Linkscape coordinates to LiaisonScape. This Dataset cannot be migrated safely.");
  assert.equal(translate("ja", "legacyMigrationRefusal"), "旧Linkscape形式の座標をLiaisonScapeへ移行できませんでした。このDatasetは安全に移行できません。");
  assert.equal(translate("en", "legacyMigrationSuccess"), "Legacy Linkscape coordinates migrated to LiaisonScape.");
  assert.equal(translate("ja", "legacyMigrationSuccess"), "旧Linkscape形式の座標をLiaisonScapeへ移行しました。");
  assert.equal(formatSelectedEntity("en", "entity-1"), "Selected Entity: entity-1");
  assert.equal(formatSelectedEntity("ja", "entity-1"), "選択中のエンティティ: entity-1");
  assert.equal(formatSelectedRelation("en", "relation-1"), "Selected Relation: relation-1");
  assert.equal(formatSelectedRelation("ja", "relation-1"), "選択中のつながり: relation-1");
  assert.equal(formatGraphSummary("en", 1, 1), "1 entity · 1 relation");
  assert.equal(formatGraphSummary("en", 9, 8), "9 entities · 8 relations");
  assert.equal(formatGraphSummary("ja", 1, 1), "1 エンティティ · 1 つながり");
  assert.equal(formatLoadedDataset("en", 1, 1), "Loaded 1 Entity and 1 Relation.");
  assert.equal(formatLoadedDataset("en", 9, 8), "Loaded 9 Entities and 8 Relations.");
  assert.equal(formatLoadedDataset("ja", 9, 8), "9 件のエンティティと 8 件のつながりを読み込みました。");
  assert.equal(formatUnsupportedEventRelations("en", 1), "1 relation involving an Event is not shown in this graph.");
  assert.equal(formatUnsupportedEventRelations("en", 3), "3 relations involving an Event are not shown in this graph.");
  assert.equal(formatUnsupportedEventRelations("ja", 1), "できごとに関係するつながりが 1 件あります。このアプリでは表示されません。");
  assert.equal(formatUnsupportedEventRelations("ja", 3), "できごとに関係するつながりが 3 件あります。このアプリでは表示されません。");
  assert.equal(formatRelationUpdateRefusal("en", "relation_not_found"), "The relation could not be updated. The relation could not be found.");
  assert.equal(formatRelationUpdateRefusal("ja", "relation_not_found"), "つながりを更新できませんでした。 対象のつながりが見つかりません。");
  assert.equal(formatRelationCreationRefusal("en", "relation_endpoint_required"), "The relation could not be created. Select both a source and a target.");
  assert.equal(formatRelationCreationRefusal("ja", "relation_source_entity_required"), "つながりを作成できませんでした。 選択したSource Entityが見つかりません。");
  assert.equal(formatRelationDeletionRefusal("en", "relation_not_found"), "The relation could not be deleted. The relation could not be found.");
  assert.equal(formatEntityDeletionRefusal("ja", "entity_not_found"), "エンティティを削除できませんでした。 対象のエンティティが見つかりません。");
  assert.equal(formatRelationCreationRefusal("en", "future_refusal"), "The relation could not be created. The operation could not be completed.");
  assert.equal(translate("ja", "coordinateSaveSuccess"), "座標を保存しました。");
  assert.equal(translate("en", "jsonLoadFailure"), "Could not load the Dataset. Check the JSON format.");
  assert.equal(translate("ja", "jsonLoadFailure"), "Datasetを読み込めませんでした。JSONの形式を確認してください。");
  assert.equal(translate("en", "datasetValidationFailure"), "Could not open the Dataset. It has validation errors in the Core or supported Extensions.");
  assert.equal(translate("ja", "datasetValidationFailure"), "このDatasetは開けませんでした。Coreまたは対応しているExtensionに検証エラーがあります。");
  assert.equal(translate("en", "exportBlockedValidation"), "Could not export the E2R JSON. The Dataset has validation errors.");
  assert.equal(translate("ja", "exportBlockedValidation"), "E2R JSONを書き出せませんでした。Datasetに検証エラーがあります。");
  assert.equal(translate("en", "exportWithWarnings"), "Exporting the E2R JSON with validation warnings.");
  assert.equal(translate("ja", "exportWithWarnings"), "検証警告がありますが、E2R JSONを書き出します。");
  assert.equal(translate("en", "coordinateDraftWriteRefusal"), "Could not save the coordinates. This Dataset's Coordinate Draft is not in a format that LiaisonScape can safely write.");
  assert.equal(translate("ja", "coordinateDraftWriteRefusal"), "座標を保存できませんでした。このDatasetのCoordinate Draft（座標仕様ドラフト）は、LiaisonScapeが安全に書き込める形式ではありません。");
  assert.equal(translate("en", "coordinatePayloadWriteRefusal"), "Could not save the coordinates. The moved coordinates remain temporary because the existing Coordinate or Specification data cannot be safely written.");
  assert.equal(translate("ja", "coordinatePayloadWriteRefusal"), "座標を保存できませんでした。既存のCoordinateまたはSpecificationデータに安全に書き込めないため、移動した座標は一時的なままです。");
  assert.equal(translate("en", "guides"), "Guides");
  assert.equal(translate("en", "canvasActions"), "Canvas actions");
  assert.equal(translate("ja", "guides"), "ガイド");
  assert.equal(translate("ja", "canvasActions"), "キャンバス操作");
  assert.equal(translate("ja", "datasetMetadata"), "Dataset メタデータ");
  assert.equal(translate("ja", "validationDiagnostics"), "検証診断");
  assert.equal(formatDiagnosticSeverity("en", "error"), "Error");
  assert.equal(formatDiagnosticSeverity("en", "warning"), "Warning");
  assert.equal(formatDiagnosticSeverity("ja", "error"), "エラー");
  assert.equal(formatDiagnosticSeverity("ja", "warning"), "警告");
  assert.equal(translate("en", "diagnosticCodeLabel"), "Code");
  assert.equal(translate("en", "diagnosticPathLabel"), "Path");
  assert.equal(translate("ja", "diagnosticCodeLabel"), "コード");
  assert.equal(translate("ja", "diagnosticPathLabel"), "場所");
  assert.equal(translate("en", "datasetIdNotAssigned"), "Not assigned");
  assert.equal(translate("ja", "datasetIdNotAssigned"), "未設定");
  assert.equal(translate("ja", "graphViewControls"), "グラフ表示操作");
  assert.equal(translate("ja", "moveZoomControls"), "ズーム操作を移動");
  assert.equal(translate("ja", "saveRelation"), "つながりを作成");
});
