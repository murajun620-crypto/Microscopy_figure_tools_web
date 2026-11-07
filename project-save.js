import { filePickerOptions } from './ui-common.js?v=79b671978f24';

export async function prepareProjectSave({handle=null,saveAs=false,name,startIn,fallback},host=window) {
  let target=saveAs?null:handle;
  if(target) {
    const options={mode:'readwrite'};
    if(typeof target.queryPermission==='function'&&await target.queryPermission(options)!=='granted') {
      if(typeof target.requestPermission!=='function'||await target.requestPermission(options)!=='granted')throw new Error('このプロジェクトへの上書き保存が許可されていません。「名前を付けて保存」で保存先を選び直してください。');
    }
  } else if(typeof host.showSaveFilePicker==='function') {
    target=await host.showSaveFilePicker({...filePickerOptions('mifito-images','MiFiToプロジェクト',{'application/octet-stream':['.mifito']},startIn),suggestedName:name});
  } else {
    return {handle:null,name,write:blob=>fallback(blob,name)};
  }
  return {handle:target,name:target.name,async write(blob){
    const writer=await target.createWritable();
    try{await writer.write(blob);await writer.close();}
    catch(error){try{await writer.abort();}catch{}throw error;}
    return target.name;
  }};
}
