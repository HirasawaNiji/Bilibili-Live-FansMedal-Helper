import { acceptHMRUpdate, defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import Storage from '@/library/storage'
import _ from 'lodash'
import type { UiConfig, MenuIndex } from '@/types'

const index2name: Record<MenuIndex, string> = {
  WeeklySummary: '每周小结',
  MainSiteTasks: '主站任务',
  LiveTasks: '直播任务',
  OtherTasks: '其它任务',
  EnhanceExperience: '体验优化',
}

export const useUIStore = defineStore('ui', () => {
  const savedConfig = Storage.getUiConfig()
  // 兼容旧版本页面：移除元素并入体验优化，其余已移除页面回到直播任务。
  const savedIndex = String(savedConfig.activeMenuIndex)
  if (savedIndex === 'RemoveElement') {
    savedConfig.activeMenuIndex = 'EnhanceExperience'
  } else if (!Object.hasOwn(index2name, savedIndex)) {
    savedConfig.activeMenuIndex = 'LiveTasks'
  }
  const uiConfig = ref<UiConfig>(savedConfig)
  const activeMenuName = computed(() => index2name[uiConfig.value.activeMenuIndex])
  const isShowPanelButtonText = computed(() =>
    uiConfig.value.isShowPanel ? '隐藏控制面板' : '显示控制面板',
  )

  function changeShowPanel() {
    uiConfig.value.isShowPanel = !uiConfig.value.isShowPanel
  }

  function setActiveMenuIndex(index: MenuIndex) {
    uiConfig.value.activeMenuIndex = index
  }

  watch(
    uiConfig,
    _.debounce((newUiConfig: UiConfig) => Storage.setUiConfig(newUiConfig), 350),
    { deep: true },
  )

  return {
    isShowPanelButtonText,
    activeMenuName,
    uiConfig,
    changeShowPanel,
    setActiveMenuIndex,
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useUIStore, import.meta.hot))
}
