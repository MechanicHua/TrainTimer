# TrainTimer

本地命令行魔方计时器，支持成绩记录、毫秒级显示、15 秒观察倒计时，以及项目内置的 TNoodle CLI 打乱公式生成。

## 运行

网页界面：

```bash
npm run web
```

启动后用浏览器打开终端输出的 `http://127.0.0.1:端口` 地址。网页需要本地服务提供 API，不建议直接用 `file://` 打开 `public/index.html`。

命令行界面：

```bash
npm start
```

开启观察时间：

```bash
npm start -- --inspection
```

关闭观察时间：

```bash
npm start -- --no-inspection
```

查看最近成绩：

```bash
npm start -- history
```

## 按键

- 准备状态：开启观察时按 `Space` 开始观察；未开启观察时持续按住 `Space` 超过 0.5 秒后松开才开始计时，短按不会启动。
- 观察状态：持续按住 `Space` 超过 0.5 秒后松开才开始计时，短按不会启动；第 8 秒和第 12 秒会响铃提醒；超过 15 秒开始计时会自动记 `+2`，超过 17 秒会自动记 `DNF`。
- 计时状态：按任意键结束并记录成绩。
- 已记录状态：按 `O` 把上一把设为 OK，按 `2` 设为 `+2`，按 `D` 设为 `DNF`，按 `Backspace/Delete` 删除上一把。
- 退出：按 `q`、`Esc` 或 `Ctrl+C`。

## 网页功能

- 计时器、观察倒计时和成绩统计。
- 支持会话管理，并按当前会话显示次数、最佳、平均、mo3、ao5、ao12、最佳 mo3、最佳 ao5、最佳 ao12、统计详情、更多最佳滚动平均、最近成绩、成绩表逐条 ao5/ao12 和 PB 刷新标记、成绩趋势图和统计摘要复制。
- 历史成绩读取同一个本地 JSON 文件。
- 打乱公式由内置 TNoodle CLI 生成。
- 打乱结果预览优先使用 TNoodle `draw` 输出的 2D 展开图，确保预览状态和 TNoodle 打乱定义一致；TNoodle 预览不可用时会回退到本地 3x3 状态渲染。
- 成绩管理支持手动录入、上一把快速 OK/+2/DNF/删除、单条删除、选中删除、批量标记 OK/+2/DNF、批量标签、清空当前会话、删除会话后撤销恢复、撤销最近一次删除/移动/标记/标签/导入、查看全部成绩、按成绩/罚时/标签/备注/打乱筛选全部成绩、按日期/成绩/罚时/备注排序、选中成绩移动到其他会话、单次成绩详情、原始成绩编辑、打乱公式编辑、备注、标签、打乱公式复制、单次成绩详情复制、当前会话/当前筛选列表/选中成绩/全部数据的 JSON/CSV 导出、当前会话/当前筛选列表/选中成绩/全部数据的 csTimer CSV 导出，以及带预览确认的 JSON/CSV/csTimer CSV 导入；导入或合并时会自动处理重复成绩 ID，避免后续编辑或删除误命中多条。
- 蓝牙魔方连接使用浏览器 Web Bluetooth；需要支持 Web Bluetooth 的浏览器和真实设备。网页会枚举 GATT 服务、订阅 notify/indicate 特征，并在状态栏、蓝牙日志和控制台显示设备发出的原始数据。默认连接会按常见智能魔方名称筛选设备，“兼容扫描”会列出更多蓝牙设备，方便连接名称不在默认列表里的魔方；浏览器保存过授权后，可用“重连”直接连接已授权设备。若设备提供标准 Battery Service，会读取并显示电量；GoCube / Rubik's Connected 会通过 Nordic UART 自动请求状态和电量，并解析其二进制转动包；Giiker / Mi Smart 会解析 20 字节状态包中的最新转动，并向电量服务发送查询。日志也会尝试把通知中的标准转动记号、JSON 转动字段或分隔符转动串解析为转动流；正式计时开始前的预备转动只写入日志，不计入本把成绩，计时中解析到的转动会应用到当前打乱状态上显示是否已复原，蓝牙日志会同步显示当前魔方展开状态，检测到已复原会自动停表并保存成绩。成绩详情和导出数据会保留手动/蓝牙停表来源、本把蓝牙转动序列、转动数、TPS 和单次蓝牙复盘状态，便于继续接入更多具体品牌协议和排查设备数据。

## 成绩文件

默认写入：

```text
~/.train-timer/solves.json
```

可以用环境变量改位置：

```bash
TRAIN_TIMER_HISTORY=/path/to/solves.json npm start
```

## TNoodle 打乱

TNoodle 是 WCA 官方打乱程序项目：https://github.com/thewca/tnoodle

项目内置了 `vendor/tnoodle-cli-1.1.1.jar`，默认通过它调用 TNoodle 核心打乱引擎生成打乱公式。需要 Java 11 或更高版本。

也可以用外部 TNoodle 兼容 CLI 覆盖默认来源：

```bash
TNOODLE_CMD=/path/to/tnoodle npm start
```

或者调用可执行 jar：

```bash
TNOODLE_JAR=/path/to/tnoodle-cli.jar npm start
```

可指定 puzzle，默认是 `three`：

```bash
TNOODLE_PUZZLE=three npm start
```

如果本机未安装 TNoodle 命令或未配置 `TNOODLE_JAR`，程序会使用本地备用 3x3 随机步打乱，并在界面中明确提示。正式 WCA 用途应使用当前官方 TNoodle 程序。
如果需要强制禁用项目内置 JAR 来测试备用路径：

```bash
TRAIN_TIMER_DISABLE_BUNDLED_TNOODLE=1 npm start
```

## 许可证

项目内置的 TNoodle CLI 使用 GPLv3，因为它依赖 WCA `tnoodle-lib`。因此本项目元数据标记为 `GPL-3.0-or-later`。
