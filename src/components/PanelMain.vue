<script setup lang="ts">
import { useUIStore } from '@/stores'
import MainSiteTasks from './MainSiteTasks.vue'
import LiveTasks from './LiveTasks.vue'
import OtherTasks from './OtherTasks.vue'
import EnhanceExperience from './EnhanceExperience.vue'
import WeeklySummary from './WeeklyMedalStats.vue'

const uiStore = useUIStore()
const pages = { MainSiteTasks, LiveTasks, OtherTasks, EnhanceExperience, WeeklySummary }
</script>

<template>
  <KeepAlive>
    <component :is="pages[uiStore.uiConfig.activeMenuIndex]" />
  </KeepAlive>
</template>
