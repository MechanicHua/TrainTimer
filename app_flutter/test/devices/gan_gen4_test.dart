import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:traintimer/devices/devices.dart';

final class FakeBleTransport implements BleTransport {
  final List<Uint8List> writes = [];
  bool hasCharacteristic = true;
  @override
  Future<List<BleCharacteristic>> discoverCharacteristics() async =>
      hasCharacteristic
      ? [
          const BleCharacteristic(
            service: ganGen4Service,
            characteristic: ganGen4Write,
            canRead: false,
            canWrite: true,
            canNotify: false,
          ),
        ]
      : [];
  @override
  Future<void> write(
    BleCharacteristic characteristic,
    Uint8List bytes, {
    bool withResponse = true,
  }) async {
    writes.add(bytes);
  }

  @override
  Future<void> connect(String deviceId) async {}
  @override
  Future<void> disconnect() async {}
  @override
  Future<void> dispose() async {}
  @override
  Future<BluetoothPermission> requestPermission() async =>
      BluetoothPermission.granted;
  @override
  Stream<DiscoveredDevice> scan() => const Stream.empty();
  @override
  Future<void> stopScan() async {}
  @override
  Stream<RawNotification> subscribe(BleCharacteristic characteristic) =>
      const Stream.empty();
  @override
  Future<Uint8List> read(BleCharacteristic characteristic) async =>
      Uint8List(0);
}

const source = DeviceSource(
  deviceId: 'fixture',
  protocol: 'gan-v4',
  connectionEpoch: 1,
);

