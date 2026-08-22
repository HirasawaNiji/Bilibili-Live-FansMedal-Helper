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

## 点亮与观看流程

```text
熄灭粉丝牌
    ↓
主播正在直播 → 按任务要求点赞 → 校验是否点亮
主播尚未开播 → 进入等待队列 → 开播后再执行
```

观看任务每完成一轮都会重新读取哔哩哔哩返回的任务进度；主播下播后会停止向该房间发送观看心跳，并根据设置重新进入等待队列。

## 本地构建

环境要求：Node.js 24。

```sh
npm install
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
