import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/cube/cube_move.dart';
import '../../core/cube/cube_state.dart';
import '../../core/timing/monotonic_clock.dart';
import '../../devices/devices.dart' as ble;
import '../../rendering/cube3d/cube_view.dart';

/// Explicit, user-operated hardware prototype. No event enters the main timer.
class BluetoothPrototype extends StatefulWidget {
  const BluetoothPrototype({super.key, this.visible = true});

  final bool visible;

  @override
  State<BluetoothPrototype> createState() => _BluetoothPrototypeState();
}

typedef _Preview = ({
  CubeState state,
  CubeMove? move,
  int count,
  bool synchronized,
});

class _BluetoothPrototypeState extends State<BluetoothPrototype> {
  final _clock = StopwatchClock();
  late final _transport = ble.NativeBleTransport(clock: _clock);
  final _form = GlobalKey<FormState>();
  final _mac = TextEditingController();
  final _found = <String, ble.DiscoveredDevice>{};
  final _devices = ValueNotifier<List<ble.DiscoveredDevice>>([]);
  final _logs = ValueNotifier<List<String>>([]);
  final _pose = ValueNotifier<ble.CubePose?>(null);
  CubeOrientation _poseReference = CubeOrientation.identity;
  final _battery = ValueNotifier<int?>(null);
  final _preview = ValueNotifier<_Preview>((
    state: CubeState.solved(),
    move: null,
    count: 0,
    synchronized: false,
  ));
  StreamSubscription<ble.DiscoveredDevice>? _scanSubscription;
  // ignore: cancel_subscriptions -- _releaseProtocol owns cancellation on every exit.
  StreamSubscription<ble.RawNotification>? _packetSubscription;
  StreamSubscription<String?>? _disconnectSubscription;
  StreamSubscription<ble.NativeBleFailure>? _errorSubscription;
  ble.GanGen4Protocol? _protocol;
  String? _selected;
  String _status = '未连接';
  String? _error;
  bool _scanning = false;
  bool _connecting = false;
  bool _connected = false;
  bool _closing = false;
  int _keyVersion = 0;
  int _generation = 0;
  int _scanGeneration = 0;
  String? _autofilledMac;

  String? get _candidateMac =>
      _selected == null || !_found.containsKey(_selected)
      ? null
      : ble.ganGen4MacCandidate(_found[_selected]!);

  void _selectDevice(String? value) {
    setState(() {
      _selected = value;
      final candidate = _candidateMac;
      if (candidate != null &&
          (_mac.text.isEmpty || _mac.text == _autofilledMac)) {
        _mac.text = candidate;
        _autofilledMac = candidate;
      }
    });
  }

  @override
  void initState() {
    super.initState();
    _disconnectSubscription = _transport.onDisconnected.listen((reason) {
      if (!mounted || _closing) return;
      _generation++;
      _connected = false;
      _connecting = false;
      _status = '连接已断开';
      _log('断开：${reason ?? '原生连接已结束'}');
      unawaited(_releaseProtocol());
      setState(() {});
    });
    _errorSubscription = _transport.errors.listen((error) {
      if (!mounted || _closing) return;
      _log('${error.code}：${error.message}');
      setState(() => _error = error.message);
    });
  }

  void _log(String message) {
    if (!mounted || _closing) return;
    final bounded = message.length > 400 ? message.substring(0, 400) : message;
    _logs.value = [
      '${(_clock.now.inMilliseconds / 1000).toStringAsFixed(3)}  $bounded',
      ..._logs.value.take(63),
    ];
  }

  Future<void> _scan() async {
    if (_connecting || _connected || _scanning) return;
    final generation = ++_scanGeneration;
    final previous = _scanSubscription;
    _scanSubscription = null;
    _found.clear();
    _devices.value = const [];
    setState(() {
      _selected = null;
      _scanning = true;
      _error = null;
      _status = '检查蓝牙权限…';
    });
    try {
      await previous?.cancel();
      if (!mounted || _closing || generation != _scanGeneration) return;
      final permission = await _transport.requestPermission();
      if (!mounted || _closing || generation != _scanGeneration) return;
      if (permission != ble.BluetoothPermission.granted) {
        throw StateError('蓝牙权限/适配器状态：${permission.name}。请检查系统蓝牙与应用权限。');
      }
      _status = '正在扫描，请选择 GAN i4';
      _scanSubscription = _transport.scan().listen(
        (device) {
          if (_closing || !mounted || generation != _scanGeneration) return;
          if (!_found.containsKey(device.id) && _found.length >= 32) {
            if (!_isGan(device)) return;
            final replaceable = _found.entries.where(
              (entry) => !_isGan(entry.value) && entry.key != _selected,
            );
            if (replaceable.isEmpty) return;
            _found.remove(replaceable.first.key);
          }
          _found[device.id] = device;
          final devices = _found.values.toList()
            ..sort((a, b) => (_isGan(b) ? 1 : 0).compareTo(_isGan(a) ? 1 : 0));
          _devices.value = List.unmodifiable(devices);
        },
        onError: (Object error) {
          if (!mounted || _closing || generation != _scanGeneration) return;
          _scanGeneration++;
          final failed = _scanSubscription;
          _scanSubscription = null;
          if (failed != null) unawaited(failed.cancel());
          setState(() {
            _error = '$error';
            _scanning = false;
            _status = '扫描未完成';
          });
        },
      );
      if (mounted) setState(() {});
    } catch (error) {
      if (mounted && !_closing && generation == _scanGeneration) {
        setState(() {
          _error = '$error';
          _scanning = false;
          _status = '扫描不可用';
        });
      }
    }
  }

