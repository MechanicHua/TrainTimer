import 'dart:typed_data';

enum ConnectionState { disconnected, scanning, connecting, connected }

enum TimeSource { hostMonotonic, calibratedDevice }

enum EventOrigin { live, history, stateSnapshot }

final class DeviceCapabilities {
  const DeviceCapabilities({
    this.fullState = false,
    this.history = false,
    this.pose = false,
    this.battery = false,
  });

  final bool fullState;
  final bool history;
  final bool pose;
  final bool battery;
}

final class DeviceSource {
  const DeviceSource({
    required this.deviceId,
    required this.protocol,
    required this.connectionEpoch,
  });

  final String deviceId;
  final String protocol;

  /// Disambiguates events from connections whose native counters reset.
  final int connectionEpoch;
}

final class DeviceEventTime {
  const DeviceEventTime({
    required this.hostReceivedAt,
    this.deviceTicks,
    this.calibratedAt,
  });

  final Duration hostReceivedAt;
  final int? deviceTicks;

  /// Same monotonic origin as host time, set only by validated calibration.
  final Duration? calibratedAt;

  Duration get measuredAt => calibratedAt ?? hostReceivedAt;
  TimeSource get source => calibratedAt == null
      ? TimeSource.hostMonotonic
      : TimeSource.calibratedDevice;
}

final class EventQuality {
  const EventQuality({
    this.trusted = true,
    this.missingMoves = 0,
    this.origin = EventOrigin.live,
  });

  final bool trusted;
  final int missingMoves;
  final EventOrigin origin;
}

sealed class DeviceEvent {
  const DeviceEvent({
    required this.source,
    required this.order,
    required this.time,
    this.quality = const EventQuality(),
  });

  final DeviceSource source;
  final int order;
  final DeviceEventTime time;
  final EventQuality quality;
}

final class ConnectionChanged extends DeviceEvent {
  const ConnectionChanged({
    required super.source,
    required super.order,
    required super.time,
    required this.state,
    this.reason,
    super.quality,
  });

  final ConnectionState state;
  final String? reason;
}

final class CubeTurn extends DeviceEvent {
  const CubeTurn({
    required super.source,
    required super.order,
    required super.time,
    required this.moveSequence,
    required this.notation,
    super.quality,
  });

  final int moveSequence;
  final String notation;
}

final class CubeStateSnapshot extends DeviceEvent {
  CubeStateSnapshot({
    required super.source,
    required super.order,
    required super.time,
    required List<int> facelets,
    required this.lastMoveSequence,
    super.quality = const EventQuality(origin: EventOrigin.stateSnapshot),
  }) : facelets = List.unmodifiable(facelets);

  final List<int> facelets;
  final int? lastMoveSequence;
}

final class CubePose extends DeviceEvent {
  const CubePose({
    required super.source,
    required super.order,
    required super.time,
    required this.x,
    required this.y,
    required this.z,
    required this.w,
    super.quality,
  });

  final double x;
  final double y;
  final double z;
  final double w;
}

final class CubeBattery extends DeviceEvent {
  const CubeBattery({
    required super.source,
    required super.order,
    required super.time,
    required this.percent,
    super.quality,
  }) : assert(percent >= 0 && percent <= 100);

  final int percent;
}

/// A history packet has no validated per-move host timeline. Keep it separate
/// from live turns until the protocol can prove sequence/time correspondence.
final class CubeHistory extends DeviceEvent {
  CubeHistory({
    required super.source,
    required super.order,
    required super.time,
    required List<String> moves,
    required this.rawStartCounter,
    super.quality = const EventQuality(
      trusted: false,
      origin: EventOrigin.history,
    ),
  }) : moves = List.unmodifiable(moves);

  final List<String> moves;
  final int rawStartCounter;
}

final class DeviceDiagnostic extends DeviceEvent {
  const DeviceDiagnostic({
    required super.source,
    required super.order,
    required super.time,
    required this.code,
    required this.message,
    super.quality,
  });

  final String code;
  final String message;
}

final class RawNotification {
  RawNotification({
    required this.characteristic,
    required this.receivedAt,
    required Uint8List bytes,
    this.service,
  }) : bytes = Uint8List.fromList(bytes).asUnmodifiableView();

  final String characteristic;
  final String? service;
  final Duration receivedAt;
  final Uint8List bytes;
}
