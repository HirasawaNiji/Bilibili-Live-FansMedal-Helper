# 来源与修改说明

本项目是 [Bilibili Live Tasks Helper（BLTH）](https://github.com/andywang425/BLTH) 的非官方修改版本。

## 原项目

- 项目名称：Bilibili Live Tasks Helper
- 原项目地址：https://github.com/andywang425/BLTH
- 原作者：andywang425
- 原版权声明：Copyright (c) 2023 andywang425
- 开源许可证：MIT License

原项目的版权声明与 `LICENSE` 文件均完整保留。

## 修改版本

- 仓库：https://github.com/HirasawaNiji/Bilibili-Live-FansMedal-Helper
- 维护者：HirasawaNiji
- 上游基础版本：BLTH 7.3.3

主要修改包括：

- 只对正在直播的主播执行观看和点赞点亮任务
- 未开播主播进入等待队列，开播后再执行任务
- 移除自动发送弹幕任务的界面和加载入口
- 增加储蓄亲密度 90+ 溢出提醒
- 在提醒中显示主播当前开播状态

本修改版不代表 BLTH 原作者或哔哩哔哩的官方立场，也不受其背书。

## 上游修复移植

在本修改版 7.5.0 的基础上，选择性移植 BLTH 7.3.4–7.3.6 中适用的修复，未整体合并上游新增活动模块。上游作者的版权及许可证继续保留。

| 修复 | 上游来源 |
| --- | --- |
| 按勋章 ID 去重，涵盖分页失败返回的部分结果 | [8447c06](https://github.com/andywang425/BLTH/commit/8447c06ff156fee25599a0a40d14bbabf02a0dab) |
| 面板按钮绝对定位与宽度变化时重新定位；本版另处理空容器锚点 | [84a20eb](https://github.com/andywang425/BLTH/commit/84a20eb0cb13a62f4559f4aab8ca650715642f75) |
| 防挂机提前执行及页面焦点状态处理 | [33d90ea](https://github.com/andywang425/BLTH/commit/33d90ea933dcb90beb15c9a03d4c77f776d3f638) |
| 直播状态与观看心跳日志优化 | [6b72f41](https://github.com/andywang425/BLTH/commit/6b72f4138c1e2a34b5aafab171f314863d769d57) |

同时同步了上游 7.3.4 将储蓄亲密度提示提升为警告的调整。亲密喂养模块及其活动资格判断、喂养次数等修复未引入，因为本版没有该活动模块；自动弹幕也继续保持移除状态。
