export type Locale = "en" | "ja";

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
    entityRelationshipGraph: "Entity relationship graph",
    selectedRelationCurvatureHint: "Drag the selected relation to adjust its curve.",
    editRelation: "Edit Relation",
    editEntity: "Edit Entity",
    datasetTitle: "Dataset title",
    untitled: "Untitled",
    newDataset: "New Dataset",
    openDataset: "Open E2R Dataset",
    continueEditing: "Continue Editing",
    userGuide: "English user guide",
    footerDescriptor: "E2R relationship editor",
    languageEnglish: "English",
    languageJapanese: "日本語",
    saveRelation: "Save Relation",
  },
  ja: {
    cancel: "キャンセル",
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
    editRelation: "つながりを編集",
    editEntity: "エンティティを編集",
    newDataset: "新しいDataset",
    openDataset: "E2R Datasetを開く",
    continueEditing: "編集を続ける",
    userGuide: "日本語ユーザーガイド",
    footerDescriptor: "E2Rリレーションシップエディター",
    languageEnglish: "English",
    languageJapanese: "日本語",
    saveRelation: "つながりを作成",
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
