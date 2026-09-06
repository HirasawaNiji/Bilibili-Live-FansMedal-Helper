import type { LiveData } from './bili-api/data'

export type WeeklyTask = 'like' | 'watchLive'
export interface WeeklyTaskProgress {
  rounds: number
  reward: number | null
}
export interface WeeklyMedalRecord {
  ownerUid: number
  targetId: number
  roomId: number
  nickName: string
  medalName: string
  week: string
  days: Record<string, Partial<Record<WeeklyTask, WeeklyTaskProgress>>>
  updatedAt: number
}
export type WeeklyMedalRecords = Record<string, WeeklyMedalRecord>

const DAY_MS = 86_400_000
const CHINA_OFFSET = 8 * 60 * 60 * 1000

/** 北京时间自然日与周一日期，不依赖浏览器的时区。 */
export function weeklyPeriod(now = Date.now()): { day: string; week: string } {
  const date = new Date(now + CHINA_OFFSET)
  const day = date.toISOString().slice(0, 10)
  const monday = new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * DAY_MS)
  return { day, week: monday.toISOString().slice(0, 10) }
}

/** 仅识别明确的数字奖励；文案变化时保留未知，不假设一轮等于一点。 */
export function parseIntimacyReward(text: string): number | null {
  const match = text?.trim().match(/^(?:亲密度\s*)?\+\s*(\d+(?:\.\d+)?)(?:\s*亲密度)?$/)
  return match ? Number(match[1]) : null
}

/** 每天每种任务保存已确认进度的最大值，刷新、重跑和领取储蓄不会重复计数。 */
export function observeWeeklyMedal(
  records: WeeklyMedalRecords,
  ownerUid: number,
  medal: LiveData.FansMedalPanel.List,
  data: LiveData.GetActivatedMedalInfo.Data,
  now = Date.now(),
  requestStartedAt = now,
): void {
  const { day, week } = weeklyPeriod(now)
  // 跨午夜的响应可能仍包含前一天进度，留待下一次查询，避免计入新一天/周。
  if (weeklyPeriod(requestStartedAt).day !== day) return
  const key = `${ownerUid}:${medal.medal.target_id}:${week}`
  const record = (records[key] ??= {
    ownerUid,
    targetId: medal.medal.target_id,
    roomId: medal.room_info.room_id,
    nickName: medal.anchor_info.nick_name,
    medalName: medal.medal.medal_name,
    week,
    days: {},
    updatedAt: now,
  })
  record.nickName = medal.anchor_info.nick_name
  record.medalName = medal.medal.medal_name
  record.roomId = medal.room_info.room_id
  record.updatedAt = now
  const daily = (record.days[day] ??= {})
  for (const task of data.task_info ?? []) {
    if (task.jump_type !== 'like' && task.jump_type !== 'watchLive') continue
    const match = task.sub_title?.match(/(\d+)\s*\/\s*(\d+)/)
    if (!match) continue
    const rounds = Number(match[1])
    const limit = Number(match[2])
    if (rounds > limit) continue
    const previous = daily[task.jump_type]
    daily[task.jump_type] = {
      rounds: Math.max(previous?.rounds ?? 0, rounds),
      reward: previous?.reward ?? parseIntimacyReward(task.add_text),
    }
  }
  // 保留最近八周，避免长期运行后本地统计无限增长。
  const oldestWeek = weeklyPeriod(now - 7 * 7 * DAY_MS).week
  for (const [recordKey, value] of Object.entries(records)) {
    if (value.week < oldestWeek) delete records[recordKey]
  }
}

export function weeklyTotals(record?: WeeklyMedalRecord) {
  let points = 0
  let likeRounds = 0
  let watchRounds = 0
  let unknownRounds = 0
  for (const daily of Object.values(record?.days ?? {})) {
    for (const [task, progress] of Object.entries(daily)) {
      if (task === 'like') likeRounds += progress.rounds
      else watchRounds += progress.rounds
      if (progress.reward === null) unknownRounds += progress.rounds
      else points += progress.rounds * progress.reward
    }
  }
  return { points, likeRounds, watchRounds, unknownRounds }
}
