// Coordinate and settings logic is independent of the DOM and image renderer.
export const UNITS = { nm: 0.001, 'µm': 1, mm: 1000 };
export const LIMITS = { sourcePixels: 64_000_000, outputPixels: 64_000_000, edge: 16384, fileBytes: 128 * 1024 * 1024, batchBytes: 256 * 1024 * 1024, files: 100 };
export const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
export const copy = value => structuredClone(value);

export function positive(value, label) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label}は0より大きい数値にしてください。`);
  return value;
}

export function validateSize(width, height, output = false) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) throw new Error('画像サイズが不正です。');
  if (width > LIMITS.edge || height > LIMITS.edge || width * height > (output ? LIMITS.outputPixels : LIMITS.sourcePixels)) {
    throw new Error('画像サイズが大きすぎます。各辺16,384 px以内、合計64メガピクセル以内にしてください。');
  }
}

export function calibrationFromPoints(p1, p2, length, unit = 'µm') {
  if (!Object.hasOwn(UNITS, unit)) throw new Error('対応していない単位です。');
  for (const point of [p1, p2]) if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error('測定点が不正です。');
  const distance = positive(Math.hypot(p2.x - p1.x, p2.y - p1.y), '2点間の距離');
  return { pixelSize: positive(length, '既知の長さ') / distance, unit };
}

export function scaleBarPixels(calibration, length, unit) {
  if (!calibration || !Object.hasOwn(UNITS, calibration.unit) || !Object.hasOwn(UNITS, unit)) throw new Error('先に校正してください。');
  return positive(length, 'スケールバーの長さ') * UNITS[unit] / (positive(calibration.pixelSize, '校正値') * UNITS[calibration.unit]);
}

export function viewToImage(point, bounds, canvasWidth, canvasHeight, crop, topMargin = 0, raw = false) {
  positive(bounds.width, '表示幅'); positive(bounds.height, '表示高さ');
  const x = (point.x - bounds.left) * canvasWidth / bounds.width;
  const y = (point.y - bounds.top) * canvasHeight / bounds.height;
  return raw ? { x, y } : { x: x + crop.x, y: y - topMargin + crop.y };
}

export function cropFromPoints(start, end, width, height, ratio = null) {
  const x0 = clamp(Math.floor(start.x), 0, width - 1), y0 = clamp(Math.floor(start.y), 0, height - 1);
  const x1 = clamp(Math.floor(end.x), 0, width - 1), y1 = clamp(Math.floor(end.y), 0, height - 1);
  const sx = x1 < x0 ? -1 : 1, sy = y1 < y0 ? -1 : 1;
  let w = Math.abs(x1 - x0) + 1, h = Math.abs(y1 - y0) + 1;
  if (ratio !== null) {
    positive(ratio, '縦横比');
    if (w / h > ratio) w = Math.max(1, pyRound(h * ratio)); else h = Math.max(1, pyRound(w / ratio));
    const fit = Math.min((sx < 0 ? x0 + 1 : width - x0) / w, (sy < 0 ? y0 + 1 : height - y0) / h, 1);
    w = Math.max(1, Math.trunc(w * fit)); h = Math.max(1, Math.trunc(h * fit));
  }
  return { x: sx < 0 ? x0 - w + 1 : x0, y: sy < 0 ? y0 - h + 1 : y0, width: w, height: h };
}

// Python round() uses ties to even; image geometry must use the same rule.
export function pyRound(value) { const floor = Math.floor(value); return value - floor === 0.5 ? floor + (floor % 2 !== 0 ? 1 : 0) : Math.round(value); }
export function dimensionCrop(width, height, ratio, mode) {
  if (!ratio || mode === 'selection') return null;
  positive(ratio, '縦横比');
  const w = mode === 'height' ? Math.max(1, pyRound(height * ratio)) : width;
  const h = mode === 'width' ? Math.max(1, pyRound(width / ratio)) : height;
  if (w > width || h > height) return null;
  return { x: Math.floor((width - w) / 2), y: Math.floor((height - h) / 2), width: w, height: h };
}
export function fitCropAspect(crop, width, height, ratio) {
  const w = crop.width / crop.height > ratio ? Math.max(1, pyRound(crop.height * ratio)) : crop.width;
  const h = crop.width / crop.height > ratio ? crop.height : Math.max(1, pyRound(crop.width / ratio));
  return { x: clamp(pyRound(crop.x + (crop.width - w) / 2), 0, width - w), y: clamp(pyRound(crop.y + (crop.height - h) / 2), 0, height - h), width: w, height: h };
}
export function editCrop(crop, mode, start, end, width, height, ratio = null) {
  if (mode === 'move') return { ...crop, x: clamp(crop.x + Math.floor(end.x) - Math.floor(start.x), 0, width - crop.width), y: clamp(crop.y + Math.floor(end.y) - Math.floor(start.y), 0, height - crop.height) };
  if (ratio && mode.includes('-')) return cropFromPoints({ x: mode.endsWith('left') ? crop.x + crop.width - 1 : crop.x, y: mode.startsWith('top') ? crop.y + crop.height - 1 : crop.y }, end, width, height, ratio);
  let { x, y } = crop, right = x + crop.width, bottom = y + crop.height;
  if (mode.includes('left')) x = clamp(Math.floor(end.x), 0, right - 10);
  if (mode.includes('right')) right = clamp(Math.floor(end.x) + 1, x + 10, width);
  if (mode.includes('top')) y = clamp(Math.floor(end.y), 0, bottom - 10);
  if (mode.includes('bottom')) bottom = clamp(Math.floor(end.y) + 1, y + 10, height);
  return { x, y, width: right - x, height: bottom - y };
}

export function validateCrop(crop, width, height) {
  if (!crop || !['x', 'y', 'width', 'height'].every(key => Number.isSafeInteger(crop[key])) || crop.x < 0 || crop.y < 0 || crop.width < 1 || crop.height < 1 || crop.x + crop.width > width || crop.y + crop.height > height) throw new Error('トリミング範囲が画像の外側にあるか、サイズが不正です。');
  return copy(crop);
}

export function relativeCrop(crop, oldWidth, oldHeight, newWidth, newHeight) {
  const x = clamp(Math.round(crop.x / oldWidth * newWidth), 0, newWidth - 1);
  const y = clamp(Math.round(crop.y / oldHeight * newHeight), 0, newHeight - 1);
  const right = clamp(Math.round((crop.x + crop.width) / oldWidth * newWidth), x + 1, newWidth);
  const bottom = clamp(Math.round((crop.y + crop.height) / oldHeight * newHeight), y + 1, newHeight);
  return { x, y, width: right - x, height: bottom - y };
}

export function defaultSettings(width, height) {
  validateSize(width, height);
  return {
    crop: { x: 0, y: 0, width, height }, calibration: null,
    cropOptions: { aspect: 'free', application: 'selection', width: 5, height: 4, pending: null },
    scaleBar: { visible: true, length: null, unit: 'µm', anchor: 'bottom-right', position: null, fontPercent: 9, thicknessPercent: 0.8, gapPercent: 1, verticalPaddingPercent: 3, color: '#ffffff', textColor: '#ffffff', background: false, backgroundColor: '#000000', opacity: 0.5, showText: true, outsideTransparent: true, outsideColor: '#ffffff' },
    panelLabel: { visible: true, text: '', subtext: '', parentheses: true, anchor: 'top-left', position: null, fontPercent: 9, color: '#ffffff', background: false, backgroundColor: '#000000', opacity: 0.65, bold: false, outsideTransparent: true, outsideColor: '#ffffff' },
    output: { scale: 1, resampling: 'smooth', sizeCm: 4, sizeAxis: 'width', dpi:600, outsideTransparent: true, outsideColor: '#ffffff', pptEditable: false, pptIncludeLabel: true },
  };
}

export class History {
  constructor(initial, limit = 100) { this.limit = limit; this.entries = [copy(initial)]; this.index = 0; }
  push(state) {
    if (JSON.stringify(this.entries[this.index]) === JSON.stringify(state)) return;
    this.entries = this.entries.slice(0, this.index + 1); this.entries.push(copy(state));
    if (this.entries.length > this.limit) this.entries.shift();
    this.index = this.entries.length - 1;
  }
  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index < this.entries.length - 1; }
  undo() { if (this.canUndo) this.index--; return copy(this.entries[this.index]); }
  redo() { if (this.canRedo) this.index++; return copy(this.entries[this.index]); }
}

const anchors = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'outside-top-left', 'outside-top-right', 'outside-bottom-left', 'outside-bottom-center', 'outside-bottom-right'];
function numberRange(value, min, max, name) { if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${name}が不正です。`); return value; }
function color(value) { if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) throw new Error('色が不正です。'); return value; }
function text(value, max = 200) { if (typeof value !== 'string' || value.length > max) throw new Error('文字列が不正、または長すぎます。'); return value; }
function boolean(value) { if (typeof value !== 'boolean') throw new Error('設定の真偽値が不正です。'); return value; }