  Future<void> _stopScan() async {
    _scanGeneration++;
    final subscription = _scanSubscription;
    _scanSubscription = null;
    await subscription?.cancel();
    await _transport.stopScan();
    if (mounted && !_closing) setState(() => _scanning = false);
  }

  static bool _isGan(ble.DiscoveredDevice device) =>
      device.name.toLowerCase().startsWith('gan') ||
      device.services.any(
        (service) => ble.normalizeBleUuid(service) == ble.ganGen4Service,
      );

  Future<void> _connect() async {
    if (_connecting || _connected || !_form.currentState!.validate()) return;
    if (_selected == null) {
      setState(() => _error = '请先扫描并选择设备。');
      return;
    }
    final generation = ++_generation;
    final protocol = ble.GanGen4Protocol(
      mac: _mac.text.trim(),
      keyVersion: _keyVersion,
    );
    _preview.value = (
      state: CubeState.solved(),
      move: null,
      count: 0,
      synchronized: false,
    );
    _pose.value = null;
    _poseReference = CubeOrientation.identity;
    _battery.value = null;
    setState(() {
      _connecting = true;
      _error = null;
      _status = '连接设备…';
    });
    try {
      await _stopScan();
      await _transport.connect(_selected!);
      if (!mounted || _closing || generation != _generation) return;
      final characteristics = await _transport.discoverCharacteristics();
      if (!mounted || _closing || generation != _generation) return;
      final readable = characteristics.where(
        (characteristic) =>
            ble.normalizeBleUuid(characteristic.service) ==
                ble.ganGen4Service &&
            ble.normalizeBleUuid(characteristic.characteristic) ==
                ble.ganGen4Read &&
            characteristic.canNotify,
      );
      if (readable.isEmpty) throw StateError('设备未提供 GAN Gen4 通知特征。');
      _protocol = protocol;
      final pending = <ble.RawNotification>[];
      var pendingOverflow = false;
      var initialized = false;
      _packetSubscription = _transport
          .subscribe(readable.first)
          .listen(
            (packet) {
              if (!mounted || _closing || generation != _generation) return;
              if (!initialized) {
                if (pending.length < 32) {
                  pending.add(packet);
                } else {
                  pendingOverflow = true;
                }
                return;
              }
              _decode(protocol, packet);
            },
            onError: (Object error) {
              _log('通知失败：$error');
              if (mounted && !_closing) setState(() => _error = '$error');
            },
          );
      await _transport.notificationsReady(readable.first);
      if (!mounted || _closing || generation != _generation) return;
      _status = '通知已启用，发送 GAN 初始化请求…';
      await protocol.initialize(
        _transport,
        ble.DeviceSource(
          deviceId: _selected!,
          protocol: protocol.id,
          connectionEpoch: generation,
        ),
        discovered: characteristics,
      );
      if (!mounted || _closing || generation != _generation) return;
      initialized = true;
      for (final packet in pending) {
        _decode(protocol, packet);
      }
      pending.clear();
      if (pendingOverflow) {
        _log('初始化缓存已达 32 包，期间动作可能缺失；正在重新请求当前状态。');
        await protocol.requestState();
      }
      _log('已订阅 GAN Gen4，初始化请求已发送。请转层，检查状态与姿态。');
      setState(() {
        _connected = true;
        _connecting = false;
        _status = 'GAN Gen4 已连接';
      });
    } catch (error) {
      if (!mounted || _closing || generation != _generation) return;
      await _releaseProtocol();
      try {
        await _transport.disconnect();
      } catch (_) {
        /* Preserve original error. */
      }
      if (!mounted || _closing) return;
      _log('连接/初始化失败：$error');
      setState(() {
        _error = '$error';
        _connecting = false;
        _connected = false;
        _status = '连接未完成';
      });
    }
  }

