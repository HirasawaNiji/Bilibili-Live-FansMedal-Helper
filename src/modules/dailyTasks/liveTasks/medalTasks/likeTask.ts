import { delayToNextMoment, isNowBefore, isTimestampToday, tsm } from '@/library/luxon'
import { useBiliStore, useModuleStore, useRuntimeStatusStore } from '@/stores'
import type { ModuleStatusTypes } from '@/types'
import MedalModule from '@/modules/dailyTasks/liveTasks/medalTasks/MedalModule'
import type { LiveData } from '@/library/bili-api/data'
import { sleep } from '@/library/utils'
import type { AfterExecutionAction, BatchExecutionResult, GroupedMedals } from './types'

class LikeTask extends MedalModule {
  config = this.medalTasksConfig.like
  private runtimeStatus = useRuntimeStatusStore()

  /**
   * 每日点赞次数上限
   *
   * 每个账号一天最多进行 5000 次有效点赞（能完成任务的点赞）
   */
  private static readonly DAILY_LIKE_LIMIT = 5000

  set status(s: ModuleStatusTypes) {
    useModuleStore().moduleStatus.DailyTasks.LiveTasks.medalTasks.like = s
  }

  /**
   * 获取已点亮的粉丝勋章，并按是否可立即点赞分组
   */
  private getMedals(): GroupedMedals<'readyMedals' | 'waitingMedals'> {
    const fansMedals = useBiliStore().filteredFansMedals
    const result: GroupedMedals<'readyMedals' | 'waitingMedals'> = {
      readyMedals: [],
      waitingMedals: [],
    }

    fansMedals.forEach((medal) => {
      if (
        this.SHARED_MEDAL_FILTERS.meetWhiteOrBlackList(medal) &&
        this.SHARED_MEDAL_FILTERS.levelLt120(medal) &&
        this.SHARED_MEDAL_FILTERS.isLighted(medal)
      ) {
        if (this.SHARED_MEDAL_FILTERS.isLiving(medal)) {
          // 当前直播间正在直播，可立即点赞
          result.readyMedals.push(medal)
        } else if (this.config.waitUntilLiving) {
          // 当前直播未开播但开启了“等待开播后再点赞”，等直播间开播后再点赞
          result.waitingMedals.push(medal)
        }
      }
    })

    if (this.config.isWhiteList) {
      this.sortMedals(result.readyMedals)
      this.sortMedals(result.waitingMedals)
    }

    return result
  }

