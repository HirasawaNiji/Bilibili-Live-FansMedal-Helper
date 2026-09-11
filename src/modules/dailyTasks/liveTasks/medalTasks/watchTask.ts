import { delayToNextMoment, isNowAfter, isNowBefore, isTimestampToday, tsm } from '@/library/luxon'
import BAPI from '@/library/bili-api'
import { useBiliStore, useModuleStore, usePlayerStore, useRuntimeStatusStore } from '@/stores'
import Logger from '@/library/logger'
import CryptoJS from 'crypto-js'
import { sleep } from '@/library/utils'
import type { ModuleStatusTypes, RunAtMoment } from '@/types'
import MedalModule from '@/modules/dailyTasks/liveTasks/medalTasks/MedalModule'
import type { LiveData } from '@/library/bili-api/data'
import type { AfterExecutionAction, BatchExecutionResult, GroupedMedals } from './types'
import { useWeeklyMedalStore } from '@/stores/useWeeklyMedalStore'
import { runWeeklyWatchQueue } from '@/library/weekly-watch-scheduler'

interface SpyderData {
  benchmark: string
  device: string
  ets: number
  id: string
  time: number
  ts: number
  ua: string
}

class RoomHeart {
  constructor(
    roomID: number,
    areaID: number,
    parentID: number,
    ruid: number,
    targetSeconds: number,
  ) {
    this.roomID = roomID
    this.areaID = areaID
    this.parentID = parentID
    this.ruid = ruid
    this.targetSeconds = targetSeconds
  }

  private logger = new Logger('RoomHeart')

  /** 已观看时间（秒） */
  private watchedSeconds: number = 0

  /** 目标观看时间（秒） */
  private readonly targetSeconds: number

  private readonly areaID: number
  private readonly parentID: number
  private readonly roomID: number
  /** 主播的 UID */
  private readonly ruid: number
  private seq = 0

  /** 计算签名和发送请求时均需要 JSON.stringify */
  private get id(): number[] {
    return [this.parentID, this.areaID, this.seq, this.roomID]
  }

  /** Cookie LIVE_BUVID */
  private buvid?: string = useBiliStore().cookies!.LIVE_BUVID

  private uuid = crypto.randomUUID()

  /** 计算签名和发送请求时均需要 JSON.stringify */
  private device: string[] = [this.buvid as string, this.uuid]
  /** 浏览器 user agent */
  private ua = navigator.userAgent

  private heartBeatInterval!: number
  private secretKey!: string
  private secretRule!: number[]
  /** ets */
  private timestamp!: number
  /** 下一次 X 心跳的目标发送时间 */
  private nextHeartbeatAt = 0

  private static readonly HEARTBEAT_WAIT_SLICE_MS = 1000
  private static readonly HEARTBEAT_DRIFT_WARN_MS = 5000

  /**
   * 开始心跳
   *
   * @returns 是否成功观看过任意时长
   */
  public async start(): Promise<boolean> {
    if (!this.buvid) {
      this.logger.error(`缺少buvid，无法为直播间 ${this.roomID} 执行观看直播任务，请尝试刷新页面`)
      return false
    }
    await this.E()
    return this.watchedSeconds > 0
  }

  private setHeartbeatState(data: {
    heartbeat_interval: number
    secret_key: string
    secret_rule: number[]
    timestamp: number
  }) {
    ;({
      heartbeat_interval: this.heartBeatInterval,
      secret_key: this.secretKey,
      secret_rule: this.secretRule,
      timestamp: this.timestamp,
    } = data)

    // 根据观察，心跳响应中的 timestamp = 上次心跳响应中的 timestamp + 上次心跳响应中的 heartbeat_interval
    // 如果是第一次心跳，timestamp = 发心跳时的秒级时间戳 -1或-2（可能是B站服务器的时间不准？误差不大实测可忽略）
    // 总是使用最新心跳中返回的 timestamp 和 heartBeatInterval 来计算下次发送的时间
    // 如果每次心跳后固定等待 heartBeatInterval 秒，发送时间误差会随时间推移变得越来越大
    this.nextHeartbeatAt = (this.timestamp + this.heartBeatInterval) * 1000
  }

