import '../device_events.dart';
import '../transport/ble_transport.dart';

/// A protocol owns identity/handshake/crypto, sequence/time interpretation and
/// decoded event ordering. Each packet can produce multiple distinct events.
abstract interface class CubeProtocol {
  String get id;
  DeviceCapabilities get capabilities;
  Future<void> initialize(BleTransport transport, DeviceSource source);
  List<DeviceEvent> decode(RawNotification notification);
  Future<void> requestState();
  Future<void> requestHistory({required int afterSequence});
  Future<void> dispose();
}

/// Protocol code is available, but support still requires platform integration
/// and a verified device identity. No test fixture establishes real BLE support.
final class GanI4Support {
  const GanI4Support();

  bool get available => false;
  String get limitation =>
      'GAN Gen4 encryption and packet parsing have offline regression tests. '
      'Native transport, macOS/Windows identity, history recovery, device timing '
      'and reconnect require real-device validation before claiming support.';
}
