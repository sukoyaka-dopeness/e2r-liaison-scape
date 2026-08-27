export type Locale = "en" | "ja";
export type DiagnosticSeverity = "error" | "warning";

export const LOCALE_STORAGE_KEY = "liaisonscape.locale";

export type LocaleStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type LocaleDocument = {
  documentElement: { lang: string };
};

export const messages = {
  en: {
    getStarted: "Get Started",
    homeDescription: "Create and edit E2R relationship graphs centered on Entities and Relations.",
    home: "Home",
    openWorkspaceDataset: "Open Dataset",
    exportDataset: "Export E2R JSON",
    addEntity: "Add Entity",
    cancel: "Cancel",
    edit: "Edit",
    cancelReplacement: "Cancel Dataset replacement",
    datasetReplacementTitle: "Replace Dataset?",
    datasetReplacementMessage: "Current work may be lost. Choose how to continue.",
    discardAndContinue: "Discard and Continue",
    discardWorkAndContinue: "Discard work and Continue",
    exportAndContinue: "Export and Continue",
    exportDatasetOnly: "Export Dataset",
    cancelDeletion: "Cancel deletion",
    cancelDetailDismissal: "Cancel closing detail",
    detailDismissalTitle: "Discard unsaved changes?",
    detailDismissalMessage: "This detail has unsaved changes. Discard them and close?",
    discardDetailDraft: "Discard Changes",
    cancelCreationDismissal: "Cancel closing creation",
    creationDismissalTitle: "Discard unsaved creation draft?",
    creationDismissalMessage: "You have unsaved changes for this new object. Discard them and close?",
    discardCreationDraft: "Discard and Close",
    confirmDeletion: "Confirm deletion",
    delete: "Delete",
    addRelation: "Add Relation",
    createEntity: "Create Entity",
    createRelation: "Create Relation",
    sourceEntity: "Source Entity",
    targetEntity: "Target Entity",
    selectSource: "Select source",
    selectTarget: "Select target",
    name: "Name",
    description: "Description",
    saveEntity: "Save Entity",
    saveCoordinates: "Save node coordinates",
    more: "More",
    migrateCoordinateDraft: "Migrate Coordinate to Draft",
    migrateLinkscapeCoordinates: "Migrate Linkscape coordinates to LiaisonScape",
    migrateLegacyCoordinates: "Migrate legacy Linkscape coordinates to LiaisonScape",
    zoomOut: "Zoom out",
    zoomIn: "Zoom in",
    resetView: "Reset view",
    automaticRoute: "Use automatic route",
    automaticLabelPosition: "Use automatic label position",
    selectEntityOrRelation: "Select an Entity or Relation",
    movedCoordinatesTemporary: "Moved coordinates are temporary until you save them.",
    storedCoordinatesRestored: "Stored coordinates are restored when available.",
    automaticLabelPlacement: "Use automatic label position",
    openDetails: "Open details",
    automaticPlacementReset: "Return to automatic placement",
    movedCoordinatesTemporaryDetail: "Moved coordinates are temporary until you save them.",
    coordinateDraftMigrationRefusal: "Could not migrate the Coordinate data to Coordinate Draft. This Dataset cannot be migrated safely.",
    coordinateDraftMigrationSuccess: "Coordinate Prototype migrated to Coordinate Draft 0.1.0.",
    spaceMigrationRefusal: "Could not migrate the Linkscape coordinates to LiaisonScape. This Dataset cannot be migrated safely.",
    spaceMigrationSuccess: "Linkscape coordinates migrated to LiaisonScape.",
    legacyMigrationRefusal: "Could not migrate the legacy Linkscape coordinates to LiaisonScape. This Dataset cannot be migrated safely.",
    legacyMigrationSuccess: "Legacy Linkscape coordinates migrated to LiaisonScape.",
    coordinateSaveSuccess: "Entity coordinates saved to the experimental Coordinate payload.",
    jsonLoadFailure: "Could not load the Dataset. Check the JSON format.",
    datasetValidationFailure: "Could not open the Dataset. It has validation errors in the Core or supported Extensions.",
    handoffInvalid: "The Dataset handoff link is invalid.",
    handoffFetchFailure: "Could not retrieve the Dataset from the handoff link.",
    exportBlockedValidation: "Could not export the E2R JSON. The Dataset has validation errors.",
    exportWithWarnings: "Exporting the E2R JSON with validation warnings.",
    coordinateDraftWriteRefusal: "Could not save the coordinates. This Dataset's Coordinate Draft is not in a format that LiaisonScape can safely write.",
    coordinatePayloadWriteRefusal: "Could not save the coordinates. The moved coordinates remain temporary because the existing Coordinate or Specification data cannot be safely written.",
    entityRelationshipGraph: "Entity relationship graph",
    guides: "Guides", canvasActions: "Canvas actions", datasetMetadata: "Dataset metadata", validationDiagnostics: "Validation diagnostics", graphViewControls: "Graph view controls", moveZoomControls: "Move zoom controls",
    diagnosticCodeLabel: "Code",
    diagnosticPathLabel: "Path",
    datasetIdNotAssigned: "Not assigned",
    selectedRelationCurvatureHint: "Drag the selected relation to adjust its curve.",
    automaticPlacement: "Automatic placement",
    userPlacement: "User placement",
    relationRoutePlacement: "Route",
    relationLabelPlacement: "Label",
    nodeLabelPlacement: "Node label",
    editRelation: "Edit Relation",
    editEntity: "Edit Entity",
    datasetTitle: "Dataset title",
    datasetTitleVisible: "Title",
    editDatasetTitle: "Edit Dataset title",
    saveDatasetTitle: "Save Dataset title",
    saveDatasetTitleVisible: "Save",
    datasetTitleInput: "Dataset title",
    untitled: "Untitled",
    newDataset: "New Dataset", openSampleDataset: "Open sample Dataset", sampleDatasetLoadFailure: "Could not load the sample Dataset.",
    openDataset: "Open E2R Dataset",
    continueEditing: "Continue Editing",
    browserBackDatasetNotice: "Your Dataset is still open. Continue to return to the workspace.",
    userGuide: "English user guide",
    footerDescriptor: "E2R relationship editor", credits: "Credits", closeCredits: "Close Credits", application: "Application", creator: "Creator", releaseDate: "Release date", releaseDatePending: "2026-08-16", aiAcknowledgement: "With gratitude to all the AI systems that contributed to this project.", creditsLinks: "Credits links", liaisonScapeRepository: "LiaisonScape repository", e2rSpecificationRepository: "E2R specification repository",
    languageEnglish: "English",
    entityDeletionResolutionTitle: "Review connections before deleting",
    entityDeletionResolutionConnections: "Connections to resolve",
    entityDeletionResolutionHidden: "Some connections are not normally shown in this graph. Review them individually first.",
    entityDeletionResolutionInspect: "Inspect Relation",
    entityDeletionResolutionKeep: "Keep Entity",
    entityDeletionResolutionResolved: "All blocking Relations have been resolved. You can now delete this Entity.",
    languageJapanese: "日本語",
    saveRelation: "Save Relation",
    relationDetail: "Relation Detail",
    deleteRelation: "Delete Relation",
    relationDeleteAction: "Delete Relation",
    entityDetailTitle: "Entity Detail",
    relationDetailTitle: "Relation Detail",
    detailSaveChanges: "Save Entity",
    entityDetailSave: "Save Entity",
    relationDetailSave: "Save Relation",
    technicalDetails: "Technical details",
    objectId: "Object ID",
    relatedRelationName: "Relation name",
    relatedRelationSource: "Source",
    relatedRelationTarget: "Target",
    entityShownRelations: "Shown Relations",
    entityDatasetRelations: "Relations in Dataset",
    entityDeleteAction: "Delete Entity",
    closeRelationDetail: "Close Relation Detail",
    close: "Close", entityDetail: "Entity Detail", id: "ID", shownRelations: "Shown Relations", datasetRelations: "Dataset Relations", dangerZone: "Danger zone", relatedRelations: "Related Relations:", deleteEntity: "Delete Entity", closeEntityDetail: "Close Entity Detail",
  },
  ja: {
    edit: "\u7de8\u96c6",
    datasetTitleVisible: "\u30bf\u30a4\u30c8\u30eb",
    editDatasetTitle: "\u30c7\u30fc\u30bf\u30bb\u30c3\u30c8\u306e\u30bf\u30a4\u30c8\u30eb\u3092\u7de8\u96c6",
    saveDatasetTitle: "\u30c7\u30fc\u30bf\u30bb\u30c3\u30c8\u306e\u30bf\u30a4\u30c8\u30eb\u3092\u4fdd\u5b58",
    saveDatasetTitleVisible: "\u4fdd\u5b58",
    datasetTitleInput: "Dataset\u30bf\u30a4\u30c8\u30eb",
    handoffInvalid: "Datasetの引き渡しリンクが正しくありません。",
    handoffFetchFailure: "引き渡しリンクからDatasetを取得できませんでした。",
    cancel: "キャンセル",
    cancelReplacement: "Datasetの置き換えをキャンセル",
    datasetReplacementTitle: "Datasetを置き換えますか？",
    datasetReplacementMessage: "現在の作業が失われる可能性があります。続行方法を選択してください。",
    discardAndContinue: "破棄して続行",
    discardWorkAndContinue: "作業を破棄して続行",
    exportAndContinue: "書き出して続行",
    exportDatasetOnly: "Datasetを書き出す",
    datasetTitle: "Datasetタイトル",
    untitled: "タイトルなし",
    getStarted: "はじめる",
    homeDescription: "エンティティ同士をつなげて\n相関図を作ります。",
    home: "ホーム",
    openWorkspaceDataset: "E2R Datasetを開く",
    exportDataset: "E2R JSONを書き出す",
    addEntity: "エンティティを追加",
    addRelation: "つながりを追加",
    createEntity: "エンティティを追加",
    createRelation: "つながりを追加",
    sourceEntity: "接続元のエンティティ",
    targetEntity: "接続先のエンティティ",
    selectSource: "接続元を選択",
    selectTarget: "接続先を選択",
    name: "名前",
    description: "説明",
    saveEntity: "エンティティを作成",
    saveCoordinates: "座標を保存",
    more: "その他",
    migrateCoordinateDraft: "CoordinateをDraftへ移行",
    migrateLinkscapeCoordinates: "Linkscape座標をLiaisonScapeへ移行",
    migrateLegacyCoordinates: "旧Linkscape座標をLiaisonScapeへ移行",
    zoomOut: "縮小",
    zoomIn: "拡大",
    resetView: "表示をリセット",
    entityRelationshipGraph: "エンティティ相関図",
    selectedRelationCurvatureHint: "選択中のつながりをドラッグすると曲線を調整できます。",
    automaticPlacement: "自動配置",
    userPlacement: "ユーザー配置",
    relationRoutePlacement: "ルート",
    relationLabelPlacement: "ラベル",
    nodeLabelPlacement: "ノードラベル",
    editRelation: "つながりを編集",
    editEntity: "エンティティを編集",
    newDataset: "新しいDataset", openSampleDataset: "サンプルDatasetを開く", sampleDatasetLoadFailure: "サンプルDatasetを読み込めませんでした。",
    openDataset: "E2R Datasetを開く",
    continueEditing: "編集を続ける",
    userGuide: "日本語ユーザーガイド",
    footerDescriptor: "E2Rリレーションシップエディター", credits: "クレジット", closeCredits: "クレジットを閉じる", application: "アプリケーション", creator: "作成者", releaseDate: "リリース日", releaseDatePending: "2026-08-16", aiAcknowledgement: "With gratitude to all the AI systems that contributed to this project.", creditsLinks: "Credits links", liaisonScapeRepository: "LiaisonScape repository", e2rSpecificationRepository: "E2R specification repository",
    languageEnglish: "English",
    entityDeletionResolutionTitle: "削除前につながりを確認してください",
    entityDeletionResolutionConnections: "解決するつながり",
    entityDeletionResolutionHidden: "このグラフには通常表示されないつながりもあります。個別に確認してください。",
    entityDeletionResolutionInspect: "つながりを確認",
    entityDeletionResolutionKeep: "エンティティを残す",
    entityDeletionResolutionResolved: "すべてのブロッカーが解決されました。このエンティティを削除できます。",
    languageJapanese: "日本語",
    saveRelation: "つながりを作成",
    close: "閉じる", entityDetail: "Entity 詳細", id: "ID", shownRelations: "表示中の Relation", datasetRelations: "Dataset の Relation", dangerZone: "危険な操作", relatedRelations: "関連する Relation:", deleteEntity: "Entity を削除", closeEntityDetail: "Entity 詳細を閉じる",
    relationDetail: "Relation 詳細",
    deleteRelation: "Relation を削除",
    closeRelationDetail: "Relation 詳細を閉じる",
    guides: "ガイド", canvasActions: "キャンバス操作", datasetMetadata: "Dataset メタデータ", validationDiagnostics: "検証診断", graphViewControls: "グラフ表示操作", moveZoomControls: "ズーム操作を移動",
    diagnosticCodeLabel: "コード",
    diagnosticPathLabel: "場所",
    datasetIdNotAssigned: "未設定",
    cancelDeletion: "削除を取り消す",
    cancelDetailDismissal: "詳細を閉じるのをキャンセル",
    detailDismissalTitle: "未保存の変更を破棄しますか？",
    detailDismissalMessage: "この詳細には未保存の変更があります。破棄して閉じますか？",
    discardDetailDraft: "変更を破棄して閉じる",
    cancelCreationDismissal: "作成を閉じるのをキャンセル",
    creationDismissalTitle: "新しい作成内容の未保存を破棄しますか？",
    creationDismissalMessage: "この新しいオブジェクトには未保存の変更があります。破棄して閉じますか？",
    discardCreationDraft: "破棄して閉じる",
    confirmDeletion: "削除の確認",
    delete: "削除",
    relationDeleteAction: "つながりを削除",
    entityShownRelations: "表示中のつながり",
    entityDatasetRelations: "Dataset内のつながり",
    entityDeleteAction: "エンティティを削除",
    entityDetailTitle: "エンティティの詳細",
    relationDetailTitle: "つながりの詳細",
    detailSaveChanges: "変更を保存",
    entityDetailSave: "エンティティを保存",
    relationDetailSave: "つながりを保存",
    technicalDetails: "技術情報",
    objectId: "Object ID",
    relatedRelationName: "つながりの名前",
    relatedRelationSource: "始点",
    relatedRelationTarget: "終点",
    automaticRoute: "自動ルートに戻す",
    automaticLabelPosition: "ラベル位置を自動に戻す",
    selectEntityOrRelation: "エンティティまたはつながりを選択",
    movedCoordinatesTemporary: "移動した座標は、保存するまで一時的です。",
    storedCoordinatesRestored: "保存済みの座標がある場合は復元されます。",
    automaticLabelPlacement: "ラベル位置を自動配置に戻す",
    openDetails: "詳細を開く",
    automaticPlacementReset: "自動配置に戻す",
    movedCoordinatesTemporaryDetail: "移動した座標は、「座標を保存」ボタンを押すまでの一時的なものです。",
    coordinateDraftMigrationRefusal: "CoordinateデータをCoordinate Draft（座標仕様ドラフト）へ移行できませんでした。このDatasetは安全に移行できません。",
    coordinateDraftMigrationSuccess: "Coordinate PrototypeからCoordinate Draft 0.1.0（座標仕様ドラフト）へ移行しました。",
    spaceMigrationRefusal: "Linkscapeの座標をLiaisonScapeへ移行できませんでした。このDatasetは安全に移行できません。",
    spaceMigrationSuccess: "Linkscapeの座標をLiaisonScapeへ移行しました。",
    legacyMigrationRefusal: "旧Linkscape形式の座標をLiaisonScapeへ移行できませんでした。このDatasetは安全に移行できません。",
    legacyMigrationSuccess: "旧Linkscape形式の座標をLiaisonScapeへ移行しました。",
    coordinateSaveSuccess: "座標を保存しました。",
    jsonLoadFailure: "Datasetを読み込めませんでした。JSONの形式を確認してください。",
    datasetValidationFailure: "このDatasetは開けませんでした。Coreまたは対応しているExtensionに検証エラーがあります。",
    exportBlockedValidation: "E2R JSONを書き出せませんでした。Datasetに検証エラーがあります。",
    exportWithWarnings: "検証警告がありますが、E2R JSONを書き出します。",
    coordinateDraftWriteRefusal: "座標を保存できませんでした。このDatasetのCoordinate Draft（座標仕様ドラフト）は、LiaisonScapeが安全に書き込める形式ではありません。",
    coordinatePayloadWriteRefusal: "座標を保存できませんでした。既存のCoordinateまたはSpecificationデータに安全に書き込めないため、移動した座標は一時的なままです。",
    browserBackDatasetNotice: "Datasetは開いたままです。「続ける」を選ぶと作業画面に戻れます。",
  },
} as const;

