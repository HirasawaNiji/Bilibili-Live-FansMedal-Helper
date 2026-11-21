<script setup lang="ts">
import { useUIStore } from '@/stores'
import PanelAside from './PanelAside.vue'
import PanelHeader from './PanelHeader.vue'
import PanelMain from './PanelMain.vue'
import RealtimeStatus from './RealtimeStatus.vue'

const uiStore = useUIStore()
const descriptions = {
  MainSiteTasks: '管理每日登录、观看、投币与分享任务。',
  LiveTasks: '管理粉丝牌任务，让每一次陪伴都有收获。',
  OtherTasks: '管理银瓜子兑换与年度大会员权益。',
  WeeklySummary: '回顾本周任务收益，查看主播观看优先级。',
  EnhanceExperience: '调整观看偏好，留下你想看到的直播间。',
}
</script>

<template>
  <el-dialog
    v-model="uiStore.uiConfig.isShowPanel"
    class="blth-panel-dialog"
    modal-class="blth-panel-overlay"
    title="BLTH 控制面板"
    align-center
    append-to-body
    :show-close="false"
    :close-on-click-modal="false"
    :lock-scroll="false"
  >
    <template #header>
      <PanelHeader />
    </template>
    <div class="panel-layout">
      <aside class="panel-sidebar"><PanelAside /></aside>
      <main class="panel-workspace">
        <div class="page-heading">
          <div class="page-title">
            <p class="page-eyebrow">
              {{
                uiStore.uiConfig.activeMenuIndex === 'EnhanceExperience' ? '个性化' : '我的工作台'
              }}
            </p>
            <h2>{{ uiStore.activeMenuName }}</h2>
            <p>{{ descriptions[uiStore.uiConfig.activeMenuIndex] }}</p>
          </div>
          <div id="blth-page-actions" class="page-actions" />
        </div>
        <el-scrollbar class="workspace-scrollbar">
          <PanelMain class="page-content" />
        </el-scrollbar>
      </main>
      <aside class="panel-status" aria-label="实时状态">
        <div class="status-heading">
          <h2>实时状态</h2>
          <span class="status-live"><span /> 实时更新</span>
        </div>
        <el-scrollbar class="status-scrollbar">
          <RealtimeStatus />
        </el-scrollbar>
      </aside>
    </div>
  </el-dialog>
</template>

<style>
/* @resource 样式可能稍后注入，组合选择器避免被 el-dialog 的默认 50% 宽度覆盖。 */
.el-dialog.blth-panel-dialog {
  --blth-panel-width: min(1800px, calc(100vw - 48px), calc((100dvh - 48px) * 16 / 9));
  --el-color-primary: #159ed8;
  --el-color-primary-light-9: #eaf7fd;
  --el-dialog-padding-primary: 0;

  display: flex;
  flex-direction: column;
  width: var(--blth-panel-width);
  height: calc(var(--blth-panel-width) * 9 / 16);
  padding: 0;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
  color: var(--el-text-color-primary);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 16px;
  box-shadow: 0 24px 90px #0a233c38;
}

.el-overlay.blth-panel-overlay {
  background: #0f243c66;
  backdrop-filter: blur(5px);
}

.blth-panel-dialog > .el-dialog__header {
  display: flex;
  flex: 0 0 76px;
  align-items: center;
  justify-content: space-between;
  padding: 0 26px;
  margin: 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.blth-panel-dialog > .el-dialog__body {
  display: flex;
  flex: 1;
  min-height: 0;
  padding: 0;
}

html[lab-style*='dark'] .blth-panel-dialog {
  --el-color-primary-light-9: #182e3a;
}
</style>

<style scoped>
.panel-layout {
  display: grid;
  flex: 1;
  grid-template-columns: 164px minmax(0, 2fr) minmax(300px, 1fr);
  min-width: 0;
  min-height: 0;
}

.panel-sidebar {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--el-border-color-lighter);
}

.panel-workspace {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--el-fill-color-lighter);
}

.page-heading {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  padding: 26px 28px 22px;
}

.page-title {
  flex: 1 1 260px;
}

.page-actions:empty {
  display: none;
}

h2 {
  margin: 4px 0 8px;
  font-size: 24px;
  font-weight: 650;
  line-height: 1.4;
}

.page-heading p {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}

.page-heading .page-eyebrow {
  font-size: 11px;
  color: var(--el-color-primary);
  letter-spacing: 1px;
}

.workspace-scrollbar,
.status-scrollbar {
  flex: 1;
  min-height: 0;
}

.page-content {
  padding: 0 28px 28px;
  overflow-wrap: anywhere;
}

.page-content :deep(> .el-row) {
  padding: 10px 16px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-extra-light);
}

.page-content :deep(.el-space) {
  max-width: 100%;
}

.page-content :deep(.el-card) {
  border-radius: 10px;
}

.panel-status {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--el-bg-color);
  border-left: 1px solid var(--el-border-color-lighter);
}

.status-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 20px 18px;
}

.status-heading h2 {
  margin: 0;
  font-size: 16px;
}

.status-live {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.status-live > span {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 4px;
  background: var(--el-color-primary);
  border-radius: 50%;
}

@media (width <= 1180px) {
  .panel-layout {
    grid-template-columns: 144px minmax(0, 2fr) minmax(300px, 1fr);
  }

  .page-heading {
    padding: 22px 20px;
  }

  .page-content {
    padding: 0 20px 20px;
  }
}

@media (width <= 760px) {
  .panel-layout {
    grid-template-columns: 120px minmax(300px, 1fr) 260px;
    overflow-x: auto;
  }
}
</style>