export function validateSettings(value, width, height) {
  if (!value || typeof value !== 'object') throw new Error('設定JSONの内容が不正です。');
  const defaults = defaultSettings(width, height), result = copy(defaults);
  result.crop = validateCrop(value.crop, width, height);
  if (value.cropOptions) {
    if (!['free', 'source', '1:1', '4:3', '3:2', '16:9', 'custom'].includes(value.cropOptions.aspect) || !['selection', 'width', 'height'].includes(value.cropOptions.application)) throw new Error('トリミングの適用方法が不正です。');
    result.cropOptions = { aspect: value.cropOptions.aspect, application: value.cropOptions.application, width: numberRange(value.cropOptions.width, 0.001, 1000, '縦横比'), height: numberRange(value.cropOptions.height, 0.001, 1000, '縦横比'), pending:value.cropOptions.pending?validateCrop(value.cropOptions.pending,width,height):null };
  }
  if (value.calibration !== null) {
    if (!value.calibration || !Object.hasOwn(UNITS, value.calibration.unit)) throw new Error('校正の単位が不正です。');
    result.calibration = { pixelSize: positive(value.calibration.pixelSize, '校正値'), unit: value.calibration.unit };
  }
  for (const name of ['scaleBar', 'panelLabel']) {
    const settings = value[name];
    if (!settings || !anchors.includes(settings.anchor)) throw new Error('注釈の位置が不正です。');
    const target = result[name];
    for (const key of ['visible', 'background']) target[key] = boolean(settings[key]);
    for (const key of ['color', 'backgroundColor']) target[key] = color(settings[key]);
    target.anchor = settings.anchor;
    target.fontPercent = numberRange(settings.fontPercent, 0.1, 20, '文字サイズ');
    target.opacity = numberRange(settings.opacity, 0, 1, '背景の不透明度');
    target.position = settings.position === null ? null : { x: numberRange(settings.position?.x, 0, width, '注釈X座標'), y: numberRange(settings.position?.y, 0, height * 3, '注釈Y座標') };
    target.outsideTransparent = boolean(settings.outsideTransparent ?? value.output?.outsideTransparent ?? true);
    target.outsideColor = color(settings.outsideColor ?? value.output?.outsideColor ?? '#ffffff');
    if (name === 'scaleBar') {
      target.length = settings.length === null ? null : positive(settings.length, 'スケールバーの長さ');
      if (!Object.hasOwn(UNITS, settings.unit)) throw new Error('スケールバーの単位が不正です。');
      target.unit = settings.unit; target.thicknessPercent = numberRange(settings.thicknessPercent, 0.1, 10, '線の太さ'); target.showText = boolean(settings.showText);
      target.textColor = color(settings.textColor ?? settings.color);
      target.gapPercent = numberRange(settings.gapPercent ?? 1, 0, 10, 'バー－文字間隔');
      target.verticalPaddingPercent = numberRange(settings.verticalPaddingPercent ?? 3, 0, 10, '上下余白補正');
    } else {
      target.text = text(settings.text); target.subtext = text(settings.subtext); target.bold = boolean(settings.bold);
      target.parentheses = boolean(settings.parentheses ?? true);
    }
  }
  const output = value.output;
  if (!output || ![1, 2, 4].includes(output.scale) || !['nearest', 'smooth'].includes(output.resampling) || !['width', 'height'].includes(output.sizeAxis)) throw new Error('出力設定が不正です。');
  if (![300,600,1200].includes(output.dpi ?? 600)) throw new Error('保存解像度が不正です。');
  result.output = { scale: output.scale, resampling: output.resampling, sizeCm: numberRange(output.sizeCm, 0.01, 100, '出力サイズ'), sizeAxis: output.sizeAxis, dpi:output.dpi ?? 600, outsideTransparent: boolean(output.outsideTransparent), outsideColor: color(output.outsideColor), pptEditable: boolean(output.pptEditable), pptIncludeLabel: boolean(output.pptIncludeLabel ?? true) };
  return result;
}

