import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { beforeEach, test } from 'node:test'
import { createPinia } from 'pinia'

const moduleUrl = (source) => `data:text/javascript,${encodeURIComponent(source)}`
const stateUrl = moduleUrl('export default {root: {}, cache: {lastAliveHeartBeatTime: 0}}')
const { default: state } = await import(stateUrl)
const shared = `import state from '${stateUrl}';`
const stubs = {
  $: `${shared} export const unsafeWindow = state.root;`,
  '@/library/storage': `${shared} export default {
    getCache: () => structuredClone(state.cache), setCache: value => {state.cache = {...value}}
  };`,
  '@/library/luxon': 'export const tsm = Date.now;',
  './useBiliStore': 'export const useBiliStore = () => ({});',
  '@/library/script-lifecycle': `${shared}
    export const acquireDocumentLock = async (_locks, recovering) => {state.recovering = recovering; state.lockRequests++; return state.acquire};
    export const stopScriptRequests = () => {state.stopped = true};`,
  '@/library/watch-recovery': `export * from '${new URL('../src/library/watch-recovery.ts', import.meta.url).href}';`,
}
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (Object.hasOwn(stubs, specifier))
      return { url: moduleUrl(stubs[specifier]), shortCircuit: true }
    return nextResolve(specifier, context)
  },
})
const { useCacheStore } = await import('../src/stores/useCacheStore.ts')
hooks.deregister()

beforeEach(() => {
  for (const key of Object.keys(state.root)) delete state.root[key]
  Object.assign(state, {
    acquire: true,
    stopped: false,
    reloads: 0,
    lockRequests: 0,
    recovering: false,
    cache: { lastAliveHeartBeatTime: 0 },
  })
  globalThis.window = state.root
  window.self = window
  window.top = window
  window.location = {
    reload() {
      assert.equal(state.stopped, true)
      state.reloads++
    },
  }
  Object.defineProperty(navigator, 'locks', { configurable: true, value: {} })
  const values = new Map()
  globalThis.sessionStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
})

test('恢复启动忽略旧缓存心跳残留，以实际独占锁为准', async () => {
  state.cache.lastAliveHeartBeatTime = Date.now()
  sessionStorage.setItem('BLTH:watch-recovery-reload:v1', String(Date.now()))
  const store = useCacheStore(createPinia())
  await store.checkCurrentScriptType()
  assert.equal(store.currentScriptType, 'Main')
  assert.equal(store.hasDocumentLock, true)
  assert.equal(state.recovering, true)
  assert.equal(store.reloadForWatchRecovery(), true)
  assert.equal(state.reloads, 1)
})

test('即使存活心跳过期，拿不到锁也不能启动主任务或刷新', async () => {
  state.acquire = false
  const store = useCacheStore(createPinia())
  await store.checkCurrentScriptType()
  assert.equal(store.currentScriptType, 'Other')
  assert.equal(store.reloadForWatchRecovery(), false)
  assert.equal(state.stopped, false)
})

test('同文档重复注入不重复接管，子frame只能跟随且不能刷新', async () => {
  await useCacheStore(createPinia()).checkCurrentScriptType()
  const duplicate = useCacheStore(createPinia())
  await duplicate.checkCurrentScriptType()
  assert.equal(duplicate.currentScriptType, 'Other')
  const childWindow = { top: state.root }
  childWindow.self = childWindow
  globalThis.window = childWindow
  const child = useCacheStore(createPinia())
  await child.checkCurrentScriptType()
  assert.equal(child.currentScriptType, 'SubMain')
  assert.equal(child.reloadForWatchRecovery(), false)
  assert.equal(state.lockRequests, 1)
})

test('浏览器没有Web Locks时保留旧判断但禁止自动刷新', async () => {
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
  const store = useCacheStore(createPinia())
  await store.checkCurrentScriptType()
  assert.equal(store.currentScriptType, 'Main')
  assert.equal(store.hasDocumentLock, false)
  assert.equal(store.reloadForWatchRecovery(), false)
})

test('无法保存恢复标记时不停止当前脚本，也不刷新', async () => {
  const store = useCacheStore(createPinia())
  await store.checkCurrentScriptType()
  sessionStorage.setItem = () => {
    throw Error('storage blocked')
  }
  assert.equal(store.reloadForWatchRecovery(), false)
  assert.equal(state.stopped, false)
  assert.equal(state.reloads, 0)
})
