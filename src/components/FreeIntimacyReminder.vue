<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { RefreshRight } from '@element-plus/icons-vue'
import { useBiliStore, useCacheStore, useModuleStore } from '@/stores'
import {
  refreshFreeIntimacyReminders,
  waitForFansMedalsReady,
} from '@/library/free-intimacy-reminders'

const biliStore = useBiliStore()
const cacheStore = useCacheStore()
const moduleStore = useModuleStore()
const refreshing = ref(false)

/** 扫描全部粉丝勋章，刷新储蓄亲密度达到 90 的提醒及开播状态。 */
async function refreshReminders() {
  if (refreshing.value) return
  if (cacheStore.currentScriptType === 'Other') {
    ElMessage.error('当前脚本未正常运行，请保留一个直播间并刷新该页面。')
    return
  }

  refreshing.value = true
  try {
    if (biliStore.fansMedalsMeta.status === 'loading') {
      await waitForFansMedalsReady()
    } else if (biliStore.fansMedalsMeta.status !== 'loaded') {
      await moduleStore.rerunModule('Default_FansMedals', true)
    }
    if (!(await waitForFansMedalsReady())) {
      throw new Error('粉丝勋章列表加载失败或等待超时')
    }

    const result = await refreshFreeIntimacyReminders()
    if (result.intimacyFailedCount > 0 || result.liveStatusFailedCount > 0) {
      const details = [
        result.intimacyFailedCount > 0 ? `${result.intimacyFailedCount} 个亲密度查询失败` : '',
        result.liveStatusFailedCount > 0
          ? `${result.liveStatusFailedCount} 个开播状态查询失败`
          : '',
      ]
        .filter(Boolean)
        .join('，')
      ElMessage.warning(`提醒刷新完成：${details}`)
    } else {
      ElMessage.success(`提醒和开播状态刷新完成，当前有 ${result.reminderCount} 位主播达到90+`)
    }
  } catch (error) {
    ElMessage.error(`提醒刷新失败：${error instanceof Error ? error.message : String(error)}`)
  } finally {
    refreshing.value = false
  }
}
</script>

<template>
  <section class="intimacy-reminder" aria-label="储蓄亲密度即将溢出">
    <div class="reminder-heading">
      <h4>储蓄亲密度即将溢出</h4>
      <el-button
        size="small"
        type="warning"
        text
        :icon="RefreshRight"
        :loading="refreshing"
        @click="refreshReminders"
        >刷新提醒</el-button
      >
    </div>
    <template v-if="cacheStore.freeIntimacyReminders.length">
      <p class="reminder-description">
        {{ cacheStore.freeIntimacyReminders.length }} 位主播 · 储蓄达到 90 时提醒
      </p>
      <div class="reminder-list">
        <div
          v-for="item in cacheStore.freeIntimacyReminders"
          :key="item.targetId"
          class="reminder-item"
        >
          <div class="reminder-row">
            <el-link
              :href="`https://live.bilibili.com/${item.roomId}`"
              :title="`直播间 ${item.roomId}`"
              target="_blank"
              rel="noreferrer"
              >{{ item.nickName }}</el-link
            >
            <el-tag :type="item.reachLimit ? 'danger' : 'warning'" size="small">
              已储蓄 {{ item.freeIntimacy }}<template v-if="item.reachLimit"> · 已满</template>
            </el-tag>
          </div>
          <div class="reminder-row reminder-meta">
            <span>
              {{ item.medalName }} ·
              <span :class="{ 'is-live': item.liveStatus === 1 }">
                {{
                  item.liveStatus === 1
                    ? '正在直播'
                    : item.liveStatus === 2
                      ? '轮播中'
                      : item.liveStatus === 0
                        ? '未开播'
                        : '状态未知'
                }}
              </span>
            </span>
            <el-link
              :href="`https://live.bilibili.com/${item.roomId}?visit_id=`"
              type="primary"
              target="_blank"
              rel="noreferrer"
              >去投喂</el-link
            >
          </div>
        </div>
      </div>
    </template>
    <p v-else class="reminder-description">
      暂无即将溢出的提醒。任务查询时自动更新，也可手动刷新。
    </p>
  </section>
</template>

<style scoped>
.intimacy-reminder {
  padding: 10px;
  margin-top: 12px;
  background: var(--el-color-warning-light-9);
  border: 1px solid var(--el-color-warning-light-7);
  border-radius: 6px;
}

.reminder-heading,
.reminder-row {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

h4 {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--el-color-warning-dark-2);
}

.reminder-heading .el-button {
  padding: 0;
  font-size: 10px;
}

.reminder-description {
  margin: 4px 0 0;
  font-size: 10px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}

.reminder-list {
  max-height: 200px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.reminder-item {
  padding: 10px 0;
  border-bottom: 1px solid var(--el-color-warning-light-7);
}

.reminder-item:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.reminder-row .el-link {
  min-width: 0;
  font-size: 11px;
}

.reminder-row .el-tag {
  flex-shrink: 0;
  font-size: 10px;
}

.reminder-meta {
  margin-top: 5px;
  font-size: 10px;
  color: var(--el-text-color-secondary);
}

.reminder-meta > .el-link {
  flex-shrink: 0;
}

.is-live {
  color: var(--el-color-success);
}
</style>
