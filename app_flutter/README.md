# TrainTimer Flutter

依据 [迁移计划](../docs/flutter-app-migration-plan-2026-10-18.md) 开发的独立桌面新版。当前交付是**第一阶段关键原型**，不是完整迁移或正式安装版。旧版目录、运行包和用户数据均不参与新版开发写入。

## 当前可运行能力

- 本地三阶合法随机状态与原生 min2phase；输出经独立 Dart 状态演算验证，最多20 HTM。TNoodle生成规则的一致性仍待验证。
- 单调时钟键盘计时、0.5秒蓄备、可关闭的观察、15/17秒处罚、Esc DNF；原始成绩先保存。
- 独立后台 Drift/SQLite、会话、游标历史、备注/罚时编辑、基础增量聚合、中断恢复检查点与一致性快照。
- 3D Canvas投影候选及独立转层动画；尚未选定最终后端。
- macOS CoreBluetooth原始传输、GAN Gen4加解密与独立消息解析、设置中的真机连接原型。该面板与主计时隔离，用来验证协议和身份；不能据此声称蓝牙自动计时已经完整交付。
- macOS真实睡眠事件、可见性、保持唤醒与退出确认原型。

第一阶段状态、实测证据和未完成项见 [实施记录](docs/implementation-status.md)。

## 运行与检查

固定开发环境：Flutter 3.35.7，commit `adc901062556672b4138e18a4dc62a4be8f4b3c2`，Dart3.9.2；所有Dart依赖锁在 `pubspec.lock`。SDK位于忽略的 `.toolchain/`，不进入应用运行依赖。

```sh
cd app_flutter
./tool/bootstrap.sh
./tool/check.sh
```

安装完整Xcode及CocoaPods后可用标准Flutter macOS宿主构建：

```sh
.toolchain/flutter/bin/flutter build macos --release
```

本机也提供**实验性CLT打包**，可在只有Apple Command Line Tools时组合官方Flutter Release资源和AppKit宿主：

```sh
./tool/build-macos-prototype.sh
```

输出：`build/prototype/TrainTimer Flutter Prototype.app`。这是ARM64、ad hoc签名、未公证的本地原型；不等同于标准Xcode构建、正式发行版或macOS12兼容性通过。打包默认重新编译Dart资源，记录源码/二进制哈希，构建期间源文件变化会拒绝替换旧产物。

Windows在相应架构的Windows宿主上执行 `tool/build-windows.ps1 -Architecture x64` 或 `-Architecture arm64`。当前没有Windows工具链和测试机，两种架构均未声称构建通过。

## 数据隔离

默认路径由 `path_provider` 取得新版bundle的Application Support，再使用 `TrainTimerFlutter/v1/traintimer.sqlite`。不会扫描、导入或改写旧版 `~/.train-timer`。旧数据迁移入口尚未交付。

测试时可显式设置 `TRAIN_TIMER_FLUTTER_DATA` 指定新版测试目录，`TRAIN_TIMER_SOLVER` 指向本地测试动态库。不要把新版测试目录指向旧版数据。

## 证据与范围

[求解器回归](native/min2phase/README.md)、[百万/两百万条存储基准](benchmarks/README.md)分别说明测量范围。存储延迟不是UI延迟，求解时间不是无线链路延迟，单元测试也不能替代真机验收。

完整项目打乱、自动纠错整条链路、蓝牙计时整合、CFOP/OP、复盘、各格式导入导出、自动备份轮换、详情精简、原生Liquid Glass及正式安装包仍须按计划后续阶段实施；不以占位控件标记完成。

## 许可证

项目沿用GPL-3.0-or-later。min2phase固定上游、可移植补丁和许可证全文位于 `native/min2phase/`。实验包包含源码来源说明及第三方许可声明。
