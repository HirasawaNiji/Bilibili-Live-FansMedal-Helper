<script setup lang="ts">
import { computed } from 'vue'
import { useCacheStore, useRuntimeStatusStore } from '@/stores'
import FreeIntimacyReminder from './FreeIntimacyReminder.vue'
import type {
  RuntimeItemStatus,
  RuntimeTaskKey,
  RuntimeTaskPhase,
} from '@/stores/useRuntimeStatusStore'

const cacheStore = useCacheStore()
const runtimeStore = useRuntimeStatusStore()
const taskOrder: RuntimeTaskKey[] = ['watch', 'like', 'light']
const phaseLabels: Record<RuntimeTaskPhase, string> = {
  idle: '尚未启动',
  running: '正在运行',
  waiting: '等待中',
  completed: '已完成',
  error: '发生错误',
}
const phaseTagTypes = {
  idle: 'info',
  running: 'primary',
  waiting: 'warning',
  completed: 'success',
  error: 'danger',
} as const
const itemLabels: Record<RuntimeItemStatus, string> = {
  pending: '待处理',
  running: '正在执行',
  waiting: '等待开播',
  completed: '已完成',
  failed: '未完成',
  skipped: '已跳过',
}
const itemTagTypes = {
  pending: 'info',
  running: 'primary',
  waiting: 'warning',
  completed: 'success',
  failed: 'danger',
  skipped: 'warning',
} as const
const statusOrder: Record<RuntimeItemStatus, number> = {
  running: 0,
  waiting: 1,
  pending: 2,
  failed: 3,
  skipped: 4,
  completed: 5,
}
const taskRows = (task: RuntimeTaskKey) =>
  Object.values(runtimeStore.tasks[task].items).sort(
    (a, b) => statusOrder[a.status] - statusOrder[b.status] || b.updatedAt - a.updatedAt,
  )
const taskCounts = (task: RuntimeTaskKey) => {
  const rows = Object.values(runtimeStore.tasks[task].items)
  const completed = rows.filter((item) => item.status === 'completed').length
  return {
    total: rows.length,
    completed,
    unfinished: rows.filter((item) => item.status !== 'completed' && item.status !== 'skipped')
      .length,
    waiting: rows.filter((item) => item.status === 'waiting').length,
    percentage: rows.length ? Math.round((completed / rows.length) * 100) : 0,
  }
}
const recentEvents = computed(() => runtimeStore.events.slice(0, 50))
const formatTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false })
</script>

<template>
  <div class="runtime-status">
    <el-alert
      v-if="cacheStore.currentScriptType === 'Other'"
      class="instance-warning"
      title="当前脚本未正常运行，请保留一个直播间并刷新该页面。"
      type="error"
      :closable="false"
      show-icon
    />
    <section v-for="task in taskOrder" :key="task" class="task-card">
      <div class="task-header">
        <h3>{{ runtimeStore.taskNames[task] }}</h3>
        <el-tag :type="phaseTagTypes[runtimeStore.tasks[task].phase]" size="small" effect="plain">
          {{ phaseLabels[runtimeStore.tasks[task].phase] }}
        </el-tag>
      </div>
      <div class="task-counts">
        <span
          >已完成 <b>{{ taskCounts(task).completed }}</b> / {{ taskCounts(task).total }}</span
        >
        <span>待完成 {{ taskCounts(task).unfinished }}</span>
      </div>
      <el-progress
        :percentage="taskCounts(task).percentage"
        :show-text="false"
        :stroke-width="5"
        :status="runtimeStore.tasks[task].phase === 'completed' ? 'success' : undefined"
      />
      <div v-if="runtimeStore.tasks[task].current" class="current-task">
        <span class="current-label">当前主播</span>
        <el-link
          :href="`https://live.bilibili.com/${runtimeStore.tasks[task].current!.roomId}`"
          target="_blank"
          rel="noreferrer"
          type="primary"
          >{{ runtimeStore.tasks[task].current!.nickName }}</el-link
        >
        <p>{{ runtimeStore.tasks[task].current!.detail }}</p>
        <span v-if="runtimeStore.tasks[task].current!.round" class="rounds">
          第 {{ runtimeStore.tasks[task].current!.round }} 轮
          <template v-if="runtimeStore.tasks[task].current!.targetRounds">
            / 共 {{ runtimeStore.tasks[task].current!.targetRounds }} 轮
          </template>
        </span>
      </div>
      <p v-else class="task-message">{{ runtimeStore.tasks[task].message }}</p>
      <p v-if="taskCounts(task).waiting" class="waiting-hint">
        {{ taskCounts(task).waiting }} 位主播等待开播
      </p>
      <FreeIntimacyReminder v-if="task === 'watch'" />
      <details v-if="taskRows(task).length" class="task-details">
        <summary>
          主播记录 <span>{{ taskRows(task).length }}</span>
        </summary>
        <div class="record-list">
          <div v-for="item in taskRows(task)" :key="item.roomId" class="record">
            <div class="record-heading">
              <el-link
                :href="`https://live.bilibili.com/${item.roomId}`"
                target="_blank"
                rel="noreferrer"
              >
                {{ item.nickName }}
              </el-link>
              <el-tag :type="itemTagTypes[item.status]" size="small">{{
                itemLabels[item.status]
              }}</el-tag>
            </div>
            <p class="record-meta">{{ item.medalName }} · 房间 {{ item.roomId }}</p>
            <p>{{ item.detail }}</p>
            <p v-if="item.round">
              第 {{ item.round }} 轮<template v-if="item.targetRounds">
                / 共 {{ item.targetRounds }} 轮</template
              >
            </p>
          </div>
        </div>
      </details>
      <p v-else class="empty-records">暂无主播记录</p>
    </section>

    <section class="event-section">
      <div class="event-heading">
        <h3>最近动态</h3>
        <span>最近 {{ recentEvents.length }} 条</span>
      </div>
      <div v-if="recentEvents.length" class="event-list">
        <div v-for="event in recentEvents" :key="event.id" class="event" :class="event.level">
          <div class="event-meta">
            <span>{{ runtimeStore.taskNames[event.task] }}</span>
            <time>{{ formatTime(event.time) }}</time>
          </div>
          <p>{{ event.message }}</p>
        </div>
      </div>
      <p v-else class="empty-events">任务开始后，运行动态会显示在这里。</p>
    </section>
  </div>
