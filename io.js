import { LIMITS, validateSize } from './core.js?v=ef359abed43b';
import { rasterSize } from './image-header.js';
import { identity, multiply, svgCoordinate, svgLength, svgRasterPlan, svgTransform, transformedImage } from './svg-geometry.js?v=829ee8aa3ef2';

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
const downloadLinks=[];
export function clearDownloads() {
  for(const url of downloadUrls) URL.revokeObjectURL(url);
  downloadUrls.length=0;
  downloadLinks.length=0;
  document.getElementById('downloadList').replaceChildren();
  document.getElementById('downloadReceipt').hidden=true;
}
export function download(blob,name,{automatic=true}={}) {
  const url=URL.createObjectURL(blob),anchor=document.createElement('a');
  downloadUrls.push(url); anchor.href=url;anchor.download=name;anchor.textContent=name;
  downloadLinks.push(anchor);
  document.getElementById('downloadList').append(anchor);
  document.getElementById('downloadReceipt').hidden=false;
  if(automatic)anchor.click();
}

export async function downloadAll(signal) {
  let started=0;
  for(const anchor of [...downloadLinks]) {
    if(signal?.aborted)throw new Error('ダウンロードを中止しました。開始済みの保存は続行されます。');
    anchor.click();started++;
    // Space the requests; browser download permission still applies.
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  return started;
}

// SVG is used only as an inert raster image, never inserted into the page DOM.
// Strip executable content and external resources so imported images stay local.
export function sanitizeSvg(text, expectedSize = null) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('外部参照を含むSVGには対応していません。');
  const document = new DOMParser().parseFromString(text, 'image/svg+xml'), root = document.documentElement;
  if (document.querySelector('parsererror') || root.localName !== 'svg') throw new Error('SVGが不正です。');
  for (const element of Array.from(root.querySelectorAll('script, foreignObject, iframe, object, embed, style, animate, animateTransform, animateMotion, set'))) element.remove();
  for (const element of [root, ...root.querySelectorAll('*')]) for (const attribute of Array.from(element.attributes)) {
    const v = attribute.value.trim();
    if (/^on/i.test(attribute.name) || (['href', 'src'].includes(attribute.localName) && !(v.startsWith('#') || /^data:image\/(png|jpe?g|gif|webp|bmp);base64,/i.test(v))) || /url\(\s*['"]?(?!#)/i.test(v) || /@import|expression\(/i.test(v)) element.removeAttributeNode(attribute);
  }
  const view = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if(view&&(view.length!==4||!view.every(Number.isFinite)||view[2]<=0||view[3]<=0))throw new Error('SVGのviewBoxが不正です。');
  function dimension(attribute, fallback) {
    const value = root.getAttribute(attribute);
    if (value && /^\d+(?:\.\d+)?(?:px)?$/.test(value.trim())) return Math.ceil(Number.parseFloat(value));
    if (fallback > 0 && Number.isFinite(fallback)) return Math.ceil(fallback);
    return 1024;
  }
  const legacy={width:dimension('width',view?.[2]),height:dimension('height',view?.[3])};
  const width=svgLength(root.getAttribute('width'))||view?.[2]||1024,height=svgLength(root.getAttribute('height'))||view?.[3]||1024;
  const images=[],ids=new Map([...root.querySelectorAll('[id]')].map(el=>[el.id,el]));
  let visits=0;
  function visit(element,parent=identity(),path=new Set()) {
    if(++visits>4096||path.has(element)||['defs','symbol','clipPath','mask','pattern','svg'].includes(element.localName)&&element!==root)return;
    if(element.hasAttribute('clip-path')||element.hasAttribute('mask')||/display\s*:\s*none|visibility\s*:\s*hidden/.test(element.getAttribute('style')??''))return;
    const transform=svgTransform(element.getAttribute('transform'));if(!transform)return;
    let matrix=multiply(parent,transform);path=new Set([...path,element]);
    if(element.localName==='use') {
      const target=ids.get((element.getAttribute('href')||element.getAttributeNS('http://www.w3.org/1999/xlink','href')||'').slice(1));
      const x=svgCoordinate(element.getAttribute('x')??'0'),y=svgCoordinate(element.getAttribute('y')??'0');if(x===null||y===null)return;
      matrix=multiply(matrix,[1,0,0,1,x,y]);
      if(target)visit(target,matrix,path);return;
    }
    if(element.localName==='image') {
      const href=element.getAttribute('href')||element.getAttributeNS('http://www.w3.org/1999/xlink','href')||'';
      if(!/^data:image\/(png|jpe?g|gif|webp|bmp);base64,/i.test(href))return;
      let native;
      try{const base=href.slice(href.indexOf(',')+1).replace(/\s/g,''),binary=atob(base.slice(0,Math.min(base.length,699048)));native=rasterSize(Uint8Array.from(binary,c=>c.charCodeAt(0)));}catch{return;}
      const w=svgLength(element.getAttribute('width'))??native.width,h=svgLength(element.getAttribute('height'))??native.height;
      const x=svgCoordinate(element.getAttribute('x')??'0'),y=svgCoordinate(element.getAttribute('y')??'0');if(x===null||y===null)return;
      const box=transformedImage(x,y,w,h,matrix,native.width,native.height);
      if(box)images.push(box);return;
    }
    for(const child of element.children)visit(child,matrix,path);
  }
  visit(root);
  let geometry=svgRasterPlan(view??[0,0,width,height],width,height,/^(?:xMidYMid(?:\s+meet)?)?$/.test(root.getAttribute('preserveAspectRatio')??'')?images:[]);
  let legacyGrid=false;
  // Existing .mifito files retain the raster grid their settings were saved on.
  if(expectedSize&&(expectedSize.width!==geometry.width||expectedSize.height!==geometry.height)) {
    if(expectedSize.width!==legacy.width||expectedSize.height!==legacy.height)throw new Error('SVGの画像サイズが保存された設定と一致しません。');
    validateSize(legacy.width,legacy.height);geometry={...legacy,view:null,imageCrop:null};legacyGrid=true;
  }
  root.setAttribute('width',String(geometry.width));root.setAttribute('height',String(geometry.height));
  if(geometry.view){root.setAttribute('viewBox',geometry.view.join(' '));root.setAttribute('preserveAspectRatio','none');}
  else if(!view&&!legacyGrid)root.setAttribute('viewBox',`0 0 ${width} ${height}`);
  return {blob:new Blob([new XMLSerializer().serializeToString(root)],{type:'image/svg+xml'}),...geometry};
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

export async function decodeImage(file, expectedSize = null) {
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
    const safe=sanitizeSvg(await file.text(),expectedSize),image=await rasterImage(safe.blob);
    const source=document.createElement('canvas');source.width=safe.width;source.height=safe.height;
    source.getContext('2d').drawImage(image,0,0,safe.width,safe.height);
    return {source,width:safe.width,height:safe.height,imageCrop:safe.imageCrop,note:`SVGを${safe.width} × ${safe.height} pxで読み込みました。${safe.imageCrop?'「SVGの画像部分を選択」で端に合わせられます。':''}`};
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
