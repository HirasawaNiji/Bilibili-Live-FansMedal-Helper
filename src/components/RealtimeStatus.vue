<script setup lang="ts">
import { computed } from 'vue'
import { useCacheStore, useRuntimeStatusStore } from '@/stores'
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

const phaseTagTypes: Record<
  RuntimeTaskPhase,
  'info' | 'primary' | 'warning' | 'success' | 'danger'
> = {
  idle: 'info',
  running: 'primary',
  waiting: 'warning',
  completed: 'success',
  error: 'danger',
}

const itemLabels: Record<RuntimeItemStatus, string> = {
  pending: '待处理',
  running: '正在执行',
  waiting: '等待开播',
  completed: '已完成',
  failed: '未完成',
  skipped: '已跳过',
}

const itemTagTypes: Record<
  RuntimeItemStatus,
  'info' | 'primary' | 'warning' | 'success' | 'danger'
> = {
  pending: 'info',
  running: 'primary',
  waiting: 'warning',
  completed: 'success',
  failed: 'danger',
  skipped: 'warning',
}

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

const getItemLabel = (status: RuntimeItemStatus) => itemLabels[status]
const getItemTagType = (status: RuntimeItemStatus) => itemTagTypes[status]

const taskCounts = (task: RuntimeTaskKey) => {
  const rows = Object.values(runtimeStore.tasks[task].items)
  return {
    completed: rows.filter((item) => item.status === 'completed').length,
    unfinished: rows.filter((item) => item.status !== 'completed' && item.status !== 'skipped')
      .length,
    waiting: rows.filter((item) => item.status === 'waiting').length,
  }
}

const recentEvents = computed(() => runtimeStore.events.slice(0, 50))
const formatTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false })
</script>

<template>
  <div>
    <el-alert
      v-if="cacheStore.currentScriptType === 'Other'"
      class="instance-warning"
      title="当前脚本未正常运行，请保留一个直播间并刷新该页面。"
      type="error"
      :closable="false"
      show-icon
    />

    <el-card v-for="task in taskOrder" :key="task" class="task-card" shadow="never">
      <template #header>
        <div class="task-header">
          <span class="task-title">{{ runtimeStore.taskNames[task] }}</span>
          <el-space>
            <el-tag type="success">已完成 {{ taskCounts(task).completed }}</el-tag>
            <el-tag type="warning">待完成 {{ taskCounts(task).unfinished }}</el-tag>
            <el-tag v-if="taskCounts(task).waiting" type="warning" effect="plain">
              等待开播 {{ taskCounts(task).waiting }}
            </el-tag>
            <el-tag :type="phaseTagTypes[runtimeStore.tasks[task].phase]" effect="dark">
              {{ phaseLabels[runtimeStore.tasks[task].phase] }}
            </el-tag>
          </el-space>
        </div>
      </template>

      <el-alert
        v-if="runtimeStore.tasks[task].current"
        class="current-task"
        type="info"
        :closable="false"
        show-icon
      >
        <template #title>
          当前正在处理主播【{{ runtimeStore.tasks[task].current!.nickName }}】的直播间
          {{ runtimeStore.tasks[task].current!.roomId }}：
          {{ runtimeStore.tasks[task].current!.detail }}
          <template v-if="runtimeStore.tasks[task].current!.round">
            （第 {{ runtimeStore.tasks[task].current!.round }} 轮<span
              v-if="runtimeStore.tasks[task].current!.targetRounds"
              >/共 {{ runtimeStore.tasks[task].current!.targetRounds }} 轮</span
            >）
          </template>
        </template>
      </el-alert>
      <el-text v-else type="info">{{ runtimeStore.tasks[task].message }}</el-text>

      <el-table
        v-if="taskRows(task).length"
        class="status-table"
        :data="taskRows(task)"
        size="small"
        max-height="260"
      >
        <el-table-column prop="nickName" label="主播" min-width="120" />
        <el-table-column prop="medalName" label="粉丝牌" min-width="90" />
        <el-table-column label="直播间" width="100" align="center">
          <template #default="scope">
            <el-link
              :href="`https://live.bilibili.com/${scope.row.roomId}`"
              type="primary"
              target="_blank"
            >
              {{ scope.row.roomId }}
            </el-link>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="scope">
            <el-tag :type="getItemTagType(scope.row.status)" size="small">
              {{ getItemLabel(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="detail" label="说明" min-width="180" />
      </el-table>
      <el-empty v-else :image-size="54" description="本次运行暂时没有主播记录" />
    </el-card>

    <el-card class="event-card" shadow="never">
      <template #header>
        <span class="task-title">最近动态</span>
      </template>
      <el-timeline v-if="recentEvents.length">
        <el-timeline-item
          v-for="event in recentEvents"
          :key="event.id"
          :timestamp="formatTime(event.time)"
          placement="top"
          :type="event.level === 'error' ? 'danger' : event.level"
        >
          <el-tag size="small" type="info">{{ runtimeStore.taskNames[event.task] }}</el-tag>
          {{ event.message }}
        </el-timeline-item>
      </el-timeline>
      <el-empty v-else :image-size="54" description="暂无任务动态" />
    </el-card>
  </div>
</template>

<style scoped>
.instance-warning,
.task-card {
  margin-bottom: 16px;
}

.instance-warning :deep(.el-alert__title) {
  font-weight: 600;
  color: var(--el-color-danger);
}

.task-header {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
}

.task-title {
  font-weight: 600;
}

.current-task,
.status-table {
  margin-top: 12px;
}

.event-card :deep(.el-timeline) {
  padding-left: 8px;
}
</style>
