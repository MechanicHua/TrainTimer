import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:traintimer/devices/devices.dart';

void main() {
  test('GAN Gen4 candidate follows legacy native manufacturer byte layout', () {
    final data = Uint8List.fromList([
      1,
      0,
      0xaa,
      0xbb,
      0xcc,
      6,
      5,
      4,
      3,
      2,
      1,
      99,
    ]);
    final device = DiscoveredDevice(
      id: 'uuid',
      name: 'GAN i4',
      services: const [ganGen4Service],
      manufacturerData: data,
    );
    data[10] = 0;
    expect(ganGen4MacCandidate(device), '01:02:03:04:05:06');
    expect(() => device.manufacturerData![0] = 7, throwsUnsupportedError);
  });

  test(
    'unrelated names, services, company ids and truncated data yield no MAC',
    () {
      final data = Uint8List.fromList([
        1,
        0,
        0xaa,
        0xbb,
        0xcc,
        6,
        5,
        4,
        3,
        2,
        1,
      ]);
      expect(
        ganGen4MacCandidate(
          DiscoveredDevice(
            id: 'a',
            name: 'headphones',
            services: const [ganGen4Service],
            manufacturerData: data,
          ),
        ),
        isNull,
      );
      expect(
        ganGen4MacCandidate(
          DiscoveredDevice(id: 'a', name: 'GAN i4', manufacturerData: data),
        ),
        isNull,
      );
      data[0] = 2;
      expect(
        ganGen4MacCandidate(
          DiscoveredDevice(
            id: 'a',
            name: 'GAN i4',
            services: const [ganGen4Service],
            manufacturerData: data,
          ),
        ),
        isNull,
      );
      expect(
        ganGen4MacCandidate(
          DiscoveredDevice(
            id: 'a',
            name: 'GAN i4',
            services: const [ganGen4Service],
            manufacturerData: Uint8List(7),
          ),
        ),
        isNull,
      );
    },
  );
}