export function serializeProject(settings, image) {
  const s = validateSettings(settings, image.width, image.height), b=s.scaleBar, p=s.panelLabel, c=s.crop;
  const unit=value=>value==='µm'?'um':value;
  return { application: 'microscopy-figure-tools-web', schemaVersion: 2, schema_version: 1,
    image: { name:image.name,path:image.name,source_image_path:image.name,width:image.width,height:image.height }, settings:s,
    crop:{enabled:c.x!==0||c.y!==0||c.width!==image.width||c.height!==image.height,left:c.x,top:c.y,right:c.x+c.width,bottom:c.y+c.height,aspect_mode:s.cropOptions.aspect,aspect_application:s.cropOptions.application,custom_aspect_width:s.cropOptions.width,custom_aspect_height:s.cropOptions.height},
    calibration:{is_calibrated:!!s.calibration,length_per_pixel:s.calibration?.pixelSize??null,unit:s.calibration?unit(s.calibration.unit):null,known_length:null,measured_pixel_distance:null},
    scale_bar:{visible:b.visible,length:b.length,unit:unit(b.unit),position_preset:b.anchor,placement_mode:b.anchor.startsWith('outside-')?'outside_bottom':'inside',horizontal_alignment:b.anchor.split('-').at(-1),use_custom_position:!!b.position,custom_position:b.position??{x:0,y:0},line_width:b.thicknessPercent,line_width_ratio_percent:b.thicknessPercent,line_color:b.color},
    label:{visible:b.showText,font_family:'Arial',font_scale:b.fontPercent,font_ratio_percent:b.fontPercent,color:b.textColor,text_bar_gap_offset:b.gapPercent,text_gap_ratio_percent:b.gapPercent},
    background:{visible:b.background,color:b.backgroundColor,opacity_percent:Math.round(b.opacity*100),vertical_padding_offset:b.verticalPaddingPercent,background_padding_ratio_percent:.8},
    layout:{vertical_padding_offset:b.verticalPaddingPercent,edge_margin_ratio_percent:b.verticalPaddingPercent,text_gap_ratio_percent:b.gapPercent},
    outside_area:{enabled:b.anchor.startsWith('outside-'),transparent:b.outsideTransparent,background_color:b.outsideColor},
    panel_label:{visible:p.visible,text:p.text,supplemental_text:p.subtext,use_parentheses:p.parentheses,position_preset:p.anchor,font_family:'Arial',font_weight:'Regular',font_ratio_percent:p.fontPercent,font_scale:p.fontPercent,supplemental_font_ratio_percent:p.fontPercent,bold:false,text_color:p.color,background_visible:p.background,background_color:p.backgroundColor,background_opacity_percent:Math.round(p.opacity*100),background_padding_ratio_percent:.8,outside_transparent:p.outsideTransparent,outside_background_color:p.outsideColor,use_custom_position:!!p.position,position:p.position??{x:0,y:0}},
    output:{scale_factor:s.output.scale,image_resampling:s.output.resampling,size_axis:s.output.sizeAxis,size_cm:s.output.sizeCm,dpi:s.output.dpi,ppt_label_text:s.output.pptEditable}
  };
}

