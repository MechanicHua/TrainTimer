import 'dart:async';
import 'package:flutter/material.dart';
import '../../app/app_model.dart';
import '../../core/cube/cube_move.dart';
import '../../core/timing/timing.dart';
import '../../rendering/cube3d/cube_view.dart';

String formatTime(int? microseconds) {
  if (microseconds == null) return 'DNF';
  final centiseconds = microseconds ~/ 10000;
  final seconds = centiseconds ~/ 100;
  return '${seconds >= 60 ? '${seconds ~/ 60}:' : ''}${seconds >= 60 ? (seconds % 60).toString().padLeft(2, '0') : seconds}.${(centiseconds % 100).toString().padLeft(2, '0')}';
}

class TimerPage extends StatelessWidget {
  const TimerPage({super.key, required this.model, required this.visible});
  final AppModel model;
  final bool visible;
  @override
  Widget build(BuildContext context) {
    final running = model.timer.phase == TimerPhase.running;
    return LayoutBuilder(
      builder: (context, box) => SingleChildScrollView(
        padding: EdgeInsets.symmetric(
          horizontal: box.maxWidth < 650 ? 16 : 40,
          vertical: 24,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Text(
                  running ? '专注复原' : '三阶 · 键盘计时',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const Spacer(),
                Chip(label: Text(running ? '计时中' : '离线原型')),
              ],
            ),
            const SizedBox(height: 24),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  children: [
                    Text('当前打乱', style: Theme.of(context).textTheme.labelLarge),
                    const SizedBox(height: 12),
                    if (model.generating)
                      const LinearProgressIndicator()
                    else
                      SelectableText(
                        model.scramble.isEmpty ? '等待本地求解器' : model.scramble,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 20,
                          height: 1.7,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    if (!running) ...[
                      const SizedBox(height: 8),
                      Text(
                        '合法随机状态原型 · TNoodle 生成规则待差分验收',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
            TimerDisplay(controller: model.timer, visible: visible),
            if (model.timer.phase == TimerPhase.interrupted) ...[
              const Text(
                '系统睡眠已中断本把。请选择处理方式，待处理记录不参与统计。',
                textAlign: TextAlign.center,
              ),
              Wrap(
                alignment: WrapAlignment.center,
                spacing: 12,
                children: [
                  FilledButton(
                    onPressed: () => unawaited(model.resolveInterrupted(true)),
                    child: const Text('记为 DNF'),
                  ),
                  OutlinedButton(
                    onPressed: () => unawaited(model.resolveInterrupted(false)),
                    child: const Text('丢弃中断记录'),
                  ),
                ],
              ),
            ],
            if (model.timer.snapshot.saveError != null)
              FilledButton(
                onPressed: () => unawaited(model.savePending()),
                child: const Text('重试保存成绩'),
              ),
            if (!running) ...[
              const SizedBox(height: 8),
              Wrap(
                alignment: WrapAlignment.center,
                spacing: 12,
                runSpacing: 8,
                children: [
                  FilledButton.icon(
                    onPressed: model.active || model.generating
                        ? null
                        : () => unawaited(model.nextScramble()),
                    icon: const Icon(Icons.refresh_rounded),
                    label: const Text('下一条打乱'),
                  ),
                  FilterChip(
                    label: const Text('15 秒观察'),
                    selected: model.inspectionEnabled,
                    onSelected: model.active ? null : model.configureInspection,
                  ),
                ],
              ),
              const SizedBox(height: 24),
              if (box.maxWidth > 760)
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: _CubePrototype(model: model, visible: visible),
                    ),
                    const SizedBox(width: 24),
                    Expanded(child: _Recent(model: model)),
                  ],
                )
              else ...[
                _CubePrototype(model: model, visible: visible),
                const SizedBox(height: 16),
                _Recent(model: model),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

class TimerDisplay extends StatefulWidget {
  const TimerDisplay({
    super.key,
    required this.controller,
    required this.visible,
  });
  final TimerController controller;
  final bool visible;
  @override
  State<TimerDisplay> createState() => _TimerDisplayState();
}

class _TimerDisplayState extends State<TimerDisplay> {
  Timer? _refresh;
  bool get _needsFrames =>
      widget.visible &&
      switch (widget.controller.phase) {
        TimerPhase.running ||
        TimerPhase.inspecting ||
        TimerPhase.holding => true,
        _ => false,
      };
  @override
  void initState() {
    super.initState();
    _schedule();
  }

  @override
  void didUpdateWidget(TimerDisplay oldWidget) {
    super.didUpdateWidget(oldWidget);
    _schedule();
  }

  void _schedule() {
    _refresh?.cancel();
    _refresh = null;
    if (_needsFrames) {
      _refresh = Timer.periodic(const Duration(milliseconds: 16), (_) {
        if (mounted) setState(() {});
      });
    }
  }

  @override
  void dispose() {
    _refresh?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.controller.snapshot;
    final observing =
        s.phase == TimerPhase.inspecting ||
        s.phase == TimerPhase.holding && s.inspection > Duration.zero;
    final time = observing
        ? (15 - s.inspection.inMicroseconds / 1000000).ceil().toString()
        : formatTime(s.elapsed.inMicroseconds);
    final hint = switch (s.phase) {
      TimerPhase.awaitingStart => '按住空格 0.5 秒，松开起表',
      TimerPhase.holding => s.holdReady ? '已准备 · 松开起表' : '继续按住空格',
      TimerPhase.inspecting =>
        s.penalty == SolvePenalty.none
            ? '观察中 · 按住空格后松开起表'
            : s.penalty == SolvePenalty.plusTwo
            ? '观察处罚 +2'
            : '观察处罚 DNF',
      TimerPhase.running => '任意普通按键停表 · Esc 记为 DNF',
      TimerPhase.saving => s.saveError == null ? '正在保存原始成绩…' : '保存失败 · 记录保留待重试',
      TimerPhase.completed => '成绩已保存 · 空格准备下一把',
      TimerPhase.interrupted => '中断记录待处理',
      TimerPhase.preparingScramble => '等待打乱到位',
    };
    return RepaintBoundary(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 32),
        child: Column(
          children: [
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                time,
                semanticsLabel: '计时 $time',
                style: TextStyle(
                  fontSize: 110,
                  fontWeight: FontWeight.w400,
                  letterSpacing: -4,
                  color: s.holdReady
                      ? Theme.of(context).colorScheme.primary
                      : null,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Text(hint, textAlign: TextAlign.center),
            if (s.phase == TimerPhase.completed &&
                s.penalty != SolvePenalty.none)
              Text(s.penalty == SolvePenalty.dnf ? 'DNF' : '罚时 +2，原始用时单独保留'),
          ],
        ),
      ),
    );
  }
}

class _CubePrototype extends StatefulWidget {
  const _CubePrototype({required this.model, required this.visible});
  final AppModel model;
  final bool visible;
  @override
  State<_CubePrototype> createState() => _CubePrototypeState();
}

class _CubePrototypeState extends State<_CubePrototype> {
  double _yaw = -.55;
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          Text('3D 绘制候选', style: Theme.of(context).textTheme.titleMedium),
          SizedBox(
            height: 220,
            width: 280,
            child: CubeView(
              state: widget.model.cube,
              lastMove: widget.model.lastMove,
              visible: widget.visible,
              yaw: _yaw,
            ),
          ),
          Wrap(
            spacing: 4,
            children: [
              for (final f in CubeFace.values)
                OutlinedButton(
                  onPressed: () => widget.model.previewMove(CubeMove(f, 1)),
                  child: Text(f.name.toUpperCase()),
                ),
            ],
          ),
          Slider(
            value: _yaw,
            min: -mathPi,
            max: mathPi,
            label: '视角',
            semanticFormatterCallback: (v) =>
                '视角 ${(v * 180 / mathPi).round()} 度',
            onChanged: (value) => setState(() => _yaw = value),
          ),
          const Text('手动转层与视角测试 · 静止停绘'),
        ],
      ),
    ),
  );
}

const mathPi = 3.141592653589793;

class _Recent extends StatelessWidget {
  const _Recent({required this.model});
  final AppModel model;
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('最近成绩', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 16),
          if (model.recent.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 36),
              child: Text('第一把，从这里开始。'),
            ),
          for (final solve in model.recent.take(5))
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(
                formatTime(solve.effectiveDurationUs),
                style: const TextStyle(fontSize: 24),
              ),
              trailing: Text(solve.penalty.name == 'plusTwo' ? '+2' : '三阶'),
              subtitle: Text(
                DateTime.fromMicrosecondsSinceEpoch(
                  solve.startedAtUs,
                  isUtc: true,
                ).toLocal().toString().substring(0, 19),
              ),
            ),
        ],
      ),
    ),
  );
}
