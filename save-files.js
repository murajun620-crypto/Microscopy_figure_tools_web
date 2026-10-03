import { uniqueName } from './core.js?v=2d894542ff65';

export const extensionFor = format => format === 'jpeg' ? 'jpg' : format === 'tiff' ? 'tif' : format;
export function outputBase(name, used = new Set()) { return `${uniqueName(name, used)}_mifito`; }

export async function ensureWritable(directory) {
  const options = { mode:'readwrite' };
  if (await directory.queryPermission(options) !== 'granted' && await directory.requestPermission(options) !== 'granted') {
    throw new Error('このフォルダへの保存が許可されていません。保存先を選び直してください。');
  }
}

// Keep the mifito suffix even when a previous output already exists.
export async function writeFile(directory, blob, requestedName) {
  const match = /^(.*)_mifito(\.[^.]+)$/.exec(requestedName);
  if (!match || /[\\/]/.test(requestedName)) throw new Error('保存ファイル名が不正です。');
  let name = requestedName;
  for (let number = 1; ; number++) {
    try { await directory.getFileHandle(name); }
    catch (error) { if (error.name === 'NotFoundError') break; throw error; }
    if (number >= 10000) throw new Error('同名の保存ファイルが多すぎます。別の保存先を選んでください。');
    name = `${match[1]}_${number + 1}_mifito${match[2]}`;
  }
  const handle = await directory.getFileHandle(name, { create:true }), writer = await handle.createWritable();
  try { await writer.write(blob); await writer.close(); }
  catch (error) { try { await writer.abort(); } catch {} throw error; }
  return name;
}

export async function readFolder(directory, supported, limit = 100) {
  const records = [];
  async function visit(parent, depth) {
    if (depth > 10) throw new Error('フォルダの階層が深すぎます。画像のあるフォルダを直接開いてください。');
    for await (const entry of parent.values()) {
      if (entry.kind === 'directory') await visit(entry, depth + 1);
      else if (supported.test(entry.name) && !/_mifito\.[^.]+$/i.test(entry.name)) {
        if (records.length >= limit) throw new Error('画像は100枚以内のフォルダを開いてください。');
        records.push({ file:await entry.getFile(), directory:parent });
      }
    }
  }
  await visit(directory, 0);
  return records;
}