export function desktopSettings(data, image) {
  const required=['image','crop','calibration','scale_bar','label','background'];
  if(data.schema_version!==1||required.some(key=>!data[key]||typeof data[key]!=='object')) throw new Error('Python版の設定JSONが不正です。');
  const name=String(data.image.source_image_path??data.image.path??'').split(/[\\/]/).at(-1);
  if(name!==image.name||data.image.width!==image.width||data.image.height!==image.height) throw new Error('設定JSONの画像名・サイズが現在の画像と一致しません。対応する元画像を開いてください。');
  const s=defaultSettings(image.width,image.height),c=data.crop,b=data.scale_bar,l=data.label,g=data.background,p=data.panel_label??{},o=data.output??{},a=data.outside_area??{};
  const unit=value=>value==='um'?'µm':value;
  s.crop={x:c.left,y:c.top,width:c.right-c.left,height:c.bottom-c.top};
  s.cropOptions={aspect:c.aspect_mode??'free',application:c.aspect_application??'selection',width:c.custom_aspect_width??5,height:c.custom_aspect_height??4};
  s.calibration=data.calibration.is_calibrated?{pixelSize:data.calibration.length_per_pixel,unit:unit(data.calibration.unit)}:null;
  Object.assign(s.scaleBar,{visible:b.visible,length:b.length??null,unit:unit(b.unit),anchor:b.placement_mode==='outside_bottom'?`outside-bottom-${b.horizontal_alignment??b.position_preset.split('-').at(-1)}`:b.position_preset,
    position:b.use_custom_position?b.custom_position:null,thicknessPercent:b.line_width_ratio_percent??b.line_width,color:b.line_color,showText:l.visible,fontPercent:l.font_ratio_percent??l.font_scale,textColor:l.color,gapPercent:l.text_gap_ratio_percent??l.text_bar_gap_offset,
    verticalPaddingPercent:data.layout?.edge_margin_ratio_percent??g.vertical_padding_offset??0,background:g.visible,backgroundColor:g.color,opacity:g.opacity_percent/100,outsideTransparent:a.transparent??true,outsideColor:a.background_color??'#ffffff'});
  Object.assign(s.panelLabel,{visible:p.visible??true,text:p.text??'a',subtext:p.supplemental_text??'',parentheses:p.use_parentheses??true,anchor:p.position_preset??'top-left',fontPercent:p.font_ratio_percent??p.font_scale??9,color:p.text_color??'#ffffff',background:p.background_visible??false,backgroundColor:p.background_color??'#000000',opacity:(p.background_opacity_percent??65)/100,outsideTransparent:p.outside_transparent??true,outsideColor:p.outside_background_color??'#ffffff',position:p.use_custom_position?p.position:null});
  Object.assign(s.output,{scale:o.scale_factor??1,resampling:o.image_resampling??'smooth',sizeAxis:o.size_axis??'width',sizeCm:o.size_cm??4,dpi:o.dpi??600,pptEditable:o.ppt_label_text??false});
  return validateSettings(s,image.width,image.height);
}
export function formatLength(value){
  positive(value,'スケールバーの長さ');
  if(Number.isInteger(value))return BigInt(value).toString();
  const rounded=Number(value.toPrecision(6)),exponent=Math.floor(Math.log10(rounded));
  if(exponent>=-4&&exponent<6)return rounded.toString();
  const [mantissa,power]=rounded.toExponential().split('e'),n=Number(power);
  return `${mantissa}e${n<0?'-':'+'}${String(Math.abs(n)).padStart(2,'0')}`;
}

