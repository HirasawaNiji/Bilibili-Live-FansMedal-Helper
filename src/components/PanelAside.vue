<script setup lang="ts">
import { useUIStore } from '@/stores'
import type { MenuIndex } from '@/types'
import { Calendar, Monitor, VideoCamera, House, Grid } from '@element-plus/icons-vue'

const uiStore = useUIStore()
const taskItems = [
  { index: 'MainSiteTasks', title: '主站任务', icon: House },
  { index: 'LiveTasks', title: '直播任务', icon: VideoCamera },
  { index: 'OtherTasks', title: '其它任务', icon: Grid },
] as const
</script>

<template>
  <nav class="panel-nav" aria-label="控制面板导航">
    <p class="nav-label">工作台</p>
    <el-menu
      :default-active="uiStore.uiConfig.activeMenuIndex"
      @select="(index: string) => uiStore.setActiveMenuIndex(index as MenuIndex)"
    >
      <el-menu-item index="WeeklySummary">
        <el-icon><Calendar /></el-icon>
        <span>每周小结</span>
      </el-menu-item>
      <el-menu-item-group title="每日任务">
        <el-menu-item v-for="item in taskItems" :key="item.index" :index="item.index">
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.title }}</span>
        </el-menu-item>
      </el-menu-item-group>
      <el-menu-item-group title="个性化">
        <el-menu-item index="EnhanceExperience">
          <el-icon><Monitor /></el-icon>
          <span>体验优化</span>
        </el-menu-item>
      </el-menu-item-group>
    </el-menu>
  </nav>
  <div class="nav-footer"><span class="save-dot" /> 配置自动保存</div>
</template>

<style scoped>
.panel-nav {
  flex: 1;
  padding: 22px 10px;
  overflow-y: auto;
}

.nav-label {
  margin: 0 14px 10px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  letter-spacing: 1px;
}

.el-menu {
  background: transparent;
  border-right: 0;
}

.el-menu-item {
  height: 44px;
  padding: 0 14px !important;
  margin-bottom: 5px;
  font-size: 13px;
  border-radius: 8px;
}

.el-menu-item.is-active {
  font-weight: 600;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.el-menu-item .el-icon {
  margin-right: 10px;
  font-size: 18px;
}

:deep(.el-menu-item-group__title) {
  padding: 20px 14px 10px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  letter-spacing: 1px;
}

.nav-footer {
  padding: 20px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.save-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 5px;
  background: var(--el-color-success);
  border-radius: 50%;
}
</style>
