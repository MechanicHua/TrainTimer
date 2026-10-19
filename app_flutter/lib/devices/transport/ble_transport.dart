import 'dart:typed_data';

import '../device_events.dart';

/// Compare UUIDs independent of CoreBluetooth's 16/32/128-bit presentation.
/// Preserve the original identity in native calls, which may use short UUIDs.
String normalizeBleUuid(String value) {
  final normalized = value.trim().toLowerCase();
  if (RegExp(r'^[0-9a-f]{4}$').hasMatch(normalized)) {
    return '0000$normalized-0000-1000-8000-00805f9b34fb';
  }
  if (RegExp(r'^[0-9a-f]{8}$').hasMatch(normalized)) {
    return '$normalized-0000-1000-8000-00805f9b34fb';
  }
  return normalized;
}

final class DiscoveredDevice {
  DiscoveredDevice({
    required this.id,
    required this.name,
    this.rssi,
    Uint8List? manufacturerData,
    List<String> services = const [],
  }) : manufacturerData = manufacturerData == null
           ? null
           : Uint8List.fromList(manufacturerData).asUnmodifiableView(),
       services = List.unmodifiable(services);

  final String id;
  final String name;
  final int? rssi;
  final Uint8List? manufacturerData;
  final List<String> services;
}

final class BleCharacteristic {
  const BleCharacteristic({
    required this.service,
    required this.characteristic,
    required this.canRead,
    required this.canWrite,
    required this.canNotify,
    this.canWriteWithoutResponse = false,
  });

  final String service;
  final String characteristic;
  final bool canRead;
  final bool canWrite;
  final bool canNotify;
  final bool canWriteWithoutResponse;
}

enum BluetoothPermission { granted, denied, restricted, unavailable }

/// Native platform boundary. No GAN commands or decryption belong here.
abstract interface class BleTransport {
  Future<BluetoothPermission> requestPermission();
  Stream<DiscoveredDevice> scan();
  Future<void> stopScan();
  Future<void> connect(String deviceId);
  Future<List<BleCharacteristic>> discoverCharacteristics();
  Stream<RawNotification> subscribe(BleCharacteristic characteristic);
  Future<Uint8List> read(BleCharacteristic characteristic);
  Future<void> write(
    BleCharacteristic characteristic,
    Uint8List bytes, {
    bool withResponse = true,
  });
  Future<void> disconnect();
  Future<void> dispose();
}
