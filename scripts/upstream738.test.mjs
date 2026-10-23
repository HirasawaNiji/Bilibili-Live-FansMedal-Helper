import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { beforeEach, test } from 'node:test'

const moduleUrl = (source) => `data:text/javascript,${encodeURIComponent(source)}`
const stateUrl = moduleUrl('export default {}')
const { default: state } = await import(stateUrl)
const shared = `import state from '${stateUrl}';`
const stubs = {
  $: 'export const unsafeWindow = globalThis;',
  '@/modules/BaseModule': `export default class BaseModule {
    logger = {log() {}, warn() {}, error() {}};
  }`,
  '@/stores': `${shared}
    export const useBiliStore = () => state.bili;
    export const useModuleStore = () => state.modules;
    export const useCacheStore = () => ({});
    export const useRuntimeStatusStore = () => ({beginTask() {}, setTaskPhase(...args) {state.phases.push(args)}});
    export const usePlayerStore = () => state.player;`,
  '@/stores/useWeeklyMedalStore': 'export const useWeeklyMedalStore = () => ({});',
  '@/modules/dailyTasks/liveTasks/medalTasks/MedalModule': `export {default} from '${new URL('../src/modules/dailyTasks/liveTasks/medalTasks/MedalModule.ts', import.meta.url).href}';`,
  '@/library/utils':
    'export const sleep = async () => {}; export const arrayToMap = () => new Map();',
  '@/library/luxon': `export const tsm = () => 12345;
    export const isTimestampToday = () => false;
    export const isNowAfter = () => false;
    export const isNowBefore = () => false;
    export const delayToNextMoment = () => ({ms: 86400000});`,
  '@/library/bili-api': `${shared} export default {main: {
    videoRelation: async () => ({code: 0, data: {coin: state.alreadyCoined}}),
    coinAdd: async () => {state.coinCalls++; if(state.networkError) throw Error('offline'); return {code: state.coinCode};}
  }};`,
}
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (Object.hasOwn(stubs, specifier))
      return { url: moduleUrl(stubs[specifier]), shortCircuit: true }
    return nextResolve(specifier, context)
  },
})
const { default: MedalModule } =
  await import('../src/modules/dailyTasks/liveTasks/medalTasks/MedalModule.ts')
const { default: CoinTask } = await import('../src/modules/dailyTasks/mainSiteTasks/coinTask.ts')
const { default: SwitchQuality } =
  await import('../src/modules/enhanceExperience/switchLiveStreamQuality.ts')
const { default: LightTask } =
  await import('../src/modules/dailyTasks/liveTasks/medalTasks/lightTask.ts')
const { default: LikeTask } =
  await import('../src/modules/dailyTasks/liveTasks/medalTasks/likeTask.ts')
globalThis.window = globalThis
const { fproxy } = await import('../src/library/fetch-hook/index.ts')
hooks.deregister()

beforeEach(() => {
  Object.assign(state, {
    bili: { fansMedalsMeta: { status: 'error' } },
    modules: {
      moduleConfig: {
        DailyTasks: {
          MainSiteTasks: { coin: { _lastCompleteTime: 0 } },
          LiveTasks: {
            medalTasks: {
              light: { enabled: true, _lastCompleteTime: 0 },
              like: { _lastCompleteTime: 0 },
            },
          },
        },
        EnhanceExperience: { switchLiveStreamQuality: { qualityDesc: '原画' } },
      },
      moduleStatus: {
        DailyTasks: {
          MainSiteTasks: { coin: 'running' },
          LiveTasks: { medalTasks: { light: '', like: '' } },
        },
      },
    },
    alreadyCoined: 0,
    coinCode: 0,
    coinCalls: 0,
    networkError: false,
    phases: [],
  })
})

test('勋章首次获取已经失败时立即结束等待', async () => {
  assert.equal(await MedalModule.waitForFansMedals(), false)
})