export type MessageKey = keyof typeof messages.en;

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "ja";
}

export function detectLocale(browserLanguage: string | undefined): Locale {
  return browserLanguage?.toLowerCase().startsWith("ja") ? "ja" : "en";
}

export function readStoredLocale(storage: LocaleStorage | undefined): Locale | null {
  if (!storage) return null;
  const value = storage.getItem(LOCALE_STORAGE_KEY);
  return isLocale(value) ? value : null;
}

export function getInitialLocale(
  storage: LocaleStorage | undefined,
  browserLanguage: string | undefined,
): Locale {
  return readStoredLocale(storage) ?? detectLocale(browserLanguage);
}

export function saveLocale(storage: LocaleStorage, locale: Locale): void {
  storage.setItem(LOCALE_STORAGE_KEY, locale);
}

export function applyLocale(locale: Locale, target: LocaleDocument): void {
  target.documentElement.lang = locale;
}

export function translate(locale: Locale, key: MessageKey): string {
  return messages[locale][key];
}

export function formatDiagnosticSeverity(locale: Locale, severity: DiagnosticSeverity): string {
  if (locale === "ja") {
    switch (severity) {
      case "error": return "エラー";
      case "warning": return "警告";
    }
  }
  switch (severity) {
    case "error": return "Error";
    case "warning": return "Warning";
  }
}

