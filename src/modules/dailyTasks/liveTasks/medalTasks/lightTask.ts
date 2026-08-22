import { delayToNextMoment, isNowBefore, isTimestampToday, tsm } from '@/library/luxon'
import { useBiliStore, useModuleStore } from '@/stores'
import { sleep } from '@/library/utils'
import type { ModuleStatusTypes } from '@/types'
import MedalModule from '@/modules/dailyTasks/liveTasks/medalTasks/MedalModule'
import type { LiveData } from '@/library/bili-api/data'
import type { AfterExecutionAction, BatchExecutionResult, GroupedMedals } from './types'

class LightTask extends MedalModule {
  config = this.medalTasksConfig.light

  set status(s: ModuleStatusTypes) {
    useModuleStore().moduleStatus.DailyTasks.LiveTasks.medalTasks.light = s
  }

  /**
   * 获取已熄灭的粉丝勋章，并按能否立即点赞分组。
   *
   * 本定制版不发送弹幕：未开播的房间一律进入等待队列。
   */
  private getMedals(): GroupedMedals<'readyMedals' | 'waitingMedals'> {
    const result: GroupedMedals<'readyMedals' | 'waitingMedals'> = {
      readyMedals: [],
      waitingMedals: [],
    }

    useBiliStore().filteredFansMedals.forEach((medal) => {
      if (
        !this.SHARED_MEDAL_FILTERS.meetWhiteOrBlackList(medal) ||
        this.SHARED_MEDAL_FILTERS.isLighted(medal)
      ) {
        return
      }

      if (this.SHARED_MEDAL_FILTERS.isLiving(medal)) {
        result.readyMedals.push(medal)
      } else {
        result.waitingMedals.push(medal)
      }
    })

    if (this.config.isWhiteList) {
      this.sortMedals(result.readyMedals)
      this.sortMedals(result.waitingMedals)
    }

    return result
  }

  /**
   * 通过点赞点亮一个粉丝勋章。
   *
   * @param skipPreVerify 从等待队列调用时，直播状态刚刚验证过，可跳过首次校验
   */
  private async executeLightTask(
    medal: LiveData.FansMedalPanel.List,
    skipPreVerify = false,
  ): Promise<AfterExecutionAction> {
    if (MedalModule.shouldStopForCrossDay()) {
      this.logger.log('即将或刚刚发生跨天，提早结束本轮点亮熄灭勋章任务')
      return 'stopAndMarkUncompleted'
    }

    const room_id = medal.room_info.room_id
    const target_id = medal.medal.target_id
    const nick_name = medal.anchor_info.nick_name
    const medal_name = medal.medal.medal_name

    const medalData = await this.fetchMedalData(target_id)
    if (!medalData) {
      this.logger.error(
        `粉丝勋章【${medal_name}】 无法获取主播【${nick_name}】（UID：${target_id}，直播间：${room_id}）的粉丝团点亮任务信息，跳过点赞点亮`,
      )
      return 'markUncompleted'
    }

    const likeItem = MedalModule.findTaskInfo(medalData.task_info, 'like')
    if (!likeItem) {
      this.logger.error(
        `粉丝勋章【${medal_name}】 的点亮任务中没有点赞任务，无法在“不发送弹幕”模式下自动点亮`,
      )
      return 'markUncompleted'
    }

    if (!skipPreVerify) {
      const verdict = await this.preExecuteVerify(room_id, (liveStatus) => liveStatus === 1)

      if (verdict === 'error') {
        this.logger.error(
          `粉丝勋章【${medal_name}】 无法确认主播【${nick_name}】（直播间：${room_id}）是否开播，休眠5分钟后放回等待队列`,
        )
        await sleep(300e3)
        return 'requeue'
      } else if (verdict === 'fail') {
        this.logger.log(
          `粉丝勋章【${medal_name}】 主播【${nick_name}】（直播间：${room_id}）尚未开播，进入等待队列；不会发送弹幕`,
        )
        return 'requeue'
      }
    }

    const times = MedalModule.parseTitleCount(likeItem.title) ?? 30
    this.logger.log(
      `粉丝勋章【${medal_name}】 主播【${nick_name}】已经开播，开始点赞 ${times} 次以恢复点亮`,
    )

    if (!(await this.like(medal, times))) {
      return 'markUncompleted'
    }

    await sleep(MedalModule.WAIT_MEDAL_UPDATE_DELAY)
    if (!(await this.refreshFansMedals())) {
      this.logger.warn(`粉丝勋章【${medal_name}】点赞后无法刷新粉丝勋章列表，无法确认是否点亮`)
      return 'markUncompleted'
    }

    const latestMedal = useBiliStore().filteredFansMedalsMap.get(room_id)
    if (latestMedal?.medal.is_lighted === 1) {
      this.logger.log(`粉丝勋章【${medal_name}】已由B站确认恢复点亮`)
      return null
    }

    this.logger.warn(
      `粉丝勋章【${medal_name}】已执行点赞点亮，但刷新后仍处于熄灭状态，本轮按未完成处理`,
    )
    return 'markUncompleted'
  }

