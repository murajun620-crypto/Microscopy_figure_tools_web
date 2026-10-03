import { copy, outputMetrics, pyRound, relativeCrop, serializeProject, uniqueName } from './core.js?v=2d894542ff65';
import { numberedLabel } from './label-numbering.js?v=fe9f5790b43f';
import { canvasBlob, decodeImage, encodeTiff, loadScript, releaseImage } from './io.js?v=deadb306aaf4';
import { buildPlan, renderCanvas, renderRaster, renderSvg } from './render.js?v=952b7e69af87';
import { inlinePlain } from './inline-text.js';
import { pngWithDpi } from './png.js';
import { jpegWithDpi } from './jpeg.js';
import { outputBase, extensionFor } from './save-files.js?v=84ba3a3d158f';

export async function exportImage(source, settings, format) {
  if (format === 'svg') {
    const { markup } = renderSvg(source, settings);
    return new Blob([markup], { type: 'image/svg+xml' });
  }
  const { canvas, plan, metrics } = format === 'pdf' ? renderCanvas(source, settings,{annotations:false}) : renderRaster(source, settings);
  try {
    if (format === 'png') return new Blob([pngWithDpi(new Uint8Array(await (await canvasBlob(canvas)).arrayBuffer()), metrics.dpi)], { type: 'image/png' });
    if (format === 'tiff') return await encodeTiff(canvas, metrics.dpi);
    if (format === 'jpeg' || format === 'bmp') {
      const context=canvas.getContext('2d');context.globalCompositeOperation='destination-over';context.fillStyle=settings.scaleBar.outsideColor;context.fillRect(0,0,canvas.width,canvas.height);context.globalCompositeOperation='source-over';
      if(format==='jpeg') {const blob=await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('JPEGを生成できませんでした。')),'image/jpeg',1));return new Blob([jpegWithDpi(new Uint8Array(await blob.arrayBuffer()),metrics.dpi)],{type:'image/jpeg'});}
      const {encodeBmp}=await import('./bmp.js');return new Blob([encodeBmp(context.getImageData(0,0,canvas.width,canvas.height),metrics.dpi)],{type:'image/bmp'});
    }
    if (format === 'pdf') {
      await loadScript('pdf-lib.min.js');
      const doc = await PDFLib.PDFDocument.create(), image = await doc.embedPng(await (await canvasBlob(canvas)).arrayBuffer());
      const width = metrics.widthCm / 2.54 * 72, height = metrics.heightCm / 2.54 * 72;
      const page=doc.addPage([width,height]),sx=width/plan.width,sy=height/plan.height;
      page.drawImage(image,{x:0,y:0,width,height});
      const color=value=>PDFLib.rgb(parseInt(value.slice(1,3),16)/255,parseInt(value.slice(3,5),16)/255,parseInt(value.slice(5,7),16)/255);
      for(const box of plan.annotations){
        const draw=(r,fill,opacity=1)=>page.drawRectangle({x:(pyRound(box.x)+r.x)*sx,y:height-(pyRound(box.y)+r.y+r.height)*sy,width:r.width*sx,height:r.height*sy,color:color(fill),opacity});
        if(box.backgroundRect)draw(box.backgroundRect,box.style.backgroundColor,Math.round(box.style.opacity*255)/255);
        if(box.barRect)draw(box.barRect,box.style.color);
        // Preserve the browser's Arial/TeX appearance without embedding a
        // proprietary system font. Bars and backgrounds remain PDF vectors.
        const textLayer=renderCanvas(source,settings,{image:false,annotationShapes:false,onlyAnnotationKind:box.kind});
        try{const text=await doc.embedPng(await(await canvasBlob(textLayer.canvas)).arrayBuffer());page.drawImage(text,{x:0,y:0,width,height});}
        finally{textLayer.canvas.width=textLayer.canvas.height=0;}
      }
      return new Blob([await doc.save()], { type: 'application/pdf' });
    }
    throw new Error('対応していない出力形式です。');
  } finally { canvas.width = canvas.height = 0; }
}

export async function createPresentation() {
  await loadScript('pptxgen.bundle.js');
  const presentation = new PptxGenJS(); presentation.layout = 'LAYOUT_WIDE';
  presentation.author = 'Microscopy Figure Tools'; presentation.subject = 'Microscopy figures'; presentation.title = 'Microscopy Figures'; presentation.lang = 'ja-JP';
  return presentation;
}

