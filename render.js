import { clamp, formatLength, outputMetrics, pyRound, rasterMetrics, scaleBarPixels } from './core.js';
import { inlineRuns } from './inline-text.js';

export const FONT = 'Arial';
export const font = size => `${size}px Arial, sans-serif`;
const pixels = (short, percent, minimum = 1) => Math.max(minimum, pyRound(short * percent / 100));
const rect = (x, y, width, height) => ({ x, y, width, height });
const alignX = (anchor, width, boxWidth, inset = 0) => anchor.endsWith('right') ? Math.max(0, width - boxWidth - inset) : anchor.endsWith('center') ? Math.max(0, Math.floor((width - boxWidth) / 2)) : inset;
const lengthText = formatLength;
export function panelParts(style, includeLabel = true) {
  let core = style.text.trim();
  while (core.startsWith('(') && core.endsWith(')') && core.slice(1, -1).trim()) core = core.slice(1, -1).trim();
  return [includeLabel && core ? (style.parentheses ? `(${core})` : core) : '', style.subtext.trim()];
}
function metrics(context, text, size) {
  context.font = font(size); const m = context.measureText(text);
  const ascent = Math.round(m.fontBoundingBoxAscent ?? size * 1854 / 2048), descent = Math.round(m.fontBoundingBoxDescent ?? size * 434 / 2048);
  const left = Math.floor(-(m.actualBoundingBoxLeft ?? 0)), right = Math.ceil(m.actualBoundingBoxRight ?? m.width);
  const top = -Math.ceil(m.actualBoundingBoxAscent ?? size * .75), bottom = Math.ceil(m.actualBoundingBoxDescent ?? size * .2);
  return { advance: pyRound(m.width), left, right, top, bottom, tightWidth: Math.max(0, right - left), tightHeight: Math.max(0, bottom - top), ascent, descent, height: ascent + descent };
}
function textRuns(context, text, size) {
  const base = metrics(context, 'M', size); let x = 0, left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  const runs = inlineRuns(text).map(run => {
    const runSize = run.script ? Math.max(1, pyRound(size * .7)) : size;
    const m = metrics(context, run.text, runSize), y = base.ascent + (run.script < 0 ? Math.max(1, pyRound(size * .25)) : run.script > 0 ? -Math.max(1, pyRound(size * .35)) : 0);
    const result = { text: run.text, size: runSize, x, y };
    left = Math.min(left, x + m.left); top = Math.min(top, y + m.top); right = Math.max(right, x + m.right); bottom = Math.max(bottom, y + m.bottom);
    x += m.advance; return result;
  });
  return { runs, advance: x, left: runs.length ? left : 0, top: runs.length ? top : 0, width: runs.length ? right - left : 0, height: runs.length ? bottom - top : 0 };
}

