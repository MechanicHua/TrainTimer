import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:traintimer/core/timing/monotonic_clock.dart';
import 'package:traintimer/devices/devices.dart' as ble;

final class ChannelClock implements MonotonicClock {
  @override
  Duration now = const Duration(seconds: 12);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('dev.traintimer/ble');
  const eventControl = MethodChannel('dev.traintimer/ble/events');
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  final calls = <MethodCall>[];
  late ChannelClock clock;
  late ble.NativeBleTransport transport;

  Future<void> emit(Map<String, Object?> event) async {
    // The test messenger's platform-side event injection mirrors EventChannel.
    await messenger.handlePlatformMessage(
      eventControl.name,
      const StandardMethodCodec().encodeSuccessEnvelope(event),
      (_) {},
    );
    await pumpEventQueue();
  }

  setUp(() {
    calls.clear();
    clock = ChannelClock();
    transport = ble.NativeBleTransport(clock: clock);
    messenger.setMockMethodCallHandler(eventControl, (_) async => null);
    messenger.setMockMethodCallHandler(channel, (call) async {
      calls.add(call);
      return switch (call.method) {
        'permission' => 'granted',
        'discover' => [
          {
            'service': 'service',
            'characteristic': 'notify',
            'read': true,
            'write': true,
            'canWriteWithoutResponse': true,
            'notify': true,
          },
        ],
        'read' => Uint8List.fromList([1, 2]),
        _ => null,
      };
    });
  });

  tearDown(() async {
    await transport.dispose();
    messenger.setMockMethodCallHandler(channel, null);
    messenger.setMockMethodCallHandler(eventControl, null);
  });

  test(
    'native calls preserve identity, byte payload and response contract',
    () async {
      expect(
        await transport.requestPermission(),
        ble.BluetoothPermission.granted,
      );
      await transport.connect('device-id');
      expect(calls.last.method, 'connect');
      expect(calls.last.arguments, {'id': 'device-id'});
      final characteristic = (await transport.discoverCharacteristics()).single;
      expect(characteristic.canNotify, isTrue);
      expect(await transport.read(characteristic), [1, 2]);
      await transport.write(
        characteristic,
        Uint8List.fromList([3, 4]),
        withResponse: false,
      );
      final arguments = calls.last.arguments as Map<dynamic, dynamic>;
      expect(arguments['service'], 'service');
      expect(arguments['characteristic'], 'notify');
      expect(arguments['bytes'], [3, 4]);
      expect(arguments['response'], isFalse);
      await transport.disconnect();
      expect(calls.last.method, 'disconnect');
    },
  );

  test('connect completion waits for native delegate result', () async {
    final completion = Completer<void>();
    messenger.setMockMethodCallHandler(channel, (call) async {
      if (call.method == 'connect') await completion.future;
      return null;
    });
    var connected = false;
    final pending = transport.connect('device-id').then((_) {
      connected = true;
    });
    await pumpEventQueue();
    expect(connected, isFalse);
    completion.complete();
    await pending;
    expect(connected, isTrue);
  });

  test(
    'discovery and notifications use injected host monotonic time',
    () async {
      final devices = <ble.DiscoveredDevice>[];
      final packets = <ble.RawNotification>[];
      final disconnects = <String?>[];
      final discovery = transport.scan().listen(devices.add);
      const characteristic = ble.BleCharacteristic(
        service: 'service',
        characteristic: 'notify',
        canRead: false,
        canWrite: false,
        canNotify: true,
      );
      final notifications = transport
          .subscribe(characteristic)
          .listen(packets.add);
      final disconnections = transport.onDisconnected.listen(disconnects.add);
      await pumpEventQueue();
      await emit({
        'type': 'discovered',
        'id': 'one',
        'name': 'GAN i4',
        'rssi': -45,
      });
      clock.now = const Duration(seconds: 20);
      await emit({
        'type': 'notification',
        'characteristic': 'notify',
        'bytes': Uint8List.fromList([7, 8]),
      });
      await emit({
        'type': 'notification',
        'characteristic': 'other',
        'bytes': Uint8List.fromList([9]),
      });
      await emit({'type': 'disconnected', 'reason': 'lost'});
      expect(devices.single.id, 'one');
      expect(devices.single.rssi, -45);
      expect(packets.single.bytes, [7, 8]);
      expect(packets.single.receivedAt, const Duration(seconds: 20));
      expect(disconnects, ['lost']);
      await transport.stopScan();
      await discovery.cancel();
      await notifications.cancel();
      await disconnections.cancel();
    },
  );

  test(
    'missing plugin reports unavailable and never claims connection',
    () async {
      messenger.setMockMethodCallHandler(channel, null);
      expect(
        await transport.requestPermission(),
        ble.BluetoothPermission.unavailable,
      );
      await expectLater(transport.connect('missing'), throwsUnsupportedError);
    },
  );

  test(
    'unsupported characteristic operations are rejected before native call',
    () {
      const characteristic = ble.BleCharacteristic(
        service: 'service',
        characteristic: 'read-only',
        canRead: true,
        canWrite: false,
        canNotify: false,
      );
      expect(() => transport.subscribe(characteristic), throwsArgumentError);
      expect(
        transport.write(characteristic, Uint8List(1)),
        throwsArgumentError,
      );
    },
  );
}
