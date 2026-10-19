import 'dart:typed_data';

import 'package:pointycastle/api.dart';
import 'package:pointycastle/block/aes.dart';

import '../device_events.dart';
import '../transport/ble_transport.dart';
import 'cube_protocol.dart';
import 'move_sequence_tracker.dart';

// Ported from TrainTimer src/gan-bluetooth.js. Differential fixtures are
// generated from that read-only implementation, including both key versions.
const ganGen4Service = '00000010-0000-fff7-fff6-fff5fff4fff0';
const ganGen4Read = '0000fff6-0000-1000-8000-00805f9b34fb';
const ganGen4Write = '0000fff5-0000-1000-8000-00805f9b34fb';
const _faces = 'URFDLB';
const _historyFaces = 'DUBFLR';
const _axisMasks = [2, 32, 8, 1, 16, 4];
const _baseKeys = [
  [1, 2, 66, 40, 49, 145, 22, 7, 32, 5, 24, 84, 66, 17, 18, 83],
  [17, 3, 50, 40, 33, 1, 118, 39, 32, 149, 120, 20, 50, 18, 2, 67],
  [5, 18, 2, 69, 2, 1, 41, 86, 18, 120, 18, 118, 129, 1, 8, 3],
  [1, 68, 40, 6, 134, 33, 34, 40, 81, 5, 8, 49, 130, 2, 33, 6],
];
const _corners = [
  [8, 9, 20],
  [6, 18, 38],
  [0, 36, 47],
  [2, 45, 11],
  [29, 26, 15],
  [27, 44, 24],
  [33, 53, 42],
  [35, 17, 51],
];
const _edges = [
  [5, 10],
  [7, 19],
  [3, 37],
  [1, 46],
  [32, 16],
  [28, 25],
  [30, 43],
  [34, 52],
  [23, 12],
  [21, 41],
  [50, 39],
  [48, 14],
];

enum GanPacketKind { moves, state, pose, battery, history, hardware, unknown }

final class GanMoveRecord {
  const GanMoveRecord({
    required this.notation,
    required this.counter,
    required this.deviceTicks,
  });
  final String notation;
  final int counter;
  final int deviceTicks;
}

/// Values are immutable. Device ticks remain raw: their units/calibration have
/// not yet been validated on GAN i4 and do not replace host monotonic time.
final class GanGen4Packet {
  GanGen4Packet({
    required this.kind,
    this.counter,
    Iterable<GanMoveRecord> moves = const [],
    Iterable<String> history = const [],
    Iterable<int>? facelets,
    this.battery,
    this.quaternion,
    this.velocity,
  }) : moves = List.unmodifiable(moves),
       history = List.unmodifiable(history),
       facelets = facelets == null ? null : List.unmodifiable(facelets);

  final GanPacketKind kind;
  final int? counter;
  final List<GanMoveRecord> moves;
  final List<String> history;
  final List<int>? facelets;
  final int? battery;
  final ({double x, double y, double z, double w})? quaternion;
  final ({double x, double y, double z})? velocity;

  String? get faceletString => facelets?.map((face) => _faces[face]).join();
}

final class GanGen4Codec {
  GanGen4Codec({required String mac, int keyVersion = 0}) {
    if (keyVersion < 0 || keyVersion > 1) {
      throw ArgumentError.value(keyVersion, 'keyVersion', 'expected 0 or 1');
    }
    final compact = mac.replaceAll(RegExp('[:-]'), '');
    if (!RegExp(r'^[0-9a-fA-F]{12}$').hasMatch(compact)) {
      throw ArgumentError('A verified six-byte GAN MAC address is required.');
    }
    final macBytes = List.generate(
      6,
      (i) => int.parse(compact.substring(i * 2, i * 2 + 2), radix: 16),
    );
    _key = Uint8List.fromList(_baseKeys[keyVersion * 2]);
    _iv = Uint8List.fromList(_baseKeys[keyVersion * 2 + 1]);
    for (var i = 0; i < 6; i++) {
      _key[i] = (_key[i] + macBytes[5 - i]) % 255;
      _iv[i] = (_iv[i] + macBytes[5 - i]) % 255;
    }
  }

  late final Uint8List _key;
  late final Uint8List _iv;

  /// GAN's two overlapping AES blocks are intentionally not CBC padding.
  Uint8List encrypt(List<int> plain) => _crypt(plain, encrypting: true);
  Uint8List decrypt(List<int> encrypted) =>
      _crypt(encrypted, encrypting: false);