// Port of MainWindow._calculate_scale_bar_layout and _panel_label_layout.
// Output-scale rounding happens before layout, as in Qt, not after drawing.
export function buildPlan(settings, context, strict = false, scale = 1, includeLabel = true) {
  const { crop, scaleBar: bar, panelLabel: label } = settings;
  const width = crop.width * scale, imageHeight = crop.height * scale, short = Math.min(width, imageHeight);
  const boxes = [], warnings = [];
  if (bar.visible && settings.calibration && bar.length) {
    const barWidth = Math.max(1, pyRound(scaleBarPixels(settings.calibration, bar.length, bar.unit) * scale));
    if (barWidth >= width) throw new Error('スケールバーが画像の幅を超えています。');
    const fontSize = pixels(short, bar.fontPercent), m = metrics(context, `${lengthText(bar.length)} ${bar.unit}`, fontSize);
    const textWidth = bar.showText ? Math.max(m.advance, m.tightWidth) + Math.max(2, pyRound(fontSize * .12)) : 0;
    const textHeight = bar.showText ? m.height : 0, thickness = pixels(short, bar.thicknessPercent), gap = bar.showText ? pixels(short, bar.gapPercent, 0) : 0;
    const paddingX = Math.max(1, pyRound(fontSize * .2)), paddingTop = Math.max(1, pyRound(fontSize * .15)), paddingBottom = paddingTop + Math.max(1, pyRound(fontSize * .1));
    const contentWidth = Math.max(barWidth, textWidth), contentHeight = thickness + (bar.showText ? gap + textHeight : 0);
    const bgWidth = contentWidth + paddingX * 2, bgHeight = contentHeight + paddingTop + paddingBottom;
    const outside = bar.anchor.startsWith('outside-bottom'), verticalPadding = pixels(short, bar.verticalPaddingPercent, 0);
    const totalWidth = outside ? Math.min(width, Math.max(bar.background ? bgWidth : 0, contentWidth + pixels(short, .8) * 2)) : (bar.background ? bgWidth : contentWidth);
    const totalHeight = (outside ? verticalPadding : 0) + (bar.background ? bgHeight : contentHeight);
    const edge = bar.background ? 0 : pixels(short, bar.verticalPaddingPercent);
    const x = outside ? alignX(bar.anchor, width, totalWidth) : clamp(alignX(bar.anchor, width, totalWidth, edge), 0, Math.max(0, width - totalWidth));
    const y = outside ? imageHeight : clamp(bar.anchor.startsWith('bottom') ? imageHeight - totalHeight - edge : edge, 0, Math.max(0, imageHeight - totalHeight));
    const cx = outside ? Math.max(bar.background ? paddingX : pixels(short, .8), Math.floor((totalWidth - contentWidth) / 2)) : (bar.background ? paddingX : 0);
    const cy = (outside ? verticalPadding : 0) + (bar.background ? paddingTop : 0);
    const barY = !outside && bar.anchor.startsWith('bottom') ? cy + (bar.showText ? textHeight + gap : 0) : cy;
    const textY = !outside && bar.anchor.startsWith('bottom') ? cy : cy + thickness + gap;
    boxes.push({ kind:'scaleBar', anchor:bar.anchor, style:bar, x,y, width:totalWidth,height:totalHeight, band:outside ? 'bottom' : null, bandHeight:outside ? totalHeight : 0,
      backgroundRect:bar.background ? rect(cx-paddingX, cy-paddingTop, bgWidth,bgHeight) : null,
      barRect:rect(cx+Math.floor((contentWidth-barWidth)/2),barY,barWidth,thickness),
      runs:bar.showText ? [{ text:`${lengthText(bar.length)} ${bar.unit}`, size:fontSize, x:cx+Math.floor((contentWidth-textWidth)/2), y:textY+m.ascent }] : [],
      fontSize,barWidth,thickness,textWidth,textHeight,gap });
  } else if (bar.visible) warnings.push(settings.calibration ? 'スケールバーの長さを入力してください。' : '未校正：スケールバーは表示されません。');
  if (label.visible) {
    const [main, supplemental] = panelParts(label, includeLabel), fontSize = pixels(short, label.fontPercent);
    const m = metrics(context, main, fontSize), sub = textRuns(context, supplemental, fontSize);
    const labelWidth = main ? m.tightWidth : 0, subWidth = supplemental ? Math.max(pyRound(sub.width),sub.advance) : 0;
    const gap = main && supplemental ? metrics(context,' ',fontSize).advance : 0;
    const subHeight = supplemental ? pyRound(sub.height) : 0, contentHeight = Math.max(main ? m.tightHeight : 0,subHeight,fontSize);
    const paddingX = label.background ? Math.max(1,pyRound(fontSize*.2)) : 0, paddingY = label.background ? Math.max(1,pyRound(fontSize*.15)) : 0;
    const boxWidth = Math.max(1,labelWidth+gap+subWidth+paddingX*2), boxHeight = Math.max(1,contentHeight+paddingY*2);
    const outsideGap = Math.max(1,pyRound(3*short/1000));
    const band = label.anchor.startsWith('outside-top') ? 'top' : label.anchor.startsWith('outside-bottom') ? 'bottom' : null;
    const x=alignX(label.anchor,width,boxWidth), y=band==='top' ? 0 : band==='bottom' ? imageHeight+outsideGap : label.anchor.startsWith('bottom') ? Math.max(0,imageHeight-boxHeight) : 0;
    const runs=[];
    if(main) runs.push({text:main,size:fontSize,x:paddingX-m.left,y:paddingY+Math.max(0,(contentHeight-m.tightHeight)/2)-m.top});
    if(supplemental) runs.push(...sub.runs.map(run=>({...run,x:run.x+paddingX+labelWidth+gap-sub.left,y:run.y+paddingY+Math.max(0,(contentHeight-subHeight)/2)-sub.top})));
    boxes.push({kind:'panelLabel',anchor:label.anchor,style:label,x,y,width:boxWidth,height:boxHeight,band,bandHeight:band?boxHeight+outsideGap:0,backgroundRect:label.background?rect(0,0,boxWidth,boxHeight):null,runs,fontSize,subSize:fontSize,labelWidth,gap,pad:paddingX,main,supplemental});
  }
  const top=Math.max(0,...boxes.filter(b=>b.band==='top').map(b=>b.bandHeight)), bottom=Math.max(0,...boxes.filter(b=>b.band==='bottom').map(b=>b.bandHeight));
  const fills=[];
  for(const box of boxes) {
    const shift=box.band==='top'?0:top;
    box.area=box.band ? rect(0,box.band==='top'?0:top+imageHeight,width,box.bandHeight) : rect(0,top,width,imageHeight);
    box.y+=shift;
    if(box.style.position) { box.x=clamp(box.style.position.x*scale,box.area.x,Math.max(box.area.x,width-box.width)); box.y=clamp(box.style.position.y*scale+shift,box.area.y,Math.max(box.area.y,box.area.y+box.area.height-box.height)); }
    if(box.band && !box.style.outsideTransparent) fills.push({...box.area,color:box.style.outsideColor});
  }
  return {width,height:imageHeight+top+bottom,top,bottom,crop:{...crop},imageHeight,coordinateScale:scale,annotations:boxes,fills,warnings};
}

