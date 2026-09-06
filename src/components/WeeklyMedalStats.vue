<script setup lang="ts">
import { computed, onScopeDispose, ref } from 'vue'
import { useBiliStore, useCacheStore, useModuleStore } from '@/stores'
import { ElMessage } from 'element-plus'
import { RefreshRight } from '@element-plus/icons-vue'
import { useWeeklyMedalStore } from '@/stores/useWeeklyMedalStore'
import { weeklyPeriod, weeklyTotals } from '@/library/weekly-medal-stats'
import { compareWeeklyWatchScores } from '@/library/weekly-watch-scheduler'
import {
  refreshFreeIntimacyReminders,
  waitForFansMedalsReady,
} from '@/library/free-intimacy-reminders'

const biliStore = useBiliStore()
const weeklyStore = useWeeklyMedalStore()
const cacheStore = useCacheStore()
const moduleStore = useModuleStore()
const watchConfig = computed(() => moduleStore.moduleConfig.DailyTasks.LiveTasks.medalTasks.watch)
const search = ref('')
const refreshing = ref(false)
const now = ref(Date.now())
const timer = window.setInterval(() => {
  now.value = Date.now()
}, 30_000)
onScopeDispose(() => window.clearInterval(timer))
const currentWeek = computed(() => weeklyPeriod(now.value).week)
const selectedWeek = ref('current')
const week = computed(() =>
  selectedWeek.value === 'current' ? currentWeek.value : selectedWeek.value,
)
const isCurrentWeek = computed(() => week.value === currentWeek.value)
const accountRecords = computed(() =>
  Object.values(weeklyStore.records).filter(
    (record) => record.ownerUid === biliStore.BilibiliLive?.UID,
  ),
)
const pastWeeks = computed(() =>
  [...new Set(accountRecords.value.map((r) => r.week))]
    .filter((value) => value !== currentWeek.value)
    .sort()
    .reverse(),
)
const rows = computed(() => {
  const records = new Map(
    accountRecords.value.filter((r) => r.week === week.value).map((r) => [r.targetId, r]),
  )
  const medals = new Map(
    biliStore.filteredFansMedals.map((medal) => [
      medal.medal.target_id,
      {
        targetId: medal.medal.target_id,
        nickName: medal.anchor_info.nick_name,
        medalName: medal.medal.medal_name,
        roomId: medal.room_info.room_id,
      },
    ]),
  )
  for (const record of records.values()) medals.set(record.targetId, record)
  const currentMedals = new Map(
    biliStore.filteredFansMedals.map((medal) => [medal.medal.target_id, medal]),
  )
  const result = [...medals.values()]
    .map((medal) => {
      const record = records.get(medal.targetId)
      const current = currentMedals.get(medal.targetId)
      const inList = watchConfig.value.isWhiteList
        ? watchConfig.value.roomidList.includes(medal.roomId)
        : !watchConfig.value.roomidList.includes(medal.roomId)
      const reason = !current
        ? '已不在勋章列表'
        : !inList
          ? '观看名单外'
          : current.medal.level >= 120
            ? '等级已达上限'
            : current.medal.is_lighted !== 1
              ? '需先点亮勋章'
              : ''
      const totals = weeklyTotals(record)
      return {
        ...medal,
        ...totals,
        rounds: totals.likeRounds + totals.watchRounds,
        observed:
          !!record && Object.values(record.days).some((daily) => Object.keys(daily).length > 0),
        updatedAt: record?.updatedAt,
        eligible: reason === '',
        reason,
        rank: 0,
      }
    })
    .sort(
      (a, b) =>
        (isCurrentWeek.value ? Number(b.eligible) - Number(a.eligible) : 0) ||
        compareWeeklyWatchScores(a, b),
    )
  let rank = 0
  for (let i = 0; i < result.length; i++) {
    const row = result[i]
    if (!isCurrentWeek.value || !row.eligible) continue
    if (i === 0 || compareWeeklyWatchScores(row, result[i - 1]) !== 0) rank = i + 1
    row.rank = rank
  }
  return result
})
const visibleRows = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return rows.value.filter((row) =>
    `${row.nickName} ${row.medalName} ${row.roomId}`.toLocaleLowerCase().includes(query),
  )
})
const summary = computed(() => ({
  points: rows.value.reduce((sum, row) => sum + row.points, 0),
  observed: rows.value.filter((row) => row.observed).length,
  incomplete: rows.value.some((row) => !row.observed || row.unknownRounds > 0),
  first: rows.value.filter((row) => row.rank === 1),
}))
const priorityMessage = computed(() => {
  if (!isCurrentWeek.value) return '正在查看历史周；切回本周可查看开播后的参考优先级。'
  if (!watchConfig.value.enabled)
    return '观看任务未开启，以下优先级仅供预览。可在直播任务页开启观看任务。'
  if (!watchConfig.value.prioritizeWeeklyIntimacy)
    return '本周低收益优先未开启，以下为收益排序预览，实际仍按原名单顺序执行。'
  return '本周低收益优先已开启。每完成一轮观看后，重新选择正在直播且符合条件的主播。'
})
const formatUpdatedAt = (timestamp?: number) =>
  timestamp
    ? new Date(timestamp).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '尚未观测'

