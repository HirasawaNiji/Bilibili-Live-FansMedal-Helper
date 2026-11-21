<script setup lang="ts">
import { useModuleStore } from '@/stores'
import helpInfo from '@/library/help-info'
import RemoveElement from './RemoveElement.vue'

const moduleStore = useModuleStore()
const config = moduleStore.moduleConfig.EnhanceExperience

// 画质名称列表
const qualityDescList = ['原画（HDR）', '原画', '蓝光', '超清', '高清']

// 修改画质名称列表后用户配置如果不合法，回退到“原画”
if (!qualityDescList.includes(config.switchLiveStreamQuality.qualityDesc)) {
  config.switchLiveStreamQuality.qualityDesc = '原画'
}
</script>

<template>
  <div class="experience-page">
    <section class="preference-card">
      <div class="section-heading">
        <h3>观看偏好</h3>
        <p>画质、连接与隐私，按你的习惯调整。</p>
      </div>
      <div class="preference-options">
        <el-row>
          <el-space wrap :size="[8, 0]">
            <el-switch
              v-model="config.switchLiveStreamQuality.enabled"
              active-text="自动切换画质"
            />
            <el-select
              v-model="config.switchLiveStreamQuality.qualityDesc"
              placeholder="Select"
              style="width: 140px"
            >
              <el-option v-for="i in qualityDescList" :key="i" :label="i" :value="i" />
            </el-select>
            <Info :item="helpInfo.EnhanceExperience.switchLiveStreamQuality" />
          </el-space>
        </el-row>
        <el-row>
          <el-space wrap :size="[8, 0]">
            <el-switch v-model="config.banp2p.enabled" active-text="禁用P2P" />
            <Info :item="helpInfo.EnhanceExperience.banp2p" />
          </el-space>
        </el-row>
        <el-row>
          <el-space wrap :size="[8, 0]">
            <el-switch v-model="config.noReport.enabled" active-text="拦截日志数据上报" />
            <Info :item="helpInfo.EnhanceExperience.noReport" />
          </el-space>
        </el-row>
        <el-row>
          <el-space wrap :size="[8, 0]">
            <el-switch v-model="config.noSleep.enabled" active-text="屏蔽挂机检测" />
            <Info :item="helpInfo.EnhanceExperience.noSleep" />
          </el-space>
        </el-row>
        <el-row>
          <el-space wrap :size="[8, 0]">
            <el-switch v-model="config.invisibility.enabled" active-text="隐身入场" />
            <Info :item="helpInfo.EnhanceExperience.invisibility" />
          </el-space>
        </el-row>
      </div>
    </section>
    <section class="preference-card">
      <div class="section-heading">
        <h3>移除元素 <span>10 项</span></h3>
        <p>隐藏直播间里的干扰，让画面更清爽。</p>
      </div>
      <RemoveElement class="remove-options" />
    </section>
  </div>
</template>

<style scoped>
.experience-page {
  container-type: inline-size;
}

.preference-card {
  margin-bottom: 18px;
  overflow: hidden;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
}

.section-heading {
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--el-border-color-extra-light);
}

h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

h3 span {
  padding: 2px 7px;
  margin-left: 8px;
  font-size: 10px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  border-radius: 5px;
}

.section-heading p {
  margin: 6px 0 0;
  font-size: 11px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}

.preference-options,
.remove-options {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 4px 16px;
  padding: 12px 20px;
}

.preference-options > .el-row,
.remove-options :deep(> .el-row) {
  min-height: 40px;
  padding: 4px 0;
}

.preference-options > .el-row:first-child {
  grid-column: 1 / -1;
}

@container (min-width: 600px) {
  .preference-options,
  .remove-options {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
