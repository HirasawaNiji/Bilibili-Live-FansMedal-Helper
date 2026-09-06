import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  observeWeeklyMedal,
  parseIntimacyReward,
  weeklyPeriod,
  weeklyTotals,
} from '../src/library/weekly-medal-stats.ts'
import { runWeeklyWatchQueue } from '../src/library/weekly-watch-scheduler.ts'

const medal = {
  medal: { target_id: 100, medal_name: '粉丝牌' },
  anchor_info: { nick_name: '主播' },
  room_info: { room_id: 200 },
}
const data = (watch = 0, like = 0, reward = '+1亲密度') => ({
  task_info: [
    { jump_type: 'watchLive', sub_title: `每日上限 ${watch}/10`, add_text: reward },
    { jump_type: 'like', sub_title: `每日上限 ${like}/10`, add_text: '+2' },
  ],
})
const monday = Date.parse('2026-09-07T12:00:00+08:00')

test('跨周午夜返回的旧响应不计入新的一周', () => {
  const records = {}
  observeWeeklyMedal(
    records,
    1,
    medal,
    data(10),
    Date.parse('2026-09-06T16:00:01Z'),
    Date.parse('2026-09-06T15:59:59Z'),
  )
  assert.deepEqual(records, {})
})

test('北京时间周一零点换周，不受运行机器时区影响', () => {
  assert.deepEqual(weeklyPeriod(Date.parse('2026-09-06T15:59:59Z')), {
    day: '2026-09-06',
    week: '2026-08-31',
  })
  assert.deepEqual(weeklyPeriod(Date.parse('2026-09-06T16:00:00Z')), {
    day: '2026-09-07',
    week: '2026-09-07',
  })
})

test('刷新、重跑、旧响应不会重复或倒减每日进度，次日累计', () => {
  let records = {}
  observeWeeklyMedal(records, 1, medal, data(2, 1), monday)
  // 模拟关闭再打开后从油猴存储读取。
  records = JSON.parse(JSON.stringify(records))
  observeWeeklyMedal(records, 1, medal, data(2, 1), monday)
  observeWeeklyMedal(records, 1, medal, data(1, 0), monday)
  assert.equal(weeklyTotals(records['1:100:2026-09-07']).points, 4)
  observeWeeklyMedal(records, 1, medal, data(3, 1), monday)
  observeWeeklyMedal(records, 1, medal, data(1, 1), monday + 86_400_000)
  assert.deepEqual(weeklyTotals(records['1:100:2026-09-07']), {
    points: 8,
    likeRounds: 2,
    watchRounds: 4,
    unknownRounds: 0,
  })
})

test('账号、主播与周分别统计，历史周保留，八周以前清理', () => {
  const records = {}
  observeWeeklyMedal(records, 1, medal, data(2), monday)
  observeWeeklyMedal(records, 2, medal, data(5), monday)
  observeWeeklyMedal(
    records,
    1,
    { ...medal, medal: { ...medal.medal, target_id: 101 } },
    data(7),
    monday,
  )
  observeWeeklyMedal(records, 1, medal, data(1), monday + 7 * 86_400_000)
  assert.equal(weeklyTotals(records['1:100:2026-09-07']).points, 2)
  assert.equal(weeklyTotals(records['2:100:2026-09-07']).points, 5)
  assert.equal(weeklyTotals(records['1:101:2026-09-07']).points, 7)
  assert.equal(weeklyTotals(records['1:100:2026-09-14']).points, 1)
  observeWeeklyMedal(records, 1, medal, data(1), monday + 8 * 7 * 86_400_000)
  assert.equal(records['1:100:2026-09-07'], undefined)
  assert.ok(records['1:100:2026-09-14'])
})

