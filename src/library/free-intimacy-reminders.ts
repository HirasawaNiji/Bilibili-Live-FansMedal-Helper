import BAPI from '@/library/bili-api'
import { sleep } from '@/library/utils'
import { useBiliStore, useCacheStore } from '@/stores'

export interface FreeIntimacyRefreshResult {
  reminderCount: number
  intimacyFailedCount: number
  liveStatusFailedCount: number
}

let activeRefresh: Promise<FreeIntimacyRefreshResult> | undefined

/** 等待粉丝勋章列表结束加载，避免启动阶段重复请求或扫描空列表。 */
export async function waitForFansMedalsReady(timeout = 60e3): Promise<boolean> {
  const biliStore = useBiliStore()
  const deadline = Date.now() + timeout

  while (biliStore.fansMedalsMeta.status === 'loading' && Date.now() < deadline) {
    await sleep(500)
  }

  return biliStore.fansMedalsMeta.status === 'loaded'
}

/**
 * 扫描全部粉丝勋章，更新储蓄亲密度达到 90 的提醒及其实时开播状态。
 *
 * 同一页面内的自动刷新与手动刷新会复用同一个 Promise，避免并发扫描。
 */
export function refreshFreeIntimacyReminders(): Promise<FreeIntimacyRefreshResult> {
  if (activeRefresh) return activeRefresh

  activeRefresh = (async () => {
    const biliStore = useBiliStore()
    const cacheStore = useCacheStore()

    if (biliStore.fansMedalsMeta.status !== 'loaded') {
      throw new Error('粉丝勋章列表尚未加载完成')
    }

    const medals = biliStore.filteredFansMedals
    let intimacyFailedCount = 0
    let liveStatusFailedCount = 0

    for (let i = 0; i < medals.length; i++) {
      const medal = medals[i]
      try {
        const response = await BAPI.live.getActivatedMedalInfo(medal.medal.target_id)
        if (response.code === 0) {
          let liveStatus: number | null = medal.room_info.living_status

          // 只为进入提醒名单的主播额外查询实时开播状态，减少无用请求。
          if (response.data.free_intimacy >= 90) {
            try {
              const liveStatusResponse = await BAPI.live.getRoomPlayInfo(medal.room_info.room_id)
              if (liveStatusResponse.code === 0) {
                liveStatus = liveStatusResponse.data.live_status
              } else {
                liveStatus = null
                liveStatusFailedCount++
              }
            } catch {
              liveStatus = null
              liveStatusFailedCount++
            }
          }

          cacheStore.updateFreeIntimacyReminder(medal, response.data, liveStatus)
        } else {
          intimacyFailedCount++
        }
      } catch {
        intimacyFailedCount++
      }

      // 限速，降低全量扫描触发接口风控的概率。
      if (i < medals.length - 1) await sleep(400)
    }

    cacheStore.pruneFreeIntimacyReminders(medals.map((medal) => medal.medal.target_id))

    return {
      reminderCount: cacheStore.freeIntimacyReminders.length,
      intimacyFailedCount,
      liveStatusFailedCount,
    }
  })().finally(() => {
    activeRefresh = undefined
  })

  return activeRefresh
}