  /**
   * 执行单个直播间的点赞任务
   *
   * @param medal 粉丝勋章
   * @param skipPreVerify 是否跳过执行前直播状态校验，默认 false
   *
   * @returns 执行结果
   */
  private async executeLikeTask(
    medal: LiveData.FansMedalPanel.List,
    skipPreVerify?: false,
  ): Promise<AfterExecutionAction>
  private async executeLikeTask(
    medal: LiveData.FansMedalPanel.List,
    skipPreVerify?: true,
  ): Promise<Exclude<AfterExecutionAction, 'requeue'>>
  private async executeLikeTask(
    medal: LiveData.FansMedalPanel.List,
    skipPreVerify = false,
  ): Promise<AfterExecutionAction | Exclude<AfterExecutionAction, 'requeue'>> {
    if (MedalModule.shouldStopForCrossDay()) {
      this.logger.log('即将或刚刚发生跨天，提早结束本轮点赞任务')
      return 'stopAndMarkUncompleted'
    }

    const room_id = medal.room_info.room_id
    const target_id = medal.medal.target_id
    const nick_name = medal.anchor_info.nick_name
    const medal_name = medal.medal.medal_name
    this.runtimeStatus.setCurrent('like', medal, '正在检查点赞任务进度')

    const medalData = await this.fetchMedalData(target_id)
    if (!medalData) {
      this.logger.error(
        `粉丝勋章【${medal_name}】 无法获取主播【${nick_name}】（UID：${target_id}，直播间：${room_id}）的粉丝团升级任务信息，跳过点赞任务`,
      )
      this.runtimeStatus.setItemStatus('like', medal, 'failed', '无法获取点赞任务信息')
      return 'skipSleep'
    }

    if (medalData.reach_free_intimacy_limit) {
      this.logger.warn(
        `粉丝勋章【${medal_name}】（主播【${nick_name}】，UID：${target_id}，直播间：${room_id}）已达到储蓄亲密度上限（已储蓄 ${medalData.free_intimacy} 亲密度，投喂一个粉丝灯牌即可领取这些亲密度），无法通过点赞获取更多亲密度，跳过点赞任务`,
      )
      this.runtimeStatus.setItemStatus(
        'like',
        medal,
        'skipped',
        `储蓄亲密度已达上限（${medalData.free_intimacy}），需先投喂灯牌`,
      )
      return 'skipSleep'
    }

    const item = MedalModule.findTaskInfo(medalData.task_info, 'like')
    if (!item) {
      this.logger.error(
        `粉丝勋章【${medal_name}】 无法在主播【${nick_name}】（UID：${target_id}，直播间：${room_id}）的粉丝团升级任务信息中找到点赞任务，跳过点赞任务`,
      )
      this.runtimeStatus.setItemStatus('like', medal, 'failed', '没有找到点赞任务信息')
      return 'skipSleep'
    }

    if (item.is_done) {
      this.runtimeStatus.setItemStatus('like', medal, 'completed', 'B站显示点赞任务已经完成')
      return 'skipSleep'
    }

    const parsed = MedalModule.parseDailyLimit(item.sub_title)
    if (!parsed) {
      this.logger.error(
        `粉丝勋章【${medal_name}】 无法解析主播【${nick_name}】（UID：${target_id}，直播间：${room_id}）的点赞任务的每日上限信息，跳过点赞任务`,
      )
      this.runtimeStatus.setItemStatus('like', medal, 'failed', '无法解析点赞任务进度')
      return 'skipSleep'
    }

    if (parsed.current >= parsed.limit) {
      this.runtimeStatus.setItemStatus(
        'like',
        medal,
        'completed',
        `点赞任务已完成（${item.sub_title}）`,
      )
      return 'skipSleep'
    }

    if (!skipPreVerify) {
      const verdict = await this.preExecuteVerify(room_id, (liveStatus) => liveStatus === 1)

      if (verdict === 'error') {
        this.logger.error(
          `粉丝勋章【${medal_name}】 执行前校验：无法获取主播【${nick_name}】（UID：${target_id}，直播间：${room_id}）的直播状态，${this.config.waitUntilLiving ? '回到等待队列' : '跳过点赞任务'}；可能遭遇风控，休眠 5 分钟再继续`,
        )
        this.runtimeStatus.setItemStatus(
          'like',
          medal,
          this.config.waitUntilLiving ? 'waiting' : 'skipped',
          '直播状态查询失败，等待后续重试',
        )
        await sleep(300e3)

        return this.config.waitUntilLiving ? 'requeue' : 'skipSleep'
      } else if (verdict === 'fail') {
        this.logger.log(
          `粉丝勋章【${medal_name}】 执行前校验：主播【${nick_name}】（UID：${target_id}，直播间：${room_id}）当前不在直播，${this.config.waitUntilLiving ? '回到等待队列' : '跳过点赞任务'}`,
        )
        this.runtimeStatus.setItemStatus(
          'like',
          medal,
          this.config.waitUntilLiving ? 'waiting' : 'skipped',
          this.config.waitUntilLiving ? '主播未开播，等待开播后点赞' : '主播未开播，已跳过',
        )
        return this.config.waitUntilLiving ? 'requeue' : 'skipSleep'
      }
    }

    const times = MedalModule.parseTitleCount(item.title) ?? 30
    const target = this.config.useTargetRounds
      ? Math.min(parsed.limit, this.config.targetRounds)
      : parsed.limit
    const remaining = target - parsed.current
    let hasSuccessfulLike = false

    for (let j = 0; j < remaining; j++) {
      if (MedalModule.shouldStopForCrossDay()) {
        this.logger.log('即将或刚刚发生跨天，提早结束本轮点赞任务')
        return 'stopAndMarkUncompleted'
      }

      this.runtimeStatus.setCurrent(
        'like',
        medal,
        `正在执行第 ${parsed.current + j + 1} 轮点赞（${times} 次）`,
        parsed.current + j + 1,
        target,
      )

      if (await this.like(medal, times)) {
        hasSuccessfulLike = true
        this.config._todayLikeCount += times
        this.config._lastSuccessLikeTime = tsm()
      }

      if (j < remaining - 1) {
        await sleep(MedalModule.LIKE_DYNAMIC_INTERVAL)
      }
    }

    if (hasSuccessfulLike) {
      const taskCompleted = await this.confirmTaskCompletedAfterUpdate(
        medal,
        'like',
        this.config.useTargetRounds ? target : undefined,
      )
      this.runtimeStatus.setItemStatus(
        'like',
        medal,
        taskCompleted ? 'completed' : 'failed',
        taskCompleted ? '点赞任务已由B站确认完成' : '已点赞，但B站任务进度未达到目标',
      )

      if (this.config._todayLikeCount >= LikeTask.DAILY_LIKE_LIMIT) {
        this.logger.log(
          `今日已点赞 ${this.config._todayLikeCount} 次，达到每日点赞次数上限（${LikeTask.DAILY_LIKE_LIMIT}），跳过剩余点赞任务`,
        )
        return 'stop'
      }

      return taskCompleted ? null : 'markUncompleted'
    }

    // 所有点赞尝试均失败，估计是有什么异常状况，跳过
    this.runtimeStatus.setItemStatus('like', medal, 'failed', '所有点赞请求均未成功')
    return null
  }