</template>

<style scoped>
.runtime-status {
  padding: 0 20px 20px;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.instance-warning,
.task-card {
  margin-bottom: 14px;
}

.task-card {
  padding: 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
}

.task-header,
.task-counts,
.record-heading,
.event-heading,
.event-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.task-counts {
  margin: 10px 0 8px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.task-counts b {
  margin-left: 3px;
  font-size: 18px;
  color: var(--el-text-color-primary);
}

.current-task {
  padding: 9px 10px;
  margin-top: 10px;
  background: var(--el-color-primary-light-9);
  border-radius: 6px;
}

.current-label {
  margin-right: 8px;
  font-size: 10px;
  color: var(--el-text-color-secondary);
}

.current-task .el-link {
  font-size: 12px;
  font-weight: 600;
}

p {
  margin: 6px 0 0;
  line-height: 1.7;
}

.rounds,
.task-message,
.record-meta {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.task-message {
  margin-top: 12px;
}

.waiting-hint {
  font-size: 11px;
  color: var(--el-color-warning);
}

.task-details {
  padding-top: 8px;
  margin-top: 10px;
  border-top: 1px solid var(--el-border-color-extra-light);
}

summary {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
}

summary span {
  float: right;
}

.record-list {
  max-height: 280px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.record {
  padding: 12px 0;
  border-bottom: 1px solid var(--el-border-color-extra-light);
}

.record-heading .el-link {
  min-width: 0;
  font-size: 12px;
}

.record-heading .el-tag {
  flex-shrink: 0;
}

.empty-records,
.empty-events {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.empty-records {
  margin-top: 12px;
}

.event-heading {
  margin: 22px 0 16px;
}

.event-heading > span,
.event-meta {
  font-size: 10px;
  color: var(--el-text-color-secondary);
}

.event {
  position: relative;
  padding: 0 0 18px 15px;
  margin-left: 3px;
  border-left: 1px solid var(--el-border-color-lighter);
}

.event::before {
  position: absolute;
  top: 3px;
  left: -4px;
  width: 7px;
  height: 7px;
  content: '';
  background: var(--el-color-primary);
  border-radius: 50%;
}

.event.success::before {
  background: var(--el-color-success);
}

.event.warning::before {
  background: var(--el-color-warning);
}

.event.error::before {
  background: var(--el-color-danger);
}

.event:last-child {
  border-left-color: transparent;
}

.event p {
  font-size: 11px;
}

@media (width <= 1180px) {
  .runtime-status {
    padding: 0 14px 14px;
  }

  .task-card {
    padding: 13px;
  }
}
</style>