  void _decode(ble.GanGen4Protocol protocol, ble.RawNotification packet) {
    try {
      for (final event in protocol.decode(packet)) {
        switch (event) {
          case ble.CubeTurn():
            if (event.quality.origin != ble.EventOrigin.live) {
              _log('历史转层 ${event.moveSequence} ${event.notation}，不作为新动作');
              continue;
            }
            final move = CubeMove.parse(event.notation);
            final current = _preview.value;
            _preview.value = (
              state: current.state.apply(move),
              move: move,
              count: current.count + 1,
              synchronized:
                  current.synchronized && event.quality.missingMoves == 0,
            );
            _log(
              '动作 ${event.moveSequence} ${event.notation}'
              '${event.quality.missingMoves > 0 ? ' · 缺 ${event.quality.missingMoves} 步' : ''}',
            );
          case ble.CubeStateSnapshot():
            if (!event.quality.trusted) {
              _log('过期状态包 counter=${event.lastMoveSequence}，不覆盖当前状态');
              continue;
            }
            final current = _preview.value;
            final state = CubeState(
              event.facelets.map((face) => 'URFDLB'[face]).join(),
            );
            _preview.value = (
              state: state,
              move: null,
              count: current.count,
              synchronized: true,
            );
            _log(
              '完整状态同步 counter=${event.lastMoveSequence} · ${state.isSolved ? '已复原' : '未复原'}'
              '${event.quality.missingMoves > 0 ? ' · 历史缺 ${event.quality.missingMoves} 步' : ''}',
            );
          case ble.CubePose():
            _pose.value = event;
          case ble.CubeBattery():
            _battery.value = event.percent;
            _log('电量 ${event.percent}%');
          case ble.CubeHistory():
            _log(
              '历史包 ${event.rawStartCounter}：${event.moves.join(' ')}；不作为新动作',
            );
          case ble.DeviceDiagnostic():
            _log('${event.code}：${event.message}');
          case ble.ConnectionChanged():
            break;
        }
      }
    } catch (error) {
      _log('包未采用：$error。检查 MAC/密钥版本或重新连接。');
    }
  }

  Future<void> _releaseProtocol() async {
    final subscription = _packetSubscription;
    final protocol = _protocol;
    _packetSubscription = null;
    _protocol = null;
    await subscription?.cancel();
    await protocol?.dispose();
  }

  Future<void> _disconnect() async {
    _generation++;
    await _releaseProtocol();
    try {
      await _transport.disconnect();
    } catch (error) {
      _log('断开返回：$error');
    }
    if (mounted && !_closing) {
      setState(() {
        _connected = false;
        _connecting = false;
        _status = '已主动断开';
      });
    }
  }

  @override
  void dispose() {
    _closing = true;
    _generation++;
    unawaited(_shutdown());
    _mac.dispose();
    _devices.dispose();
    _logs.dispose();
    _pose.dispose();
    _battery.dispose();
    _preview.dispose();
    super.dispose();
  }