export function clipCrop(crop,width,height){
  const x=clamp(crop.x,0,width),y=clamp(crop.y,0,height),right=clamp(crop.x+crop.width,0,width),bottom=clamp(crop.y+crop.height,0,height);
  return right>x&&bottom>y?{x,y,width:right-x,height:bottom-y}:null;
}
export function sessionProject(items,output,formats=['png']){
  return {schema_version:1,session_type:'microscopy_batch',output_dir:null,output_scale:output.scale,image_resample:output.resampling,output_size_axis:output.sizeAxis,output_size_cm:output.sizeCm,output_dpi:output.dpi,output_formats:formats.map(format=>`.${format==='jpeg'?'jpg':format==='tiff'?'tif':format}`),conflict_mode:'auto-number',items:items.map(item=>({source_path:item.name,enabled:item.enabled,scale_bar_visible:item.barVisible??item.settings.scaleBar.visible,panel_label_visible:item.labelVisible??item.settings.panelLabel.visible,generated_label:item.labelText??item.settings.panelLabel.text,supplemental_text:item.subtext??item.settings.panelLabel.subtext,project_data:serializeProject(item.settings,item)}))};
}
export function parseSession(data,images){
  if(!data||data.schema_version!==1||data.session_type!=='microscopy_batch'||!Array.isArray(data.items)||!data.items.length||data.items.length>LIMITS.files)throw new Error('セッションJSONが不正です。');
  const used=new Set();
  return data.items.map(record=>{
    const name=String(record.source_path??'').split(/[\\/]/).at(-1),matches=images.filter(image=>image.name===name);
    if(matches.length!==1||used.has(matches[0]?.id))throw new Error(`セッションの元画像 ${name} を一意に対応できません。元画像を先に開き、同名画像の重複を解消してください。`);
    const image=matches[0];used.add(image.id);const settings=parseProject(record.project_data,image);
    settings.scaleBar.visible=boolean(record.scale_bar_visible);settings.panelLabel.visible=boolean(record.panel_label_visible);settings.panelLabel.text=text(record.generated_label);settings.panelLabel.subtext=text(record.supplemental_text);
    Object.assign(settings.output,{scale:data.output_scale??1,resampling:data.image_resample??'smooth',sizeAxis:data.output_size_axis??'width',sizeCm:data.output_size_cm??4,dpi:data.output_dpi??600});
    return {image,enabled:boolean(record.enabled),settings:validateSettings(settings,image.width,image.height)};
  });
}

