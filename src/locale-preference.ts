import { isLocale, type Locale, LOCALE_STORAGE_KEY } from "./i18n.ts";

export const TEMPORARY_LOCALE_RESOLUTION_KEY = "liaisonscape.localeTemporaryResolution";

export type RequestedLocale = { kind: "none" | "invalid" } | { kind: "valid"; locale: Locale };
export type TemporaryLocaleResolution = { requestedLocale: Locale; effectiveLocale: Locale };

function decodePart(value: string): string | null {
  try { return decodeURIComponent(value.replace(/\+/g, " ")); }
  catch { return null; }
}

export function parseRequestedLocale(hash: string): RequestedLocale {
  const values: string[] = [];
  let malformed = false;
  for (const pair of (hash.startsWith("#") ? hash.slice(1) : hash).split("&")) {
    if (!pair) continue;
    const separator = pair.indexOf("=");
    const name = decodePart(separator < 0 ? pair : pair.slice(0, separator));
    if (name !== "locale") continue;
    const value = decodePart(separator < 0 ? "" : pair.slice(separator + 1));
    if (value === null) malformed = true;
    else values.push(value);
  }
  if (values.length === 0 && !malformed) return { kind: "none" };
  if (malformed || values.length !== 1 || !isLocale(values[0])) return { kind: "invalid" };
  return { kind: "valid", locale: values[0] };
}

export function readExplicitLocale(storage: Pick<Storage, "getItem">): Locale | undefined {
  try {
    const value = storage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(value) ? value : undefined;
  } catch { return undefined; }
}

export function readTemporaryLocaleResolution(storage: Pick<Storage, "getItem">): TemporaryLocaleResolution | undefined {
  try {
    const raw = storage.getItem(TEMPORARY_LOCALE_RESOLUTION_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return undefined;
    const record = parsed as Record<string, unknown>;
    if (!isLocale(record.requestedLocale) || !isLocale(record.effectiveLocale)) return undefined;
    return { requestedLocale: record.requestedLocale, effectiveLocale: record.effectiveLocale };
  } catch { return undefined; }
}

export function writeTemporaryLocaleResolution(storage: Pick<Storage, "setItem">, value: TemporaryLocaleResolution): void {
  try { storage.setItem(TEMPORARY_LOCALE_RESOLUTION_KEY, JSON.stringify(value)); } catch { /* session storage is optional */ }
}

export function clearTemporaryLocaleResolution(storage: Pick<Storage, "removeItem">): void {
  try { storage.removeItem(TEMPORARY_LOCALE_RESOLUTION_KEY); } catch { /* session storage is optional */ }
}

export function setLocaleFragment(hash: string, locale: Locale): string {
  const kept = (hash.startsWith("#") ? hash.slice(1) : hash).split("&").filter((pair) => {
    if (!pair) return false;
    const separator = pair.indexOf("=");
    return decodePart(separator < 0 ? pair : pair.slice(0, separator)) !== "locale";
  });
  kept.push(`locale=${locale}`);
  return `#${kept.join("&")}`;
}

export function resolveStartupLocale(input: {
  requested: RequestedLocale;
  saved?: Locale;
  temporary?: TemporaryLocaleResolution;
  browserLanguage?: string;
}): { locale: Locale; conflict: boolean } {
  const { requested, saved, temporary } = input;
  if (requested.kind === "valid") {
    if (temporary?.requestedLocale === requested.locale) return { locale: temporary.effectiveLocale, conflict: false };
    if (saved && requested.locale !== saved) return { locale: saved, conflict: true };
    return { locale: requested.locale, conflict: false };
  }
  if (saved) return { locale: saved, conflict: false };
  return { locale: input.browserLanguage?.toLowerCase().startsWith("ja") ? "ja" : "en", conflict: false };
}
