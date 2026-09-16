import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { beforeEach, test } from 'node:test'
import {
  getRecoveryRecord,
  recordWatchFailure,
  recoveryDay,
} from '../src/library/watch-recovery.ts'

const moduleUrl = (source) => `data:text/javascript,${encodeURIComponent(source)}`
const stateUrl = moduleUrl('export default {}')
const { default: state } = await import(stateUrl)
const shared = `import state from '${stateUrl}';`
const recoveryUrl = new URL('../src/library/watch-recovery.ts', import.meta.url).href
const stubs = {
  '@/library/luxon': `${shared}
    export const tsm = () => state.now;
    export const isNowAfter = () => state.crossDay;
    export const isNowBefore = () => false;
    export const isTimestampToday = () => false;
    export const delayToNextMoment = () => ({ms: 86400000});`,
  '@/library/utils': `${shared} export const sleep = async ms => { state.now += ms; state.waits.push(ms); };`,
  '@/library/logger': `${shared} export default class Logger {
    log(...args) { state.logs.push(args); }
    warn(...args) { state.logs.push(args); }
    error(...args) { state.logs.push(args); }
  }`,
  '@/library/script-lifecycle': `${shared} export const isScriptStopping = () => state.stopping;`,
  '@/library/watch-recovery': `export * from '${recoveryUrl}';`,
  '@/library/weekly-watch-scheduler': 'export const runWeeklyWatchQueue = async () => true;',
  '@/stores/useWeeklyMedalStore': 'export const useWeeklyMedalStore = () => ({});',
  '@/library/storage': `${shared}
    import {getRecoveryRecord} from '${recoveryUrl}';
    export default {
      getWatchRecovery: () => getRecoveryRecord(structuredClone(state.recovery), state.now),
      setWatchRecovery: (uid, value) => { state.recovery = structuredClone(value); },
      setModuleConfig: () => { state.configSaved = true; }
    };`,
  '@/stores': `${shared}
    export const useBiliStore = () => ({cookies: {LIVE_BUVID: 'test'}, BilibiliLive: {UID: 1}});
    export const useModuleStore = () => ({moduleConfig: state.config});
    export const usePlayerStore = () => ({});
    export const useRuntimeStatusStore = () => ({
      setCurrent() {}, setItemStatus(...args) { state.statuses.push(args); }
    });
    export const useCacheStore = () => ({
      hasDocumentLock: state.hasLock, currentScriptType: 'Main',
      reloadForWatchRecovery() {
        assertSaved(); state.reloads++; state.stopping = true; return true;
      }
    });
    function assertSaved() {
      if (!state.recovery?.reloadUsed || !state.configSaved) throw Error('刷新前未保存');
    }`,
  '@/modules/dailyTasks/liveTasks/medalTasks/MedalModule': `${shared}
    export default class MedalModule {
      medalTasksConfig = {watch: {waitUntilLiving: true}};
      logger = {log(...args) {state.logs.push(args)}, warn(...args) {state.logs.push(args)}, error(...args) {state.logs.push(args)}};
      static WAIT_MEDAL_UPDATE_DELAY = 3000;
      static shouldStopForCrossDay() { return state.crossDay; }
      static parseTitleCount() { return 15; }
      static findTaskInfo(tasks) { return tasks[0]; }
      static parseDailyLimit(text) { const [current,limit] = text.split('/').map(Number); return {current,limit}; }
      async fetchMedalData() {
        state.reads++;
        if (state.failQueries && state.reads > 1) return null;
        if (state.delayedRead === state.reads) state.progress++;
        return {reach_free_intimacy_limit: state.cap, task_info: [{title: '观看15分钟', sub_title: state.progress+'/10', is_done: state.progress >= 10}]};
      }
      async preExecuteVerify() { return state.verdict; }
    }`,
  '@/library/bili-api': `${shared}
    const data = () => ({heartbeat_interval: 60, secret_key: 'test', secret_rule: [], timestamp: state.now/1000});
    export default {
      live: {getInfoByRoom: async () => ({code:0, data:{room_info:{area_id:78,parent_area_id:2}}})},
      liveTrace: {
        E: async () => {state.sessions++; state.sequence=0; return {code:0,data:data()};},
        X: async () => {
          state.sequence++; state.xCalls++;
          if (state.failAt[state.sessions] === state.sequence) throw Error('network status: 0');
          if (state.serverFail) return {code: -1, message: 'time check failed'};
          if (state.sequence === 15 && state.creditAt === state.sessions) state.progress++;
          if (state.stopAt === state.sequence) state.stopping = true;
          return {code:0,data:data()};
        }
      }
    };`,
}
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (Object.hasOwn(stubs, specifier))
      return { url: moduleUrl(stubs[specifier]), shortCircuit: true }
    return nextResolve(specifier, context)
  },
})
const { default: WatchTask, RoomHeart } =
  await import('../src/modules/dailyTasks/liveTasks/medalTasks/watchTask.ts')
hooks.deregister()

