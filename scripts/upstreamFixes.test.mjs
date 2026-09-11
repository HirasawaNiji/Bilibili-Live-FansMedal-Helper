import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { beforeEach, test } from 'node:test'

// 加载真实模块，仅替换油猴环境、网络和定时等待；不向 B 站发送请求。
const moduleUrl = (source) => `data:text/javascript,${encodeURIComponent(source)}`
const stateUrl = moduleUrl(`export default {
  responses: [], calls: [], warnings: [],
  bili: { fansMedalsMeta: {} },
  modules: { moduleConfig: {
    DailyTasks: { LiveTasks: { medalTasks: { light: {}, like: {}, watch: {} } } },
    EnhanceExperience: { noSleep: { enabled: true } }
  } }
}`)
const { default: state } = await import(stateUrl)
const sharedImport = `import state from '${stateUrl}';`
const stubs = {
  '@/stores': `${sharedImport}
    export const useBiliStore = () => state.bili;
    export const useModuleStore = () => state.modules;`,
  '@/library/bili-api': `${sharedImport}
    export default { live: { fansMedalPanel: async (page) => {
      state.calls.push(page);
      const response = state.responses[page - 1];
      if (response instanceof Error) throw response;
      return response;
    } } };`,
  '@/library/luxon': `export const tsm = Date.now;
    export const isTimestampToday = () => false;
    export const delayToNextMoment = () => ({ ms: 86400000 });`,
  '@/library/utils': 'export const sleep = async () => {};',
  '@/modules/BaseModule': `${sharedImport}
    export default class BaseModule {
      constructor(name) { this.moduleName = name; }
      logger = { log() {}, error() {}, warn(...args) { state.warnings.push(args); } };
    }`,
  '@/library/error': `export class ModuleError extends Error {
    constructor(name, message) { super(message); this.moduleName = name; }
  }`,
}
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (Object.hasOwn(stubs, specifier)) {
      return { url: moduleUrl(stubs[specifier]), shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})
const { default: FansMedals } = await import('../src/modules/default/fansMedals.ts')
const { default: NoSleep } = await import('../src/modules/enhanceExperience/noSleep.ts')
hooks.deregister()

beforeEach(() => {
  state.responses = []
  state.calls = []
  state.warnings = []
  state.bili = { fansMedalsMeta: {} }
})
const medal = (id) => ({ medal: { medal_id: id, medal_name: '同名勋章' } })
const page = (list, special = [], total = 2) => ({
  code: 0,
  data: { list, special_list: special, page_info: { total_page: total } },
})

test('真实加载链路：特殊列表、普通列表与相邻分页去重，保留首次出现的顺序', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const first = medal(1)
  state.responses = [page([medal(1), medal(2)], [first]), page([medal(2), medal(3)])]
  await new FansMedals('test').run(true)
  assert.deepEqual(state.calls, [1, 2])
  assert.deepEqual(
    state.bili.fansMedals.map((item) => item.medal.medal_id),
    [1, 2, 3],
  )
  assert.equal(state.bili.fansMedals[0], first)
  assert.equal(state.bili.fansMedalsMeta.status, 'loaded')
})

test('分页中途失败，已取得的部分列表也去重', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  state.responses = [page([medal(1), medal(2)], [medal(1)]), { code: -1, message: '查询失败' }]
  await new FansMedals('test').run(true)
  assert.deepEqual(
    state.bili.fansMedals.map((item) => item.medal.medal_id),
    [1, 2],
  )
})

test('不同 ID 的同名勋章不误删，空列表仍可正常加载', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  state.responses = [page([medal(1), medal(2)], [], 1)]
  const task = new FansMedals('test')
  await task.run(true)
  assert.equal(state.bili.fansMedals.length, 2)
  state.responses = [page([], [], 1)]
  await task.run(true)
  assert.deepEqual(state.bili.fansMedals, [])
})

test('第一页请求失败仍报错，并能再次加载', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const task = new FansMedals('test')
  state.responses = [new Error('网络异常')]
  await assert.rejects(task.run(true), /网络异常/)
  assert.equal(state.bili.fansMedalsMeta.status, 'error')
  state.responses = [page([medal(1)], [], 1)]
  await task.run(true)
  assert.equal(state.bili.fansMedalsMeta.status, 'loaded')
})

function withDocument(t, document) {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const originalMouseEvent = Object.getOwnPropertyDescriptor(globalThis, 'MouseEvent')
  Object.defineProperty(globalThis, 'document', { value: document, configurable: true })
  Object.defineProperty(globalThis, 'MouseEvent', {
    value: class extends Event {},
    configurable: true,
  })
  t.after(() => {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument)
    else delete globalThis.document
    if (originalMouseEvent) Object.defineProperty(globalThis, 'MouseEvent', originalMouseEvent)
    else delete globalThis.MouseEvent
  })
}

test('防挂机在 document-start 注入，同时设置可见性及焦点并保持定时活动', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  const document = new EventTarget()
  withDocument(t, document)
  let moves = 0
  document.addEventListener('mousemove', () => moves++)
  assert.equal(NoSleep.runAt, 'document-start')
  assert.equal(NoSleep.onFrame, 'top')
  assert.equal(NoSleep.runAfterDefault, false)
  assert.equal(NoSleep.runOnMultiplePages, true)
  new NoSleep('test').run()
  assert.equal(document.visibilityState, 'visible')
  assert.equal(document.hidden, false)
  assert.equal(document.hasFocus(), true)
  t.mock.timers.tick(60_000)
  assert.equal(moves, 1)
})

test('页面属性已锁定时提示警告，不使防挂机模块抛出异常', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  const document = new EventTarget()
  Object.defineProperty(document, 'visibilityState', { value: 'hidden' })
  withDocument(t, document)
  assert.doesNotThrow(() => new NoSleep('test').run())
  assert.equal(state.warnings.length, 1)
})
