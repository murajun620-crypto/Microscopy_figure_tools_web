// Read dimensions before native decoding allocates a full bitmap. TIFF headers
// are checked in the worker and SVG dimensions are checked after sanitization.
export function rasterSize(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && [137,80,78,71,13,10,26,10].every((byte, index) => bytes[index] === byte)) {
    if (String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') throw new Error('PNGヘッダーが不正です。');
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length >= 26 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    const dibSize = view.getUint32(14, true);
    if (dibSize === 12) return { width: view.getUint16(18, true), height: view.getUint16(20, true) };
    if (dibSize >= 40) return { width: view.getInt32(18, true), height: Math.abs(view.getInt32(22, true)) };
    throw new Error('対応していないBMPヘッダーです。');
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let cursor = 2;
    while (cursor + 4 <= bytes.length) {
      if (bytes[cursor++] !== 0xff) throw new Error('JPEGヘッダーが不正です。');
      while (cursor < bytes.length && bytes[cursor] === 0xff) cursor++;
      const marker = bytes[cursor++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
      if (cursor + 2 > bytes.length) break;
      const size = view.getUint16(cursor);
      if (size < 2) throw new Error('JPEGヘッダーが不正です。');
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && cursor + 7 <= bytes.length) return { width: view.getUint16(cursor + 5), height: view.getUint16(cursor + 3) };
      cursor += size;
    }
    throw new Error('JPEGの画像サイズを確認できませんでした。PNGに変換して開いてください。');
  }
  throw new Error('画像ヘッダーを読み取れませんでした。PNG / JPEG / BMPを選択してください。');
}
