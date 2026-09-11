# Bilibili Live FansMedal Helper

> 本项目基于 [andywang425/BLTH](https://github.com/andywang425/BLTH) 修改而来，是非官方的社区维护版本，主要适配哔哩哔哩直播粉丝勋章任务改版。
>
> 原项目作者：[andywang425](https://github.com/andywang425)<br>
> 修改版维护者：[HirasawaNiji](https://github.com/HirasawaNiji)<br>
> 上游基础版本：BLTH 7.3.3<br>
> 开源许可证：[MIT](LICENSE)

本仓库与哔哩哔哩及 BLTH 原作者没有隶属或官方合作关系。原项目版权声明和 MIT 许可证均予以保留，详细来源说明见 [NOTICE.md](NOTICE.md)。

## 安装

首先安装 [Tampermonkey](https://www.tampermonkey.net) 或 [Violentmonkey](https://violentmonkey.github.io)，然后选择脚本版本：

- [安装压缩版（推荐）](https://github.com/HirasawaNiji/Bilibili-Live-FansMedal-Helper/releases/latest/download/bilibili-live-tasks-helper.min.user.js)
- [安装可读源码版](https://github.com/HirasawaNiji/Bilibili-Live-FansMedal-Helper/releases/latest/download/bilibili-live-tasks-helper.user.js)

安装后登录哔哩哔哩并打开任意直播间，脚本控制面板会显示在直播画面左侧。为避免重复执行任务，请勿同时启用原版 BLTH。

## 与原版的主要区别

- 观看直播任务只处理当前正在直播的主播。
- 未开播主播进入等待队列，开播后自动开始观看。
- 点亮熄灭粉丝牌只使用点赞，不自动发送弹幕。
- 移除独立的自动发送弹幕任务入口。
- 新增储蓄亲密度达到 90 的溢出提醒。
- 提醒列表显示主播当前开播状态，并提供直播间投喂入口。
- 不会自动投喂付费粉丝灯牌或消耗电池。

## 每周收益优先

侧边栏在“实时状态”和“每日任务”之间提供“每周小结”，按北京时间周一至周日汇总每位主播的点赞和观看任务亲密度，保留最近八周。页面展示开播后的参考优先级、观看名单资格及任务轮数，支持搜索、查看历史周和手动刷新本周。亲密度与轮数相同的主播优先级并列；实际执行还需检查开播状态、每日目标和储蓄上限。统计随任务查询或手动刷新更新，按账号和主播分别保存，重复刷新不会重复计数。

“优先观看本周任务亲密度较少的主播”默认开启：每完成一轮观看，都会重新比较候选主播的本周收益，优先选择收益少且正在直播的主播；收益相同时参考已完成轮数并轮流执行。启用等待开播时，刚开播的主播也会在后续轮次参与选择，不必等其他主播做完当天全部轮次。切换发生在一轮结束后，不中断正在发送的观看心跳。黑白名单、每日目标和储蓄上限仍然有效，关闭该选项可恢复原先顺序，修改后刷新页面生效。

统计以接口返回的任务进度和明确的奖励数值为准，包含尚未领取的储蓄亲密度，不是勋章实际等级经验或付费送礼总额。首次查询可以计入当天已完成的任务，但无法追溯未记录日期；接口奖励文案无法识别时会显示“部分奖励未知”，不会猜测经验值。

## 推荐使用方式

打开自己的 Bilibili 直播间（一个能自己控制开播与否的直播间），打开脚本控制面板选取任务后刷新页面。观看任务需要当前打开的直播间处于未开播状态，任务进度可在“实时状态”查看，本周亲密度和参考优先级可在“每周小结”查看。

## 本地构建

环境要求：Node.js 24。

```sh
npm install
npm test
npm run type-check
npm run build
```

构建产物位于 `dist/`。

## 风险提示

本项目依赖哔哩哔哩的网页和直播接口，平台规则或接口变化可能导致部分功能失效。自动化脚本也可能带来任务失败、请求限制或账号风险，请自行判断并承担使用风险。

脚本不会自动执行付费投喂，但用户手动点击直播间投喂入口后产生的消费由用户自行确认和承担。

## 许可证与来源

本项目依照 [MIT License](LICENSE) 发布。修改和再分发时必须保留原项目的版权声明与许可证文本。

- 上游项目：[andywang425/BLTH](https://github.com/andywang425/BLTH)
- 修改说明：[NOTICE.md](NOTICE.md)
- 版本记录：[CHANGELOG.md](CHANGELOG.md)