  Uint8List _crypt(List<int> bytes, {required bool encrypting}) {
    if (bytes.length < 16) {
      throw const FormatException(
        'Encrypted GAN packet is shorter than 16 bytes.',
      );
    }
    final output = Uint8List.fromList(bytes);
    final engine = AESEngine()..init(encrypting, KeyParameter(_key));
    void block(int offset) {
      final input = Uint8List.fromList(output.sublist(offset, offset + 16));
      if (encrypting) {
        for (var i = 0; i < 16; i++) {
          input[i] ^= _iv[i];
        }
      }
      final result = Uint8List(16);
      engine.processBlock(input, 0, result, 0);
      for (var i = 0; i < 16; i++) {
        output[offset + i] = encrypting ? result[i] : result[i] ^ _iv[i];
      }
    }

    if (!encrypting && output.length > 16) block(output.length - 16);
    block(0);
    if (encrypting && output.length > 16) block(output.length - 16);
    return output;
  }

  List<Uint8List> initializationRequests() => [
    _request([0xdf, 0x03]),
    _request([0xdd, 0x04, 0, 0xed]),
    _request([0xdd, 0x04, 0, 0xef]),
  ];

  Uint8List stateRequest() => _request([0xdd, 0x04, 0, 0xed]);

  Uint8List _request(List<int> prefix) {
    final plain = Uint8List(20)..setRange(0, prefix.length, prefix);
    return encrypt(plain);
  }

  GanGen4Packet decode(List<int> bytes) => parsePlain(decrypt(bytes));

  static GanGen4Packet parsePlain(List<int> bytes) {
    if (bytes.any((byte) => byte < 0 || byte > 255)) {
      throw const FormatException('GAN packet values must be unsigned bytes.');
    }
    if (bytes.length < 2) {
      throw const FormatException('Missing GAN packet header.');
    }
    final mode = bytes[0];
    final length = bytes[1];
    switch (mode) {
      case 0x01:
        final records = <GanMoveRecord>[];
        for (var offset = 0; offset + 8 < bytes.length; offset += 9) {
          if (bytes[offset] != 0x01) break;
          if (bytes[offset + 1] < 7) {
            throw const FormatException('Truncated GAN move record.');
          }
          final action = bytes[offset + 8];
          final face = _axisMasks.indexOf(action & 0x3f);
          final power = action >> 6;
          if (face < 0 || power > 2) {
            throw const FormatException('Invalid GAN move encoding.');
          }
          records.add(
            GanMoveRecord(
              notation: _move(_faces[face], power),
              counter: bytes[offset + 7] << 8 | bytes[offset + 6],
              deviceTicks:
                  bytes[offset + 2] |
                  bytes[offset + 3] << 8 |
                  bytes[offset + 4] << 16 |
                  bytes[offset + 5] << 24,
            ),
          );
        }
        if (records.isEmpty) {
          throw const FormatException('Missing GAN move record.');
        }
        return GanGen4Packet(
          kind: GanPacketKind.moves,
          counter: records.last.counter,
          moves: records,
        );
      case 0xed:
        if (length < 14 || bytes.length < 18) {
          throw const FormatException('Truncated GAN cube state.');
        }
        return GanGen4Packet(
          kind: GanPacketKind.state,
          counter: bytes[3] << 8 | bytes[2],
          facelets: _decodeFacelets(bytes),
        );
      case 0xec:
        if (length < 10 || bytes.length < 12) {
          throw const FormatException('Truncated GAN pose.');
        }
        final quaternion = (
          x: _signedMagnitude(_bits(bytes, 32, 48), 0x8000, 0x7fff),
          y: _signedMagnitude(_bits(bytes, 48, 64), 0x8000, 0x7fff),
          z: _signedMagnitude(_bits(bytes, 64, 80), 0x8000, 0x7fff),
          w: _signedMagnitude(_bits(bytes, 16, 32), 0x8000, 0x7fff),
        );
        if (quaternion.x == 0 &&
            quaternion.y == 0 &&
            quaternion.z == 0 &&
            quaternion.w == 0) {
          throw const FormatException('Zero GAN pose quaternion.');
        }
        return GanGen4Packet(
          kind: GanPacketKind.pose,
          quaternion: quaternion,
          velocity: (
            x: _signedMagnitude(_bits(bytes, 80, 84), 8, 7),
            y: _signedMagnitude(_bits(bytes, 84, 88), 8, 7),
            z: _signedMagnitude(_bits(bytes, 88, 92), 8, 7),
          ),
        );
      case 0xd1:
        if (length < 1 || bytes.length < length + 2) {
          throw const FormatException('Truncated GAN history.');
        }
        final history = <String>[];
        for (var i = 0; i < (length - 1) * 2; i++) {
          final start = 24 + i * 4;
          final face = _bits(bytes, start, start + 3);
          if (face >= _historyFaces.length) {
            throw const FormatException('Invalid GAN history face.');
          }
          history.add(
            _move(_historyFaces[face], _bits(bytes, start + 3, start + 4)),
          );
        }
        return GanGen4Packet(
          kind: GanPacketKind.history,
          counter: bytes[2],
          history: history,
        );
      case 0xef:
        if (length < 1 || bytes.length <= length + 1) {
          throw const FormatException('Truncated GAN battery packet.');
        }
        final battery = bytes[length + 1];
        if (battery > 100) {
          throw const FormatException('Invalid GAN battery level.');
        }
        return GanGen4Packet(kind: GanPacketKind.battery, battery: battery);
      case 0xf5 || 0xf6 || 0xfa || 0xfc || 0xfd || 0xfe || 0xff:
        return GanGen4Packet(kind: GanPacketKind.hardware);
      default:
        return GanGen4Packet(kind: GanPacketKind.unknown);
    }
  }

