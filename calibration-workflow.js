import { copy, validateSettings } from './core.js?v=e326b16982bb';

// Calibration has its own scope, independent of bar styling and crop scope.
export function prepareCalibration(items,current,calibration,scope) {
  if(!['batch','individual'].includes(scope)||!items.includes(current))throw new Error('校正の設定対象が不正です。');
  return (scope==='individual'?[current]:items).map(item=>{
    const settings=copy(item.settings);
    settings.calibration=copy(calibration);
    return {item,settings:validateSettings(settings,item.width,item.height)};
  });
}