function formatLegacyEntityIncidentWarning(locale: Locale, count: number): string {
  if (locale === "ja") return `このエンティティには ${count} 件のつながりがあります。エンティティを削除する前につながりを削除してください。`;
  return locale === "en"
    ? `この Entity には ${count} 件の Relation が接続されています。Entity を削除する前に Relation を削除してください。`
    : `This Entity is connected by ${count} Relation${count === 1 ? "" : "s"}. Delete those Relations before deleting this Entity.`;
}

export function formatEntityIncidentWarning(locale: Locale, count: number): string {
  return locale === "ja"
    ? `\u3053\u306e\u30a8\u30f3\u30c6\u30a3\u30c6\u30a3\u306b\u306f ${count} \u4ef6\u306e\u3064\u306a\u304c\u308a\u304c\u3042\u308a\u307e\u3059\u3002\u30a8\u30f3\u30c6\u30a3\u30c6\u30a3\u3092\u524a\u9664\u3059\u308b\u524d\u306b\u3064\u306a\u304c\u308a\u3092\u524a\u9664\u3057\u3066\u304f\u3060\u3055\u3044\u3002`
    : `This Entity is connected by ${count} Relation${count === 1 ? "" : "s"}. Delete those Relations before deleting this Entity.`;
}

export type ConfirmationSubject = "Entity" | "Relation";
export function formatDeleteConfirmation(locale: Locale, subject: ConfirmationSubject): string {
  return locale === "ja" ? `この ${subject} を削除しますか？` : `Delete this ${subject}?`;
}