test('奖励未知不猜点数，可在后续明确奖励后补齐；不计付费任务和非法进度', () => {
  assert.equal(parseIntimacyReward('亲密度 + 1'), 1)
  assert.equal(parseIntimacyReward('奖励翻倍至10'), null)
  assert.equal(parseIntimacyReward('+1~5'), null)
  const records = {}
  observeWeeklyMedal(records, 1, medal, data(2, 0, '奖励待定'), monday)
  assert.deepEqual(weeklyTotals(records['1:100:2026-09-07']), {
    points: 0,
    likeRounds: 0,
    watchRounds: 2,
    unknownRounds: 2,
  })
  observeWeeklyMedal(records, 1, medal, data(2), monday)
  assert.equal(weeklyTotals(records['1:100:2026-09-07']).points, 2)
  observeWeeklyMedal(
    records,
    1,
    medal,
    {
      task_info: [
        { jump_type: 'sendGift', sub_title: '1/1', add_text: '+100' },
        { jump_type: 'watchLive', sub_title: '99/10', add_text: '+1' },
      ],
    },
    monday,
  )
  assert.equal(weeklyTotals(records['1:100:2026-09-07']).points, 2)
})

function harness(overrides = {}) {
  let now = 0
  const calls = []
  const points = { frequent: 10, rare: 0 }
  const options = {
    now: () => now,
    score: (item) => ({ points: points[item] ?? 0, rounds: 0 }),
    shouldStop: () => false,
    sleep: async (ms) => {
      now += ms
    },
    execute: async (item) => {
      calls.push(item)
      return 'done'
    },
    onWaiting: () => {},
    waitUntilLiving: () => true,
    pollInterval: 120,
    ...overrides,
  }
  return {
    options,
    calls,
    points,
    advance: (ms) => {
      now += ms
    },
  }
}

test('少收益的主播优先；收益变化后每轮重新选择', async () => {
  const h = harness()
  h.points.frequent = 1
  h.options.execute = async (item) => {
    h.calls.push(item)
    h.points[item]++
    return h.calls.length <= 2 ? 'yield' : 'done'
  }
  assert.equal(await runWeeklyWatchQueue(['frequent', 'rare'], h.options), true)
  assert.deepEqual(h.calls, ['rare', 'frequent', 'rare', 'frequent'])
})

test('等待中的主播中途开播，不必等待常播主播全部做完', async () => {
  const h = harness()
  let rareProbes = 0
  h.options.execute = async (item) => {
    h.calls.push(item)
    if (item === 'rare' && rareProbes++ === 0) return 'offline'
    if (item === 'frequent' && h.calls.length === 2) {
      h.advance(900)
      return 'yield'
    }
    return 'done'
  }
  assert.equal(await runWeeklyWatchQueue(['frequent', 'rare'], h.options), true)
  assert.deepEqual(h.calls, ['rare', 'frequent', 'rare', 'frequent'])
})

test('收益和进度都相同或未知时轮流执行，保留原顺序作为初始顺序', async () => {
  const h = harness({ score: () => ({ points: 0, rounds: 0 }) })
  h.options.execute = async (item) => {
    h.calls.push(item)
    return h.calls.length <= 2 ? 'yield' : 'done'
  }
  await runWeeklyWatchQueue(['frequent', 'rare'], h.options)
  assert.deepEqual(h.calls, ['frequent', 'rare', 'frequent', 'rare'])
})

test('无主播开播时休眠再探测；失败和跨天不记为全部完成', async () => {
  const h = harness()
  let waiting = 0
  h.options.onWaiting = () => {
    waiting++
  }
  h.options.execute = async (item) => {
    h.calls.push(item)
    return h.calls.length === 1 ? 'offline' : 'error'
  }
  assert.equal(await runWeeklyWatchQueue(['rare'], h.options), false)
  assert.equal(waiting, 1)
  assert.equal(h.options.now(), 120)
  assert.equal(
    await runWeeklyWatchQueue(['rare'], {
      ...h.options,
      shouldStop: () => true,
    }),
    false,
  )
})

test('关闭等待时跳过离线主播；已完成房间从队列移除', async () => {
  const h = harness({ waitUntilLiving: () => false })
  h.options.execute = async (item) => {
    h.calls.push(item)
    return item === 'rare' ? 'offline' : 'done'
  }
  assert.equal(await runWeeklyWatchQueue(['frequent', 'rare'], h.options), true)
  assert.deepEqual(h.calls, ['rare', 'frequent'])
})
