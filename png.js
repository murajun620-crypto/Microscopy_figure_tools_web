const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Canvas writes 96 dpi. Replace pHYs with the selected print size without
// changing any pixel data or inflating/recompressing the image.
export function pngWithDpi(bytes, dpi) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 33 || ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) throw new Error('PNGデータが不正です。');
  if (!Number.isFinite(dpi) || dpi <= 0 || dpi / 0.0254 > 0xffffffff) throw new Error('解像度が不正です。');
  const chunk = new Uint8Array(21), view = new DataView(chunk.buffer);
  view.setUint32(0, 9); chunk.set([112, 72, 89, 115], 4);
  view.setUint32(8, Math.round(dpi / 0.0254)); view.setUint32(12, Math.round(dpi / 0.0254)); chunk[16] = 1;
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  const parts = [bytes.subarray(0, 8)], input = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let cursor = 8, inserted = false, ended = false;
  while (cursor + 12 <= bytes.length) {
    const size = input.getUint32(cursor), end = cursor + 12 + size;
    if (end > bytes.length) throw new Error('PNGチャンクが不正です。');
    const type = String.fromCharCode(...bytes.subarray(cursor + 4, cursor + 8));
    if (type !== 'pHYs') parts.push(bytes.subarray(cursor, end));
    if (type === 'IHDR') { parts.push(chunk); inserted = true; }
    cursor = end;
    if (type === 'IEND') { ended = true; break; }
  }
  if (!inserted || !ended) throw new Error('PNG構造が不正です。');
  const result = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}
