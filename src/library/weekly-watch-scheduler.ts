export type WeeklyWatchAction = 'done' | 'yield' | 'offline' | 'error' | 'stop'

/** 周小结与实际调度共用收益比较规则，数值越小越优先。 */
export function compareWeeklyWatchScores(
  left: { points: number; rounds: number },
  right: { points: number; rounds: number },
): number {
  return left.points - right.points || left.rounds - right.rounds
}

interface WeeklyQueueOptions<T> {
  now: () => number
  score: (item: T) => { points: number; rounds: number }
  shouldStop: () => boolean
  sleep: (ms: number) => Promise<void>
  execute: (item: T) => Promise<WeeklyWatchAction>
  onWaiting: (count: number) => void
  waitUntilLiving: () => boolean
  pollInterval: number
}

/** 每轮重新排序；离线房间暂时退让，收益相同的房间轮流执行。 */
export async function runWeeklyWatchQueue<T>(
  items: T[],
  options: WeeklyQueueOptions<T>,
): Promise<boolean> {
  const queue = items.map((item, order) => ({ item, order, lastServed: 0, availableAt: 0 }))
  let sequence = 0
  let allCompleted = true
  while (queue.length) {
    if (options.shouldStop()) return false
    const now = options.now()
    const ready = queue.filter((entry) => entry.availableAt <= now)
    ready.sort((a, b) => {
      const left = options.score(a.item)
      const right = options.score(b.item)
      return (
        compareWeeklyWatchScores(left, right) || a.lastServed - b.lastServed || a.order - b.order
      )
    })
    const next = ready[0]
    if (!next) {
      options.onWaiting(queue.length)
      await options.sleep(
        Math.min(options.pollInterval, Math.min(...queue.map((e) => e.availableAt)) - now),
      )
      continue
    }
    const action = await options.execute(next.item)
    next.lastServed = ++sequence
    if (action === 'stop') return false
    if (action === 'yield') continue
    if (action === 'offline' && options.waitUntilLiving()) {
      next.availableAt = options.now() + options.pollInterval
      continue
    }
    if (action === 'error') allCompleted = false
    queue.splice(queue.indexOf(next), 1)
  }
  return allCompleted
}
