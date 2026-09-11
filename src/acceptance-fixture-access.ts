export type AcceptanceFixtureName = "titanic" | "apollo-11" | "lighthouse";
export type AcceptanceFixtureLocale = "en" | "ja";
export const ACCEPTANCE_FIXTURE_ENDPOINT = "/__acceptance-fixtures";
const FIXTURE_NAMES: ReadonlySet<string> = new Set(["titanic", "apollo-11", "lighthouse"]);
const LOCALES: ReadonlySet<string> = new Set(["en", "ja"]);
export function parseAcceptanceFixture(value: string | null, locale: string | null): { name: AcceptanceFixtureName; locale: AcceptanceFixtureLocale } | null {
  if (!value || !FIXTURE_NAMES.has(value) || !locale || !LOCALES.has(locale)) return null;
  return { name: value as AcceptanceFixtureName, locale: locale as AcceptanceFixtureLocale };
}
export function acceptanceFixturePath({ name, locale }: { name: AcceptanceFixtureName; locale: AcceptanceFixtureLocale }): string {
  return `${ACCEPTANCE_FIXTURE_ENDPOINT}/${name}.${locale}.e2r.json`;
}
