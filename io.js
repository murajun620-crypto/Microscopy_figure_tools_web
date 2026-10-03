import { LIMITS, validateSize } from './core.js?v=2d894542ff65';
import { rasterSize } from './image-header.js';

export const SUPPORTED = /\.(png|jpe?g|bmp|svg|tiff?)$/i;
const scripts = new Map();
export function loadScript(name) {
  if (!scripts.has(name)) scripts.set(name, new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = new URL(`./vendor/${name}`, import.meta.url).href;
    script.onload = resolve; script.onerror = () => { scripts.delete(name); script.remove(); reject(new Error('出力ライブラリを読み込めませんでした。ページを再読み込みしてください。')); };
    document.head.append(script);
  }));
  return scripts.get(name);
}

export async function canvasBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('画像を生成できませんでした。出力サイズを小さくしてください。')), 'image/png'));
}

const downloadUrls=[];
export function clearDownloads() {
  for(const url of downloadUrls) URL.revokeObjectURL(url);
  downloadUrls.length=0;
  document.getElementById('downloadList').replaceChildren();
  document.getElementById('downloadReceipt').hidden=true;
}
export function download(blob,name,{automatic=true}={}) {
  const url=URL.createObjectURL(blob),anchor=document.createElement('a');
  downloadUrls.push(url); anchor.href=url;anchor.download=name;anchor.textContent=name;
  document.getElementById('downloadList').append(anchor);
  document.getElementById('downloadReceipt').hidden=false;
  if(automatic)anchor.click();
}

// SVG is used only as an inert raster image, never inserted into the page DOM.
// Strip executable content and external resources so imported images stay local.
export function sanitizeSvg(text) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('外部参照を含むSVGには対応していません。');
  const document = new DOMParser().parseFromString(text, 'image/svg+xml'), root = document.documentElement;
  if (document.querySelector('parsererror') || root.localName !== 'svg') throw new Error('SVGが不正です。');
  for (const element of Array.from(root.querySelectorAll('script, foreignObject, iframe, object, embed, style, animate, animateTransform, animateMotion, set'))) element.remove();
  for (const element of [root, ...root.querySelectorAll('*')]) for (const attribute of Array.from(element.attributes)) {
    const v = attribute.value.trim();
    if (/^on/i.test(attribute.name) || (['href', 'src'].includes(attribute.localName) && !(v.startsWith('#') || /^data:image\/(png|jpe?g|gif|webp|bmp);base64,/i.test(v))) || /url\(\s*['"]?(?!#)/i.test(v) || /@import|expression\(/i.test(v)) element.removeAttributeNode(attribute);
  }
  const view = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  function dimension(attribute, fallback) {
    const value = root.getAttribute(attribute);
    if (value && /^\d+(?:\.\d+)?(?:px)?$/.test(value.trim())) return Math.ceil(Number.parseFloat(value));
    if (fallback > 0 && Number.isFinite(fallback)) return Math.ceil(fallback);
    return 1024;
  }
  const width = dimension('width', view?.[2]), height = dimension('height', view?.[3]); validateSize(width, height);
  root.setAttribute('width', String(width)); root.setAttribute('height', String(height));
  return { blob: new Blob([new XMLSerializer().serializeToString(root)], { type: 'image/svg+xml' }), width, height };
}

async function rasterImage(blob) {
  const url = URL.createObjectURL(blob), image = new Image();
  try { image.src = url; await image.decode(); validateSize(image.naturalWidth, image.naturalHeight); return image; }
  finally { URL.revokeObjectURL(url); }
}

let worker = null, nextRequest = 0;
const requests = new Map();
function tiffRequest(action, payload, transfer = []) {
  if (!worker) {
    worker = new Worker(new URL('./tiff-worker.js', import.meta.url));
    worker.onmessage = ({ data }) => {
      const request = requests.get(data.id); if (!request) return;
      requests.delete(data.id); clearTimeout(request.timer);
      if (data.error) request.reject(new Error(data.error)); else request.resolve(data);
    };
    worker.onerror = () => resetTiffWorker('TIFFを処理できませんでした。');
  }
  return new Promise((resolve, reject) => {
    const id = ++nextRequest;
    const timer = setTimeout(() => resetTiffWorker('TIFF処理が時間内に完了しませんでした。別形式で開いてください。'), 30000);
    requests.set(id, { resolve, reject, timer }); worker.postMessage({ id, action, ...payload }, transfer);
  });
}
function resetTiffWorker(message) {
  worker?.terminate(); worker = null;
  for (const request of requests.values()) { clearTimeout(request.timer); request.reject(new Error(message)); }
  requests.clear();
}

export async function encodeTiff(canvas, dpi) {
  const rgba = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.buffer;
  const { buffer } = await tiffRequest('encode', { rgba, width: canvas.width, height: canvas.height, dpi }, [rgba]);
  return new Blob([buffer], { type: 'image/tiff' });
}

export async function decodeImage(file) {
  if (!SUPPORTED.test(file.name)) throw new Error('PNG / JPEG / BMP / SVG / TIFFの画像を選択してください。');
  if (file.size > LIMITS.fileBytes) throw new Error('1ファイル128 MB以内の画像を選択してください。');
  if (/\.tiff?$/i.test(file.name)) {
    const buffer = await file.arrayBuffer(), data = await tiffRequest('decode', { buffer }, [buffer]);
    validateSize(data.width, data.height);
    const canvas = document.createElement('canvas'); canvas.width = data.width; canvas.height = data.height;
    canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data.rgba), data.width, data.height), 0, 0);
    return { source: canvas, width: data.width, height: data.height, note: `TIFF：先頭ページを8-bit RGBAで読み込みました${data.pages > 1 ? `（全${data.pages}ページ）` : ''}。` };
  }
  if (/\.svg$/i.test(file.name)) {
    const safe = sanitizeSvg(await file.text()), source = await rasterImage(safe.blob);
    return { source, width: safe.width, height: safe.height, note: 'SVGは画像として読み込みました。外部参照・スクリプト・CSSは除外しています。' };
  }
  // Browser native decoders apply EXIF orientation. All coordinates then refer
  // to the displayed, oriented image, including the dimensions in settings JSON.
  const header = rasterSize(new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer()));
  validateSize(header.width, header.height);
  const source = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try { validateSize(source.width, source.height); } catch (error) { source.close(); throw error; }
  return { source, width: source.width, height: source.height, note: '' };
}

export function releaseImage(source) {
  if (source instanceof ImageBitmap) source.close();
  else if (source instanceof HTMLCanvasElement) source.width = source.height = 0;
}

export async function thumbnail(source) {
  const canvas = document.createElement('canvas'), scale = Math.min(1, 96 / Math.max(source.width || source.naturalWidth, source.height || source.naturalHeight));
  canvas.width = Math.max(1, Math.round((source.width || source.naturalWidth) * scale)); canvas.height = Math.max(1, Math.round((source.height || source.naturalHeight) * scale));
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  const blob = await canvasBlob(canvas); canvas.width = canvas.height = 0; return URL.createObjectURL(blob);
}