  /**
   * 等待下一次心跳的发送时间到来，期间每隔一段时间检查一次剩余时间
   */
  private async waitForNextHeartbeat(): Promise<void> {
    while (true) {
      const remaining = this.nextHeartbeatAt - tsm()

      if (remaining <= 0) {
        const drift = -remaining
        if (drift >= RoomHeart.HEARTBEAT_DRIFT_WARN_MS) {
          this.logger.warn(
            `直播间 ${this.roomID} 的 X 心跳发送已滞后 ${(drift / 1000).toFixed(2)} 秒，下次心跳可能触发服务端 time check failed`,
          )
        }
        return
      }
      await sleep(Math.min(remaining, RoomHeart.HEARTBEAT_WAIT_SLICE_MS))
    }
  }

  /**
   * E心跳，开始时发送一次
   */
  private async E(): Promise<void> {
    try {
      const response = await BAPI.liveTrace.E(this.id, this.device, this.ruid)
      this.logger.log(
        `BAPI.liveTrace.E(${this.id}, ${this.device}, ${this.ruid}) response`,
        response,
      )
      if (response.code === 0) {
        this.seq += 1
        this.setHeartbeatState(response.data)
        await this.waitForNextHeartbeat()
        return this.X()
      } else {
        this.logger.error(
          `直播间 ${this.roomID} 的 E 心跳失败，无法继续执行观看直播任务，跳过该房间`,
          response.message,
        )
      }
    } catch (error) {
      this.logger.error(
        `直播间 ${this.roomID} 的 E 心跳出错，无法继续执行观看直播任务，跳过该房间`,
        error,
      )
    }
  }

  /**
   * X心跳，E心跳过后都是X心跳
   */
  private async X(): Promise<void> {
    while (true) {
      if (isNowAfter(23, 58) || isNowBefore(0, 5)) {
        this.logger.log(`即将或刚刚发生跨天，停止直播间 ${this.roomID} 的X心跳`)
        return
      }

      try {
        const spyderData: SpyderData = {
          id: JSON.stringify(this.id),
          device: JSON.stringify(this.device),
          ets: this.timestamp,
          benchmark: this.secretKey,
          time: this.heartBeatInterval,
          ts: tsm(),
          ua: this.ua,
        }
        // 签名
        const s = this.spyder(JSON.stringify(spyderData), this.secretRule)

        const response = await BAPI.liveTrace.X(
          s,
          this.id,
          this.device,
          this.ruid,
          this.timestamp,
          this.secretKey,
          this.heartBeatInterval,
          spyderData.ts,
        )
        this.logger.log(
          `BAPI.liveTrace.X(${s}, ${this.id}, ${this.device}, ${this.ruid}, ${this.timestamp}, ${this.secretKey}, ${this.heartBeatInterval}, ${spyderData.ts}) response`,
          response,
        )
        if (response.code === 0) {
          this.seq += 1
          this.watchedSeconds += this.heartBeatInterval
          this.logger.log(
            `直播间 ${this.roomID} 的第 ${this.seq - 1} 次 X 心跳成功，已观看 ${this.watchedSeconds} 秒`,
          )
          if (this.watchedSeconds >= this.targetSeconds) {
            // 达到目标观看时间，结束
            return
          }
          this.setHeartbeatState(response.data)
          await this.waitForNextHeartbeat()
          // 继续下一轮 X 心跳
        } else {
          this.logger.error(
            `直播间 ${this.roomID} 的 X 心跳失败，无法继续执行观看直播任务，跳过该房间（目前已观看 ${this.watchedSeconds} 秒）`,
            response.message,
          )
          return
        }
      } catch (error) {
        this.logger.error(
          `直播间 ${this.roomID} 的 X 心跳出错，无法继续执行观看直播任务，跳过该房间（目前已观看 ${this.watchedSeconds} 秒）`,
          error,
        )
        return
      }
    }
  }

