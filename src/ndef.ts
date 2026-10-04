/**
 * Builds the NDEF message a phone reads from a card: a single URI record,
 * wrapped in the NDEF TLV that NFC Forum Type 2 tags (NTAG213/215/216)
 * store from page 4.
 */

// NFC Forum URI identifier codes (abbreviations for common prefixes)
const URI_PREFIXES: Array<[number, string]> = [
  [0x02, "https://www."],
  [0x01, "http://www."],
  [0x04, "https://"],
  [0x03, "http://"],
];

export const MAX_URL_LENGTH = 200;

/** NDEF TLV for one URI record, followed by the terminator TLV */
export function buildUrlTlv(url: string): Buffer {
  const match = URI_PREFIXES.find(([, prefix]) => url.startsWith(prefix));
  const code = match ? match[0] : 0x00;
  const rest = Buffer.from(match ? url.slice(match[1].length) : url, "utf8");

  const payload = Buffer.concat([Buffer.from([code]), rest]);
  if (payload.length > 255) throw new Error("URL is too long");

  // Header 0xD1: first and last record, short record, well-known type; type "U"
  const record = Buffer.concat([Buffer.from([0xd1, 0x01, payload.length, 0x55]), payload]);

  const length = record.length < 0xff
    ? Buffer.from([record.length])
    : Buffer.from([0xff, record.length >> 8, record.length & 0xff]);

  return Buffer.concat([Buffer.from([0x03]), length, record, Buffer.from([0xfe])]);
}

/** Pad to whole 4-byte pages */
export function padToPages(data: Buffer): Buffer {
  const remainder = data.length % 4;
  return remainder === 0 ? data : Buffer.concat([data, Buffer.alloc(4 - remainder)]);
}
