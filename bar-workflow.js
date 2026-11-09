import { copy, validateSettings } from './core.js?v=label-pt-v1914-1';

// Visibility and calibration belong to each image, even when sharing a style.
export function prepareScaleBar(items,current,settings,scope) {
  if(!['batch','individual'].includes(scope)||!items.includes(current))throw new Error('スケールバーの設定対象が不正です。');
  return (scope==='individual'?[current]:items).map(item=>{
    const next=copy(item===current?settings:item.settings);
    next.scaleBar={...copy(settings.scaleBar),visible:item===current?settings.scaleBar.visible:item.settings.scaleBar.visible};
    return {item,settings:validateSettings(next,item.width,item.height)};
  });
}
