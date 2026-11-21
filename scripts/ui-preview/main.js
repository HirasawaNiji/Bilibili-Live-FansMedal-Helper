import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import 'element-plus/dist/index.css'
import '../../src/assets/css/element-dark-css-vars.css'
import '../../src/assets/css/base.css'
import App from '../../src/App.vue'
import * as MyIconsVue from '../../src/components/icons'
import {
  useUIStore,
  useModuleStore,
  useRuntimeStatusStore,
  useBiliStore,
  useCacheStore,
} from '../../src/stores'
import { useWeeklyMedalStore } from '../../src/stores/useWeeklyMedalStore'
import { weeklyPeriod } from '../../src/library/weekly-medal-stats'

const pinia = createPinia()
const ui = useUIStore(pinia)
const modules = useModuleStore(pinia)
const runtime = useRuntimeStatusStore(pinia)
const bili = useBiliStore(pinia)
const weekly = useWeeklyMedalStore(pinia)
ui.uiConfig.activeMenuIndex = 'EnhanceExperience'
for (const item of Object.values(modules.moduleConfig.EnhanceExperience)) item.enabled = true
for (const [index, item] of Object.values(modules.moduleConfig.RemoveElement).entries()) {
  item.enabled = index !== 3 && index !== 9
}
for (const item of Object.values(modules.moduleConfig.DailyTasks.MainSiteTasks)) item.enabled = true
for (const key of ['login', 'watch', 'coin', 'share']) {
  modules.moduleStatus.DailyTasks.MainSiteTasks[key] = 'done'
}
for (const key of ['light', 'like', 'watch'])
  modules.moduleConfig.DailyTasks.LiveTasks.medalTasks[key].enabled = true
Object.assign(modules.moduleStatus.DailyTasks.LiveTasks.medalTasks, {
  light: 'done',
  like: 'waiting',
  watch: 'running',
})
// 重跑入口在预览中仅改变显示状态。
const disableReset = (node) => {
  for (const key of Object.keys(node)) {
    if (typeof node[key] === 'function') node[key] = () => {}
    else disableReset(node[key])
  }
}
disableReset(modules.moduleReset)
const names = [
  '星河放映室',
  '午后电台',
  '小岛日记',
  '云端音乐屋',
  '晚风同学',
  '月亮研究所',
  '夏日来信',
  '橘子汽水',
  '凌晨两点',
  '一起看星星',
  '森林回声',
  '白昼漫游',
]
const now = Date.now()
const medals = names.map((name, index) => ({
  medal: {
    target_id: 100000 + index,
    medal_name: ['星河', '听众', '小岛'][index % 3],
    level: 12 + index,
    is_lighted: 1,
  },
  room_info: { room_id: 200000 + index, living_status: index < 8 ? 1 : 0 },
  anchor_info: { nick_name: name, avatar: '' },
}))
bili.BilibiliLive = { UID: 123456, ROOMID: 200000 }
bili.fansMedals = medals
bili.fansMedalsMeta = { status: 'loaded' }
const cache = useCacheStore(pinia)
for (const [index, freeIntimacy] of [100, 95].entries()) {
  cache.updateFreeIntimacyReminder(medals[index], {
    free_intimacy: freeIntimacy,
    reach_free_intimacy_limit: index === 0,
  })
}
for (const key of ['watch', 'like', 'light']) {
  const completed = key === 'watch' ? 6 : key === 'like' ? 8 : 12
  runtime.tasks[key].items = Object.fromEntries(
    medals.map((medal, index) => {
      const status =
        index < completed ? 'completed' : key === 'watch' && index === 6 ? 'running' : 'waiting'
      return [
        medal.room_info.room_id,
        {
          roomId: medal.room_info.room_id,
          targetId: medal.medal.target_id,
          nickName: medal.anchor_info.nick_name,
          medalName: medal.medal.medal_name,
          status,
          detail:
            status === 'completed'
              ? '今日任务已完成'
              : status === 'running'
                ? '正在观看直播，累计任务时长中'
                : '主播未开播，等待中',
          updatedAt: now,
        },
      ]
    }),
  )
}
Object.assign(runtime.tasks.watch, {
  phase: 'running',
  current: { ...runtime.tasks.watch.items[200006], round: 2, targetRounds: 3 },
})
Object.assign(runtime.tasks.like, { phase: 'waiting', message: '本轮点赞完成，等待其余主播开播' })
Object.assign(runtime.tasks.light, { phase: 'completed', message: '全部粉丝勋章已点亮' })
runtime.events = [
  { id: 3, task: 'watch', message: '夏日来信：开始第 2 轮观看任务', level: 'info', time: now },
  {
    id: 2,
    task: 'like',
    message: '本轮点赞完成，4 位主播等待开播',
    level: 'warning',
    time: now - 30000,
  },
  { id: 1, task: 'light', message: '12 枚粉丝勋章已全部点亮', level: 'success', time: now - 60000 },
]
const { week, day } = weeklyPeriod(now)
weekly.records = Object.fromEntries(
  medals.map((medal, index) => [
    `123456:${medal.medal.target_id}:${week}`,
    {
      ownerUid: 123456,
      targetId: medal.medal.target_id,
      roomId: medal.room_info.room_id,
      nickName: medal.anchor_info.nick_name,
      medalName: medal.medal.medal_name,
      week,
      updatedAt: now,
      days: {
        [day]: {
          like: { rounds: index + 1, reward: 10 },
          watchLive: { rounds: index + 2, reward: 5 },
        },
      },
    },
  ]),
)
const app = createApp(App)
app.use(pinia)
app.use(ElementPlus)
for (const [key, component] of Object.entries({ ...ElementPlusIconsVue, ...MyIconsVue })) {
  app.component(key, component)
}
app.mount('#BLTH')
