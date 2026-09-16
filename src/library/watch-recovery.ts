export interface WatchRecoveryRecord {
  day: string
  /** 同一账号一天最多自动刷新一次，跨页面、刷新及手动重跑保留。 */
  reloadUsed: boolean
  rooms: Record<string, { progress: number; failures: number }>
}

export function recoveryDay(now = Date.now()): string {
  return new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function getRecoveryRecord(
  record: WatchRecoveryRecord | undefined,
  now = Date.now(),
): WatchRecoveryRecord {
  const day = recoveryDay(now)
  return record?.day === day ? record : { day, reloadUsed: false, rooms: {} }
}

/** 首次无增长补看一轮；第二次刷新；刷新后只再尝试一轮，失败则停止该进度。 */
export function recordWatchFailure(
  record: WatchRecoveryRecord,
  roomId: number,
  progress: number,
): 'retry' | 'reload' | 'stop' {
  const previous = record.rooms[roomId]
  const failures = previous?.progress === progress ? previous.failures + 1 : 1
  record.rooms[roomId] = { progress, failures }
  if (failures === 1) return 'retry'
  if (failures === 2 && !record.reloadUsed) return 'reload'
  return 'stop'
}

export function isWatchRecoveryExhausted(
  record: WatchRecoveryRecord,
  roomId: number,
  progress: number,
): boolean {
  const previous = record.rooms[roomId]
  return previous?.progress === progress && previous.failures >= 3
}

export const WATCH_RELOAD_MARKER = 'BLTH:watch-recovery-reload:v1'
