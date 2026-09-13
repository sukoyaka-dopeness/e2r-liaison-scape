export type AcceptanceFixtureName = "titanic" | "apollo-11" | "lighthouse";
export type AcceptanceFixtureLocale = "en" | "ja";
export type AcceptanceLayoutArm = "global-placement3" | "frontier-12";
export const ACCEPTANCE_FIXTURE_ENDPOINT = "/__acceptance-fixtures";
export const ACCEPTANCE_LAYOUT_ENDPOINT = "/__acceptance-layouts";
const FIXTURE_NAMES: ReadonlySet<string> = new Set(["titanic", "apollo-11", "lighthouse"]);
const LOCALES: ReadonlySet<string> = new Set(["en", "ja"]);
export function parseAcceptanceFixture(value: string | null, locale: string | null): { name: AcceptanceFixtureName; locale: AcceptanceFixtureLocale } | null {
  if (!value || !FIXTURE_NAMES.has(value) || !locale || !LOCALES.has(locale)) return null;
  return { name: value as AcceptanceFixtureName, locale: locale as AcceptanceFixtureLocale };
}
export function acceptanceFixturePath({ name, locale }: { name: AcceptanceFixtureName; locale: AcceptanceFixtureLocale }): string {
  return `${ACCEPTANCE_FIXTURE_ENDPOINT}/${name}.${locale}.e2r.json`;
}
export function acceptanceLayoutPath({ name, locale, arm }: { name: AcceptanceFixtureName; locale: AcceptanceFixtureLocale; arm: AcceptanceLayoutArm }): string {
  return `${ACCEPTANCE_LAYOUT_ENDPOINT}?fixture=${encodeURIComponent(name)}&locale=${encodeURIComponent(locale)}&arm=${encodeURIComponent(arm)}`;
}