export function addFigureSlide(presentation, source, settings, imageName, availableBytes = 256 * 1024 * 1024) {
  const { canvas, plan, metrics } = renderCanvas(source, settings, { panelText: !settings.output.pptEditable, includeLabel:settings.output.pptIncludeLabel });
  try {
    const imageData = canvas.toDataURL('image/png'), bytes = Math.ceil(imageData.length * 0.75);
    if (bytes > availableBytes) throw new Error('PPTX内の画像合計が256 MBを超えます。対象枚数や出力倍率を減らしてください。');
    const slide = presentation.addSlide(), requestedW = metrics.widthCm / 2.54, requestedH = metrics.heightCm / 2.54;
    const fit = Math.min(1, 12.333 / requestedW, 6.5 / requestedH), width = requestedW * fit, height = requestedH * fit;
    const x = (13.333333 - width) / 2, y = (7.5 - height) / 2, scale = width / plan.width;
    slide.addImage({ data: imageData, x, y, w: width, h: height, altText: imageName });
    if (settings.output.pptEditable) for (const box of plan.annotations.filter(box => box.kind === 'panelLabel')) {
      const s = box.style;
      const options = { fontFace: 'Arial', color: s.color.slice(1), margin: 0, breakLine: false, valign: 'mid', paraSpaceAfter: 0, lineSpacingMultiple: 1, fit: 'shrink', transparency: 0 };
      if (box.main) slide.addText(box.main, { ...options, x:x+(box.x+box.pad)*scale,y:y+box.y*scale,w:Math.max(.01,box.labelWidth*scale+.02),h:box.height*scale,fontSize:box.fontSize*scale*72 });
      if (box.supplemental) slide.addText(inlinePlain(box.supplemental), { ...options,x:x+(box.x+box.pad+box.labelWidth+box.gap)*scale,y:y+box.y*scale,w:Math.max(.01,(box.width-2*box.pad-box.labelWidth-box.gap)*scale+.02),h:box.height*scale,fontSize:box.fontSize*scale*72 });
    }
    return bytes;
  } finally { canvas.width = canvas.height = 0; }
}

export async function presentationBlob(presentation) {
  return presentation.write({ outputType: 'blob', compression: true });
}

export function batchSettings(template, original, target, index, numbering) {
  const individual=numbering.cropMode==='individual'&&target.settings;
  const settings = copy(individual?target.settings:template);
  if(!individual) settings.crop = relativeCrop(template.crop, original.width, original.height, target.width, target.height);
  else {if(target.cropError)throw new Error(target.cropError);settings.calibration??=copy(template.calibration);settings.output=copy(template.output);}
  settings.cropOptions.pending=null;
  // Preserve physical length per pixel, not the original image's physical width.
  // This assumes all selected images have the same acquisition calibration.
  if(!individual) for (const name of ['scaleBar', 'panelLabel']) settings[name].position = null;
  settings.scaleBar.visible = target.barVisible ?? template.scaleBar.visible;
  settings.panelLabel.visible = target.labelVisible ?? template.panelLabel.visible;
  if(target.labelText!==undefined) settings.panelLabel.text=target.labelText;
  if(target.subtext!==undefined) settings.panelLabel.subtext=target.subtext;
  if (numbering.enabled && (settings.panelLabel.visible || numbering.mode==='none')) {
    settings.panelLabel.text = numberedLabel(index, numbering);
    settings.panelLabel.parentheses=numbering.parentheses;
  }
  return settings;
}

export async function batchExport(items, template, original, format, numbering, signal, progress, saveFile, includeSettings=false) {
  if (typeof saveFile !== 'function') throw new Error('保存先を指定してください。');
  const formats=Array.isArray(format)?format:[format], used=new Set(), failures=[], files=[];
  let totalBytes=0, saved=0, labelIndex=0;
  async function write(blob,name,item) {
    if (signal.aborted) throw new Error('保存を中止しました。保存済みファイルは残ります。');
    if (totalBytes+blob.size>256*1024*1024) throw new Error('保存データの合計が256 MBを超えます。対象枚数や解像度を減らしてください。');
    totalBytes+=blob.size;
    const actualName=await saveFile(blob,name,item);
    files.push({name:actualName||name,source:item.name,bytes:blob.size});
  }
  for (let index=0;index<items.length;index++) {
    if (signal.aborted) throw new Error('保存を中止しました。保存済みファイルは残ります。');
    const item=items[index]; progress(`${index+1} / ${items.length}：${item.name}`); item.status='処理中';
    let source=null;
    try {
      source=(await decodeImage(item.file)).source;
      const settings=batchSettings(template,original,item,labelIndex,numbering), base=outputBase(item.name,used);
      for (const outputFormat of formats) {
        if(signal.aborted)throw new Error('保存を中止しました。保存済みファイルは残ります。');
        let blob;
        if (outputFormat==='pptx') {
          const presentation=await createPresentation(); addFigureSlide(presentation,source,settings,item.name);
          blob=await presentationBlob(presentation);
        } else blob=await exportImage(source,settings,outputFormat);
        await write(blob,`${base}.${extensionFor(outputFormat)}`,item);
      }
      if (includeSettings) await write(new Blob([JSON.stringify(serializeProject(settings,item),null,2)],{type:'application/json'}),`${base}.json`,item);
      saved++; item.status='完了';
    } catch(error) {
      if(signal.aborted){item.status='中止';throw error;}
      item.status='エラー';failures.push({name:item.name,error:error.message});
    } finally {
      if(item.labelVisible??template.panelLabel.visible) labelIndex++;
      if(source)releaseImage(source);
    }
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(signal.aborted)throw new Error('保存を中止しました。保存済みファイルは残ります。');
  if(!saved)throw new Error(`保存できる画像がありませんでした。${failures[0]?.error||''}`);
  return {saved,failures,files};
}
