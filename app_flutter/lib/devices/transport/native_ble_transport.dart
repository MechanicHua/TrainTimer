import 'dart:async';

import 'package:flutter/services.dart';

import '../../core/timing/monotonic_clock.dart';
import '../device_events.dart';
import 'ble_transport.dart';

final class NativeBleFailure {
  const NativeBleFailure({required this.code, required this.message});
  final String code;
  final String message;
}

/// Thin Flutter platform boundary. GAN identity/crypto and timer state remain
/// outside the platform channel. Missing implementations fail explicitly.
final class NativeBleTransport implements BleTransport {
  NativeBleTransport({
    required this.clock,
    MethodChannel channel = const MethodChannel('dev.traintimer/ble'),
    EventChannel events = const EventChannel('dev.traintimer/ble/events'),
  }) : _channel = channel,
       _events = events;

  final MonotonicClock clock;
  final MethodChannel _channel;
  final EventChannel _events;
  final _discoveries = StreamController<DiscoveredDevice>.broadcast();
  final _notifications = StreamController<RawNotification>.broadcast();
  final _disconnections = StreamController<String?>.broadcast();
  final _connections = StreamController<ConnectionState>.broadcast();
  final _adapterStates = StreamController<String>.broadcast();
  final _errors = StreamController<NativeBleFailure>.broadcast();
  StreamSubscription<dynamic>? _eventSubscription;
  final Map<String, Future<void>> _subscriptionRequests = {};
  bool _disposed = false;

  Stream<String?> get onDisconnected => _disconnections.stream;
  Stream<ConnectionState> get connectionChanges => _connections.stream;
  Stream<String> get adapterStates => _adapterStates.stream;
  Stream<NativeBleFailure> get errors => _errors.stream;

  void _ensureEvents() {
    if (_disposed) throw StateError('Bluetooth transport has been disposed.');
    _eventSubscription ??= _events.receiveBroadcastStream().listen(
      _handleEvent,
      onError: (Object error) {
        if (_disposed) return;
        _errors.add(NativeBleFailure(code: 'native.events', message: '$error'));
      },
    );
  }

  Future<T?> _invoke<T>(
    String method, [
    Map<String, Object?>? arguments,
  ]) async {
    if (_disposed) throw StateError('Bluetooth transport has been disposed.');
    try {
      return await _channel.invokeMethod<T>(method, arguments);
    } on MissingPluginException {
      throw UnsupportedError(
        'Native Bluetooth is unavailable on this platform.',
      );
    }
  }

  @override
  Future<BluetoothPermission> requestPermission() async {
    if (_disposed) throw StateError('Bluetooth transport has been disposed.');
    try {
      final permission = await _channel.invokeMethod<String>('permission');
      return switch (permission) {
        'granted' => BluetoothPermission.granted,
        'denied' => BluetoothPermission.denied,
        'restricted' => BluetoothPermission.restricted,
        _ => BluetoothPermission.unavailable,
      };
    } on MissingPluginException {
      return BluetoothPermission.unavailable;
    }
  }

  @override
  Stream<DiscoveredDevice> scan() {
    _ensureEvents();
    return Stream.multi((output) {
      final subscription = _discoveries.stream.listen(
        output.add,
        onError: output.addError,
        onDone: output.close,
      );
      unawaited(
        _invoke<void>('startScan').catchError((Object error) {
          output.addError(error);
        }),
      );
      output.onCancel = subscription.cancel;
    });
  }

  @override
  Future<void> stopScan() => _invoke<void>('stopScan');

  @override
  Future<void> connect(String deviceId) async {
    _ensureEvents();
    await _invoke<void>('connect', {'id': deviceId});
  }

  @override
  Future<List<BleCharacteristic>> discoverCharacteristics() async {
    final result = await _invoke<List<dynamic>>('discover');
    if (result == null) {
      throw const FormatException('Native BLE returned no characteristics.');
    }
    return result.map(_characteristic).toList(growable: false);
  }

  static BleCharacteristic _characteristic(dynamic value) {
    if (value is! Map) {
      throw const FormatException('Invalid BLE characteristic.');
    }
    final service = value['service'];
    final characteristic = value['characteristic'];
    if (service is! String || characteristic is! String) {
      throw const FormatException('Missing BLE characteristic identity.');
    }
    return BleCharacteristic(
      service: service,
      characteristic: characteristic,
      canRead: value['canRead'] == true || value['read'] == true,
      canWrite: value['canWrite'] == true || value['write'] == true,
      canNotify: value['canNotify'] == true || value['notify'] == true,
      canWriteWithoutResponse: value['canWriteWithoutResponse'] == true,
    );
  }