  static List<int> _decodeFacelets(List<int> bytes) {
    final cp = <int>[];
    final co = <int>[];
    final ep = <int>[];
    final eo = <int>[];
    for (var i = 0; i < 7; i++) {
      cp.add(_bits(bytes, 32 + i * 3, 35 + i * 3));
      co.add(_bits(bytes, 53 + i * 2, 55 + i * 2));
    }
    cp.add(28 - _sum(cp));
    co.add((3 - _sum(co) % 3) % 3);
    for (var i = 0; i < 11; i++) {
      ep.add(_bits(bytes, 69 + i * 4, 73 + i * 4));
      eo.add(_bits(bytes, 113 + i, 114 + i));
    }
    ep.add(66 - _sum(ep));
    eo.add((2 - _sum(eo) % 2) % 2);
    if (!_permutation(cp, 8) ||
        !_permutation(ep, 12) ||
        co.any((value) => value > 2) ||
        _parity(cp) != _parity(ep)) {
      throw const FormatException('Illegal GAN cube state; resynchronize.');
    }
    final facelets = List.generate(54, (i) => i ~/ 9);
    for (var i = 0; i < 8; i++) {
      for (var part = 0; part < 3; part++) {
        facelets[_corners[i][(part + co[i]) % 3]] = _corners[cp[i]][part] ~/ 9;
      }
    }
    for (var i = 0; i < 12; i++) {
      for (var part = 0; part < 2; part++) {
        facelets[_edges[i][(part + eo[i]) % 2]] = _edges[ep[i]][part] ~/ 9;
      }
    }
    return facelets;
  }

  static bool _permutation(List<int> values, int size) =>
      values.toSet().length == size && values.every((i) => i >= 0 && i < size);

  static int _parity(List<int> values) {
    var parity = 0;
    for (var i = 0; i < values.length; i++) {
      for (var j = i + 1; j < values.length; j++) {
        if (values[i] > values[j]) parity ^= 1;
      }
    }
    return parity;
  }

  static int _sum(List<int> values) =>
      values.fold(0, (sum, value) => sum + value);
  static String _move(String face, int power) =>
      '$face${['', "'", '2'][power]}';
  static double _signedMagnitude(int value, int sign, int mask) =>
      ((value & sign) == 0 ? 1 : -1) * (value & mask) / mask;

  static int _bits(List<int> bytes, int start, int end) {
    if (end > bytes.length * 8) {
      throw const FormatException('Truncated GAN bit field.');
    }
    var value = 0;
    for (var bit = start; bit < end; bit++) {
      value = value << 1 | ((bytes[bit >> 3] >> (7 - (bit & 7))) & 1);
    }
    return value;
  }
}

/// A functioning protocol adapter, with native BLE and identity supplied by the
/// application. The application subscribes before [initialize] sends requests.
final class GanGen4Protocol implements CubeProtocol {
  GanGen4Protocol({required String mac, int keyVersion = 0})
    : codec = GanGen4Codec(mac: mac, keyVersion: keyVersion);

  final GanGen4Codec codec;
  final MoveSequenceTracker _sequences = MoveSequenceTracker(modulus: 65536);
  BleTransport? _transport;
  BleCharacteristic? _write;
  DeviceSource? _source;
  int _order = 0;
  int _generation = 0;

  @override
  String get id => 'gan-v4';

  @override
  DeviceCapabilities get capabilities => const DeviceCapabilities(
    fullState: true,
    pose: true,
    battery: true,
    // History decode exists; requesting/correctly merging it is not verified.
    history: false,
  );