test('点亮部分失败仍放行后续点赞，保留未完成日期和面板提示', async () => {
  state.bili.fansMedalsMeta.status = 'loaded'
  state.bili.filteredFansMedals = []
  const light = new LightTask()
  const like = new LikeTask()
  light.getMedals = () => ({ readyMedals: [], waitingMedals: [] })
  light.executeLightTasks = async () => ({ markUncompleted: true })
  const timeout = globalThis.setTimeout
  globalThis.setTimeout = () => 0
  try {
    await light.run()
    assert.equal(state.modules.moduleStatus.DailyTasks.LiveTasks.medalTasks.light, 'done')
    assert.equal(light.config._lastCompleteTime, 0)
    assert.equal(state.phases.at(-1)[1], 'error')
    await like.waitForLightTask()
    like.getMedals = () => ({ readyMedals: [], waitingMedals: [] })
    like.executeLikeTasks = async () => ({ markUncompleted: true })
    await like.run()
    assert.equal(state.modules.moduleStatus.DailyTasks.LiveTasks.medalTasks.like, 'done')
    assert.equal(like.config._lastCompleteTime, 0)
    assert.equal(state.phases.at(-1)[1], 'error')
  } finally {
    globalThis.setTimeout = timeout
  }
})

for (const scenario of [
  'success',
  'insufficient videos',
  'already coined',
  'balance',
  'api',
  'network',
]) {
  test(`每日投币正确结束且仅成功达标才记录时间：${scenario}`, async () => {
    const task = new CoinTask()
    task.getDynamicVideoIds = () => [{ aid: '1', bvid: 'BV1' }]
    state.coinCode = scenario === 'balance' ? -104 : scenario === 'api' ? -1 : 0
    state.networkError = scenario === 'network'
    state.alreadyCoined = scenario === 'already coined' ? 1 : 0
    await task.coinDynamicVideos(scenario === 'insufficient videos' ? 2 : 1)
    const status = state.modules.moduleStatus.DailyTasks.MainSiteTasks.coin
    assert.equal(status, ['balance', 'api', 'network'].includes(scenario) ? 'error' : 'done')
    assert.equal(task.config._lastCompleteTime, scenario === 'success' ? 12345 : 0)
    assert.equal(state.coinCalls, scenario === 'already coined' ? 0 : 1)
  })
}

test('fetch 解除拦截后可以重新安装并触发新处理器', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => new Response('ok')
  // 模块记录了原始 fetch；请求由处理器直接响应，避免实际访问网络。
  let calls = 0
  const onRequest = (_config, handler) => {
    calls++
    handler.resolve(new Response('hooked'))
  }
  const first = fproxy({ onRequest }, globalThis)
  assert.equal(await (await fetch('https://example.invalid')).text(), 'hooked')
  first.unHook()
  const second = fproxy({ onRequest }, globalThis)
  try {
    assert.equal(await (await fetch('https://example.invalid')).text(), 'hooked')
    assert.equal(calls, 2)
  } finally {
    second.unHook()
    globalThis.fetch = original
  }
})

test('等待开播后使用新的画质列表选择目标', async () => {
  let live = false
  let switched
  state.player = {
    waitForLiveStatus: async () => {
      live = true
    },
  }
  const player = {
    getPlayerInfo: () => ({
      qualityCandidates: live ? [{ desc: '原画', hdrType: 0, qn: 10000 }] : [],
      quality: 0,
    }),
    switchQuality: (qn) => {
      switched = qn
    },
  }
  const interval = globalThis.setInterval
  const timeout = globalThis.setTimeout
  globalThis.setInterval = (callback) => {
    callback()
    return 0
  }
  globalThis.setTimeout = () => 0
  try {
    await new SwitchQuality().switchQuality(player)
    assert.equal(switched, 10000)
  } finally {
    globalThis.setInterval = interval
    globalThis.setTimeout = timeout
  }
})
