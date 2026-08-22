import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import type { LiveData } from '@/library/bili-api/data'

export type RuntimeTaskKey = 'light' | 'like' | 'watch'
export type RuntimeTaskPhase = 'idle' | 'running' | 'waiting' | 'completed' | 'error'
export type RuntimeItemStatus =
  'pending' | 'running' | 'waiting' | 'completed' | 'failed' | 'skipped'

export interface RuntimeMedalItem {
  roomId: number
  targetId: number
  nickName: string
  medalName: string
  status: RuntimeItemStatus
  detail: string
  round?: number
  targetRounds?: number
  updatedAt: number
}

export interface RuntimeTaskState {
  phase: RuntimeTaskPhase
  message: string
  current?: RuntimeMedalItem
  items: Record<number, RuntimeMedalItem>
  updatedAt: number
}

export interface RuntimeStatusEvent {
  id: number
  time: number
  task: RuntimeTaskKey
  message: string
  level: 'info' | 'success' | 'warning' | 'error'
}

const TASK_NAMES: Record<RuntimeTaskKey, string> = {
  light: '点亮熄灭勋章',
  like: '点赞',
  watch: '观看直播',
}

const createTaskState = (): RuntimeTaskState => ({
  phase: 'idle',
  message: '尚未启动',
  items: {},
  updatedAt: Date.now(),
})

export const useRuntimeStatusStore = defineStore('runtime-status', () => {
  const tasks = reactive<Record<RuntimeTaskKey, RuntimeTaskState>>({
    light: createTaskState(),
    like: createTaskState(),
    watch: createTaskState(),
  })
  const events = ref<RuntimeStatusEvent[]>([])
  let nextEventId = 1

  function addEvent(
    task: RuntimeTaskKey,
    message: string,
    level: RuntimeStatusEvent['level'] = 'info',
  ): void {
    events.value.unshift({ id: nextEventId++, time: Date.now(), task, message, level })
    if (events.value.length > 100) events.value.length = 100
  }

  function medalToItem(
    medal: LiveData.FansMedalPanel.List,
    status: RuntimeItemStatus,
    detail: string,
  ): RuntimeMedalItem {
    return {
      roomId: medal.room_info.room_id,
      targetId: medal.medal.target_id,
      nickName: medal.anchor_info.nick_name,
      medalName: medal.medal.medal_name,
      status,
      detail,
      updatedAt: Date.now(),
    }
  }

  function beginTask(
    task: RuntimeTaskKey,
    readyMedals: LiveData.FansMedalPanel.List[],
    waitingMedals: LiveData.FansMedalPanel.List[],
  ): void {
    const state = tasks[task]
    const items: Record<number, RuntimeMedalItem> = {}

    readyMedals.forEach((medal) => {
      items[medal.room_info.room_id] = medalToItem(medal, 'pending', '等待处理')
    })
    waitingMedals.forEach((medal) => {
      items[medal.room_info.room_id] = medalToItem(medal, 'waiting', '主播未开播，等待中')
    })

    state.items = items
    state.current = undefined
    state.phase =
      readyMedals.length > 0 ? 'running' : waitingMedals.length > 0 ? 'waiting' : 'running'
    state.message = `已载入 ${readyMedals.length + waitingMedals.length} 位待检查主播`
    state.updatedAt = Date.now()
    addEvent(task, state.message)
  }

  function ensureItem(task: RuntimeTaskKey, medal: LiveData.FansMedalPanel.List): RuntimeMedalItem {
    const roomId = medal.room_info.room_id
    return (tasks[task].items[roomId] ??= medalToItem(medal, 'pending', '等待处理'))
  }

  function setCurrent(
    task: RuntimeTaskKey,
    medal: LiveData.FansMedalPanel.List,
    detail: string,
    round?: number,
    targetRounds?: number,
  ): void {
    const state = tasks[task]
    const item = ensureItem(task, medal)
    Object.assign(item, {
      status: 'running',
      detail,
      round,
      targetRounds,
      updatedAt: Date.now(),
    })
    state.current = { ...item }
    state.phase = 'running'
    state.message = detail
    state.updatedAt = Date.now()
    addEvent(task, `${item.nickName}：${detail}`)
  }

  function setItemStatus(
    task: RuntimeTaskKey,
    medal: LiveData.FansMedalPanel.List,
    status: RuntimeItemStatus,
    detail: string,
  ): void {
    const state = tasks[task]
    const item = ensureItem(task, medal)
    Object.assign(item, { status, detail, updatedAt: Date.now() })
    if (state.current?.roomId === item.roomId) state.current = undefined
    state.updatedAt = Date.now()

    const level: RuntimeStatusEvent['level'] =
      status === 'completed'
        ? 'success'
        : status === 'failed'
          ? 'error'
          : status === 'waiting' || status === 'skipped'
            ? 'warning'
            : 'info'
    addEvent(task, `${item.nickName}：${detail}`, level)
  }

  function setTaskPhase(task: RuntimeTaskKey, phase: RuntimeTaskPhase, message: string): void {
    const state = tasks[task]
    const changed = state.phase !== phase || state.message !== message
    state.phase = phase
    state.message = message
    if (phase !== 'running') state.current = undefined
    state.updatedAt = Date.now()
    if (changed) {
      const level = phase === 'completed' ? 'success' : phase === 'error' ? 'error' : 'info'
      addEvent(task, message, level)
    }
  }

  return {
    tasks,
    events,
    taskNames: TASK_NAMES,
    beginTask,
    setCurrent,
    setItemStatus,
    setTaskPhase,
  }
})
