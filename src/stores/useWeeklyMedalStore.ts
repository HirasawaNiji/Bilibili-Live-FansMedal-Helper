import { defineStore } from 'pinia'
import { ref } from 'vue'
import Storage from '@/library/storage'
import { observeWeeklyMedal, weeklyPeriod, weeklyTotals } from '@/library/weekly-medal-stats'
import type { LiveData } from '@/library/bili-api/data'
import { useBiliStore } from './useBiliStore'
import { useCacheStore } from './useCacheStore'

export const useWeeklyMedalStore = defineStore('weekly-medals', () => {
  const records = ref(Storage.getWeeklyMedalStats())

  function observe(
    medal: LiveData.FansMedalPanel.List,
    data: LiveData.GetActivatedMedalInfo.Data,
    requestStartedAt = Date.now(),
  ) {
    const ownerUid = useBiliStore().BilibiliLive?.UID
    if (!ownerUid || useCacheStore().currentScriptType === 'Other') return
    // 独立存储，避免其它标签页的存活心跳用旧 cache 覆盖周统计。
    const latest = Storage.getWeeklyMedalStats()
    observeWeeklyMedal(latest, ownerUid, medal, data, Date.now(), requestStartedAt)
    Storage.setWeeklyMedalStats(latest)
    records.value = latest
  }

  function totals(targetId: number, week = weeklyPeriod().week) {
    const ownerUid = useBiliStore().BilibiliLive?.UID
    return weeklyTotals(records.value[`${ownerUid}:${targetId}:${week}`])
  }

  return { records, observe, totals }
})
