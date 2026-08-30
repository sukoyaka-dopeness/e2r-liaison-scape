import {
  createDomTestEnvironment as createSharedDomTestEnvironment,
  type DomTestEnvironment,
  type DomTestEnvironmentOptions,
} from '@sukoyaka-dopeness/e2r-dom-test-environment'

export type { DomTestEnvironment }

export function createDomTestEnvironment(
  options: DomTestEnvironmentOptions = {},
): DomTestEnvironment {
  return createSharedDomTestEnvironment({
    url: 'https://liaisonscape.test/',
    ...options,
  })
}