  /**
   * wasm 导出的 spyder 函数的 javascript 实现
   * @param str 一个经过 JSON.stringify 的 json 字符串
   * @param rule secret_rule 数组
   * @returns s
   */
  private spyder(str: string, rule: number[]): string {
    const data: SpyderData = JSON.parse(str)
    const [parent_id, area_id, seq_id, room_id]: number[] = JSON.parse(data.id)
    const [buvid, uuid]: string[] = JSON.parse(data.device)
    const key: string = data.benchmark
    const newData = {
      platform: 'web',
      parent_id,
      area_id,
      seq_id,
      room_id,
      buvid,
      uuid,
      ets: data.ets,
      time: data.time,
      ts: data.ts,
    }
    let s = JSON.stringify(newData)
    for (const r of rule) {
      switch (r) {
        case 0:
          s = CryptoJS.HmacMD5(s, key).toString(CryptoJS.enc.Hex)
          break
        case 1:
          s = CryptoJS.HmacSHA1(s, key).toString(CryptoJS.enc.Hex)
          break
        case 2:
          s = CryptoJS.HmacSHA256(s, key).toString(CryptoJS.enc.Hex)
          break
        case 3:
          s = CryptoJS.HmacSHA224(s, key).toString(CryptoJS.enc.Hex)
          break
        case 4:
          s = CryptoJS.HmacSHA512(s, key).toString(CryptoJS.enc.Hex)
          break
        case 5:
          s = CryptoJS.HmacSHA384(s, key).toString(CryptoJS.enc.Hex)
          break
        default:
          s = CryptoJS.HmacMD5(s, key).toString(CryptoJS.enc.Hex)
      }
    }
    return s
  }
}

class WatchTask extends MedalModule {
  static runAt: RunAtMoment = 'window-load'

  config = this.medalTasksConfig.watch

  set status(s: ModuleStatusTypes) {
    useModuleStore().moduleStatus.DailyTasks.LiveTasks.medalTasks.watch = s
  }

  private playerStore = usePlayerStore()
  private runtimeStatus = useRuntimeStatusStore()
  private isRunning = false

  /**
   * 获取已点亮的粉丝勋章，并按是否正在直播分组
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
          result.readyMedals.push(medal)
        } else if (this.config.waitUntilLiving) {
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
   * 获取指定直播间的 area_id 和 parent_area_id
   *
   * 出错时返回 [-1, -1]
   *
   * @param roomid 房间号
   * @returns [area_id, parent_area_id]
   */
  private async getAreaInfo(roomid: number): Promise<[number, number]> {
    try {
      const response = await BAPI.live.getInfoByRoom(roomid)
      this.logger.log(`BAPI.live.getInfoByRoom(${roomid}) response`, response)

      if (response.code === 0) {
        const room_info = response.data.room_info
        return [room_info.area_id, room_info.parent_area_id]
      } else {
        return [-1, -1]
      }
    } catch (error) {
      this.logger.error(
        `获取指定直播间的 area_id 和 parent_area_id(roomid = ${roomid}) 出错`,
        error,
      )
      return [-1, -1]
    }
  }