  Future<void> _shutdown() async {
    await _scanSubscription?.cancel();
    await _disconnectSubscription?.cancel();
    await _errorSubscription?.cancel();
    await _releaseProtocol();
    try {
      await _transport.stopScan();
    } catch (_) {
      /* Unsupported platforms. */
    }
    try {
      await _transport.disconnect();
    } catch (_) {
      /* Closing native resources. */
    }
    await _transport.dispose();
  }

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('GAN i4 连接原型', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          const Text('用于验证连接、每一步、完整状态与姿态数据。此处不生成成绩。'),
          const SizedBox(height: 16),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              FilledButton.icon(
                onPressed: _connecting || _connected || _scanning
                    ? null
                    : () => unawaited(_scan()),
                icon: const Icon(Icons.bluetooth_searching),
                label: const Text('扫描设备'),
              ),
              if (_scanning)
                OutlinedButton(
                  onPressed: () => unawaited(
                    _stopScan().catchError((Object error) {
                      if (mounted) setState(() => _error = '$error');
                    }),
                  ),
                  child: const Text('停止扫描'),
                ),
              Text(_status),
            ],
          ),
          const SizedBox(height: 16),
          ValueListenableBuilder<List<ble.DiscoveredDevice>>(
            valueListenable: _devices,
            builder: (context, devices, _) => DropdownButtonFormField<String>(
              initialValue: _selected,
              isExpanded: true,
              decoration: const InputDecoration(labelText: '选择蓝牙设备'),
              items: [
                for (final device in devices)
                  DropdownMenuItem(
                    value: device.id,
                    child: Text(
                      '${device.name.isEmpty ? '未命名' : device.name} · ${device.id}',
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
              ],
              onChanged: _connecting || _connected ? null : _selectDevice,
            ),
          ),
          const SizedBox(height: 16),
          Form(
            key: _form,
            child: TextFormField(
              controller: _mac,
              enabled: !_connecting && !_connected,
              decoration: const InputDecoration(
                labelText: 'GAN MAC 地址',
                hintText: '01:02:03:04:05:06',
                helperText: '广播候选可编辑；macOS 设备 UUID 不能用于解密。收到合法完整状态后才确认候选。',
                helperMaxLines: 3,
              ),
              validator: (value) {
                try {
                  ble.GanGen4Codec(mac: value?.trim() ?? '');
                  return null;
                } catch (_) {
                  return '请输入 6 字节 MAC 地址，例如 01:02:03:04:05:06。';
                }
              },
            ),
          ),
          if (_candidateMac != null)
            Wrap(
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 8,
              children: [
                Text('广播候选 MAC：$_candidateMac（待合法状态确认）'),
                TextButton(
                  onPressed: _connecting || _connected
                      ? null
                      : () {
                          _mac.text = _candidateMac!;
                          _autofilledMac = _candidateMac;
                        },
                  child: const Text('填入候选'),
                ),
              ],
            ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 12,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              const Text('密钥版本'),
              SegmentedButton<int>(
                segments: const [
                  ButtonSegment(value: 0, label: Text('0')),
                  ButtonSegment(value: 1, label: Text('1')),
                ],
                selected: {_keyVersion},
                onSelectionChanged: _connecting || _connected
                    ? null
                    : (value) => setState(() => _keyVersion = value.single),
              ),
              FilledButton(
                onPressed: _connecting || _connected
                    ? null
                    : () => unawaited(_connect()),
                child: Text(_connecting ? '正在连接…' : '连接并初始化'),
              ),
              OutlinedButton(
                onPressed: !_connecting && !_connected
                    ? null
                    : () => unawaited(_disconnect()),
                child: const Text('主动断开'),
              ),
            ],
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: SelectableText(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          const SizedBox(height: 16),
          ValueListenableBuilder<_Preview>(
            valueListenable: _preview,
            builder: (context, preview, _) => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${preview.synchronized ? '已接收完整状态' : '等待状态同步，当前为演示基线'} · 动作 ${preview.count}',
                ),
                SizedBox(
                  height: 260,
                  width: 300,
                  child: ValueListenableBuilder<ble.CubePose?>(
                    valueListenable: _pose,
                    builder: (_, pose, _) => CubeView(
                      state: preview.state,
                      lastMove: preview.move,
                      visible: widget.visible,
                      orientation: pose == null
                          ? CubeOrientation.identity
                          : CubeOrientation.fromGan(
                              x: pose.x,
                              y: pose.y,
                              z: pose.z,
                              w: pose.w,
                            ).relativeTo(_poseReference),
                    ),
                  ),
                ),
              ],
            ),
          ),
          ValueListenableBuilder<int?>(
            valueListenable: _battery,
            builder: (_, battery, _) =>
                Text('电量：${battery == null ? '等待设备' : '$battery%'}'),
          ),
          const SizedBox(height: 8),
          ValueListenableBuilder<ble.CubePose?>(
            valueListenable: _pose,
            builder: (_, pose, _) => SelectableText(
              pose == null
                  ? '姿态：等待设备'
                  : '姿态 q(x,y,z,w)：${[pose.x, pose.y, pose.z, pose.w].map((v) => v.toStringAsFixed(4)).join(', ')}',
            ),
          ),
          OutlinedButton(
            onPressed: _pose.value == null
                ? null
                : () {
                    final pose = _pose.value!;
                    setState(
                      () => _poseReference = CubeOrientation.fromGan(
                        x: pose.x,
                        y: pose.y,
                        z: pose.z,
                        w: pose.w,
                      ),
                    );
                  },
            child: const Text('以当前姿态为参考'),
          ),
          const Text('姿态独立驱动 3D，不计作转层。方向、平滑与设备时间仍需真机验收。'),
          const SizedBox(height: 16),
          Text('最新 64 条诊断', style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          SizedBox(
            height: 200,
            child: ValueListenableBuilder<List<String>>(
              valueListenable: _logs,
              builder: (_, logs, _) => ListView.builder(
                itemCount: logs.length,
                itemBuilder: (_, index) => SelectableText(logs[index]),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}