  /**
   * 顺序执行多个直播间的点赞任务
   *
   * @returns 执行结果
   */
  private async executeLikeTasks(
    medals: LiveData.FansMedalPanel.List[],
  ): Promise<BatchExecutionResult> {
    let markUncompleted = false
    const requeueRoomids: number[] = []

    for (let i = 0; i < medals.length; i++) {
      const action = await this.executeLikeTask(medals[i])
      if (action === 'stop' || action === 'stopAndMarkUncompleted') {
        return { stop: true, markUncompleted: action === 'stopAndMarkUncompleted' }
      } else if (action === 'requeue') {
        requeueRoomids.push(medals[i].room_info.room_id)
      } else if (action === 'markUncompleted') {
        markUncompleted = true
      }

      if (action !== 'skipSleep' && i < medals.length - 1) {
        await sleep(MedalModule.LIKE_DYNAMIC_INTERVAL)
      }
    }

    return { markUncompleted, requeueRoomids }
  }

  public async run(): Promise<void> {
    this.logger.log('点赞模块开始运行')

    if (!isTimestampToday(this.config._lastCompleteTime)) {
      if (!isTimestampToday(this.config._lastSuccessLikeTime, 0, 0)) {
        this.config._todayLikeCount = 0
      }

      await this.waitForLightTask()

      if (!(await MedalModule.waitForFansMedals())) {
        this.logger.error('粉丝勋章数据不存在，不执行点赞任务')
        this.status = 'error'
        this.runtimeStatus.setTaskPhase('like', 'error', '粉丝勋章数据不存在，点赞任务未运行')
        return
      }

      this.status = 'running'
      MedalModule.initSnapshotsWithFansMedalsData()

      const { readyMedals, waitingMedals } = this.getMedals()
      this.runtimeStatus.beginTask('like', readyMedals, waitingMedals)
      let pendingRoomids = waitingMedals.map((medal) => medal.room_info.room_id)
      let allCompleted = true

      const { stop, markUncompleted, requeueRoomids } = await this.executeLikeTasks(readyMedals)

      if (markUncompleted) {
        allCompleted = false
      }
      if (requeueRoomids) {
        pendingRoomids.push(...requeueRoomids)
      }
      if (!stop) {
        while (pendingRoomids.length > 0) {
          this.runtimeStatus.setTaskPhase(
            'like',
            'waiting',
            `还有 ${pendingRoomids.length} 位主播未开播，正在等待点赞`,
          )
          const { stop, markUncompleted, requeueRoomids } = await this.runWaitingRound(
            pendingRoomids,
            (liveStatus) => liveStatus === 1,
            (medal) => this.executeLikeTask(medal, true),
          )
          if (markUncompleted) {
            allCompleted = false
          }
          if (stop) {
            break
          }

          pendingRoomids = requeueRoomids!

          if (pendingRoomids.length > 0) {
            const medalMap = useBiliStore().filteredFansMedalsMap
            const pendingRoomsInfo: Record<number, string | undefined> = {}

            for (const roomid of pendingRoomids) {
              pendingRoomsInfo[roomid] = medalMap.get(roomid)?.anchor_info.nick_name
            }

            this.logger.log(
              `仍有 ${pendingRoomids.length} 个直播间未开播，${MedalModule.WAIT_POLL_INTERVAL / 1000} 秒后继续检查`,
              { pendingRoomsInfo },
            )
            await sleep(MedalModule.WAIT_POLL_INTERVAL)
          }
        }
      }

      if (allCompleted) {
        this.config._lastCompleteTime = tsm()
        this.status = 'done'
        this.logger.log('点赞任务已完成')
        this.runtimeStatus.setTaskPhase('like', 'completed', '点赞任务已全部完成')
      } else {
        this.status = ''
        this.runtimeStatus.setTaskPhase('like', 'waiting', '仍有点赞任务未完成')
      }
    } else {
      if (isNowBefore(0, 5)) {
        this.logger.log('昨天的点赞任务已经完成过了，等到今天的00:05再执行')
      } else {
        this.logger.log('今天已经完成过点赞任务了')
        this.status = 'done'
        this.runtimeStatus.setTaskPhase('like', 'completed', '今天已经完成过点赞任务')
      }
    }

    const diff = delayToNextMoment()
    this.nextRunTimer = setTimeout(() => this.run(), diff.ms)
    this.logger.log('距离点赞模块下次运行时间:', diff.str)
  }
}

export default LikeTask