  /** 顺序执行当前已经开播的点亮任务 */
  private async executeLightTasks(
    medals: LiveData.FansMedalPanel.List[],
  ): Promise<BatchExecutionResult> {
    let markUncompleted = false
    const requeueRoomids: number[] = []

    for (const medal of medals) {
      const action = await this.executeLightTask(medal)
      if (action === 'stop' || action === 'stopAndMarkUncompleted') {
        return { stop: true, markUncompleted: action === 'stopAndMarkUncompleted' }
      } else if (action === 'requeue') {
        requeueRoomids.push(medal.room_info.room_id)
      } else if (action === 'markUncompleted') {
        markUncompleted = true
      }
    }

    return { markUncompleted, requeueRoomids }
  }

  public async run(): Promise<void> {
    this.logger.log('点亮熄灭勋章模块开始运行（仅开播点赞，不发送弹幕）')

    if (!isTimestampToday(this.config._lastCompleteTime)) {
      if (!(await MedalModule.waitForFansMedals())) {
        this.logger.error('粉丝勋章数据不存在，不执行点亮熄灭勋章任务')
        this.status = 'error'
        return
      }

      this.status = 'running'
      MedalModule.initSnapshotsWithFansMedalsData()

      const { readyMedals, waitingMedals } = this.getMedals()
      let pendingRoomids = waitingMedals.map((medal) => medal.room_info.room_id)
      let allCompleted = true

      const initialResult = await this.executeLightTasks(readyMedals)
      if (initialResult.markUncompleted) allCompleted = false
      if (initialResult.requeueRoomids) pendingRoomids.push(...initialResult.requeueRoomids)

      if (!initialResult.stop && pendingRoomids.length > 0) {
        // 初始可执行房间已处理完，允许点赞/观看模块继续运行；本模块在后台等待剩余主播开播。
        this.status = 'waiting'

        while (pendingRoomids.length > 0) {
          const result = await this.runWaitingRound(
            pendingRoomids,
            (liveStatus) => liveStatus === 1,
            (medal) => this.executeLightTask(medal, true),
          )

          if (result.markUncompleted) allCompleted = false
          if (result.stop) {
            allCompleted = false
            break
          }

          pendingRoomids = result.requeueRoomids!
          if (pendingRoomids.length > 0) {
            const medalMap = useBiliStore().filteredFansMedalsMap
            const pendingRoomsInfo: Record<number, string | undefined> = {}
            for (const roomid of pendingRoomids) {
              pendingRoomsInfo[roomid] = medalMap.get(roomid)?.anchor_info.nick_name
            }
            this.logger.log(
              `仍有 ${pendingRoomids.length} 个熄灭勋章对应的主播未开播，${MedalModule.WAIT_POLL_INTERVAL / 1000} 秒后继续检查；不会发送弹幕`,
              { pendingRoomsInfo },
            )
            await sleep(MedalModule.WAIT_POLL_INTERVAL)
          }
        }
      } else if (initialResult.stop) {
        allCompleted = false
      }

      if (allCompleted) {
        this.config._lastCompleteTime = tsm()
        this.status = 'done'
        this.logger.log('点亮熄灭勋章任务已完成')
      } else {
        this.status = 'waiting'
      }
    } else {
      if (isNowBefore(0, 5)) {
        this.logger.log('昨天的点亮熄灭勋章任务已经完成过了，等到今天的00:05再执行')
      } else {
        this.logger.log('今天已经完成过点亮熄灭勋章任务了')
        this.status = 'done'
      }
    }

    const diff = delayToNextMoment()
    this.nextRunTimer = setTimeout(() => this.run(), diff.ms)
    this.logger.log('距离点亮熄灭勋章模块下次运行时间:', diff.str)
  }
}

export default LightTask
