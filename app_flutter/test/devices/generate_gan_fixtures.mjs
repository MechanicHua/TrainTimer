// Run from repository root: node app_flutter/test/devices/generate_gan_fixtures.mjs
// The legacy decoder is read only. Flutter tests consume the checked-in output.
import { writeFileSync } from 'node:fs';
import {
  encodeGanPayload, decodeGanBluetoothPacket, encodeGanBluetoothRequests,
} from '../../../src/gan-bluetooth.js';

const mac = '01:02:03:04:05:06';
const samples = {
  move: [1,8,0,0,0,0,9,0,0x60,0,0,0,0,0,0,0,0,0,0,0],
  bundled: [1,7,0x76,0xcd,10,0,0x3a,0,0x10,1,7,0x76,0xcd,10,0,0x3b,0,0x60,0x74,0xa9],
  solved: [0xed,14,0xc5,0,5,0x39,0x70,0,0,9,0x1a,0x2b,0x3c,0x4d,0,0,0,0,0xdf,0x3c],
  unsolved: [0xed,14,0xb6,0,5,0x3b,0xb8,0,0,9,0x1a,0xb3,0xa4,0x4d,0,0,0,0,0xe2,0x17],
  pose: [0xec,10,0x81,0x54,0xa7,0xff,0xf9,0x8e,0x82,0x39,0,0,0,0,0,0,0,0,0xb9,0x1b],
  battery: [0xef,1,93,...Array(17).fill(0)],
  history: [0xd1,3,60,0x01,0x45,...Array(15).fill(0)],
  hardware: [0xf5,1,...Array(18).fill(0)],
};
const versions = [0, 1].map(keyVersion => ({
  keyVersion,
  requests: encodeGanBluetoothRequests({protocol:'v4',mac,keyVersion}).map(r=>r.bytes),
  packets: Object.entries(samples).map(([name,plain]) => {
    const encrypted = encodeGanPayload(plain,{mac,keyVersion});
    return {name,plain,encrypted,expected:decodeGanBluetoothPacket({protocol:'v4',mac,keyVersion,bytes:encrypted})};
  }),
}));
writeFileSync('app_flutter/test/devices/fixtures/gan_gen4.json', JSON.stringify({
  source:'src/gan-bluetooth.js and test/gan-bluetooth.test.js',mac,versions,
},null,2)+'\n');