  @override
  Stream<RawNotification> subscribe(BleCharacteristic characteristic) {
    if (!characteristic.canNotify) {
      throw ArgumentError('Characteristic does not support notifications.');
    }
    _ensureEvents();
    return Stream.multi((output) {
      final subscription = _notifications.stream
          .where(
            (notification) =>
                normalizeBleUuid(notification.characteristic) ==
                    normalizeBleUuid(characteristic.characteristic) &&
                (notification.service == null ||
                    normalizeBleUuid(notification.service!) ==
                        normalizeBleUuid(characteristic.service)),
          )
          .listen(output.add, onError: output.addError, onDone: output.close);
      unawaited(
        _enableNotifications(characteristic).catchError((Object error) {
          output.addError(error);
        }),
      );
      output.onCancel = subscription.cancel;
    });
  }

  Future<void> _enableNotifications(BleCharacteristic characteristic) {
    if (!characteristic.canNotify) {
      throw ArgumentError('Characteristic does not support notifications.');
    }
    final key = '${characteristic.service}/${characteristic.characteristic}'
        .toLowerCase();
    return _subscriptionRequests.putIfAbsent(
      key,
      () => _invoke<void>('subscribe', _identity(characteristic)),
    );
  }

  /// Await after listening to [subscribe] and before sending protocol requests.
  /// The native implementation resolves this after notification enablement.
  Future<void> notificationsReady(BleCharacteristic characteristic) =>
      _enableNotifications(characteristic);

  @override
  Future<Uint8List> read(BleCharacteristic characteristic) async {
    if (!characteristic.canRead) {
      throw ArgumentError('Characteristic is not readable.');
    }
    final result = await _invoke<Uint8List>('read', _identity(characteristic));
    if (result == null) {
      throw const FormatException('Native BLE returned no read data.');
    }
    return Uint8List.fromList(result);
  }

  @override
  Future<void> write(
    BleCharacteristic characteristic,
    Uint8List bytes, {
    bool withResponse = true,
  }) async {
    if (!characteristic.canWrite) {
      throw ArgumentError('Characteristic is not writable.');
    }
    if (!withResponse && !characteristic.canWriteWithoutResponse) {
      throw ArgumentError('Characteristic requires write with response.');
    }
    await _invoke<void>('write', {
      ..._identity(characteristic),
      'bytes': Uint8List.fromList(bytes),
      'response': withResponse,
    });
  }

  static Map<String, Object?> _identity(BleCharacteristic characteristic) => {
    'service': characteristic.service,
    'characteristic': characteristic.characteristic,
  };

  @override
  Future<void> disconnect() async {
    _subscriptionRequests.clear();
    await _invoke<void>('disconnect');
  }

  void _handleEvent(dynamic event) {
    if (_disposed || event is! Map) return;
    switch (event['type']) {
      case 'discovered':
        final id = event['id'];
        if (id is! String) return;
        _discoveries.add(
          DiscoveredDevice(
            id: id,
            name: event['name'] is String ? event['name'] as String : '',
            rssi: event['rssi'] is int ? event['rssi'] as int : null,
            manufacturerData: event['manufacturerData'] is Uint8List
                ? event['manufacturerData'] as Uint8List
                : null,
            services: event['services'] is List
                ? (event['services'] as List).whereType<String>().toList()
                : const [],
          ),
        );
      case 'connected':
        _connections.add(ConnectionState.connected);
      case 'disconnected':
        _subscriptionRequests.clear();
        _connections.add(ConnectionState.disconnected);
        _disconnections.add(
          event['reason'] is String ? event['reason'] as String : null,
        );
      case 'notification':
        final bytes = event['bytes'];
        final characteristic = event['characteristic'];
        if (bytes is! Uint8List || characteristic is! String) {
          _errors.add(
            const NativeBleFailure(
              code: 'native.notification',
              message:
                  'Native notification must contain a characteristic and typed bytes.',
            ),
          );
          return;
        }
        _notifications.add(
          RawNotification(
            characteristic: characteristic,
            service: event['service'] is String
                ? event['service'] as String
                : null,
            receivedAt: clock.now,
            bytes: bytes,
          ),
        );
      case 'state':
        final state = event['state'];
        if (state is String) _adapterStates.add(state);
      case 'error':
        _errors.add(
          NativeBleFailure(
            code: event['code'] is String
                ? event['code'] as String
                : 'native.error',
            message: event['message'] is String
                ? event['message'] as String
                : 'Bluetooth operation failed.',
          ),
        );
      case 'characteristics':
        // discover's Future is the authoritative response, not this diagnostic.
        break;
    }
  }

  @override
  Future<void> dispose() async {
    if (_disposed) return;
    _disposed = true;
    _subscriptionRequests.clear();
    await _eventSubscription?.cancel();
    _eventSubscription = null;
    await Future.wait([
      _discoveries.close(),
      _notifications.close(),
      _disconnections.close(),
      _connections.close(),
      _adapterStates.close(),
      _errors.close(),
    ]);
  }
}
