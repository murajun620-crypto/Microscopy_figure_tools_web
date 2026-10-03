import { LIMITS, validateSettings, validateSize } from './core.js?v=2d894542ff65';

// A small UTF-8 manifest followed by unchanged original file bytes. No base64,
// raster conversion, compression or external resources are needed to reopen it.
const MAGIC = new TextEncoder().encode('MiFiTo\r\n');
const HEADER_BYTES = MAGIC.length + 4;
const MANIFEST_LIMIT = 8 * 1024 * 1024;
const FORMATS = ['png','jpeg','svg','pdf','bmp','tiff','pptx'];
const fail = () => { throw new Error('プロジェクトが破損しているか、対応していない形式です。'); };
const digest = async blob => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), n => n.toString(16).padStart(2,'0')).join('');

function validateManifest(data) {
  if (data?.application !== 'MiFiTo' || data.version !== 1 || !Array.isArray(data.images) || !data.images.length || data.images.length > LIMITS.files) fail();
  if (!Number.isSafeInteger(data.activeIndex) || data.activeIndex < 0 || data.activeIndex >= data.images.length) fail();
  let total = 0;
  for (const image of data.images) {
    if (!image || typeof image !== 'object') fail();
    if (typeof image.name !== 'string' || image.name.length > 255 || /[\\/\x00-\x1f]/.test(image.name) || !/\.(png|jpe?g|bmp|svg|tiff?)$/i.test(image.name)) fail();
    if (!Number.isSafeInteger(image.bytes) || image.bytes <= 0 || image.bytes > LIMITS.fileBytes || !/^[a-f0-9]{64}$/.test(image.sha256)) fail();
    if (typeof image.enabled !== 'boolean' || typeof image.type !== 'string' || image.type.length > 100 || !Number.isSafeInteger(image.lastModified) || image.lastModified < 0) fail();
    validateSize(image.width,image.height);
    image.settings = validateSettings(image.settings,image.width,image.height);
    total += image.bytes;
  }
  if (total > LIMITS.batchBytes) throw new Error('プロジェクトの元画像は合計256 MB以内にしてください。');
  const ui = data.ui;
  if (!ui || !Array.isArray(ui.formats) || ui.formats.length > FORMATS.length || ui.formats.some(format=>!FORMATS.includes(format)) || ![300,600,1200].includes(ui.dpi) || typeof ui.includeSettings !== 'boolean' || !['simple','detailed'].includes(ui.colorMode)) fail();
  return total;
}

export async function createProject(items, activeIndex, ui) {
  if (!items.length) throw new Error('プロジェクトに保存する画像を開いてください。');
  if (items.length > LIMITS.files || items.reduce((sum,item)=>sum+item.file.size,0)>LIMITS.batchBytes) throw new Error('画像は100枚、合計256 MB以内にしてください。');
  const images = [];
  for (const item of items) {
    if (item.cropError) throw new Error(`${item.name}：${item.cropError}`);
    images.push({name:item.name,type:item.file.type,bytes:item.file.size,lastModified:item.file.lastModified ?? 0,width:item.width,height:item.height,enabled:item.enabled,settings:structuredClone(item.settings),sha256:await digest(item.file)});
  }
  const data = {application:'MiFiTo',version:1,activeIndex,ui:structuredClone(ui),images};
  validateManifest(data);
  const manifest = new TextEncoder().encode(JSON.stringify(data));
  if (manifest.length > MANIFEST_LIMIT) throw new Error('プロジェクトの設定が大きすぎます。');
  const header = new Uint8Array(HEADER_BYTES); header.set(MAGIC);
  new DataView(header.buffer).setUint32(MAGIC.length,manifest.length,true);
  return new Blob([header,manifest,...items.map(item=>item.file)],{type:'application/octet-stream'});
}

export async function readProject(blob) {
  if (blob.size < HEADER_BYTES || blob.size > HEADER_BYTES + MANIFEST_LIMIT + LIMITS.batchBytes) fail();
  const header = new Uint8Array(await blob.slice(0,HEADER_BYTES).arrayBuffer());
  if (!MAGIC.every((byte,index)=>byte === header[index])) fail();
  const length = new DataView(header.buffer).getUint32(MAGIC.length,true);
  if (length <= 0 || length > MANIFEST_LIMIT || HEADER_BYTES + length > blob.size) fail();
  let data;
  try { data = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await blob.slice(HEADER_BYTES,HEADER_BYTES+length).arrayBuffer())); } catch { fail(); }
  if (HEADER_BYTES + length + validateManifest(data) !== blob.size) fail();
  let offset = HEADER_BYTES + length;
  const images = [];
  for (const image of data.images) {
    // Keep an independent image snapshot: rewriting the opened .mifito file
    // invalidates File-backed slices in Chromium, including later saves.
    const original = new Blob([await blob.slice(offset,offset+image.bytes).arrayBuffer()],{type:image.type}); offset += image.bytes;
    if (await digest(original) !== image.sha256) throw new Error(`${image.name} の画像データが破損しています。`);
    images.push({...image,blob:original});
  }
  return {images,activeIndex:data.activeIndex,ui:data.ui};
}