export function paint(context, source, plan, settings, {scale=1,annotations=true,panelText=true,image=true,annotationShapes=true,onlyAnnotationKind=null}={}) {
  context.save();context.scale(scale,scale);context.clearRect(0,0,plan.width,plan.height);
  if(image) for(const fill of plan.fills||[]) {context.fillStyle=fill.color;context.fillRect(fill.x,fill.y,fill.width,fill.height);}
  context.imageSmoothingEnabled=settings.output.resampling==='smooth';context.imageSmoothingQuality='high';
  const c=plan.crop;if(image) context.drawImage(source,c.x,c.y,c.width,c.height,0,plan.top,plan.width,plan.imageHeight??c.height);
  if(annotations) for(const box of plan.annotations) {
    if(onlyAnnotationKind&&box.kind!==onlyAnnotationKind)continue;
    const s=box.style,bg=box.backgroundRect;
    context.save();context.translate(pyRound(box.x),pyRound(box.y));
    if(annotationShapes&&bg) {context.fillStyle=s.backgroundColor;context.globalAlpha=Math.round(s.opacity*255)/255;context.fillRect(bg.x,bg.y,bg.width,bg.height);context.globalAlpha=1;}
    if(annotationShapes&&box.barRect) {const r=box.barRect;context.fillStyle=s.color;context.fillRect(r.x,r.y,r.width,r.height);}
    if(box.kind!=='panelLabel'||panelText) {
      context.fillStyle=box.kind==='scaleBar'?s.textColor:s.color;context.textAlign='left';context.textBaseline='alphabetic';
      for(const run of box.runs) {context.font=font(run.size);context.fillText(run.text,run.x,run.y);}
    }
    context.restore();
  }
  context.restore();
}
export function renderCanvas(source,settings,options={}) {
  const canvas=document.createElement('canvas'),plan=buildPlan(settings,canvas.getContext('2d'),true,settings.output.scale,options.includeLabel??true),metrics=outputMetrics(plan,settings.output);
  canvas.width=metrics.width;canvas.height=metrics.height;paint(canvas.getContext('2d'),source,plan,settings,options);
  return {canvas,plan,metrics};
}
export function renderRaster(source,settings) {
  const rendered=renderCanvas(source,settings),metrics=rasterMetrics(rendered.plan,settings.output);
  if(rendered.canvas.width===metrics.width&&rendered.canvas.height===metrics.height) return {...rendered,metrics};
  const canvas=document.createElement('canvas');canvas.width=metrics.width;canvas.height=metrics.height;
  const context=canvas.getContext('2d');context.imageSmoothingEnabled=settings.output.resampling==='smooth';context.imageSmoothingQuality='high';context.drawImage(rendered.canvas,0,0,metrics.width,metrics.height);
  rendered.canvas.width=rendered.canvas.height=0;return {canvas,plan:rendered.plan,metrics};
}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function renderSvg(source,settings,options={}) {
  const {canvas,plan,metrics}=renderCanvas(source,settings,{annotations:false,...options});
  const base=canvas.toDataURL('image/png');canvas.width=canvas.height=0;
  const elements=[`<image width="${metrics.width}" height="${metrics.height}" href="${base}"/>`];
  for(const box of plan.annotations) {
    const s=box.style,shapes=[],r=box.backgroundRect,b=box.barRect;
    if(r) shapes.push(`<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="${s.backgroundColor}" opacity="${Math.round(s.opacity*255)/255}"/>`);
    if(b) shapes.push(`<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="${s.color}"/>`);
    if(box.kind!=='panelLabel'||options.panelText!==false) for(const run of box.runs) shapes.push(`<text x="${run.x}" y="${run.y}" font-size="${run.size}" fill="${box.kind==='scaleBar'?s.textColor:s.color}">${escape(run.text)}</text>`);
    elements.push(`<g transform="translate(${pyRound(box.x)} ${pyRound(box.y)})" font-family="Arial, sans-serif" font-weight="400">${shapes.join('')}</g>`);
  }
  return {markup:`<svg xmlns="http://www.w3.org/2000/svg" width="${metrics.widthCm}cm" height="${metrics.heightCm}cm" viewBox="0 0 ${metrics.width} ${metrics.height}">${elements.join('')}</svg>`,metrics};
}
