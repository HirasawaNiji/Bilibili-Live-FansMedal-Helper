import BaseModule from '@/modules/BaseModule'
import { useBiliStore, useModuleStore } from '@/stores'
import {
  refreshFreeIntimacyReminders,
  waitForFansMedalsReady,
} from '@/library/free-intimacy-reminders'

/** 启动时及定时刷新“储蓄亲密度即将溢出”提醒。 */
class FreeIntimacyReminderTask extends BaseModule {
  private static readonly REFRESH_INTERVAL = 15 * 60e3

  private scheduleNextRun(): void {
    this.nextRunTimer = window.setTimeout(
      () => this.run(),
      FreeIntimacyReminderTask.REFRESH_INTERVAL,
    )
  }

  public async run(): Promise<void> {
    try {
      const biliStore = useBiliStore()

      if (biliStore.fansMedalsMeta.status === 'loading') {
        await waitForFansMedalsReady()
      } else if (biliStore.fansMedalsMeta.status !== 'loaded') {
        await useModuleStore().rerunModule('Default_FansMedals', true)
      }

      if (!(await waitForFansMedalsReady())) {
        throw new Error('粉丝勋章列表加载失败或等待超时')
      }

      const result = await refreshFreeIntimacyReminders()
      this.logger.log(
        `储蓄亲密度提醒自动刷新完成，当前 ${result.reminderCount} 位主播达到 90+`,
        result,
      )
    } catch (error) {
      this.logger.error('储蓄亲密度提醒自动刷新失败', error)
    } finally {
      this.scheduleNextRun()
    }
  }
}

export default FreeIntimacyReminderTask