void main() {
  final fixture =
      jsonDecode(File('test/devices/fixtures/gan_gen4.json').readAsStringSync())
          as Map<String, dynamic>;
  final versions = fixture['versions'] as List<dynamic>;

  for (final version in versions.cast<Map<String, dynamic>>()) {
    final keyVersion = version['keyVersion'] as int;
    final codec = GanGen4Codec(
      mac: fixture['mac'] as String,
      keyVersion: keyVersion,
    );
    test('Gen4 key $keyVersion requests match legacy AES byte for byte', () {
      expect(
        codec.initializationRequests(),
        (version['requests'] as List<dynamic>).map(
          (r) => List<int>.from(r as List),
        ),
      );
    });
    for (final sample
        in (version['packets'] as List<dynamic>).cast<Map<String, dynamic>>()) {
      final name = sample['name'] as String;
      test(
        'Gen4 key $keyVersion $name ciphertext and decoded fields match legacy',
        () {
          final plain = List<int>.from(sample['plain'] as List);
          final encrypted = List<int>.from(sample['encrypted'] as List);
          final expected = sample['expected'] as Map<String, dynamic>;
          expect(codec.encrypt(plain), encrypted);
          expect(codec.decrypt(encrypted), plain);
          final packet = codec.decode(encrypted);
          switch (packet.kind) {
            case GanPacketKind.moves:
              expect(packet.moves.map((m) => m.notation), expected['moves']);
              expect(packet.counter, expected['moveCounter']);
            case GanPacketKind.state:
              expect(packet.counter, expected['moveCounter']);
              expect(packet.faceletString, expected['facelets']);
            case GanPacketKind.pose:
              final gyro = expected['gyro'] as Map<String, dynamic>;
              final q = gyro['quaternion'] as Map<String, dynamic>;
              expect(
                packet.quaternion!.x,
                closeTo((q['x'] as num).toDouble(), 1e-12),
              );
              expect(
                packet.quaternion!.y,
                closeTo((q['y'] as num).toDouble(), 1e-12),
              );
              expect(
                packet.quaternion!.z,
                closeTo((q['z'] as num).toDouble(), 1e-12),
              );
              expect(
                packet.quaternion!.w,
                closeTo((q['w'] as num).toDouble(), 1e-12),
              );
            case GanPacketKind.battery:
              expect(packet.battery, expected['batteryLevel']);
            case GanPacketKind.history:
              expect(packet.counter, expected['moveCounter']);
              expect(packet.history, expected['historyMoves']);
            case GanPacketKind.hardware:
              expect(expected['mode'], 'hardware');
            case GanPacketKind.unknown:
              fail('A known fixture must not decode as unknown.');
          }
        },
      );
    }
  }

  test(
    'Gen4 bundled moves stay ordered; duplicate packet cannot retrigger',
    () async {
      final protocol = GanGen4Protocol(mac: fixture['mac'] as String);
      final transport = FakeBleTransport();
      await protocol.initialize(transport, source);
      expect(transport.writes.length, 3);
      final packets =
          ((versions.first as Map<String, dynamic>)['packets'] as List<dynamic>)
              .cast<Map<String, dynamic>>();
      final sample = packets.firstWhere((p) => p['name'] == 'bundled');
      final notification = RawNotification(
        characteristic: ganGen4Read,
        receivedAt: const Duration(seconds: 10),
        bytes: Uint8List.fromList(List<int>.from(sample['encrypted'] as List)),
      );
      final turns = protocol.decode(notification).cast<CubeTurn>();
      expect(turns.map((t) => t.notation), ['L', "R'"]);
      expect(turns.map((t) => t.moveSequence), [58, 59]);
      expect(turns.every((t) => t.quality.origin == EventOrigin.live), isTrue);
      expect(turns.first.time.deviceTicks, 707958);
      expect(turns.first.time.source, TimeSource.hostMonotonic);
      expect(protocol.decode(notification), isEmpty);
      await protocol.requestState();
      expect(transport.writes.length, 4);
      expect(protocol.capabilities.history, isFalse);
      await expectLater(
        protocol.requestHistory(afterSequence: 59),
        throwsUnsupportedError,
      );
      await protocol.dispose();
    },
  );

  test(
    'state, pose and historical packets remain separate from live turns',
    () async {
      final protocol = GanGen4Protocol(mac: fixture['mac'] as String);
      await protocol.initialize(FakeBleTransport(), source);
      final packets =
          ((versions.first as Map<String, dynamic>)['packets'] as List<dynamic>)
              .cast<Map<String, dynamic>>();
      for (final pair in [
        ('solved', isA<CubeStateSnapshot>()),
        ('pose', isA<CubePose>()),
        ('history', isA<CubeHistory>()),
        ('battery', isA<CubeBattery>()),
      ]) {
        final sample = packets.firstWhere((p) => p['name'] == pair.$1);
        final events = protocol.decode(
          RawNotification(
            characteristic: ganGen4Read,
            receivedAt: Duration.zero,
            bytes: Uint8List.fromList(
              List<int>.from(sample['encrypted'] as List),
            ),
          ),
        );
        expect(events.single, pair.$2);
        expect(events.whereType<CubeTurn>(), isEmpty);
        if (events.single is CubeHistory) {
          expect(events.single.quality.origin, EventOrigin.history);
          expect(events.single.quality.trusted, isFalse);
        }
      }
      await protocol.dispose();
    },
  );

  test('malformed state, turn, pose and packet length fail explicitly', () {
    expect(() => GanGen4Codec(mac: 'a UUID is not a MAC'), throwsArgumentError);
    final codec = GanGen4Codec(mac: '01:02:03:04:05:06');
    expect(() => codec.decode([1, 2, 3]), throwsFormatException);
    expect(
      () => GanGen4Codec.parsePlain([0xed, 14, ...List.filled(18, 0)]),
      throwsFormatException,
    );
    expect(
      () => GanGen4Codec.parsePlain([1, 7, 0, 0, 0, 0, 1, 0, 0xff]),
      throwsFormatException,
    );
    expect(
      () => GanGen4Codec.parsePlain([0xec, 10, ...List.filled(18, 0)]),
      throwsFormatException,
    );
    expect(
      () => GanGen4Codec.parsePlain([0xef, 1, 101, ...List.filled(17, 0)]),
      throwsFormatException,
    );
  });
}
