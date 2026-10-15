import test from 'node:test'
import assert from 'node:assert/strict'
import { clearRetiredBrowserStorage } from '../src/browserCleanup.ts'

function property(t: any, name: string, value: unknown) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, { configurable: true, value })
  t.after(() => { if (previous) Object.defineProperty(globalThis, name, previous); else Reflect.deleteProperty(globalThis, name) })
}

test('retirement erases the old database without opening or transferring it', async t => {
  const deleted: string[] = []
  property(t, 'indexedDB', { deleteDatabase(name: string) {
    deleted.push(name)
    const request: any = {}
    queueMicrotask(() => request.onsuccess())
    return request
  } })
  const removed: string[] = []
  property(t, 'localStorage', { removeItem: (key: string) => removed.push(key) })
  property(t, 'navigator', {})
  await clearRetiredBrowserStorage()
  assert.deepEqual(deleted, ['hisab-counter'])
  assert.deepEqual(removed, ['hisab-device-id'])
})

test('blocked deletion requires closing old tabs instead of loading their data', async t => {
  property(t, 'indexedDB', { deleteDatabase() {
    const request: any = {}
    queueMicrotask(() => request.onblocked())
    return request
  } })
  await assert.rejects(clearRetiredBrowserStorage(), /Close other Hisab tabs/)
})

test('retirement removes only this app service worker and shell caches', async t => {
  property(t, 'indexedDB', undefined)
  property(t, 'localStorage', { removeItem() {} })
  const unregistered: string[] = []
  const registration = (script: string) => ({ active: { scriptURL: `https://hisab.test${script}` }, unregister: async () => unregistered.push(script) })
  property(t, 'navigator', { serviceWorker: { getRegistrations: async () => [registration('/sw.js'), registration('/other.js')] } })
  const deleted: string[] = []
  property(t, 'caches', { keys: async () => ['hisab-123', 'unrelated'], delete: async (key: string) => deleted.push(key) })
  await clearRetiredBrowserStorage()
  assert.deepEqual(unregistered, ['/sw.js'])
  assert.deepEqual(deleted, ['hisab-123'])
})