  /**
   * 执行单个直播间的观看任务
   *
   * 每次只观看一轮（通常为 15 分钟），随后读取服务端任务进度；下一轮开始前
   * 再次校验主播仍在直播，避免主播下播后继续长时间发送无效心跳。
   */
  private executeWatchTask(
    medal: LiveData.FansMedalPanel.List,
    skipPreVerify?: boolean,
  ): Promise<AfterExecutionAction>
  private executeWatchTask(
    medal: LiveData.FansMedalPanel.List,
    skipPreVerify: boolean,
    singleRound: true,
  ): Promise<AfterExecutionAction | 'yield'>
  private async executeWatchTask(
    medal: LiveData.FansMedalPanel.List,
    skipPreVerify = false,
    singleRound = false,
  ): Promise<AfterExecutionAction | 'yield'> {
    if (MedalModule.shouldStopForCrossDay()) {
      this.logger.log('即将或刚刚发生跨天，提早结束本轮观看直播任务')
      return 'stopAndMarkUncompleted'
    }

    const roomid = medal.room_info.room_id
    const uid = medal.medal.target_id
    const nick_name = medal.anchor_info.nick_name
    const medal_name = medal.medal.medal_name
    this.runtimeStatus.setCurrent('watch', medal, '正在检查观看任务进度')

    let medalData = await this.fetchMedalData(uid)
    if (!medalData) {
      this.logger.error(
        `粉丝勋章【${medal_name}】 无法获取主播【${nick_name}】（UID：${uid}，直播间：${roomid}）的粉丝团升级任务信息，跳过观看直播任务`,
      )
      this.runtimeStatus.setItemStatus('watch', medal, 'failed', '无法获取观看任务信息')
      return 'markUncompleted'
    }

    if (medalData.reach_free_intimacy_limit) {
      this.logger.warn(
        `粉丝勋章【${medal_name}】（主播【${nick_name}】，UID：${uid}，直播间：${roomid}）已达到储蓄亲密度上限（已储蓄 ${medalData.free_intimacy} 亲密度，投喂一个粉丝灯牌即可领取这些亲密度），无法通过观看直播获取更多亲密度，跳过观看直播任务`,
      )
      this.runtimeStatus.setItemStatus(
        'watch',
        medal,
        'skipped',
        `储蓄亲密度已达上限（${medalData.free_intimacy}），需先投喂灯牌`,
      )
      return 'skipSleep'
    }

    let item = MedalModule.findTaskInfo(medalData.task_info, 'watchLive')
    if (!item) {
      this.logger.error(
        `粉丝勋章【${medal_name}】 无法在主播【${nick_name}】（UID：${uid}，直播间：${roomid}）的粉丝团升级任务信息中找到观看直播任务，跳过观看直播任务`,
      )
      this.runtimeStatus.setItemStatus('watch', medal, 'failed', '没有找到观看直播任务信息')
      return 'markUncompleted'
    }

    if (item.is_done) {
      this.runtimeStatus.setItemStatus('watch', medal, 'completed', 'B站显示观看任务已经完成')
      return 'skipSleep'
    }

    let parsed = MedalModule.parseDailyLimit(item.sub_title)
    if (!parsed) {
      this.logger.error(
        `粉丝勋章【${medal_name}】 无法解析主播【${nick_name}】（UID：${uid}，直播间：${roomid}）的观看直播任务的每日上限信息，跳过观看直播任务`,
      )
      this.runtimeStatus.setItemStatus('watch', medal, 'failed', '无法解析观看任务进度')
      return 'markUncompleted'
    }

    const minutes = MedalModule.parseTitleCount(item.title) ?? 15
    const target = this.config.useTargetRounds
      ? Math.min(parsed.limit, this.config.targetRounds)
      : parsed.limit

    if (parsed.current >= target) {
      this.runtimeStatus.setItemStatus(
        'watch',
        medal,
        'completed',
        `观看任务已完成（${item.sub_title}）`,
      )
      return 'skipSleep'
    }

    if (!skipPreVerify) {
      const verdict = await this.preExecuteVerify(roomid, (liveStatus) => liveStatus === 1)

      if (verdict === 'error') {
        this.logger.error(
          `粉丝勋章【${medal_name}】 执行前校验：无法获取主播【${nick_name}】（UID：${uid}，直播间：${roomid}）的直播状态，${this.config.waitUntilLiving ? '回到等待队列' : '跳过观看直播任务'}；可能遭遇风控，休眠 5 分钟再继续`,
        )
        this.runtimeStatus.setItemStatus(
          'watch',
          medal,
          this.config.waitUntilLiving ? 'waiting' : 'skipped',
          '直播状态查询失败，等待后续重试',
        )
        await sleep(300e3)
        return this.config.waitUntilLiving ? 'requeue' : 'skipSleep'
      } else if (verdict === 'fail') {
        this.logger.log(
          `粉丝勋章【${medal_name}】 执行前校验：主播【${nick_name}】（UID：${uid}，直播间：${roomid}）当前不在直播，${this.config.waitUntilLiving ? '回到等待队列' : '跳过观看直播任务'}`,
        )
        this.runtimeStatus.setItemStatus(
          'watch',
          medal,
          this.config.waitUntilLiving ? 'waiting' : 'skipped',
          this.config.waitUntilLiving ? '主播未开播，等待开播后观看' : '主播未开播，已跳过',
        )
        return this.config.waitUntilLiving ? 'requeue' : 'skipSleep'
      }
    }

    const [area_id, parent_area_id] = await this.getAreaInfo(roomid)
    if (area_id <= 0 || parent_area_id <= 0) {
      this.logger.error(
        `粉丝勋章【${medal_name}】 的直播间 ${roomid} 没有有效直播分区，跳过观看直播任务`,
      )
      this.runtimeStatus.setItemStatus('watch', medal, 'failed', '直播间没有有效的直播分区')
      return 'markUncompleted'
    }

    while (parsed.current < target) {
      if (MedalModule.shouldStopForCrossDay()) {
        this.logger.log('即将或刚刚发生跨天，提早结束本轮观看直播任务')
        return 'stopAndMarkUncompleted'
      }

      // 除从等待队列刚刚确认开播后的第一轮外，每轮开始前都重新确认直播状态。
      if (!skipPreVerify || parsed.current > 0) {
        const verdict = await this.preExecuteVerify(roomid, (liveStatus) => liveStatus === 1)
        if (verdict !== 'pass') {
          this.logger.log(
            `粉丝勋章【${medal_name}】 主播【${nick_name}】（UID：${uid}，直播间：${roomid}）在下一轮观看前已不在直播或状态获取失败，${this.config.waitUntilLiving ? '回到等待队列' : '停止本次观看'}`,
          )
          this.runtimeStatus.setItemStatus(
            'watch',
            medal,
            this.config.waitUntilLiving ? 'waiting' : 'failed',
            this.config.waitUntilLiving ? '主播已经下播，返回等待队列' : '主播已经下播，观看未完成',
          )
          return this.config.waitUntilLiving ? 'requeue' : 'markUncompleted'
        }
      }

      const previousProgress = parsed.current
      this.logger.log(
        `粉丝勋章【${medal_name}】 开始直播间 ${roomid}（主播【${nick_name}】，UID：${uid}）的第 ${previousProgress + 1} 轮观看直播任务，本轮目标 ${minutes} 分钟`,
      )
      this.runtimeStatus.setCurrent(
        'watch',
        medal,
        `正在观看直播，本轮目标 ${minutes} 分钟`,
        previousProgress + 1,
        target,
      )

      const hasWatchingProgress = await new RoomHeart(
        roomid,
        area_id,
        parent_area_id,
        uid,
        minutes * 60,
      ).start()

      if (!hasWatchingProgress) {
        this.runtimeStatus.setItemStatus('watch', medal, 'failed', '观看心跳执行失败')
        return 'markUncompleted'
      }

      await sleep(MedalModule.WAIT_MEDAL_UPDATE_DELAY)
      medalData = await this.fetchMedalData(uid)
      if (!medalData) {
        this.logger.error(
          `粉丝勋章【${medal_name}】 完成一轮观看后无法获取最新任务进度，停止该房间，避免继续无效观看`,
        )
        this.runtimeStatus.setItemStatus('watch', medal, 'failed', '完成一轮后无法获取最新任务进度')
        return 'markUncompleted'
      }

      item = MedalModule.findTaskInfo(medalData.task_info, 'watchLive')
      parsed = item ? MedalModule.parseDailyLimit(item.sub_title) : null
      if (!item || !parsed) {
        this.logger.error(
          `粉丝勋章【${medal_name}】 完成一轮观看后无法解析最新任务进度，停止该房间，避免继续无效观看`,
        )
        this.runtimeStatus.setItemStatus('watch', medal, 'failed', '完成一轮后无法解析最新任务进度')
        return 'markUncompleted'
      }

      if (item.is_done || parsed.current >= target) {
        this.logger.log(`粉丝勋章【${medal_name}】 观看直播任务已达到目标进度（${item.sub_title}）`)
        this.runtimeStatus.setItemStatus(
          'watch',
          medal,
          'completed',
          `观看任务已完成（${item.sub_title}）`,
        )
        return null
      }

      if (parsed.current <= previousProgress) {
        const verdict = await this.preExecuteVerify(roomid, (liveStatus) => liveStatus === 1)
        if (verdict !== 'pass' && this.config.waitUntilLiving) {
          this.logger.log(`粉丝勋章【${medal_name}】 本轮观看未计入且主播已经下播，回到等待队列`)
          this.runtimeStatus.setItemStatus(
            'watch',
            medal,
            'waiting',
            '本轮未计入且主播已下播，等待重新开播',
          )
          return 'requeue'
        }

        this.logger.warn(
          `粉丝勋章【${medal_name}】 已发送 ${minutes} 分钟观看心跳，但B站任务进度仍为 ${item.sub_title}；停止该房间，避免继续无效观看`,
        )
        this.runtimeStatus.setItemStatus(
          'watch',
          medal,
          'failed',
          `已观看 ${minutes} 分钟，但B站进度未增长（${item.sub_title}）`,
        )
        return 'markUncompleted'
      }

      if (singleRound) {
        this.runtimeStatus.setItemStatus(
          'watch',
          medal,
          'pending',
          `本轮已确认（${item.sub_title}），按本周收益重新选择主播`,
        )
        return 'yield'
      }

      this.logger.log(`粉丝勋章【${medal_name}】 本轮观看已由B站确认，当前进度：${item.sub_title}`)
      this.runtimeStatus.setCurrent(
        'watch',
        medal,
        `第 ${parsed.current} 轮已确认，准备继续观看`,
        parsed.current,
        target,
      )
      skipPreVerify = false
    }

    this.runtimeStatus.setItemStatus('watch', medal, 'completed', '观看任务已达到目标轮次')
    return null
  }