const medal = {
  room_info: { room_id: 4283606 },
  medal: { target_id: 37804608, medal_name: '龙dd' },
  anchor_info: { nick_name: '主播' },
}
beforeEach(() => {
  Object.assign(state, {
    now: Date.parse('2026-09-12T13:00:00+08:00'),
    crossDay: false,
    stopping: false,
    recovery: undefined,
    progress: 9,
    sessions: 0,
    sequence: 0,
    xCalls: 0,
    failAt: {},
    creditAt: 0,
    stopAt: 0,
    delayedRead: 0,
    reads: 0,
    logs: [],
    statuses: [],
    waits: [],
    hasLock: true,
    reloads: 0,
    config: {},
    configSaved: false,
    verdict: 'pass',
    cap: false,
    failQueries: false,
    serverFail: false,
  })
  globalThis.window = {}
  window.self = window
  window.top = window
})
const run = () => new WatchTask('test').executeWatchTask(medal)

test('原始故障：第7次请求失败时返回真实360秒，不误报整轮完成', async () => {
  state.failAt = { 1: 7 }
  const result = await new RoomHeart(4283606, 78, 2, 37804608, 900).start()
  assert.deepEqual(result, { watchedSeconds: 360, completed: false, reason: 'request-error' })
})

test('网络中断后补看完整一轮，服务端增长则结束，不刷新', async () => {
  state.failAt = { 1: 7 }
  state.creditAt = 2
  assert.equal(await run(), null)
  assert.equal(state.sessions, 2)
  assert.equal(state.reloads, 0)
  assert.ok(state.logs.some((args) => String(args[0]).includes('360/900')))
  assert.ok(!state.logs.some((args) => String(args[0]).includes('已发送 15 分钟')))
})

test('完整两轮不增长：先持久化预算，再刷新；刷新后失败不会循环', async () => {
  assert.equal(await run(), 'stopAndMarkUncompleted')
  assert.equal(state.sessions, 2)
  assert.equal(state.reloads, 1)
  assert.equal(state.recovery.rooms[4283606].failures, 2)
  state.stopping = false // 模拟新文档，恢复记录保留
  assert.equal(await run(), 'markUncompleted')
  assert.equal(state.sessions, 3)
  assert.equal(state.reloads, 1)
  assert.equal(await run(), 'markUncompleted') // 手动重跑仍不能重置次数
  assert.equal(state.sessions, 3)
})

test('刷新后的那一轮恢复正常时接受服务端进度', async () => {
  await run()
  state.stopping = false
  state.creditAt = 3
  assert.equal(await run(), null)
  assert.equal(state.progress, 10)
  assert.equal(state.reloads, 1)
})

test('结算延迟30秒内增长时不补看', async () => {
  state.delayedRead = 4
  assert.equal(await run(), null)
  assert.equal(state.sessions, 1)
  assert.equal(state.reads, 4)
})

test('查询失败不能判为无效观看，更不能自动刷新', async () => {
  state.failQueries = true
  assert.equal(await run(), 'markUncompleted')
  assert.equal(state.sessions, 1)
  assert.equal(state.reloads, 0)
  assert.equal(state.recovery, undefined)
})

test('没有主锁或处于子frame时只补看，不刷新', async () => {
  state.hasLock = false
  assert.equal(await run(), 'markUncompleted')
  assert.equal(state.sessions, 2)
  assert.equal(state.reloads, 0)
  state.hasLock = true
  window.top = {}
  state.recovery = undefined
  await run()
  assert.equal(state.reloads, 0)
})

test('关闭页面中断心跳，不补发，不查询进度，不刷新', async () => {
  state.stopAt = 3
  assert.equal(await run(), 'stopAndMarkUncompleted')
  assert.equal(state.xCalls, 3)
  assert.equal(state.reads, 1)
  assert.equal(state.reloads, 0)
})

test('跨天、下播、储蓄已满时不触发补救', async () => {
  state.crossDay = true
  assert.equal(await run(), 'stopAndMarkUncompleted')
  state.crossDay = false
  state.verdict = 'fail'
  assert.equal(await run(), 'requeue')
  state.verdict = 'pass'
  state.cap = true
  assert.equal(await run(), 'skipSleep')
  assert.equal(state.sessions, 0)
  assert.equal(state.reloads, 0)
})

test('服务端业务拒绝也只允许一次补看，不会无限重发旧签名', async () => {
  state.serverFail = true
  await run()
  assert.equal(state.sessions, 2)
  assert.equal(state.xCalls, 2)
  assert.equal(state.reloads, 1)
})

test('同账号不同房间共享每日刷新预算，北京时间跨天才恢复预算', () => {
  const record = getRecoveryRecord(undefined, state.now)
  assert.equal(recordWatchFailure(record, 1, 9), 'retry')
  assert.equal(recordWatchFailure(record, 1, 9), 'reload')
  record.reloadUsed = true
  assert.equal(recordWatchFailure(record, 2, 0), 'retry')
  assert.equal(recordWatchFailure(record, 2, 0), 'stop')
  assert.equal(getRecoveryRecord(record, state.now + 86400000).reloadUsed, false)
  assert.equal(recoveryDay(Date.parse('2026-09-12T16:00:00Z')), '2026-09-13')
})
