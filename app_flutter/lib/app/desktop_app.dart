import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../features/timer/timer_page.dart';
import '../features/history/history_page.dart';
import '../features/statistics/statistics_page.dart';
import '../features/settings/settings_page.dart';
import '../ui/theme/app_theme.dart';
import 'app_model.dart';

class TrainTimerApp extends StatefulWidget {
  const TrainTimerApp({super.key, required this.model});
  final AppModel model;
  @override
  State<TrainTimerApp> createState() => _TrainTimerAppState();
}

class _TrainTimerAppState extends State<TrainTimerApp>
    with WidgetsBindingObserver {
  final _navigator = GlobalKey<NavigatorState>();
  static const _platform = MethodChannel('dev.traintimer/platform');
  ThemeMode _theme = ThemeMode.system;
  int _page = 0;
  bool _visible = true, _keepAwake = false, _preventClose = false;
  bool _closingDialog = false;
  bool _ownsStart = false;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    widget.model.addListener(_changed);
    HardwareKeyboard.instance.addHandler(_key);
    _platform.setMethodCallHandler(_nativeEvent);
  }

  void _changed() {
    final m = widget.model;
    final awake = m.timer.snapshot.shouldKeepAwake;
    if (_keepAwake != awake) {
      _keepAwake = awake;
      unawaited(_send('setKeepAwake', awake));
    }
    if (_preventClose != m.active) {
      _preventClose = m.active;
      unawaited(_send('setPreventClose', m.active));
    }
    if (mounted) setState(() {});
  }

  Future<void> _send(String method, Object? arguments) async {
    try {
      await _platform.invokeMethod<void>(method, arguments);
    } on MissingPluginException {
      /* Platform limits are listed in the phase report. */
    } on PlatformException catch (e) {
      final context = _navigator.currentContext;
      if (mounted && context != null && context.mounted) {
        ScaffoldMessenger.maybeOf(
          context,
        )?.showSnackBar(SnackBar(content: Text('系统能力失败：${e.message}')));
      }
    }
  }

  Future<void> _nativeEvent(MethodCall call) async {
    switch (call.method) {
      case 'systemSleep':
        widget.model.sleep();
      case 'visibilityChanged':
        if (mounted) setState(() => _visible = call.arguments as bool);
      case 'requestClose':
        if (_closingDialog) return;
        _closingDialog = true;
        final close = await showDialog<bool>(
          context: _navigator.currentContext!,
          builder: (context) => AlertDialog(
            title: const Text('结束当前计时并退出？'),
            content: const Text('当前记录会保存为 DNF。'),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('继续计时'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('保存并退出'),
              ),
            ],
          ),
        );
        _closingDialog = false;
        if (close == true) {
          if (widget.model.timer.phase.name == 'running') {
            widget.model.timer.escape();
          } else {
            widget.model.timer.systemSleep();
            widget.model.timer.resolveInterruption(keepAsDnf: true);
          }
          await widget.model.savePending();
          if (widget.model.timer.phase.name == 'completed') {
            await _send('closeApproved', null);
          }
        }
    }
  }

  bool _key(KeyEvent event) {
    final focus = FocusManager.instance.primaryFocus;
    final keyboard = HardwareKeyboard.instance;
    final excluded =
        _page != 0 ||
        _closingDialog ||
        (_navigator.currentState?.canPop() ?? false) ||
        focus?.context?.findAncestorWidgetOfExactType<EditableText>() != null ||
        focus?.context?.widget is EditableText ||
        keyboard.isControlPressed ||
        keyboard.isMetaPressed ||
        keyboard.isAltPressed;
    final key = event.logicalKey;
    if (event is KeyUpEvent && key == LogicalKeyboardKey.space && _ownsStart) {
      _ownsStart = false;
      widget.model.keyUp(inputAllowed: !excluded && !event.synthesized);
      return true;
    }
    if (excluded || event is KeyRepeatEvent || event.synthesized) return false;
    if (event is! KeyDownEvent) return false;
    if (key == LogicalKeyboardKey.space) {
      _ownsStart = widget.model.canInput;
      widget.model.keyDown(start: true);
      return true;
    }
    if (key == LogicalKeyboardKey.escape) {
      widget.model.keyDown(start: false, escape: true);
      return true;
    }
    if (widget.model.timer.phase.name == 'running' &&
        key.keyLabel.length == 1) {
      widget.model.keyDown(start: false);
      return true;
    }
    return false;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.inactive && _ownsStart) {
      _ownsStart = false;
      widget.model.keyUp(inputAllowed: false);
    }
    // Inactive is focus loss, not invisibility or system sleep.
    if (state == AppLifecycleState.hidden ||
        state == AppLifecycleState.paused) {
      setState(() => _visible = false);
    } else if (state == AppLifecycleState.resumed) {
      setState(() => _visible = true);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    widget.model.removeListener(_changed);
    HardwareKeyboard.instance.removeHandler(_key);
    _platform.setMethodCallHandler(null);
    unawaited(_send('setKeepAwake', false));
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    navigatorKey: _navigator,
    title: 'TrainTimer',
    debugShowCheckedModeBanner: false,
    themeMode: _theme,
    theme: AppTheme.create(Brightness.light),
    darkTheme: AppTheme.create(Brightness.dark),
    home: Builder(
      builder: (context) => Scaffold(
        body: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 24,
                  vertical: 12,
                ),
                child: Row(
                  children: [
                    const Icon(Icons.grid_view_rounded, size: 28),
                    const SizedBox(width: 12),
                    const Text(
                      'TrainTimer',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(width: 12),
                    const Text('Flutter 原型', style: TextStyle(fontSize: 12)),
                    const Spacer(),
                    DropdownButton<String>(
                      value: widget.model.sessionId,
                      items: [
                        for (final session in widget.model.sessions)
                          DropdownMenuItem(
                            value: session.id,
                            child: Text(session.name),
                          ),
                      ],
                      onChanged: widget.model.active
                          ? null
                          : (id) => unawaited(widget.model.selectSession(id!)),
                    ),
                    IconButton(
                      tooltip: '新建会话',
                      onPressed: widget.model.active
                          ? null
                          : () => _newSession(context),
                      icon: const Icon(Icons.add_rounded),
                    ),
                  ],
                ),
              ),
              if (widget.model.error != null)
                MaterialBanner(
                  content: Text(
                    widget.model.error!,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => unawaited(widget.model.nextScramble()),
                      child: const Text('重试'),
                    ),
                  ],
                ),
              if (widget.model.recovered.isNotEmpty)
                MaterialBanner(
                  content: const Text('检测到未完成的记录，处理后可继续计时。'),
                  actions: [
                    TextButton(
                      onPressed: () => unawaited(
                        widget.model.resolveRecovered(
                          widget.model.recovered.first,
                          false,
                        ),
                      ),
                      child: const Text('丢弃'),
                    ),
                    TextButton(
                      onPressed: () => unawaited(
                        widget.model.resolveRecovered(
                          widget.model.recovered.first,
                          true,
                        ),
                      ),
                      child: const Text('记为 DNF'),
                    ),
                  ],
                ),
              Expanded(
                child: Row(
                  children: [
                    NavigationRail(
                      selectedIndex: _page,
                      onDestinationSelected: widget.model.active
                          ? null
                          : (value) => setState(() => _page = value),
                      labelType: NavigationRailLabelType.all,
                      destinations: const [
                        NavigationRailDestination(
                          icon: Icon(Icons.timer_outlined),
                          label: Text('计时'),
                        ),
                        NavigationRailDestination(
                          icon: Icon(Icons.history_rounded),
                          label: Text('历史'),
                        ),
                        NavigationRailDestination(
                          icon: Icon(Icons.bar_chart_rounded),
                          label: Text('统计'),
                        ),
                        NavigationRailDestination(
                          icon: Icon(Icons.tune_rounded),
                          label: Text('设置'),
                        ),
                      ],
                    ),
                    const VerticalDivider(width: 1),
                    Expanded(
                      child: switch (_page) {
                        0 => TimerPage(model: widget.model, visible: _visible),
                        1 => HistoryPage(
                          key: ValueKey(widget.model.sessionId),
                          model: widget.model,
                        ),
                        2 => StatisticsPage(model: widget.model),
                        _ => SettingsPage(
                          visible: _visible,
                          model: widget.model,
                          themeMode: _theme,
                          onThemeChanged: (mode) =>
                              setState(() => _theme = mode),
                        ),
                      },
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );

  Future<void> _newSession(BuildContext context) async {
    var input = '';
    final name = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('新建三阶会话'),
        content: TextFormField(
          initialValue: input,
          onChanged: (value) => input = value,
          autofocus: true,
          decoration: const InputDecoration(labelText: '会话名称'),
          onFieldSubmitted: (value) => Navigator.pop(context, value),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, input),
            child: const Text('创建'),
          ),
        ],
      ),
    );
    if (name != null) await widget.model.addSession(name);
  }
}