export function formatSelectedEntity(locale: Locale, id: string): string {
  return locale === "ja" ? `選択中のエンティティ: ${id}` : `Selected Entity: ${id}`;
}

export function formatSelectedRelation(locale: Locale, id: string): string {
  return locale === "ja" ? `選択中のつながり: ${id}` : `Selected Relation: ${id}`;
}

export function formatGraphSummary(locale: Locale, entities: number, relations: number): string {
  if (locale === "ja") return `${entities} エンティティ · ${relations} つながり`;
  return `${entities} ${entities === 1 ? "entity" : "entities"} · ${relations} ${relations === 1 ? "relation" : "relations"}`;
}

export function formatLoadedDataset(locale: Locale, entities: number, relations: number): string {
  if (locale === "ja") return `${entities} 件のエンティティと ${relations} 件のつながりを読み込みました。`;
  return `Loaded ${entities} ${entities === 1 ? "Entity" : "Entities"} and ${relations} ${relations === 1 ? "Relation" : "Relations"}.`;
}

export function formatUnsupportedEventRelations(locale: Locale, count: number): string {
  if (locale === "ja") return `できごとに関係するつながりが ${count} 件あります。このグラフには表示されません。`;
  return `${count} relation${count === 1 ? "" : "s"} involving an Event ${count === 1 ? "is" : "are"} not shown in this graph.`;
}