async function refreshSummary() {
  if (refreshing.value || cacheStore.currentScriptType === 'Other') return
  refreshing.value = true
  try {
    if (biliStore.fansMedalsMeta.status !== 'loading') {
      await moduleStore.rerunModule('Default_FansMedals', true)
    }
    if (!(await waitForFansMedalsReady())) throw new Error('粉丝勋章列表加载失败或等待超时')
    const result = await refreshFreeIntimacyReminders()
    now.value = Date.now()
    if (result.intimacyFailedCount) {
      ElMessage.warning(`小结已更新，${result.intimacyFailedCount} 位主播查询失败，保留已有记录`)
    } else {
      ElMessage.success('本周小结已更新')
    }
  } catch (error) {
    ElMessage.error(`小结刷新失败：${error instanceof Error ? error.message : String(error)}`)
  } finally {
    refreshing.value = false
  }
}
</script>

<template>
  <el-card class="weekly-card" shadow="never">
    <template #header>
      <div class="weekly-header">
        <el-text tag="b">每周小结</el-text>
        <el-select v-model="selectedWeek" class="week-select" size="small" aria-label="统计周">
          <el-option :label="`本周（${currentWeek} 起）`" value="current" />
          <el-option
            v-for="value in pastWeeks"
            :key="value"
            :label="`${value} 起的一周`"
            :value="value"
          />
        </el-select>
        <el-button
          size="small"
          type="primary"
          plain
          :icon="RefreshRight"
          :loading="refreshing"
          :disabled="!isCurrentWeek || cacheStore.currentScriptType === 'Other'"
          @click="refreshSummary"
        >
          刷新本周
        </el-button>
      </div>
    </template>
    <el-alert
      v-if="cacheStore.currentScriptType === 'Other'"
      class="summary-message"
      type="warning"
      title="当前为其他标签页，显示的是已载入的统计；请在主运行直播间刷新本周数据。"
      :closable="false"
      show-icon
    />
    <el-space class="summary-totals" wrap>
      <el-tag effect="plain">已观测 {{ summary.observed }} / {{ rows.length }} 位主播</el-tag>
      <el-tag type="success" effect="plain"
        >已记录亲密度 {{ summary.points }}{{ summary.incomplete ? '（数据不完整）' : '' }}</el-tag
      >
    </el-space>
    <el-alert
      class="summary-message"
      :title="priorityMessage"
      type="info"
      :closable="false"
      show-icon
    />
    <p v-if="isCurrentWeek && summary.first.length" class="priority-preview">
      <el-text tag="b">开播后优先候选：</el-text>
      {{
        summary.first
          .slice(0, 3)
          .map((row) => row.nickName)
          .join('、')
      }}
      <template v-if="summary.first.length > 3">等 {{ summary.first.length }} 位主播</template>
    </p>
    <p class="summary-description">
      <el-text type="info" size="small">
        优先级数字越小越靠前；亲密度和任务轮数都相同时并列，运行时轮流执行。
        未观测主播暂按零收益参与比较。仅对已点亮、等级未达上限且在观看名单内的勋章预览优先级；
        实际执行还要检查开播状态、当天目标及储蓄上限。
        <template v-if="isCurrentWeek && !watchConfig.waitUntilLiving"
          >当前未开启等待开播，中途开播的主播不会自动加入本轮队列。</template
        >
      </el-text>
    </p>
    <el-input
      v-model="search"
      class="summary-search"
      placeholder="搜索主播、粉丝牌或房间号"
      aria-label="搜索每周小结"
      clearable
    />
    <el-table
      :data="visibleRows"
      size="small"
      max-height="420"
      empty-text="暂无匹配记录，可点击刷新本周加载粉丝勋章"
    >
      <el-table-column v-if="isCurrentWeek" label="参考优先级" width="100" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.rank" :type="row.rank === 1 ? 'success' : 'info'">{{
            row.rank
          }}</el-tag>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column label="主播 / 粉丝牌" min-width="130">
        <template #default="{ row }">
          <el-link
            :href="`https://live.bilibili.com/${row.roomId}`"
            target="_blank"
            rel="noreferrer"
            type="primary"
            >{{ row.nickName }}</el-link
          >
          <div>
            <el-text type="info" size="small">{{ row.medalName }}</el-text>
          </div>
        </template>
      </el-table-column>
      <el-table-column
        :label="isCurrentWeek ? '本周已观测亲密度' : '该周已观测亲密度'"
        min-width="155"
        align="center"
      >
        <template #default="{ row }">
          <el-tooltip :content="`最近观测：${formatUpdatedAt(row.updatedAt)}`">
            <span v-if="!row.observed">未观测</span>
            <span v-else>{{ row.points }}{{ row.unknownRounds ? '（部分奖励未知）' : '' }}</span>
          </el-tooltip>
          <div v-if="row.observed">
            <el-text type="info" size="small"
              >点赞 {{ row.likeRounds }} 轮 · 观看 {{ row.watchRounds }} 轮</el-text
            >
          </div>
        </template>
      </el-table-column>
      <el-table-column v-if="isCurrentWeek" label="观看条件" min-width="130">
        <template #default="{ row }">
          {{ row.reason || '在观看名单内' }}
        </template>
      </el-table-column>
    </el-table>
    <p class="summary-description">
      <el-text type="info" size="small">
        北京时间周一至周日。统计本机已查询到的点赞、观看任务进度及其亲密度奖励，包含待领取的储蓄，
        不代表勋章已升级经验。首次查询可计入当天已完成的任务，无法补回此前未记录日期或付费送礼收益。
        随任务查询或“刷新本周”更新，保留最近八周。刷新当前数据无法补回历史周。
      </el-text>
    </p>
  </el-card>
</template>

<style scoped>
.weekly-card {
  margin-bottom: 16px;
}

.weekly-header {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.week-select {
  width: 210px;
}

.summary-message,
.summary-totals,
.summary-search {
  margin-bottom: 12px;
}

.summary-description,
.priority-preview {
  margin: 12px 0;
  line-height: 1.6;
}
</style>
