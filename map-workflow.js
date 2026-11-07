import { copy, validateSettings } from './core.js?v=79b671978f24';

// Numerical ranges belong to individual images; sharing a design preserves them.
export function prepareMapRange(items,current,range,scope) {
  if(!['batch','individual'].includes(scope)||!items.includes(current))throw new Error('カラーバーの範囲の設定対象が不正です。');
  return (scope==='individual'?[current]:items).map(item=>{
    const settings=copy(item.settings);
    Object.assign(settings.mapColorbar,{min:range.min,max:range.max});
    return {item,settings:validateSettings(settings,item.width,item.height)};
  });
}

export function prepareMapDesign(items,current) {
  if(!items.includes(current))throw new Error('カラーバーの設定対象が不正です。');
  return items.map(item=>{
    const settings=copy(item.settings),{min,max}=settings.mapColorbar;
    settings.mapColorbar={...copy(current.settings.mapColorbar),min,max};
    return {item,settings:validateSettings(settings,item.width,item.height)};
  });
}
