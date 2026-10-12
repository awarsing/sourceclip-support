// Stand-ins for the Nuxt auto-imports that app composables, stores and
// middleware read as globals. Import this first, then import the module under
// test dynamically so the globals exist when it evaluates.
import { computed, type Ref, readonly, ref, toValue } from 'vue'

const states = new Map<string, Ref<unknown>>()
const unmountHooks: (() => void)[] = []

function useState<T>(key: string, init?: () => T): Ref<T> {
  if (!states.has(key)) states.set(key, ref(init?.()) as Ref<unknown>)
  return states.get(key) as Ref<T>
}

export function stubGlobals(values: Record<string, unknown>): void {
  Object.assign(globalThis, values)
}

// Forgets useState values and runs the onBeforeUnmount hooks registered so far.
export function resetNuxt(): void {
  states.clear()
  for (const hook of unmountHooks.splice(0)) hook()
}

// localStorage that keeps values in memory, or throws on every call the way a
// blocked third-party frame does.
export function memoryStorage(initial: Record<string, string> = {}, blocked = false): Storage {
  const values = new Map(Object.entries(initial))
  const guard = () => {
    if (blocked) throw new Error('storage blocked')
  }
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => {
      guard()
      return values.get(key) ?? null
    },
    setItem: (key, value) => {
      guard()
      values.set(key, String(value))
    },
    removeItem: (key) => {
      guard()
      values.delete(key)
    },
  }
}

// vue-i18n's t, rendered as the key plus its params so assertions can read it.
export function fakeT(key: string, params?: Record<string, unknown>): string {
  return params && Object.keys(params).length ? `${key} ${JSON.stringify(params)}` : key
}

stubGlobals({
  ref,
  computed,
  readonly,
  toValue,
  useState,
  onMounted: (hook: () => void) => hook(),
  onBeforeUnmount: (hook: () => void) => unmountHooks.push(hook),
  defineStore: (_id: string, setup: () => unknown) => setup,
  defineNuxtRouteMiddleware: <T>(middleware: T) => middleware,
  useI18n: () => ({ t: fakeT, locale: ref('en') }),
})
