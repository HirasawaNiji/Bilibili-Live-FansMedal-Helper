<script setup lang="ts">
import { useUIStore } from '@/stores'
import { Close } from '@element-plus/icons-vue'

const uiStore = useUIStore()
</script>

<template>
  <div class="panel-brand">
    <span class="brand-mark">BL</span>
    <div>
      <h1>BLTH <span>控制面板</span></h1>
      <p>哔哩哔哩直播粉丝牌助手</p>
    </div>
  </div>
  <div class="header-actions">
    <span class="shortcut"><kbd>Alt</kbd> + <kbd>B</kbd></span>
    <el-button
      text
      circle
      aria-label="关闭控制面板"
      :icon="Close"
      @click="uiStore.changeShowPanel"
    />
  </div>
</template>

<style scoped>
.panel-brand,
.header-actions {
  display: flex;
  gap: 14px;
  align-items: center;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  font-size: 19px;
  font-weight: 800;
  color: #fff;
  letter-spacing: -1px;
  background: #23ade5;
  border-radius: 12px;
}

h1 {
  margin: 0;
  font-size: 19px;
  font-weight: 750;
  line-height: 1.5;
  color: var(--el-text-color-primary);
}

h1 span {
  margin-left: 8px;
  font-size: 16px;
  font-weight: 500;
}

p {
  margin: 0;
  font-size: 11px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}

.shortcut {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

kbd {
  padding: 3px 5px;
  font: inherit;
  border: 1px solid var(--el-border-color-light);
  border-radius: 4px;
}
</style>
