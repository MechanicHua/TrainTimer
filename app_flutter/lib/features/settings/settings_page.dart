import 'dart:async';
import 'package:flutter/material.dart';
import '../../app/app_model.dart';
import 'bluetooth_prototype.dart';

class SettingsPage extends StatefulWidget {
  const SettingsPage({
    super.key,
    required this.model,
    required this.themeMode,
    required this.onThemeChanged,
    this.visible = true,
  });
  final AppModel model;
  final ThemeMode themeMode;
  final ValueChanged<ThemeMode> onThemeChanged;
  final bool visible;
  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  bool _backingUp = false;
  String? _message;
  Future<void> _backup() async {
    setState(() => _backingUp = true);
    try {
      await widget.model.backup();
      _message = '快照已校验：${widget.model.lastBackup}';
    } catch (e) {
      _message = '快照未创建：$e';
    } finally {
      if (mounted) setState(() => _backingUp = false);
    }
  }

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(32),
    children: [
      Text('设置与原型状态', style: Theme.of(context).textTheme.headlineMedium),
      const SizedBox(height: 24),
      BluetoothPrototype(visible: widget.visible),
      const SizedBox(height: 16),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('外观', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 16),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final option in [
                    (ThemeMode.system, '跟随系统'),
                    (ThemeMode.light, '浅色'),
                    (ThemeMode.dark, '深色'),
                  ])
                    ChoiceChip(
                      label: Text(option.$2),
                      selected: widget.themeMode == option.$1,
                      onSelected: (_) => widget.onThemeChanged(option.$1),
                    ),
                ],
              ),
              const SizedBox(height: 16),
              const Text(
                '目前使用清晰的 Flutter 内容界面。系统原生 Liquid Glass 组合与旧系统回退仍待原型验收。',
              ),
            ],
          ),
        ),
      ),
      const SizedBox(height: 16),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('独立本地数据', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 12),
              SelectableText(widget.model.dataDirectory.path),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: _backingUp || widget.model.active
                    ? null
                    : () => unawaited(_backup()),
                icon: const Icon(Icons.backup_outlined),
                label: Text(_backingUp ? '正在校验快照…' : '创建一致性快照'),
              ),
              const SizedBox(height: 12),
              const Text('原型快照只在空闲时执行。自动轮换、可取消备份、导入导出和恢复界面属于后续阶段。'),
              if (_message != null)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: SelectableText(_message!),
                ),
            ],
          ),
        ),
      ),
      const SizedBox(height: 16),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('第一阶段验收', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 16),
              const _Status('min2phase', '1506 个回归样例已通过；Windows 构建待验证'),
              const _Status('GAN i4', '协议离线回归与原生传输原型；连接、身份、重连仍待真机验收'),
              const _Status('3D 后端', 'Canvas 投影候选；遮挡、高 DPI、双端帧率与 GPU 比较待测'),
              const _Status('SQLite', '百万与两百万混合数据基准；完整 UI 延迟待测'),
              const _Status(
                '平台交付',
                'macOS ARM64、Windows x64/ARM64 的正式构建和安装验收待完成',
              ),
            ],
          ),
        ),
      ),
    ],
  );
}

class _Status extends StatelessWidget {
  const _Status(this.title, this.detail);
  final String title, detail;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 4),
        Text(detail),
      ],
    ),
  );
}
