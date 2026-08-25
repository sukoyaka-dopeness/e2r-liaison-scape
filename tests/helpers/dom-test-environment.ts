import { JSDOM } from 'jsdom'

type CleanupCallback = () => void | Promise<void>

type DomTestEnvironmentOptions = {
  url?: string
  globals?: Record<string, unknown>
}

export type DomTestEnvironment = {
  window: Window
  document: Document
  installGlobal: (name: string, value: unknown) => void
  addCleanup: (callback: CleanupCallback) => void
  cleanup: () => Promise<void>
}

const defaultGlobalNames = [
  'window',
  'document',
  'navigator',
  'location',
  'localStorage',
  'sessionStorage',
  'history',
  'HTMLElement',
  'Node',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'getComputedStyle',
] as const

export function createDomTestEnvironment({
  url = 'https://liaisonscape.test/',
  globals: additionalGlobals = {},
}: DomTestEnvironmentOptions = {}): DomTestEnvironment {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url })
  const originalDescriptors = new Map<string, PropertyDescriptor | undefined>()
  const cleanupCallbacks: CleanupCallback[] = []
  let cleanupStarted = false
  let cleanupFinished = false

  const installGlobal = (name: string, value: unknown) => {
    if (cleanupStarted) {
      throw new Error(`Cannot install global ${name} after cleanup has started`)
    }

    if (!originalDescriptors.has(name)) {
      originalDescriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    }

    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    })
  }

  const restoreGlobals = () => {
    for (const [name, descriptor] of originalDescriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else delete (globalThis as Record<string, unknown>)[name]
    }
  }

  const cleanup = async () => {
    if (cleanupFinished) return
    cleanupStarted = true
    const errors: unknown[] = []

    while (cleanupCallbacks.length > 0) {
      const callback = cleanupCallbacks.pop()!
      try {
        await callback()
      } catch (error) {
        errors.push(error)
      }
    }

    try {
      dom.window.close()
    } catch (error) {
      errors.push(error)
    }

    try {
      restoreGlobals()
    } catch (error) {
      errors.push(error)
    }

    cleanupFinished = true

    if (errors.length === 1) throw errors[0]
    if (errors.length > 1) throw new AggregateError(errors, 'UI test environment cleanup failed')
  }

  const environment: DomTestEnvironment = {
    window: dom.window,
    document: dom.window.document,
    installGlobal,
    addCleanup(callback) {
      if (cleanupStarted) throw new Error('Cannot register cleanup after cleanup has started')
      cleanupCallbacks.push(callback)
    },
    cleanup,
  }

  const defaultGlobals: Record<string, unknown> = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    location: dom.window.location,
    localStorage: dom.window.localStorage,
    sessionStorage: dom.window.sessionStorage,
    history: dom.window.history,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent,
    KeyboardEvent: dom.window.KeyboardEvent,
    getComputedStyle: dom.window.getComputedStyle,
  }

  for (const name of defaultGlobalNames) installGlobal(name, defaultGlobals[name])
  for (const [name, value] of Object.entries(additionalGlobals)) installGlobal(name, value)

  return environment
}