export type AuthoringRefusal =
  | "relation_endpoint_required"
  | "relation_source_entity_required"
  | "relation_target_entity_required"
  | "relation_not_found"
  | "entity_not_found"
  | "entity_has_incident_relations"
  | (string & {});

function refusalReason(locale: Locale, reason: AuthoringRefusal): string {
  const english: Record<string, string> = {
    relation_endpoint_required: "Select both a source and a target.",
    relation_source_entity_required: "The selected source Entity is no longer available.",
    relation_target_entity_required: "The selected target Entity is no longer available.",
    relation_not_found: "The relation could not be found.",
    entity_not_found: "The Entity could not be found.",
    entity_has_incident_relations: "Remove its Relations before deleting this Entity.",
  };
  const japanese: Record<string, string> = {
    relation_endpoint_required: "Source EntityとTarget Entityを選択してください。",
    relation_source_entity_required: "選択したSource Entityが見つかりません。",
    relation_target_entity_required: "選択したTarget Entityが見つかりません。",
    relation_not_found: "対象のつながりが見つかりません。",
    entity_not_found: "対象のエンティティが見つかりません。",
    entity_has_incident_relations: "このエンティティを削除する前につながりを削除してください。",
  };
  return (locale === "ja" ? japanese : english)[reason] ?? (locale === "ja" ? "操作を完了できませんでした。" : "The operation could not be completed.");
}

export function formatRelationUpdateRefusal(locale: Locale, reason: AuthoringRefusal): string {
  const prefix = locale === "ja" ? "つながりを更新できませんでした。" : "The relation could not be updated.";
  return `${prefix} ${refusalReason(locale, reason)}`;
}

export function formatRelationCreationRefusal(locale: Locale, reason: AuthoringRefusal): string {
  const prefix = locale === "ja" ? "つながりを作成できませんでした。" : "The relation could not be created.";
  return `${prefix} ${refusalReason(locale, reason)}`;
}

export function formatRelationDeletionRefusal(locale: Locale, reason: AuthoringRefusal): string {
  const prefix = locale === "ja" ? "つながりを削除できませんでした。" : "The relation could not be deleted.";
  return `${prefix} ${refusalReason(locale, reason)}`;
}

export function formatEntityDeletionRefusal(locale: Locale, reason: AuthoringRefusal): string {
  const prefix = locale === "ja" ? "エンティティを削除できませんでした。" : "The Entity could not be deleted.";
  return `${prefix} ${refusalReason(locale, reason)}`;
}
