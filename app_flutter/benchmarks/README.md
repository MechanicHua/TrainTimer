# 第一阶段存储原型测量

本报告只证明存储夹具和 repository 往返结果；**尚未验收百万条历史从用户操作到 Flutter 摘要呈现 p95 ≤200 ms 的目标**。

## 环境与数据

- 本地日期：2026-10-19（Asia/Shanghai）；原始 JSON 同时记录 UTC 时间。
- MacBook Pro MacBookPro18,3，Apple M1 Pro，8 个逻辑处理器，16 GB 内存，arm64；系统版本见原始报告。
- Flutter 3.35.7 / Dart 3.9.2；Drift 与 sqlite3 Dart 依赖的准确解析版本见项目 pubspec.lock。
- Python 3.12.2 / sqlite3 3.45.1；WAL、synchronous=NORMAL、4096 字节页、Python 连接缓存32 MiB。
- 100 万条：单会话含 100 万条；80 万条有详情，20 万条有姿态，20 万条仅摘要。数据库 1,367,511,040 字节。
- 200 万条：保留百万条单会话，另有 20 个会话；160 万条有详情，40 万条有姿态，40 万条仅摘要。数据库 2,723,282,944 字节。
- 日期分布横跨一年，包含正常、+2、DNF。详情包含60/100/200个合成物理动作、相对时间和序号；姿态为120个时间戳/量化四元数并gzip压缩。它们是容量夹具，不能当成已验收的设备证据编码器。
- SQLite `quick_check` 在两种容量均为 `ok`。深页使用时间+ID元组游标；原始 `EXPLAIN QUERY PLAN` 证实全局时间索引及会话时间索引命中。只有夹具选取中间页游标时用 OFFSET，不进入计时路径。

## Drift后台执行器与repository

运行 Flutter test VM，通过真实 `NativeDatabase.createInBackground` 调用 repository。包含 Dart Future、isolate消息往返、SQLite和摘要对象映射；**没有 UI 绘制，也不是 Profile/Release 真机应用验收**。连接为暖态，操作系统缓存未清空且不可控，每种操作100次；页面50条。先测200万，再在同一个明确验证过的 disposable synthetic 夹具删除后100万并重建计数缓存，测100万。后一种条件包含先前暖缓存及删除操作的影响，不能解释成独立冷启动。

| 数据量 | 操作 | p50 ms | p95 ms | p99 ms |
| --- | --- | ---: | ---: | ---: |
| 1,000,000 | 首屏摘要 | 0.299 | 0.423 | 0.661 |
| 1,000,000 | 深页游标 | 0.305 | 0.392 | 0.431 |
| 1,000,000 | 百万条单会话 | 0.308 | 0.421 | 0.456 |
| 1,000,000 | 会话切换 | 0.293 | 0.469 | 0.544 |
| 1,000,000 | 计数/总时长缓存 | 0.111 | 0.171 | 0.222 |
| 1,000,000 | 详情和姿态 | 0.265 | 0.552 | 0.715 |
| 1,000,000 | 事务保存+详情+聚合 | 0.623 | 0.893 | 3.397 |
| 2,000,000 | 首屏摘要 | 0.511 | 1.435 | 3.027 |
| 2,000,000 | 深页游标 | 0.531 | 1.442 | 2.220 |
| 2,000,000 | 百万条单会话 | 0.519 | 1.162 | 1.533 |
| 2,000,000 | 会话切换 | 0.611 | 1.229 | 1.566 |
| 2,000,000 | 计数/总时长缓存 | 0.257 | 0.556 | 1.487 |
| 2,000,000 | 详情和姿态 | 0.650 | 1.289 | 1.608 |
| 2,000,000 | 事务保存+详情+聚合 | 1.270 | 3.307 | 8.564 |

详情与姿态测量包括两个按ID查询和返回字节，不包括解码/复盘。事务保存包含摘要、约426字节详情、两级聚合和数据修订号更新；样本清理在计时范围外。`aggregate_cache` 只读取精确计数/有效计数/总时长，并不代表CFOP、滚动平均或全量统计重建。

原始100次延迟、最慢值及运行环境：[drift-repository.json](results/drift-repository.json)。

## SQLite独立测量

Python sqlite3 同样使用生产schema文件，测量不含 Dart、Drift、isolate、UI 或绘制。首屏/分页/切会话各100次，统计重建5次。100万条重建p95 2476.504 ms；200万条重建p95 5389.190 ms。5次样本的p99近似最慢值，不足以推断稳定尾部性能。

统计重建是全表精确计数/有效计数/总时长扫描，不能置于UI回调或活动计时的单一数据库执行队列。夹具提供SQLite progress handler取消与事务回滚，但生产统计重建的有界批次、进度与调度仍需后续实现。

原始数据、p50/p95/p99、最慢值、查询计划、夹具结构、脚本/schema校验：[sqlite-capacity.json](results/sqlite-capacity.json)。

## 复现

在 app_flutter 中执行，使用本机 Python 3（仅标准库）与已安装的 Flutter：

```sh
python3 benchmarks/sqlite_benchmark.py
python3 benchmarks/create_drift_fixture.py /private/tmp/traintimer-capacity-fixture
flutter test benchmarks/drift_repository_benchmark.dart --dart-define=TRAINTIMER_BENCHMARK_DB=/private/tmp/traintimer-capacity-fixture/traintimer.sqlite
flutter test test/data
```

`sqlite_benchmark.py` 的数据库是临时文件，退出后自动删除。`create_drift_fixture.py` 要求目录不存在，生成供 Dart runner 使用的独立临时数据库；runner 明确验证恰好200万条、来源全为synthetic，然后将该一次性夹具减少为100万条。复测需新建夹具。夹具可占数GB，请自行管理其临时目录；报告只保留JSON，不提交数据库二进制。

## 仍待验收

实际 Flutter 页面请求到呈现、混合计时/3D/后台计算负载、冷启动/冷缓存、多次Profile/Release构建、Windows x64/ARM64及真实硬件；备份分块与限速、日常轮换、恢复切换、导入取消/磁盘不足、长时间内存曲线均未由本轮测量覆盖。数据库原型的一致性快照与SHA-256验证不等同于完整自动备份系统已交付。
