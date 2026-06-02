export const ganManufacturerCompanyId = 0x0001;
export const ganManufacturerDataOptions = Array.from({ length: 256 }, (_, index) => (index << 8) | ganManufacturerCompanyId);

export function extractGanMacFromManufacturerData(manufacturerData, manufacturerIds = ganManufacturerDataOptions) {
  if (!manufacturerData) return '';
  if (manufacturerData instanceof DataView) {
    return extractGanMacFromAdvertisementData(dataViewSlice(manufacturerData, 2, 11));
  }

  if (typeof manufacturerData.get === 'function') {
    for (const id of manufacturerIds) {
      const mac = extractGanMacFromAdvertisementData(manufacturerData.get(id));
      if (mac) return mac;
    }
  }

  if (typeof manufacturerData.forEach === 'function') {
    let fallbackMac = '';
    manufacturerData.forEach((value) => {
      if (fallbackMac) return;
      fallbackMac = extractGanMacFromAdvertisementData(value);
    });
    return fallbackMac;
  }

  return '';
}

export function extractGanMacFromAdvertisementData(value) {
  const bytes = advertisementBytes(value);
  if (bytes.length < 6) return '';
  return Array.from(bytes.slice(-6))
    .reverse()
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join(':');
}

function advertisementBytes(value) {
  if (!value) return new Uint8Array(0);
  if (value instanceof DataView) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  return Uint8Array.from(value);
}

function dataViewSlice(value, start, end) {
  return new DataView(value.buffer.slice(value.byteOffset + start, value.byteOffset + Math.min(end, value.byteLength)));
}
