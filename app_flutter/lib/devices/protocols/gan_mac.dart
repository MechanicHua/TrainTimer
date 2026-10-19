import '../transport/ble_transport.dart';
import 'gan_gen4.dart';

/// Port of the DataView path in public/gan-mac.js, restricted to GAN name,
/// Gen4 service and GAN's company id family (little-endian low byte 0x01).
/// It is only a candidate until decryption yields a legal full cube state.
String? ganGen4MacCandidate(DiscoveredDevice device) {
  if (!device.name.toLowerCase().startsWith('gan') ||
      !device.services.any(
        (service) => service.toLowerCase() == ganGen4Service,
      )) {
    return null;
  }
  final data = device.manufacturerData;
  if (data == null || data.length < 8 || data[0] != 0x01) return null;
  final advertisement = data.sublist(2, data.length < 11 ? data.length : 11);
  return advertisement
      .sublist(advertisement.length - 6)
      .reversed
      .map((byte) => byte.toRadixString(16).padLeft(2, '0'))
      .join(':');
}