  @override
  Future<void> initialize(
    BleTransport transport,
    DeviceSource source, {
    List<BleCharacteristic>? discovered,
  }) async {
    if (_transport != null) {
      throw StateError('GAN protocol already initialized.');
    }
    _transport = transport;
    _source = source;
    final generation = ++_generation;
    try {
      final characteristics =
          discovered ?? await transport.discoverCharacteristics();
      if (generation != _generation) {
        throw StateError('GAN protocol initialization was cancelled.');
      }
      final matching = characteristics.where(
        (c) =>
            normalizeBleUuid(c.service) == ganGen4Service &&
            normalizeBleUuid(c.characteristic) == ganGen4Write &&
            c.canWrite,
      );
      if (matching.isEmpty) {
        throw StateError('GAN Gen4 write characteristic unavailable.');
      }
      _write = matching.first;
      for (final request in codec.initializationRequests()) {
        if (generation != _generation) {
          throw StateError('GAN protocol initialization was cancelled.');
        }
        await transport.write(
          _write!,
          request,
          withResponse: !_write!.canWriteWithoutResponse,
        );
      }
    } catch (_) {
      // A cancelled initialize must not dispose a newer connection epoch.
      if (generation == _generation) {
        await dispose();
      }
      rethrow;
    }
  }

  @override
  List<DeviceEvent> decode(RawNotification notification) {
    final source = _source;
    if (source == null) {
      throw StateError('Initialize GAN protocol before decoding.');
    }
    final packet = codec.decode(notification.bytes);
    final time = DeviceEventTime(hostReceivedAt: notification.receivedAt);
    switch (packet.kind) {
      case GanPacketKind.moves:
        final events = <DeviceEvent>[];
        for (final move in packet.moves) {
          final sequence = _sequences.accept(
            move.counter,
            origin: EventOrigin.live,
          );
          if (sequence.duplicate) continue;
          events.add(
            CubeTurn(
              source: source,
              order: _order++,
              time: DeviceEventTime(
                hostReceivedAt: notification.receivedAt,
                deviceTicks: move.deviceTicks,
              ),
              moveSequence: sequence.sequence,
              notation: move.notation,
              quality: EventQuality(
                origin: sequence.origin,
                missingMoves: sequence.missingMoves,
              ),
            ),
          );
        }
        return events;
      case GanPacketKind.state:
        final latestSequence = _sequences.latestSequence;
        final delta = latestSequence == null
            ? 0
            : (packet.counter! - latestSequence % 65536) % 65536;
        return [
          CubeStateSnapshot(
            source: source,
            order: _order++,
            time: time,
            facelets: packet.facelets!,
            lastMoveSequence: packet.counter,
            quality: EventQuality(
              trusted: latestSequence == null || delta < 32768,
              origin: EventOrigin.stateSnapshot,
              missingMoves: delta > 0 && delta < 32768 ? delta : 0,
            ),
          ),
        ];
      case GanPacketKind.pose:
        final pose = packet.quaternion!;
        return [
          CubePose(
            source: source,
            order: _order++,
            time: time,
            x: pose.x,
            y: pose.y,
            z: pose.z,
            w: pose.w,
          ),
        ];
      case GanPacketKind.battery:
        return [
          CubeBattery(
            source: source,
            order: _order++,
            time: time,
            percent: packet.battery!,
          ),
        ];
      case GanPacketKind.history:
        return [
          CubeHistory(
            source: source,
            order: _order++,
            time: time,
            moves: packet.history,
            rawStartCounter: packet.counter!,
          ),
        ];
      case GanPacketKind.hardware:
      case GanPacketKind.unknown:
        return [
          DeviceDiagnostic(
            source: source,
            order: _order++,
            time: time,
            code: packet.kind == GanPacketKind.hardware
                ? 'gan.hardware'
                : 'gan.unknown',
            message: 'Received GAN ${packet.kind.name} packet.',
          ),
        ];
    }
  }

  @override
  Future<void> requestState() async {
    final transport = _transport;
    if (transport == null) throw StateError('GAN protocol is not initialized.');
    await transport.write(
      _write!,
      codec.stateRequest(),
      withResponse: !_write!.canWriteWithoutResponse,
    );
  }

  @override
  Future<void> requestHistory({required int afterSequence}) => Future.error(
    UnsupportedError(
      'GAN Gen4 history request/recovery requires device validation.',
    ),
  );

  @override
  Future<void> dispose() async {
    _generation++;
    _transport = null;
    _write = null;
    _source = null;
  }
}
