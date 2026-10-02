/* TIFF decoding runs off the UI thread; the main thread can terminate it. */
importScripts('./vendor/pako.min.js', './vendor/UTIF.js');
self.onmessage = ({ data }) => {
  const { id, action } = data;
  try {
    if (action === 'decode') {
      const ifds = UTIF.decode(data.buffer), ifd = ifds.find(page => page.t256?.[0] && page.t257?.[0]);
      if (!ifd) throw new Error('TIFF内に画像がありません。');
      const width = ifd.t256[0], height = ifd.t257[0];
      if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > 16384 || height > 16384 || width * height > 64000000) throw new Error('TIFFのサイズが不正、または大きすぎます（64メガピクセル以内）。');
      if (ifd.t339?.some(type => type !== 1) || ifd.t258?.some(bits => ![1, 2, 4, 8, 16].includes(bits)) || ifd.t262?.[0] === 32803) throw new Error('浮動小数点・符号付き・RAWのTIFFには対応していません。8-bit PNGへ変換してください。');
      UTIF.decodeImage(data.buffer, ifd);
      let rgba = UTIF.toRGBA8(ifd);
      if (rgba.length !== width * height * 4) throw new Error('TIFFの画像データが不正です。');
      const orientation = ifd.t274?.[0] || 1;
      if (!Number.isInteger(orientation) || orientation < 1 || orientation > 8) throw new Error('TIFFの向きが不正です。');
      const outWidth = orientation >= 5 ? height : width, outHeight = orientation >= 5 ? width : height;
      if (orientation !== 1) {
        const oriented = new Uint8Array(rgba.length);
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          let ox, oy;
          switch (orientation) {
            case 2: ox = width-1-x; oy = y; break;
            case 3: ox = width-1-x; oy = height-1-y; break;
            case 4: ox = x; oy = height-1-y; break;
            case 5: ox = y; oy = x; break;
            case 6: ox = height-1-y; oy = x; break;
            case 7: ox = height-1-y; oy = width-1-x; break;
            case 8: ox = y; oy = width-1-x; break;
          }
          const from = (y * width + x) * 4, to = (oy * outWidth + ox) * 4;
          oriented[to] = rgba[from]; oriented[to+1] = rgba[from+1]; oriented[to+2] = rgba[from+2]; oriented[to+3] = rgba[from+3];
        }
        rgba = oriented;
      }
      self.postMessage({ id, width: outWidth, height: outHeight, rgba: rgba.buffer, pages: ifds.length }, [rgba.buffer]);
    } else if (action === 'encode') {
      const buffer = UTIF.encodeImage(data.rgba, data.width, data.height, { t282: [data.dpi], t283: [data.dpi], t296: [2] });
      self.postMessage({ id, buffer }, [buffer]);
    } else throw new Error('TIFF処理の種類が不正です。');
  } catch (error) { self.postMessage({ id, error: `TIFF処理：${error.message}` }); }
};
