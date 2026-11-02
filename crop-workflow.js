import { copy, validateCrop, validateSettings } from './core.js?v=ef359abed43b';

export function cropTargets(items,current,scope) {
  if(!['batch','individual'].includes(scope)||!items.includes(current))throw new Error('トリミングの設定対象が不正です。');
  return scope==='individual'?[current]:items;
}
export function cropConflicts(targets,crop) {
  return targets.filter(item=>{try{validateCrop(crop,item.width,item.height);return false;}catch{return true;}});
}
// Validate the whole operation before changing even one image. Different-sized
// images must never receive a silently clipped, smaller version of the crop.
export function prepareCrop(items,current,crop,scope,reset=false) {
  const targets=cropTargets(items,current,scope);
  const conflicts=reset?[]:cropConflicts(targets,crop);
  if(conflicts.length)throw new Error(`範囲が収まらない画像：${conflicts.map(item=>`${item.name}（${item.width} × ${item.height} px）`).join('、')}。全画像に収まる範囲に変更するか、「個別設定」を選んでください。画像は変更していません。`);
  return targets.map(item=>{
    const next=reset?{x:0,y:0,width:item.width,height:item.height}:validateCrop(crop,item.width,item.height);
    const settings=copy(item.settings),previous=settings.crop;
    settings.crop=next;settings.cropOptions.pending=null;
    if(item===current||scope==='batch')settings.cropOptions={...copy(current.settings.cropOptions),pending:null};
    if(settings.panelLabel.position){settings.panelLabel.position.x=Math.max(0,settings.panelLabel.position.x-next.x+previous.x);settings.panelLabel.position.y=Math.max(0,settings.panelLabel.position.y-next.y+previous.y);}
    settings.scaleBar.position=null;settings.scaleBar.fontPercent=9;
    return {item,settings:validateSettings(settings,item.width,item.height)};
  });
}

// Undo uses the scope of the original operation, even if the user switches
// scope later. Images with newer edits are left alone instead of rewinding them.
export class CropTransactions {
  #undo=new WeakMap();#redo=new WeakMap();
  apply(updates) {
    const records=[];
    for(const {item,settings} of updates) {
      const before=item.history.entries[item.history.index],beforeError=item.cropError;
      item.settings=copy(settings);item.cropError=null;item.history.push(item.settings);
      const after=item.history.entries[item.history.index];
      if(before!==after)records.push({item,before,after,beforeError});
    }
    for(const record of records){this.#undo.set(record.after,records);this.#redo.set(record.before,records);}
  }
  step(current,redo,items) {
    const entry=current.history.entries[current.history.index],records=(redo?this.#redo:this.#undo).get(entry);
    if(!records)return false;
    if(!records.some(record=>record.item===current&&current.history.entries[current.history.index+(redo?1:-1)]===(redo?record.after:record.before)))return false;
    for(const record of records) {
      const {item,before,after}=record;
      if(!items.includes(item)||item.history.entries[item.history.index]!== (redo?before:after))continue;
      const index=item.history.index+(redo?1:-1);
      if(item.history.entries[index]!== (redo?after:before))continue;
      item.settings=redo?item.history.redo():item.history.undo();item.cropError=redo?null:record.beforeError;
    }
    return true;
  }
}