export function parseProject(json, image) {
  let data;
  try { data = typeof json === 'string' ? JSON.parse(json) : json; }
  catch { throw new Error('設定JSONを読み取れませんでした。JSON形式をご確認ください。'); }
  if(data?.schema_version===1&&data.application!=='microscopy-figure-tools-web') return desktopSettings(data,image);
  if (!data || typeof data !== 'object' || data.application !== 'microscopy-figure-tools-web' || ![1,2].includes(data.schemaVersion)) throw new Error('Web版またはPython版の設定JSONを選択してください。');
  if (!data.image || data.image.width !== image.width || data.image.height !== image.height || data.image.name !== image.name) throw new Error('設定JSONの画像名・サイズが現在の画像と一致しません。対応する元画像を開いてください。');
  return validateSettings(data.settings, image.width, image.height);
}

export function outputMetrics(plan, output) {
  const width = plan.width, height = plan.height;
  validateSize(width, height, true);
  const axisPixels = output.sizeAxis === 'width' ? width : height;
  const dpi = axisPixels / positive(output.sizeCm, '出力サイズ') * 2.54;
  return { width, height, dpi, widthCm: width / dpi * 2.54, heightCm: height / dpi * 2.54 };
}

export function rasterMetrics(plan, output) {
  const metrics = outputMetrics(plan, output);
  const dpi = output.dpi ?? 600;
  if (![300,600,1200].includes(dpi)) throw new Error('保存解像度が不正です。');
  const width = Math.max(1, pyRound(metrics.widthCm / 2.54 * dpi)), height = Math.max(1, pyRound(metrics.heightCm / 2.54 * dpi));
  validateSize(width, height, true);
  return { ...metrics, width, height, dpi };
}

export function sequenceLabel(index, mode, start = 1, prefix = '', uppercase = false) {
  if (!Number.isSafeInteger(index) || index < 0 || !Number.isSafeInteger(start) || start < 1) throw new Error('連番が不正です。');
  if (mode === 'number') return `${prefix}${start + index}`;
  if (mode === 'roman') {
    let value = start + index, result = '';
    for (const [n, letters] of [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']]) while (value >= n) { result += letters; value -= n; }
    return prefix + (uppercase ? result : result.toLowerCase());
  }
  let value = start + index, label = '';
  while (value > 0) { value--; label = String.fromCharCode(97 + value % 26) + label; value = Math.floor(value / 26); }
  return prefix + (uppercase ? label.toUpperCase() : label);
}

export function uniqueName(name, used) {
  const base = name.replace(/\.[^.]+$/, '').replace(/[\\/\x00-\x1f<>:"|?*]/g, '_').replace(/^\.+/, '').trim() || 'image';
  let candidate = base, suffix = 2;
  while (used.has(candidate.toLowerCase())) candidate = `${base}_${suffix++}`;
  used.add(candidate.toLowerCase()); return candidate;
}