  /** 顺序执行多个正在直播的房间 */
  private async executeWatchTasks(
    medals: LiveData.FansMedalPanel.List[],
  ): Promise<BatchExecutionResult> {
    let markUncompleted = false
    const requeueRoomids: number[] = []

    for (const medal of medals) {
      const action = await this.executeWatchTask(medal)
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

  /** 将已开播与等待开播的主播放进同一个队列，每轮重新比较收益。 */
  private async executeWeeklyWatchTasks(
    readyMedals: LiveData.FansMedalPanel.List[],
    waitingMedals: LiveData.FansMedalPanel.List[],
  ): Promise<boolean> {
    const medals = [...readyMedals, ...waitingMedals]
    if (this.config.isWhiteList) this.sortMedals(medals)
    const weeklyStore = useWeeklyMedalStore()
    // 启动时补齐今天已完成的任务，避免把尚未查询的主播误当成本周零收益。
    for (const medal of medals) {
      if (MedalModule.shouldStopForCrossDay()) return false
      await this.fetchMedalData(medal.medal.target_id)
    }
    return runWeeklyWatchQueue(medals, {
      now: tsm,
      score: (medal) => {
        const totals = weeklyStore.totals(medal.medal.target_id)
        return { points: totals.points, rounds: totals.likeRounds + totals.watchRounds }
      },
      shouldStop: MedalModule.shouldStopForCrossDay,
      sleep,
      pollInterval: MedalModule.WAIT_POLL_INTERVAL,
      waitUntilLiving: () => this.config.waitUntilLiving,
      onWaiting: (count) =>
        this.runtimeStatus.setTaskPhase(
          'watch',
          'waiting',
          `还有 ${count} 位主播等待开播，将优先观看本周收益较少的主播`,
        ),
      execute: async (medal) => {
        const verdict = await this.preExecuteVerify(medal.room_info.room_id, (s) => s === 1, true)
        if (verdict !== 'pass') {
          this.runtimeStatus.setItemStatus(
            'watch',
            medal,
            this.config.waitUntilLiving ? 'waiting' : 'skipped',
            verdict === 'error' ? '开播状态查询失败，稍后重试' : '主播未开播',
          )
          return verdict === 'error' && !this.config.waitUntilLiving ? 'error' : 'offline'
        }
        const action = await this.executeWatchTask(medal, true, true)
        if (action === 'yield') return 'yield'
        if (action === 'requeue') return 'offline'
        if (action === 'stop' || action === 'stopAndMarkUncompleted') return 'stop'
        if (action === 'markUncompleted') return 'error'
        return 'done'
      },
    })
  }

  public async run(): Promise<void> {
    if (this.isRunning) return
    this.isRunning = true
    try {
      await this.runTasks()
    } finally {
      this.isRunning = false
    }
  }

  private async runTasks(): Promise<void> {
    this.logger.log('观看直播模块开始运行')

    await this.playerStore.waitForLiveStatus(0, {
      onNeedWait: () => {
        this.logger.log('当前直播间正在直播，直播结束后再执行观看直播任务')
        this.runtimeStatus.setTaskPhase(
          'watch',
          'waiting',
          '当前打开的直播间正在直播，等待该直播间下播后启动观看任务',
        )
      },
    })

    if (!isTimestampToday(this.config._lastCompleteTime)) {
      await this.waitForLightTask()

      if (!(await MedalModule.waitForFansMedals())) {
        this.logger.error('粉丝勋章数据不存在，不执行观看直播任务')
        this.status = 'error'
        this.runtimeStatus.setTaskPhase('watch', 'error', '粉丝勋章数据不存在，观看任务未运行')
        return
      }

      this.status = 'running'
      MedalModule.initSnapshotsWithFansMedalsData()

      const { readyMedals, waitingMedals } = this.getMedals()
      this.runtimeStatus.beginTask('watch', readyMedals, waitingMedals)
      let allCompleted = true

      if (this.config.prioritizeWeeklyIntimacy) {
        allCompleted = await this.executeWeeklyWatchTasks(readyMedals, waitingMedals)
      } else {
        let pendingRoomids = waitingMedals.map((medal) => medal.room_info.room_id)
        const { stop, markUncompleted, requeueRoomids } = await this.executeWatchTasks(readyMedals)
        if (markUncompleted) allCompleted = false
        if (requeueRoomids) pendingRoomids.push(...requeueRoomids)

        if (!stop && this.config.waitUntilLiving) {
          while (pendingRoomids.length > 0) {
            this.runtimeStatus.setTaskPhase(
              'watch',
              'waiting',
              `还有 ${pendingRoomids.length} 位主播未开播，正在等待观看`,
            )
            const result = await this.runWaitingRound(
              pendingRoomids,
              (liveStatus) => liveStatus === 1,
              (medal) => this.executeWatchTask(medal, true),
            )

            if (result.markUncompleted) allCompleted = false
            if (result.stop) break

            pendingRoomids = result.requeueRoomids!
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
      }

      if (allCompleted) {
        this.config._lastCompleteTime = tsm()
        this.logger.log('观看直播任务已完成')
        this.status = 'done'
        this.runtimeStatus.setTaskPhase('watch', 'completed', '观看直播任务已全部完成')
      } else {
        this.status = ''
        this.runtimeStatus.setTaskPhase('watch', 'waiting', '仍有观看直播任务未完成')
      }
    } else {
      if (isNowBefore(0, 5)) {
        this.logger.log('昨天的观看直播任务已经完成过了，等到今天的00:05再执行')
      } else {
        this.logger.log('今天已经完成过观看直播任务了')
        this.status = 'done'
        this.runtimeStatus.setTaskPhase('watch', 'completed', '今天已经完成过观看直播任务')
      }
    }

    const diff = delayToNextMoment()
    this.nextRunTimer = setTimeout(() => this.run(), diff.ms)
    this.logger.log('距离观看直播模块下次运行时间:', diff.str)
  }
}

export default WatchTask
