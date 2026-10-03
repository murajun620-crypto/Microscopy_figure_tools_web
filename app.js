import { History, LIMITS, calibrationFromPoints, clamp, clipCrop, copy, cropFromPoints, defaultSettings, dimensionCrop, editCrop, fitCropAspect, parseProject, parseSession, positive, rasterMetrics, serializeProject, sessionProject, validateCrop, validateSettings, viewToImage } from './core.js?v=2d894542ff65';
import { SUPPORTED, canvasBlob, decodeImage, download, downloadAll, clearDownloads, releaseImage, thumbnail } from './io.js?v=deadb306aaf4';
import { buildPlan, paint } from './render.js?v=952b7e69af87';
import { batchExport, exportImage } from './export.js?v=51b4221c04db';
import { wheelZoom, zoomText, MIN_ZOOM, MAX_ZOOM } from './zoom.js?v=eee1f27da674';
import { ensureWritable, writeFile, readFolder, imagePickerOptions, directoryPickerOptions, rememberSourceDirectory, restoreExportFormats } from './save-files.js?v=84ba3a3d158f';
import { panelNumbering, numberedLabel, labelSequenceChanges } from './label-numbering.js?v=fe9f5790b43f';
import { createProject, readProject } from './project.js?v=e979f9d02ae5';
import { APP_VERSION, WorkSaveState, workspaceSnapshot } from './work-state.js?v=2c42b014da86';

const $ = id => document.getElementById(id);
const canvas = $('preview'), context = canvas.getContext('2d');
const items = [];
const folderSupported=typeof window.showDirectoryPicker==='function';
const sourceFolders=new WeakMap();
const sourceHandles=new WeakMap();
let saveDirectory=null;
let saveBatch=false;

let current = null, source = null, plan = null, previewScale = 1, tool = 'move',previewRaw=false;
let measurement = null, measurementStart = null, drag = null, pendingCrop = null, cropStart = null, busy = false, batchController = null, toastTimer = null;
let wheelZoomFrame = 0, wheelZoomAnchor = null;
const workSaveState=new WorkSaveState();
let workStateQueued=false, leaveGuardInstalled=false, projectSaving=false;
$('appVersion').textContent=`v${APP_VERSION}`;
$('appVersion').setAttribute('aria-label',`バージョン ${APP_VERSION}`);
function projectUI() {
  return {formats:[...document.querySelectorAll('[data-export-format]:checked')].map(input=>input.dataset.exportFormat),dpi:Number($('saveDpi').value),includeSettings:$('includeSettings').checked,colorMode:'simple',labelApplySelected:$('labelApplySelected').checked,labelControls:Object.fromEntries(projectLabelControls.map(id=>[id,$(id).type==='checkbox'?$(id).checked:$(id).value]))};
}
function pendingInputEdit() {
  if(!current)return false;
  for(const input of document.querySelectorAll('[data-setting],#imageList [data-item-key]')) {
    let expected;
    if(input.dataset.setting){const [section,key]=input.dataset.setting.split('.');expected=current.settings[section][key];}
    else {const item=items.find(item=>item.id===input.closest('[data-image-id]').dataset.imageId);expected=item?.[input.dataset.itemKey];}
    if(input.type==='checkbox'){if(input.checked!==expected)return true;}
    else if(input.type==='number'||input.type==='range'||input.hasAttribute('data-number')) {if(input.value===''?expected!=null&&expected!=='':Number(input.value)!==Number(expected))return true;}
    else if(input.value!==String(expected??''))return true;
  }
  const crop=pendingCrop||current.settings.crop;
  for(const [key,id] of [['x','cropX'],['y','cropY'],['width','cropWidth'],['height','cropHeight']]) {
    const expected=crop[key]-(key==='x'?current.settings.crop.x:key==='y'?current.settings.crop.y:0);
    if($(id).value===''||Number($(id).value)!==expected)return true;
  }
  return false;
}
function hasUnsavedWork() {
  return !!items.length&&(projectSaving||pendingInputEdit()||workSaveState.isDirty(workspaceSnapshot(items,projectUI()),true));
}
function confirmUnsavedLeave(event) {
  if(!hasUnsavedWork())return;
  event.preventDefault();event.returnValue='';
}
function refreshWorkState() {
  workStateQueued=false;
  const dirty=hasUnsavedWork();
  if(dirty!==leaveGuardInstalled){
    if(dirty)window.addEventListener('beforeunload',confirmUnsavedLeave);
    else window.removeEventListener('beforeunload',confirmUnsavedLeave);
    leaveGuardInstalled=dirty;
  }
  const status=$('projectSaveStatus'), text=!items.length?'画像なし':projectSaving?'プロジェクト保存中…':dirty?'プロジェクト：未保存の変更があります':'プロジェクト：保存済み';
  if(status.textContent!==text)status.textContent=text;
  status.dataset.dirty=String(dirty);
}
function scheduleWorkState() {
  if(!workStateQueued){workStateQueued=true;queueMicrotask(refreshWorkState);}
}
for(const name of ['input','change'])document.addEventListener(name,scheduleWorkState);
function cancelWheelZoom() { cancelAnimationFrame(wheelZoomFrame); wheelZoomFrame = 0; wheelZoomAnchor = null; }
const outsideAnchors = [['outside-bottom-center','画像外・下中央'],['outside-bottom-left','画像外・左下'],['outside-bottom-right','画像外・右下']];
const COLOR_PALETTE = {
    blue:["#D8EBFF","#BFE0FF","#A5D5FF","#8BC9FF","#70BEFF","#56B2FF","#3CA6F5","#1F8FE0","#0C74C2","#0052A8"],
    red:["#FFD1CC","#FFB9B1","#FFA198","#FF897F","#FF7166","#F7574A","#E93E31","#D4291E","#BC170C","#A10000"],
    green:["#D8F5DF","#BFEECB","#A6E7B7","#8DDEA2","#74D68D","#5BCC77","#43C262","#2BA84D","#158E38","#009F22"],
    orange:["#FFE3C2","#FFD4A2","#FFC582","#FFB662","#FFA742","#FF9822","#F28610","#D77207","#BC5E03","#A14B00"],
    purple:["#E8D9FF","#DAC3FF","#CCADFF","#BE97FF","#AF81F8","#A06BEB","#9155DD","#7D3EDD","#6725C3","#5A1FA8"],
    gray:["#E0E0E0","#D2D2D2","#C4C4C4","#B6B6B6","#A8A8A8","#9A9A9A","#8A8A8A","#787878","#626262","#4A4A4A"],
    black:["#E6E6E6","#D5D5D5","#C4C4C4","#B3B3B3","#A2A2A2","#8F8F8F","#7C7C7C","#666666","#4A4A4A","#2A2A2A"],
  };
const colorFields = [], recentColors = [];
let colorTarget = null;
for (const input of document.querySelectorAll('input[type="color"][data-setting]')) {
  const title = input.parentElement.firstChild.textContent.trim();
  const section = input.dataset.setting.split('.')[0];
  const name = `${section === 'scaleBar' ? 'スケールバー' : 'パネルラベル'}の${title}`;
  input.setAttribute('aria-label',name);
  const wrapper = document.createElement('span'); wrapper.className = 'color-control';
  input.before(wrapper); wrapper.append(input); input.hidden=true;
  const button = document.createElement('button'); button.type = 'button'; button.className = 'color-icon';
  button.setAttribute('aria-label',`${name}を選ぶ`); button.setAttribute('aria-haspopup','dialog');
  button.addEventListener('click',()=>openColorPanel(input,name)); wrapper.append(button);
  input.addEventListener('change',()=>rememberColor(input.value));
  colorFields.push({input,button});
}
function syncColorFields() {
  for (const {input,button} of colorFields) {
    button.disabled=input.matches(':disabled'); button.style.backgroundColor=input.value;
    button.title=`${input.getAttribute('aria-label')}：${input.value}（色を選ぶ）`;
  }
}
function rememberColor(value) {
  const hex=value.toLowerCase();
  recentColors.splice(0,recentColors.length,hex,...recentColors.filter(color=>color!==hex).slice(0,7));
}
function colorSwatch(hex,name=hex) {
  const button=document.createElement('button'); button.type='button'; button.className='color-swatch';
  button.style.backgroundColor=hex; button.title=name; button.setAttribute('aria-label',name);
  button.setAttribute('aria-pressed',String(hex.toLowerCase()===colorTarget?.value.toLowerCase()));
  button.addEventListener('click',()=>chooseColor(hex)); return button;
}
function openColorPanel(input,title) {
  if(busy||!current||input.matches(':disabled'))return;
  colorTarget=input; $('color-panel-title').textContent=`${title}を選ぶ`;
  const names={black:'黒',gray:'灰',blue:'青',orange:'橙',red:'赤',green:'緑',purple:'紫'};
  $('color-swatches').replaceChildren(...Array.from({length:10},(_,shade)=>Object.keys(names).map(base=>colorSwatch(COLOR_PALETTE[base][shade],`${names[base]} ${shade} ${COLOR_PALETTE[base][shade]}`))).flat());
  $('basic-colors').replaceChildren(...['#000000','#ffffff'].map(hex=>colorSwatch(hex)));
  $('recent-colors').replaceChildren(...recentColors.map(hex=>colorSwatch(hex)));
  $('custom-color').value=input.value; $('color-code').value=input.value; $('color-error').textContent='';
  $('color-panel').showModal();
}
function chooseColor(value) {
  if(!/^#[0-9a-f]{6}$/i.test(value)){$('color-error').textContent='#RRGGBB形式で入力してください。';return;}
  if(!current||busy||!colorTarget?.isConnected||colorTarget.matches(':disabled')){$('color-panel').close();return;}
  colorTarget.value=value; colorTarget.dispatchEvent(new Event('change',{bubbles:true}));
  $('color-panel').close();
}
$('close-color-panel').addEventListener('click',()=>$('color-panel').close());
$('custom-color').addEventListener('change',event=>chooseColor(event.target.value));
$('apply-color-code').addEventListener('click',()=>chooseColor($('color-code').value.trim()));
$('color-code').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();chooseColor(event.target.value.trim());}});
syncColorFields();
for (const [id,options] of [['barAnchor',[['bottom-right','右下'],['bottom-left','左下'],['top-right','右上'],['top-left','左上'],...outsideAnchors]],['labelAnchor',[['top-left','左上'],['outside-top-left','画像外・左上'],['outside-bottom-left','画像外・左下'],['outside-bottom-center','画像外・下中央'],['outside-bottom-right','画像外・右下']]]]) for(const [value,label] of options) $(id).add(new Option(label,value));

function notify(message, error = false) {
  clearTimeout(toastTimer); $('status').textContent = message; $('status').classList.toggle('error', error); $('status').hidden = false;
  toastTimer = setTimeout(() => { $('status').hidden = true; }, error ? 12000 : 6000);
}
function syncImageNavigation() {
  const index = items.indexOf(current);
  $('previewNavigator').hidden = !current || items.length < 2;
  const counter = current ? `${index + 1} / ${items.length}` : '';
  if ($('previewImageCounter').textContent !== counter) $('previewImageCounter').textContent = counter;
  $('previousImage').disabled = busy || index <= 0;
  $('nextImage').disabled = busy || index < 0 || index >= items.length - 1;
}
for (const [id,offset] of [['previousImage',-1],['nextImage',1]]) $(id).addEventListener('click',()=>{
  if (busy || !current) return;
  const next = items[items.indexOf(current) + offset];
  if (next) action(()=>selectItem(next));
});
function setBusy(value) {
  if (value) cancelWheelZoom();
  busy = value; document.body.classList.toggle('busy', value);
  $('projectInput').disabled=value;
  $('openProjectButton').disabled=value;
  $('saveProjectButton').disabled=value||!items.length;
  for(const id of ['settingsInput','openSettingsButton','settingsSaveMenuButton','saveSettingsButton','saveSessionButton'])$(id).disabled=value||!current;
  if(value||!current)closeSettingsSaveMenu();
  $('saveDpi').disabled=value||!current;
  for (const id of ['imageInput', 'folderInput', 'demoButton', 'multiDemoButton', 'emptyDemoButton', 'emptySingleDemoButton', 'emptyOpenButton','removeAllButton','openSourceFolder','moveImageUp','moveImageDown','labelApplySelected']) $(id).disabled = value || (['moveImageUp','moveImageDown'].includes(id) && !current);
  $('editingControls').disabled = value || !current;
  for (const input of $('imageList').querySelectorAll('input, button')) input.disabled = value;
  for (const id of ['moveTool', 'measureTool', 'cropTool', 'exportButton','copyButton','rawPreviewButton','processedPreviewButton','zoomIn','zoomOut','zoomSelect']) $(id).disabled = value || !current;
  for(const id of ['saveDestination','chooseSaveFolder','includeSettings','closeSaveDialog','downloadAllButton']) $(id).disabled=value;
  for(const input of document.querySelectorAll('[data-export-format]')) input.disabled=value;
  for(const button of $('batchPanel').querySelectorAll('button')) button.disabled=value||!items.length;
  $('removeAllButton').disabled=value||!items.length;
  refreshSaveUI();
  $('undoButton').disabled = value || !current?.history.canUndo; $('redoButton').disabled = value || !current?.history.canRedo;
  if(current){
    const b=current.settings.scaleBar,p=current.settings.panelLabel;
    for(const id of ['cropX','cropY','cropWidth','cropHeight'])$(id).disabled=value||current.settings.cropOptions.application!=='selection';
    for(const input of document.querySelectorAll('[data-setting^="scaleBar."]')) input.disabled=value||!current.settings.calibration;
    for(const id of ['barBackgroundColor','barOpacity']) $(id).disabled=value||!current.settings.calibration||!b.background;
    $('barOutsideTransparent').disabled=value||!current.settings.calibration||!b.visible||!b.anchor.startsWith('outside-');
    $('barOutsideColor').disabled=$('barOutsideTransparent').disabled||b.outsideTransparent;
    for(const input of document.querySelectorAll('[data-setting^="panelLabel."]')) input.disabled=value||!p.visible;
    for(const id of ['labelBackgroundColor','labelOpacity']) $(id).disabled=value||!p.visible||!p.background;
    $('labelOutsideTransparent').disabled=value||!p.visible||!p.anchor.startsWith('outside-');$('labelOutsideColor').disabled=$('labelOutsideTransparent').disabled||p.outsideTransparent;
  }
  syncColorFields();
  syncImageNavigation();
  scheduleWorkState();
}
async function action(fn) {
  if (busy) return;
  setBusy(true);
  try { await fn(); } catch (error) { console.error(error); notify(error.message || '処理できませんでした。', true); }
  finally { setBusy(false); }
}

function syncInputs() {
  if (!current) return;
  for (const input of document.querySelectorAll('[data-setting]')) {
    const [section, key] = input.dataset.setting.split('.'), value = current.settings[section][key];
    if (input.type === 'checkbox') input.checked = value; else input.value = value ?? '';
  }
  $('barAnchor').value = current.settings.scaleBar.anchor; $('labelAnchor').value = current.settings.panelLabel.anchor;
  const c = current.settings.crop;
  updateCropInputs(pendingCrop || c);
  $('aspectRatio').value=current.settings.cropOptions.aspect;$('cropApplication').value=current.settings.cropOptions.application;$('customRatio').hidden=$('aspectRatio').value!=='custom';
  $('cropStatus').textContent=pendingCrop?`選択範囲 ${pendingCrop.width} × ${pendingCrop.height} px`:'選択範囲なし';
  const calibration = current.settings.calibration;
  $('pixelSize').value = calibration?.pixelSize ?? '';
  if (calibration) $('calibrationUnit').value = calibration.unit;
  $('calibrationBadge').textContent = calibration ? '設定済み' : '未設定';
  $('calibrationInfo').textContent = calibration ? `1 px = ${Number(calibration.pixelSize.toPrecision(8))} ${calibration.unit}` : 'スケールバーには校正が必要です';
  $('cropBadge').textContent = c.width === current.width && c.height === current.height ? '全体' : `${c.width} × ${c.height}`;
  $('imageName').textContent = current.name; $('imageDimensions').textContent = `元画像 ${current.width.toLocaleString()} × ${current.height.toLocaleString()} px`;
  for(const row of $('imageList').children) {const item=items.find(item=>item.id===row.dataset.imageId);if(item)for(const input of row.querySelectorAll('[data-item-key]')){const value=item[input.dataset.itemKey];if(input.type==='checkbox')input.checked=value;else input.value=value??'';}}
  updateLabelFormat();setBusy(busy);
}

function commit(settings,shared=null) {
  if (!current) return;
  const next = validateSettings(settings, current.width, current.height);
  // Reject impossible geometry before adding it to history.
  buildPlan(next, context);
  current.barVisible=next.scaleBar.visible;current.labelVisible=next.panelLabel.visible;current.labelText=next.panelLabel.text;current.subtext=next.panelLabel.subtext;
  current.settings = next; current.history.push(next); syncInputs(); render();
  if(shared)shareSettings(shared);
}
function shareSettings(section){
  const template=current.settings;
  for(const item of items)if(item!==current){
    if(section==='crop') {const c=clipCrop(template.crop,item.width,item.height);item.cropError=c?null:'共通のトリミング範囲がこの画像と重なりません。';if(c)item.settings.crop=c;item.settings.cropOptions={...copy(template.cropOptions),pending:null};}
    else if(section==='scaleBar') {const visible=item.settings.scaleBar.visible;item.settings.scaleBar={...copy(template.scaleBar),visible};}
    else if(section==='panelLabel'){const p=item.settings.panelLabel;item.settings.panelLabel={...copy(template.panelLabel),visible:p.visible,text:p.text,subtext:p.subtext,position:p.position};}
    else if(section==='output')item.settings.output=copy(template.output);
    item.history.push(item.settings);
  }
  scheduleWorkState();
}

function renderList() {
  $('imageList').replaceChildren();
  for (const item of items) {
    const row = document.createElement('li'); row.className = `image-row${item === current ? ' selected' : ''}`;row.dataset.imageId=item.id;
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = item.enabled; checkbox.disabled = busy; checkbox.setAttribute('aria-label', `${item.name}を処理対象にする`);
    checkbox.addEventListener('change', () => { item.enabled = checkbox.checked; updateBatch(); });
    const button = document.createElement('button'); button.disabled = busy; button.setAttribute('aria-label', `${item.name}を編集`);
    const img = document.createElement('img'); img.src = item.thumbnail; img.alt = '';
    const label = document.createElement('span'); label.textContent = item.name;
    const dimensions = document.createElement('small'); dimensions.textContent = `${item.width} × ${item.height} px${item.status?` · ${item.status}`:''}`; label.append(dimensions);
    button.append(img, label); button.addEventListener('click', () => action(() => selectItem(item)));
    const controls=document.createElement('details');controls.className='image-options';
    const summary=document.createElement('summary');summary.textContent='バー・ラベル設定';controls.append(summary);
    for(const [key,title] of [['barVisible','バー'],['labelVisible','ラベル']]) {
      const label=document.createElement('label');label.className='check';const input=document.createElement('input');input.type='checkbox';input.dataset.itemKey=key;input.checked=item[key]??true;input.setAttribute('aria-label',`${item.name}の${title}表示`);
      input.addEventListener('change',()=>{item[key]=input.checked;const settings=copy(item.settings);settings[key==='barVisible'?'scaleBar':'panelLabel'].visible=input.checked;item.settings=validateSettings(settings,item.width,item.height);item.history.push(item.settings);if(item===current){syncInputs();render();}});label.append(input,title);controls.append(label);
    }
    for(const [key,title] of [['labelText','ラベル文字列'],['subtext','補足文字']]) {
      const label=document.createElement('label');label.textContent=title;const input=document.createElement('input');input.type='text';input.dataset.itemKey=key;input.maxLength=key==='labelText'?24:120;input.value=item[key]??'';input.setAttribute('aria-label',`${item.name}の${title}`);if(key==='subtext')input.placeholder='例：CeO$\\_2$';
      input.addEventListener('change',()=>{item[key]=input.value;item.settings.panelLabel[key==='labelText'?'text':'subtext']=input.value;item.history.push(item.settings);if(item===current){syncInputs();render();}});label.append(input);controls.append(label);
    }
    const remove=document.createElement('button');remove.className='image-delete';remove.disabled=busy;remove.title='一覧から削除';remove.setAttribute('aria-label',`${item.name}を一覧から削除`);
    remove.innerHTML='<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 10v7M14 10v7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    remove.addEventListener('click',()=>action(()=>removeItems([item])));
    row.append(checkbox, button,remove,controls); $('imageList').append(row);
  }
  $('fileCount').textContent = items.length; updateBatch(); syncImageNavigation();
}
function updateBatch() {
  const count = items.filter(item => item.enabled).length; $('batchCount').textContent = `${count}枚`;
  refreshSaveUI();
  scheduleWorkState();
}

async function selectItem(item) {
  const decoded = await decodeImage(item.file);
  if(item.cropError){releaseImage(decoded.source);throw new Error(item.cropError);}
  if(!item.settings.calibration){const reference=items.find(candidate=>candidate.settings.calibration);if(reference)item.settings.calibration=copy(reference.settings.calibration);}
  activateItem(item,decoded);
}
function activateItem(item,decoded) {
  if (source) releaseImage(source);
  source = decoded.source; current = item; measurement = measurementStart = pendingCrop = drag = null;
  $('measurementInfo').textContent = '2点をクリック、またはドラッグ';
  setTool('move'); syncInputs(); renderList(); render();
  if (decoded.note) notify(decoded.note);
}

async function addFiles(files) {
  const valid = [...files].filter(file => SUPPORTED.test(file.name)), errors = [], added = [];
  if (!valid.length) throw new Error('PNG / JPEG / BMP / SVG / TIFFの画像を選択してください。');
  let total = items.reduce((sum, item) => sum + item.file.size, 0);
  for (const file of valid) {
    if (items.length >= LIMITS.files || total + file.size > LIMITS.batchBytes) { errors.push('画像は100枚、合計256 MB以内で開いてください。'); break; }
    let decoded;
    try {
      decoded = await decodeImage(file);
      const settings = defaultSettings(decoded.width, decoded.height);
      if(current){
        settings.scaleBar={...copy(current.settings.scaleBar),visible:true,length:null,position:null,fontPercent:9,thicknessPercent:.8,gapPercent:1,verticalPaddingPercent:3};
        settings.panelLabel={...copy(current.settings.panelLabel),visible:true,text:'',subtext:'',position:null};
        settings.output=copy(current.settings.output);
      }
      const item = { id: crypto.randomUUID(), name: file.name, file, sourceDirectory:sourceFolders.get(file)||null, sourceHandle:sourceHandles.get(file)||null, width: decoded.width, height: decoded.height, thumbnail: await thumbnail(decoded.source), settings, history: new History(settings), enabled: true,barVisible:true,labelVisible:true,labelText:'',subtext:'' };
      items.push(item); added.push(item); total += file.size;
    } catch (error) { errors.push(`${file.name}：${error.message}`); }
    finally { if (decoded) releaseImage(decoded.source); }
    await new Promise(resolve => requestAnimationFrame(resolve));
  }
  if (added.length) await selectItem(added[0]);
  renderList();
  if (errors.length) notify(`${added.length}枚を読み込みました。\n${errors.slice(0, 4).join('\n')}`, true);
  else notify(`${added.length}枚を読み込みました。`);
  return added;
}

function render() {
  scheduleWorkState();
  $('emptyState').hidden = !!current; $('canvasFrame').hidden = !current;
  if (!current || !source) { plan = null; canvas.width = canvas.height = 1; return; }
  const settings = current.settings, raw = tool === 'crop'||previewRaw;
  try {
    const rawCrop=previewRaw&&tool!=='crop'?{x:0,y:0,width:current.width,height:current.height}:settings.crop;
    plan = raw ? { width:rawCrop.width,height:rawCrop.height,imageHeight:rawCrop.height,top:0,bottom:0,crop:rawCrop,annotations:[],warnings:[],fills:[] } : buildPlan(settings, context);
    const area = $('previewArea'), zoom = $('zoomSelect').value;
    if (!area.clientWidth) return;
    const displayScale = zoom === 'fit' ? Math.min((area.clientWidth - 58) / plan.width, (area.clientHeight - 58) / plan.height, 1) : Number(zoom);
    const cssWidth = Math.max(1, plan.width * Math.max(0.01, displayScale)), cssHeight = Math.max(1, plan.height * Math.max(0.01, displayScale));
    previewScale = Math.min(cssWidth * Math.min(devicePixelRatio, 2) / plan.width, 2400 / Math.max(plan.width, plan.height));
    canvas.width = Math.max(1, Math.round(plan.width * previewScale)); canvas.height = Math.max(1, Math.round(plan.height * previewScale));
    canvas.style.width = `${cssWidth}px`; canvas.style.height = `${cssHeight}px`;
    paint(context, source, plan, settings, { scale: previewScale, annotations: !raw });
    drawGuides();
    const finalPlan = buildPlan(settings,context,false,settings.output.scale);
    const metrics = rasterMetrics(finalPlan, settings.output);
    $('outputInfo').textContent = `PNG ${metrics.width} × ${metrics.height} px · ${metrics.widthCm.toFixed(2)} × ${metrics.heightCm.toFixed(2)} cm · ${metrics.dpi} dpi`;
    $('viewInfo').textContent = `${tool==='crop'?'現在の画像（トリミング選択）':previewRaw?'元画像':'処理後画像'} · 表示 ${zoomText(displayScale)}`;
    const warnings = finalPlan.warnings;
    $('instruction').classList.toggle('warning', warnings.length > 0 && tool === 'move');
    $('instruction').textContent = tool === 'measure' ? '2点をクリック、またはドラッグ。通常は水平、Shiftを押すと自由な角度です。' : tool === 'crop' ? '2点をクリック、またはドラッグして選択。四隅・辺でサイズ、中央で位置を調整し適用します。' : warnings[0] || '注釈をドラッグして配置できます。画像外でも領域内で移動できます。';
  } catch (error) { $('instruction').textContent = error.message; $('instruction').classList.add('warning'); }
}

function sourcePoint(event) {
  return viewToImage({ x: event.clientX, y: event.clientY }, canvas.getBoundingClientRect(), plan.width, plan.height, plan.crop, plan.top);
}
function canvasPoint(event) {
  const p = sourcePoint(event);
  return { x: p.x - current.settings.crop.x, y: p.y - current.settings.crop.y + plan.top };
}
function insideImage(p) {
  const c = current.settings.crop;
  return p.x >= c.x && p.y >= c.y && p.x <= c.x + c.width && p.y <= c.y + c.height;
}
function boundedPoint(p) {
  const c = current.settings.crop;
  return { x: clamp(p.x, c.x, c.x + c.width), y: clamp(p.y, c.y, c.y + c.height) };
}
function drawGuides() {
  if (!plan||previewRaw) return;
  context.save(); context.scale(previewScale, previewScale); context.lineWidth = 2 / previewScale; context.font = `${12 / previewScale}px sans-serif`;
  if (measurement && tool !== 'crop') {
    const c = current.settings.crop, a = { x: measurement[0].x - c.x, y: measurement[0].y - c.y + plan.top }, b = { x: measurement[1].x - c.x, y: measurement[1].y - c.y + plan.top };
    context.strokeStyle = '#70e5d0'; context.fillStyle = '#70e5d0'; context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
    for (const p of [a, b]) { context.beginPath(); context.arc(p.x, p.y, 4 / previewScale, 0, Math.PI * 2); context.fill(); }
  }
  if (pendingCrop && tool !== 'measure') {
    const base=current.settings.crop,c={...pendingCrop,x:pendingCrop.x-base.x,y:pendingCrop.y-base.y+plan.top};
    context.fillStyle = '#071b1766';
    context.fillRect(0, 0, plan.width, c.y); context.fillRect(0, c.y + c.height, plan.width, plan.height - c.y - c.height);
    context.fillRect(0, c.y, c.x, c.height); context.fillRect(c.x + c.width, c.y, plan.width - c.x - c.width, c.height);
    context.strokeStyle = '#8df0d2'; context.strokeRect(c.x, c.y, c.width, c.height);
    context.setLineDash([5 / previewScale, 5 / previewScale]); context.strokeStyle = '#ffffff88';
    for (let i = 1; i <= 2; i++) { context.beginPath(); context.moveTo(c.x + c.width * i / 3, c.y); context.lineTo(c.x + c.width * i / 3, c.y + c.height); context.moveTo(c.x, c.y + c.height * i / 3); context.lineTo(c.x + c.width, c.y + c.height * i / 3); context.stroke(); }
    context.setLineDash([]);context.fillStyle='#8df0d2';for(const x of [c.x,c.x+c.width/2,c.x+c.width]) for(const y of [c.y,c.y+c.height/2,c.y+c.height]) if(x!==c.x+c.width/2||y!==c.y+c.height/2) context.fillRect(x-3/previewScale,y-3/previewScale,6/previewScale,6/previewScale);
  }
  context.restore();
}
function setTool(value) {
  tool = value; measurementStart = cropStart = drag = null;
  previewRaw=false;$('rawPreviewButton').classList.remove('active');$('processedPreviewButton').classList.add('active');
  for (const mode of ['move', 'measure', 'crop']) { $(`${mode}Tool`).classList.toggle('active', mode === value); $(`${mode}Tool`).setAttribute('aria-pressed', String(mode === value)); }
  canvas.style.cursor = value === 'move' ? 'default' : 'crosshair'; render();
}
function aspect() {
  const value = $('aspectRatio').value;
  if (value === 'free') return null;
  if(value==='source') return current.width/current.height;
  if(value==='custom') return positive($('aspectWidth').valueAsNumber, '縦横比の幅') / positive($('aspectHeight').valueAsNumber, '縦横比の高さ');
  const [w,h]=value.split(':').map(Number);return w/h;
}
function updateMeasurement() {
  if (!measurement) return;
  const distance = Math.hypot(measurement[1].x - measurement[0].x, measurement[1].y - measurement[0].y);
  $('measurementInfo').textContent = `測定距離 ${distance.toFixed(3)} px${current.settings.calibration ? ` / ${(distance * current.settings.calibration.pixelSize).toPrecision(5)} ${current.settings.calibration.unit}` : ''}`;
}
function updateCropInputs(crop) {
  const base=current.settings.crop;
  for (const [key, id] of [['x', 'cropX'], ['y', 'cropY'], ['width', 'cropWidth'], ['height', 'cropHeight']]) $(id).value = crop[key]-(key==='x'?base.x:key==='y'?base.y:0);
  $('cropStatus').textContent=`左上 x=${crop.x-base.x}, y=${crop.y-base.y} / ${crop.width} × ${crop.height} px`;
}
function cropHit(p) {
  if(!pendingCrop)return null;
  const c=pendingCrop,tolerance=8/(canvas.getBoundingClientRect().width/plan.width),left=Math.abs(p.x-c.x)<tolerance,right=Math.abs(p.x-(c.x+c.width))<tolerance,top=Math.abs(p.y-c.y)<tolerance,bottom=Math.abs(p.y-(c.y+c.height))<tolerance;
  if(p.x<c.x-tolerance||p.x>c.x+c.width+tolerance||p.y<c.y-tolerance||p.y>c.y+c.height+tolerance)return null;
  if(top&&left)return 'top-left';if(top&&right)return 'top-right';if(bottom&&left)return 'bottom-left';if(bottom&&right)return 'bottom-right';
  if(!aspect()){if(top)return 'top';if(bottom)return 'bottom';if(left)return 'left';if(right)return 'right';}
  return p.x>=c.x&&p.x<=c.x+c.width&&p.y>=c.y&&p.y<=c.y+c.height?'move':null;
}
function constrainedPoint(point,start,event){return event.shiftKey?point:{x:point.x,y:start.y};}
function distanceToLine(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy,t=length?clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/length,0,1):0;return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
function moveMeasurement(operation,p){const c=current.settings.crop,[a,b]=operation.beforeMeasurement,dx=clamp(p.x-operation.down.x,c.x-Math.min(a.x,b.x),c.x+c.width-Math.max(a.x,b.x)),dy=clamp(p.y-operation.down.y,c.y-Math.min(a.y,b.y),c.y+c.height-Math.max(a.y,b.y));return [{x:a.x+dx,y:a.y+dy},{x:b.x+dx,y:b.y+dy}];}

canvas.addEventListener('pointerdown', event => {
  if (!current || busy || !plan || event.button !== 0 || event.pointerType === 'touch') return;
  if(previewRaw) {
    canvas.setPointerCapture(event.pointerId);
    drag={mode:'pan',x:event.clientX,y:event.clientY,left:$('previewArea').scrollLeft,top:$('previewArea').scrollTop};
    return;
  }
  const p = sourcePoint(event);
  if (tool !== 'move' && !insideImage(p)) return;
  canvas.setPointerCapture(event.pointerId);
  if (tool === 'measure') {
    const tolerance=8/(canvas.getBoundingClientRect().width/plan.width);
    let hit=measurement&&!measurementStart?measurement.findIndex(q=>Math.hypot(p.x-q.x,p.y-q.y)<tolerance):-1;
    if(hit<0&&measurement&&!measurementStart&&distanceToLine(p,...measurement)<tolerance)hit=2;
    const start = measurementStart || p;
    drag = { mode: 'measure', start, down: p, secondClick: !!measurementStart, moved: false,handle:hit,beforeMeasurement:measurement?copy(measurement):null };
    if(hit<0) measurement=[start,constrainedPoint(p,start,event)];render();
  } else if (tool === 'crop' || pendingCrop && cropHit(p)) {
    try { const edit=cropHit(p);drag={mode:'crop',start:cropStart||p,down:p,ratio:aspect(),edit,origin:pendingCrop?copy(pendingCrop):null,moved:false,secondClick:!!cropStart}; } catch (error) { notify(error.message, true); }
  } else {
    const q = canvasPoint(event), hit = [...plan.annotations].reverse().find(box => q.x >= box.x && q.x <= box.x + box.width && q.y >= box.y && q.y <= box.y + box.height);
    if (hit) { drag = { mode: 'move', kind: hit.kind, offset: { x: q.x - hit.x, y: q.y - hit.y }, before: copy(current.settings) }; canvas.style.cursor = 'grabbing'; }
    else drag={mode:'pan',x:event.clientX,y:event.clientY,left:$('previewArea').scrollLeft,top:$('previewArea').scrollTop};
  }
});
canvas.addEventListener('pointermove', event => {
  if (!current || !drag || busy) return;
  const p = boundedPoint(sourcePoint(event));
  if(drag.mode==='pan'){$('previewArea').scrollLeft=drag.left+drag.x-event.clientX;$('previewArea').scrollTop=drag.top+drag.y-event.clientY;return;}
  if (drag.mode === 'measure') {if(drag.handle===2)measurement=moveMeasurement(drag,p);else if(drag.handle>=0) measurement[drag.handle]=constrainedPoint(p,measurement[1-drag.handle],event);else measurement[1]=constrainedPoint(p,drag.start,event); drag.moved ||= Math.hypot(p.x - drag.down.x, p.y - drag.down.y) > 2; updateMeasurement(); }
  else if (drag.mode === 'crop') {
    const c=current.settings.crop;
    if(drag.edit){const r=editCrop({...drag.origin,x:drag.origin.x-c.x,y:drag.origin.y-c.y},drag.edit,{x:drag.down.x-c.x,y:drag.down.y-c.y},{x:p.x-c.x,y:p.y-c.y},c.width,c.height,drag.ratio);pendingCrop={...r,x:r.x+c.x,y:r.y+c.y};}else pendingCrop=cropFromDrag(drag.start,p,drag.ratio);
    drag.moved ||= Math.hypot(p.x-drag.down.x,p.y-drag.down.y)>2;updateCropInputs(pendingCrop);
  } else {
    const q = canvasPoint(event), box = plan.annotations.find(annotation => annotation.kind === drag.kind), c = current.settings.crop;
    current.settings[drag.kind].position = { x: clamp(q.x - drag.offset.x, 0, Math.max(0,c.width - box.width)), y: clamp(q.y - drag.offset.y, box.area.y, Math.max(box.area.y,box.area.y+box.area.height-box.height))-(box.band==='top'?0:plan.top) };
  }
  render();
});
const cropFromDrag = (start,end,ratio) => {
  const c=current.settings.crop,r=cropFromPoints({x:start.x-c.x,y:start.y-c.y},{x:end.x-c.x,y:end.y-c.y},c.width,c.height,ratio);
  return {...r,x:r.x+c.x,y:r.y+c.y};
};
canvas.addEventListener('pointerup', event => {
  if (!drag) return;
  const operation = drag;
  if (operation.mode === 'measure') {
    const p=boundedPoint(sourcePoint(event));
    if(operation.handle===2)measurement=moveMeasurement(operation,p);else if(operation.handle>=0) measurement[operation.handle]=constrainedPoint(p,measurement[1-operation.handle],event);else measurement[1]=constrainedPoint(p,operation.start,event);
    if (operation.moved || operation.secondClick||operation.handle>=0) measurementStart = null;
    else measurementStart = operation.start;
    updateMeasurement();
  } else if(operation.mode==='crop') {
    if(!operation.edit) {
      pendingCrop=cropFromDrag(operation.start,boundedPoint(sourcePoint(event)),operation.ratio);
      cropStart=operation.moved||operation.secondClick?null:operation.start;
    }
    if(pendingCrop) {updateCropInputs(pendingCrop);current.settings.cropOptions.pending=copy(pendingCrop);current.history.push(current.settings);}
  } else if (operation.mode === 'move') { current.history.push(current.settings);if(operation.kind==='scaleBar')shareSettings('scaleBar'); syncInputs(); }
  drag = null; canvas.style.cursor = tool === 'move' ? 'default' : 'crosshair';
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); render();
});
canvas.addEventListener('pointercancel', event => {
  if (drag?.before) current.settings = drag.before;
  drag=null; measurementStart=null; if (current) { syncInputs(); render(); }
});
canvas.addEventListener('contextmenu',event=>{if(tool==='crop'){event.preventDefault();pendingCrop=cropStart=drag=null;current.settings.cropOptions.pending=null;current.history.push(current.settings);syncInputs();render();}});
function queuePreviewZoom(zoom, anchor) {
  const select = $('zoomSelect'), area = $('previewArea');
  let option = select.querySelector('[data-custom-zoom]');
  if (!option) { option = document.createElement('option'); option.dataset.customZoom = 'true'; select.add(option); }
  option.value = String(zoom); option.textContent = zoomText(zoom); select.value = String(zoom);
  wheelZoomAnchor = anchor;
  if (!wheelZoomFrame) wheelZoomFrame = requestAnimationFrame(()=>{
    wheelZoomFrame = 0;
    const anchor = wheelZoomAnchor; wheelZoomAnchor = null;
    if (!plan || !current || !anchor) return;
    render();
    const after = canvas.getBoundingClientRect();
    area.scrollLeft += after.left + after.width * anchor.u - anchor.x;
    area.scrollTop += after.top + after.height * anchor.v - anchor.y;
  });
}
canvas.addEventListener('wheel',event=>{
  if (!event.ctrlKey || !plan || busy) return;
  event.preventDefault();
  const bounds=canvas.getBoundingClientRect(), select=$('zoomSelect'), area=$('previewArea');
  const scale=select.value==='fit'?bounds.width/plan.width:Number(select.value), zoom=wheelZoom(scale,event.deltaY,event.deltaMode,area.clientHeight);
  if (zoom!==scale) queuePreviewZoom(zoom,{x:event.clientX,y:event.clientY,u:(event.clientX-bounds.left)/bounds.width,v:(event.clientY-bounds.top)/bounds.height});
},{passive:false});
for (const [id,factor] of [['zoomIn',1.15],['zoomOut',1/1.15]]) $(id).addEventListener('click',()=>{
  if (!plan || !current || busy) return;
  const bounds=canvas.getBoundingClientRect(), area=$('previewArea'), viewport=area.getBoundingClientRect(), select=$('zoomSelect');
  const scale=select.value==='fit'?bounds.width/plan.width:Number(select.value), x=viewport.left+area.clientWidth/2,y=viewport.top+area.clientHeight/2;
  queuePreviewZoom(clamp(scale*factor,MIN_ZOOM,MAX_ZOOM),{x,y,u:(x-bounds.left)/bounds.width,v:(y-bounds.top)/bounds.height});
});

for (const input of document.querySelectorAll('[data-setting]')) {
  input.addEventListener('change', () => {
  if (!current || busy) return;
  const [section, key] = input.dataset.setting.split('.'), settings = copy(current.settings);
    settings[section][key] = input.type === 'checkbox' ? input.checked : input.type === 'number' || input.type === 'range' || input.hasAttribute('data-number') ? (section==='scaleBar'&&key==='length'&&!input.value?null:Number(input.value)) : input.value;
  if (key === 'anchor') {
    settings[section].position = null;
  }
  try { if (!input.checkValidity()) throw new Error('入力値が範囲外です。'); commit(settings,['scaleBar','panelLabel','output'].includes(section)&&!['visible','text','subtext'].includes(key)?section:null); if(section==='cropOptions') updateAspectPreview(); } catch (error) { notify(error.message, true); syncInputs(); }
  });
}
for (const id of ['imageInput', 'folderInput']) $(id).addEventListener('change', () => { const files = [...$(id).files]; $(id).value = ''; action(async()=>{const added=await addFiles(files);if(added.length&&folderSupported){$('saveDestination').value='source';refreshSaveUI();}}); });
$('imageInput').addEventListener('click',event=>{
  if(typeof window.showOpenFilePicker!=='function')return;
  event.preventDefault();action(async()=>{
    let handles;
    try{handles=await window.showOpenFilePicker(imagePickerOptions());}
    catch(error){if(error.name==='AbortError')return;throw error;}
    const files=[];
    for(const handle of handles){const file=await handle.getFile();sourceHandles.set(file,handle);files.push(file);}
    const added=await addFiles(files);
    if(saveDirectory)await rememberSourceDirectory(added,saveDirectory);
    if(added.length){$('saveDestination').value=folderSupported?'source':'download';refreshSaveUI();}
  });
});
$('emptyOpenButton').addEventListener('click', () => $('imageInput').click());
for (const [id, mode] of [['moveTool', 'move'], ['measureTool', 'measure'], ['measureButton', 'measure'], ['cropTool', 'crop'], ['cropButton', 'crop']]) $(id).addEventListener('click', () => { if (current && !busy) setTool(mode); });
function updateAspectPreview() {
  const c=current.settings.crop,ratio=aspect(),mode=$('cropApplication').value;
  $('customRatio').hidden=$('aspectRatio').value!=='custom';
  if(mode!=='selection') {
    const r=dimensionCrop(c.width,c.height,ratio,mode);pendingCrop=r?{...r,x:r.x+c.x,y:r.y+c.y}:null;
    if(!pendingCrop) $('cropStatus').textContent=ratio?`この比率では画像の${mode==='width'?'幅':'高さ'}を維持できません`:'アスペクト比を選択してください。';
    setTool('crop');
  } else if(pendingCrop&&ratio) {
    const r=fitCropAspect({...pendingCrop,x:pendingCrop.x-c.x,y:pendingCrop.y-c.y},c.width,c.height,ratio);pendingCrop={...r,x:r.x+c.x,y:r.y+c.y};
  }
  current.settings.cropOptions.pending=pendingCrop?copy(pendingCrop):null;current.history.push(current.settings);
  if(pendingCrop)updateCropInputs(pendingCrop);render();
}
for(const id of ['cropX','cropY','cropWidth','cropHeight'])$(id).addEventListener('change',()=>{
  if(!current||busy||current.settings.cropOptions.application!=='selection')return;
  try{
    const c=current.settings.crop,r={x:c.x+$('cropX').valueAsNumber,y:c.y+$('cropY').valueAsNumber,width:$('cropWidth').valueAsNumber,height:$('cropHeight').valueAsNumber};
    if(r.width<10||r.height<10||r.x<c.x||r.y<c.y||r.x+r.width>c.x+c.width||r.y+r.height>c.y+c.height)throw new Error('トリミング範囲は現在の画像内で幅・高さ10 px以上にしてください。');
    pendingCrop=validateCrop(r,current.width,current.height);current.settings.cropOptions.pending=copy(pendingCrop);current.history.push(current.settings);updateCropInputs(pendingCrop);render();
  }catch(error){notify(error.message,true);}
});
for(const axis of ['Width','Height']) $(`useImage${axis}`).addEventListener('click',()=>{
  const c=current.settings.crop;measurement=axis==='Width'?[{x:c.x,y:c.y+c.height/2},{x:c.x+c.width,y:c.y+c.height/2}]:[{x:c.x+c.width/2,y:c.y},{x:c.x+c.width/2,y:c.y+c.height}];measurementStart=null;setTool('move');updateMeasurement();render();
});
$('resetCalibrationButton').addEventListener('click',()=>{const s=copy(current.settings);s.calibration=null;measurement=null;commit(s);});
$('calibrateButton').addEventListener('click', () => {
  try {
    if (!measurement || measurementStart) throw new Error('画像上の2点を測定してください。');
    const settings = copy(current.settings); settings.calibration = calibrationFromPoints(...measurement, $('knownLength').valueAsNumber, $('calibrationUnit').value);
    settings.scaleBar.unit = settings.calibration.unit;settings.scaleBar.fontPercent=9;measurement=null; commit(settings); setTool('move'); notify('校正を設定しました。');
  } catch (error) { notify(error.message, true); }
});
$('directCalibrationButton').addEventListener('click', () => {
  try {
    const settings = copy(current.settings); settings.calibration = { pixelSize: positive($('pixelSize').valueAsNumber, '1 pxあたりの長さ'), unit: $('calibrationUnit').value };
    settings.scaleBar.unit = settings.calibration.unit;settings.scaleBar.fontPercent=9;measurement=null; commit(settings); setTool('move'); notify('校正を設定しました。');
  } catch (error) { notify(error.message, true); syncInputs(); }
});
$('applyCropButton').addEventListener('click', () => {
  try {
    const settings = copy(current.settings);
    const c=settings.crop,mode=$('cropApplication').value;
    let next={x:c.x+$('cropX').valueAsNumber,y:c.y+$('cropY').valueAsNumber,width:$('cropWidth').valueAsNumber,height:$('cropHeight').valueAsNumber};
    if(mode!=='selection') {const ratio=aspect(),r=dimensionCrop(c.width,c.height,ratio,mode);if(!r)throw new Error(ratio?'この比率では選択した画像の辺を維持できません。':'アスペクト比を選択してください。');next={...r,x:r.x+c.x,y:r.y+c.y};}
    if(next.width<10||next.height<10)throw new Error('幅と高さは10 px以上にしてください。');
    if(next.x<c.x||next.y<c.y||next.x+next.width>c.x+c.width||next.y+next.height>c.y+c.height)throw new Error('トリミング範囲が現在の画像を超えています。');
    settings.crop=validateCrop(next,current.width,current.height);
    if(settings.panelLabel.position) {settings.panelLabel.position.x=Math.max(0,settings.panelLabel.position.x-next.x+c.x);settings.panelLabel.position.y=Math.max(0,settings.panelLabel.position.y-next.y+c.y);}
    settings.scaleBar.position=null;settings.scaleBar.fontPercent=9;pendingCrop=measurement=null;settings.cropOptions.pending=null;commit(settings,'crop');setTool('move');
  } catch (error) { notify(error.message, true); }
});
$('resetCropButton').addEventListener('click', () => {
  try { const settings = copy(current.settings); settings.crop = { x: 0, y: 0, width: current.width, height: current.height }; settings.scaleBar.position=null;settings.scaleBar.fontPercent=9;pendingCrop=measurement=null;settings.cropOptions.pending=null; commit(settings);for(const item of items){item.cropError=null;item.settings.crop={x:0,y:0,width:item.width,height:item.height};item.settings.cropOptions.pending=null;}setTool('move'); } catch (error) { notify(error.message, true); }
});
function undo(redo = false) {
  if (!current || busy) return;
  const before=current.settings;current.settings=redo?current.history.redo():current.history.undo();
  for(const section of ['crop','scaleBar','panelLabel','output']){
    const old=copy(before[section]),next=copy(current.settings[section]);
    if(section==='scaleBar'){delete old.visible;delete next.visible;}
    if(section==='panelLabel')for(const key of ['visible','text','subtext','position']){delete old[key];delete next[key];}
    if(JSON.stringify(old)!==JSON.stringify(next))shareSettings(section);
  }
  current.barVisible=current.settings.scaleBar.visible;current.labelVisible=current.settings.panelLabel.visible;current.labelText=current.settings.panelLabel.text;current.subtext=current.settings.panelLabel.subtext;
  measurement=measurementStart=drag=cropStart=null;pendingCrop=current.settings.cropOptions.pending??null;syncInputs();render();
}
$('undoButton').addEventListener('click', () => undo()); $('redoButton').addEventListener('click', () => undo(true));
$('zoomSelect').addEventListener('change',()=>{ cancelWheelZoom(); render(); });
for(const [id,raw] of [['rawPreviewButton',true],['processedPreviewButton',false]]) $(id).addEventListener('click',()=>{setTool('move');previewRaw=raw;$('rawPreviewButton').classList.toggle('active',raw);$('processedPreviewButton').classList.toggle('active',!raw);render();});
let resizeFrame; new ResizeObserver(() => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(render); }).observe($('previewArea'));
document.addEventListener('keydown', event => {
  const editing = event.target.matches('input, textarea, select');
  if (event.key === 'Escape' && current && !busy) { if (drag?.before) current.settings = drag.before; drag = pendingCrop = cropStart = measurementStart = measurement = null; current.settings.cropOptions.pending=null;current.history.push(current.settings);setTool('move'); syncInputs(); }
  if (!editing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(event.shiftKey); }
  if((event.ctrlKey||event.metaKey)&&!editing) {
    const key=event.key.toLowerCase();
    if(key==='s'){event.preventDefault();$('singleSaveButton').click();}
    if(key==='o'){event.preventDefault();$('imageInput').click();}
    if(key==='n'){event.preventDefault();$('removeAllButton').click();}
    if(key==='c'&&event.shiftKey){event.preventDefault();$('copyButton').click();}
  }
});
for (const eventName of ['dragenter', 'dragover']) $('previewArea').addEventListener(eventName, event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } });
$('previewArea').addEventListener('drop', event => { event.preventDefault(); if (!busy) action(() => addFiles(event.dataTransfer.files)); });
document.addEventListener('paste', event => {
  if (busy || event.target.matches('input, textarea')) return;
  const files = [...(event.clipboardData?.files || [])].filter(file => /^image\/(png|jpeg|bmp)$/.test(file.type));
  if (files.length) { event.preventDefault(); action(() => addFiles(files)); }
});
async function removeItems(removed) {
  if(!removed.length)return;
  const retained=items.filter(item=>!removed.includes(item));
  if(removed.includes(current)) {
    const next=retained.find(item=>items.indexOf(item)>items.indexOf(current))||retained.at(-1);
    if(next) { const oldError=next.cropError;next.cropError=null;try{await selectItem(next);}finally{next.cropError=oldError;} }
    else {if(source)releaseImage(source);source=current=plan=null;}
  }
  for(const item of removed)URL.revokeObjectURL(item.thumbnail);
  items.splice(0,items.length,...retained);
  measurement=measurementStart=pendingCrop=drag=cropStart=null;
  renderList();syncInputs();render();setBusy(busy);
  if(!current){$('imageName').textContent='画像なし';$('imageDimensions').textContent=$('outputInfo').textContent='—';}
  notify(`${removed.length}枚を一覧から削除しました。元画像は保持されます。`);
}
$('removeAllButton').addEventListener('click',()=>action(()=>removeItems([...items])));
for(const [id,offset] of [['moveImageUp',-1],['moveImageDown',1]]) $(id).addEventListener('click',()=>{if(busy||!current)return;const index=items.indexOf(current),target=index+offset;if(target<0||target>=items.length)return;[items[index],items[target]]=[items[target],items[index]];renderList();});
for(const [id,key,value] of [['batchAll','enabled',true],['batchNone','enabled',false],['batchBarsOn','barVisible',true],['batchBarsOff','barVisible',false],['batchLabelsOn','labelVisible',true],['batchLabelsOff','labelVisible',false]]) $(id).addEventListener('click',()=>{if(busy)return;for(const item of items){item[key]=value;if(key!=='enabled')item.settings[key==='barVisible'?'scaleBar':'panelLabel'].visible=value;}renderList();syncInputs();render();});
$('batchBarFirst').addEventListener('click',()=>{if(busy)return;let first=true;for(const item of items){item.barVisible=item.enabled&&first;if(item.enabled)first=false;item.settings.scaleBar.visible=item.barVisible;}renderList();syncInputs();render();});
function numbering(){
  return { ...panelNumbering($('panelFormat').value,{parent:$('panelBranchParent').value,mode:$('batchSequence').value,start:$('batchStart').valueAsNumber,startLetter:$('batchStartLetter').value,prefix:$('batchPrefix').value,separator:$('batchSeparator').value,uppercase:$('batchUppercase').checked}), parentheses:$('labelParentheses').checked };
}
function updateLabelFormat() {
  const preset=$('panelFormat').value;
  $('panelBranchRow').hidden=!['branch-number','branch-roman'].includes(preset);
  $('panelCustomOptions').hidden=preset!=='custom';
  $('panelStartRow').hidden=!['branch-number','branch-roman','number','custom'].includes(preset);
  try { const n=numbering(); $('labelFormatPreview').textContent=preset==='none'?'本文ラベルなし（補足文字は保持）':`連番の例：${[0,1,2].map(index=>numberedLabel(index,n)).join(', ')}`; }
  catch(error){$('labelFormatPreview').textContent=error.message;}
}
for(const id of ['panelFormat','panelBranchParent','batchSequence','batchStart','batchStartLetter','batchPrefix','batchSeparator','batchUppercase','labelParentheses']) {
  $(id).addEventListener('input',updateLabelFormat); $(id).addEventListener('change',updateLabelFormat);
}
updateLabelFormat();
function applyPanelLabels(onlyEnabled) {
  if(busy||!current)return;
  try {
    const n=numbering(), changes=labelSequenceChanges(items,n,onlyEnabled).map(({item,text})=>{
      const settings=copy(item.settings);settings.panelLabel.text=text;settings.panelLabel.parentheses=n.parentheses;
      const next=validateSettings(settings,item.width,item.height);buildPlan(next,context);
      return {item,text,settings:next};
    });
    for(const {item,text,settings} of changes){item.labelText=text;item.settings=settings;item.history.push(settings);}
    renderList();syncInputs();render();notify('ラベル形式を適用しました。');
  }catch(error){notify(error.message,true);}
}
$('applyPanelLabels').addEventListener('click',()=>applyPanelLabels($('labelApplySelected').checked));
const projectLabelControls=['panelFormat','panelBranchParent','batchSequence','batchStart','batchStartLetter','batchPrefix','batchSeparator','batchUppercase'];
$('openProjectButton').addEventListener('click',()=>{if(!busy)$('projectInput').click();});
$('openSettingsButton').addEventListener('click',()=>{if(!busy&&current)$('settingsInput').click();});
function closeSettingsSaveMenu(){
  $('settingsSaveMenu').hidden=true;$('settingsSaveMenuButton').setAttribute('aria-expanded','false');
}
$('settingsSaveMenuButton').addEventListener('click',()=>{
  if(busy||!current)return;
  const open=$('settingsSaveMenu').hidden;
  $('settingsSaveMenu').hidden=!open;$('settingsSaveMenuButton').setAttribute('aria-expanded',String(open));
});
document.addEventListener('click',event=>{if(!$('settingsSaveDropdown').contains(event.target))closeSettingsSaveMenu();});
$('settingsSaveDropdown').addEventListener('focusout',event=>{if(!$('settingsSaveDropdown').contains(event.relatedTarget))closeSettingsSaveMenu();});
$('settingsSaveDropdown').addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!$('settingsSaveMenu').hidden){event.preventDefault();event.stopPropagation();closeSettingsSaveMenu();$('settingsSaveMenuButton').focus();}
});
$('saveProjectButton').addEventListener('click',()=>action(async()=>{
  let handle;
  const name=`${current.name.replace(/\.[^.]+$/, '').replace(/[\\/\x00-\x1f<>:"|?*]/g,'_')}_project.mifito`;
  if(typeof window.showSaveFilePicker==='function'){
    try { handle=await window.showSaveFilePicker({suggestedName:name,types:[{description:'MiFiToプロジェクト',accept:{'application/octet-stream':['.mifito']}}]}); }
    catch(error){if(error.name==='AbortError'){notify('プロジェクトの保存をキャンセルしました。');return;}throw error;}
  }
  const ui=projectUI(), savedSnapshot=workspaceSnapshot(items,ui);
  notify('元画像と編集設定をプロジェクトに保存しています…');
  projectSaving=true;scheduleWorkState();
  try {
    const blob=await createProject(items,items.indexOf(current),ui);
    if(handle){
      const writer=await handle.createWritable();
      try{await writer.write(blob);await writer.close();}catch(error){try{await writer.abort();}catch{}throw error;}
      notify(`プロジェクトを保存しました（元画像${items.length}枚と編集設定）。`);
    }else{download(blob,name);notify(`プロジェクトのダウンロードを開始しました（元画像${items.length}枚と編集設定）。`);}
    workSaveState.markSaved(savedSnapshot);
  }finally{projectSaving=false;scheduleWorkState();}
}));
$('projectInput').addEventListener('change',()=>{
  const file=$('projectInput').files[0];$('projectInput').value='';
  if(file)action(()=>openProject(file));
});
async function openProject(file){
  notify('プロジェクトを読み込んでいます…');
  const project=await readProject(file),restored=[];
  let activeDecoded=null;
  try{
    for(const record of project.images){
      const original=new File([record.blob],record.name,{type:record.type,lastModified:record.lastModified});
      const decoded=await decodeImage(original);
      try{
        if(decoded.width!==record.width||decoded.height!==record.height)throw new Error(`${record.name} の画像サイズが設定と一致しません。`);
        buildPlan(record.settings,context);
        const item={id:crypto.randomUUID(),name:record.name,file:original,width:record.width,height:record.height,thumbnail:await thumbnail(decoded.source),settings:record.settings,history:new History(record.settings),enabled:record.enabled,barVisible:record.settings.scaleBar.visible,labelVisible:record.settings.panelLabel.visible,labelText:record.settings.panelLabel.text,subtext:record.settings.panelLabel.subtext,sourceDirectory:null,sourceHandle:null};
        restored.push(item);
        if(restored.length-1===project.activeIndex)activeDecoded=decoded;
      }finally{if(decoded!==activeDecoded)releaseImage(decoded.source);}
      await new Promise(resolve=>requestAnimationFrame(resolve));
    }
  }catch(error){for(const item of restored)URL.revokeObjectURL(item.thumbnail);if(activeDecoded)releaseImage(activeDecoded.source);throw error;}
  // Replace the current work only after every embedded image/settings pair is valid.
  for(const item of items)URL.revokeObjectURL(item.thumbnail);
  items.splice(0,items.length,...restored);
  clearDownloads();saveDirectory=null;previewRaw=false;$('zoomSelect').value='fit';
  $('saveDestination').value='download';
  $('saveDpi').value=String(project.ui.dpi);$('includeSettings').checked=project.ui.includeSettings;
  const formats=restoreExportFormats(project.ui.formats);
  for(const input of document.querySelectorAll('[data-export-format]'))input.checked=formats.includes(input.dataset.exportFormat);
  for(const id of projectLabelControls)if(typeof project.ui.labelControls?.[id]==='string'||typeof project.ui.labelControls?.[id]==='boolean'){
    const input=$(id),value=project.ui.labelControls[id];
    if(input.type==='checkbox')input.checked=value===true;
    else if(typeof value==='string'&&(input.tagName!=='SELECT'||[...input.options].some(option=>option.value===value)))input.value=value;
  }
  $('labelApplySelected').checked=project.ui.labelApplySelected===true;
  activateItem(items[project.activeIndex],activeDecoded);
  pendingCrop=current.settings.cropOptions.pending??null;syncInputs();render();
  workSaveState.markSaved(workspaceSnapshot(items,projectUI()));scheduleWorkState();
  notify(`プロジェクトを開きました（${items.length}枚）。編集を再開できます。`);
}
$('saveSettingsButton').addEventListener('click', () => {
  if(busy||!current)return;closeSettingsSaveMenu();
  try { download(new Blob([JSON.stringify(serializeProject(current.settings, current), null, 2)], { type: 'application/json' }), `${current.name.replace(/\.[^.]+$/, '')}_settings.json`); notify('設定JSONを保存しました。'); } catch (error) { notify(error.message, true); }
});
$('saveSessionButton').addEventListener('click',()=>{if(busy||!current)return;closeSettingsSaveMenu();try{download(new Blob([JSON.stringify(sessionProject(items,current.settings.output,exportFormats()),null,2)],{type:'application/json'}),'microscopy_batch.json');notify('一覧のセッション設定を保存しました。元画像も保管してください。');}catch(error){notify(error.message,true);}});
$('settingsInput').addEventListener('change', () => {
  const file = $('settingsInput').files[0]; $('settingsInput').value = '';
  action(async () => {
    if (!file) return;if(file.size>4000000)throw new Error('設定JSONが大きすぎます。');const text=await file.text();let data;try{data=JSON.parse(text);}catch{throw new Error('設定JSONを読み取れませんでした。');}
    if(data?.session_type==='microscopy_batch'){
      const records=parseSession(data,items);for(const {image,settings,enabled} of records){image.settings=settings;image.history=new History(settings);image.enabled=enabled;image.barVisible=settings.scaleBar.visible;image.labelVisible=settings.panelLabel.visible;image.labelText=settings.panelLabel.text;image.subtext=settings.panelLabel.subtext;image.cropError=null;}
      const previous=[...items];items.splice(0,items.length,...records.map(r=>r.image));for(const item of previous)if(!items.includes(item))URL.revokeObjectURL(item.thumbnail);
      await selectItem(items[0]);
      const formats=restoreExportFormats(data.output_formats??[data.output_format??'.png']);
      for(const input of document.querySelectorAll('[data-export-format]'))input.checked=formats.includes(input.dataset.exportFormat);
    }else{const settings=parseProject(data,current);pendingCrop=null;commit(settings);setTool('move');}
    notify('設定を読み込みました。');
  });
});
function exportFormats(){const formats=[...document.querySelectorAll('[data-export-format]:checked')].map(input=>input.dataset.exportFormat);if(!formats.length)throw new Error('保存形式を1つ以上選択してください。');return formats;}
function refreshSaveUI() {
  const count=items.filter(item=>item.enabled).length;
  $('singleSaveButton').disabled=busy||!current;
  $('batchSaveButton').textContent=`一括保存（${count}枚）`;
  $('batchSaveButton').disabled=busy||!current||!count;
  $('saveDialogTitle').textContent=saveBatch?'一括保存':'この画像を保存';
  $('exportButton').textContent=saveBatch?`${count}枚を一括保存`:'この画像を保存';
  $('exportButton').disabled=busy||!current||(saveBatch&&!count);
  $('saveTargetInfo').textContent=saveBatch?`保存する画像：チェックした${count}枚`:(current?current.name:'画像を開いてください');
  $('saveBatchHint').hidden=!saveBatch;
  $('copyButton').title=`表示中の画像を${current?.settings.output.dpi??600} dpiでコピー（プレビュー右上の解像度で変更）`;
  const mode=$('saveDestination').value;
  $('chooseSaveFolder').hidden=mode!=='folder';
  $('saveFolderInfo').textContent=mode==='folder'?(saveDirectory?`保存先：${saveDirectory.name}`:'保存ボタンを押すと保存先を選べます。'):mode==='source'?(current?.sourceDirectory?`元フォルダ：${current.sourceDirectory.name}`:current?.sourceHandle?'初回保存時に元フォルダを開きます。保存先を確認してください。':'初回保存時に保存先フォルダを確認してください。'):'全ファイルのダウンロードを自動で開始します。';
}
for(const [id,batch] of [['singleSaveButton',false],['batchSaveButton',true]]) $(id).addEventListener('click',()=>{
  if(busy||!current)return;
  saveBatch=batch;refreshSaveUI();$('saveDialog').showModal();
});
$('closeSaveDialog').addEventListener('click',()=>{if(!busy)$('saveDialog').close();});
$('saveDialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();});
for(const id of ['includeSettings','saveDpi']) $(id).addEventListener('change',refreshSaveUI);
$('saveDestination').addEventListener('change',refreshSaveUI);
$('saveDestination').value=folderSupported?'folder':'download';
for(const option of $('saveDestination').options)if(option.value!=='download')option.disabled=!folderSupported;
$('folderInput').closest('label').hidden=folderSupported;
$('openSourceFolder').hidden=!folderSupported;
$('saveCompatibility').hidden=folderSupported;
$('chooseSaveFolder').addEventListener('click',()=>action(async()=>{
  try{saveDirectory=await window.showDirectoryPicker(directoryPickerOptions(saveDirectory||current?.sourceDirectory||current?.sourceHandle));refreshSaveUI();}
  catch(error){if(error.name!=='AbortError')throw error;}
}));
$('openSourceFolder').addEventListener('click',()=>action(async()=>{
  let directory;
  try{directory=await window.showDirectoryPicker({id:'mifito-source',mode:'readwrite'});}
  catch(error){if(error.name==='AbortError')return;throw error;}
  const records=await readFolder(directory,SUPPORTED,LIMITS.files);
  for(const record of records)sourceFolders.set(record.file,record.directory);
  const added=await addFiles(records.map(record=>record.file));
  if(added.length){$('saveDestination').value='source';refreshSaveUI();}
}));
async function prepareSaver(targets) {
  let mode=$('saveDestination').value;
  if((mode==='folder'&&!saveDirectory)||(mode==='source'&&targets.some(item=>!item.sourceDirectory))) {
    const first=targets.find(item=>!item.sourceDirectory)||targets[0];
    const directory=await window.showDirectoryPicker(directoryPickerOptions(mode==='source'?first.sourceHandle:saveDirectory||first.sourceDirectory||first.sourceHandle));
    saveDirectory=directory;await rememberSourceDirectory(items,directory);
    if(mode==='source'&&targets.some(item=>!item.sourceDirectory))mode='folder';
    $('saveDestination').value=mode;refreshSaveUI();
  }
  const directories=mode==='download'?[]:mode==='folder'?[saveDirectory]:[...new Set(targets.map(item=>item.sourceDirectory))];
  for(const directory of directories)await ensureWritable(directory);
  clearDownloads();
  return async(blob,name,item)=>{
    if(mode==='download'){download(blob,name,{automatic:false});return name;}
    return writeFile(mode==='source'?item.sourceDirectory:saveDirectory,blob,name);
  };
}
$('exportButton').addEventListener('click',()=>action(async()=>{
  const isBatch=saveBatch,targets=isBatch?items.filter(item=>item.enabled):[current];
  try {
    if(!targets.length||!current)throw new Error('保存する画像を選んでください。');
    const formats=exportFormats(),labelNumbering={enabled:false,cropMode:'individual'},saveFile=await prepareSaver(targets);
    await document.fonts.ready;
    batchController=new AbortController();$('cancelBatchButton').hidden=false;
    const template=copy(current.settings);template.calibration??=copy(items.find(item=>item.settings.calibration)?.settings.calibration??null);
    const result=await batchExport(targets,template,current,formats,labelNumbering,batchController.signal,message=>{$('batchProgress').textContent=message;},saveFile,$('includeSettings').checked);
    const downloads=$('saveDestination').value==='download';
    if(downloads){$('batchProgress').textContent='全ファイルのダウンロードを開始しています…';await downloadAll(batchController.signal);}
    const message=`${result.saved}枚・${result.files.length}ファイル${downloads?'のダウンロードを開始しました。':'を保存しました。'}${result.failures.length?` ${result.failures.length}枚失敗：${result.failures.map(f=>`${f.name}（${f.error}）`).join('、')}`:''}`;
    $('batchProgress').textContent=message;notify(message,result.failures.length>0);
  } catch(error){if(error.name==='AbortError'){$('batchProgress').textContent='保存をキャンセルしました。';return;}$('batchProgress').textContent=error.message;throw error;}
  finally{$('cancelBatchButton').hidden=true;batchController=null;renderList();}
}));
refreshSaveUI();
$('downloadAllButton').addEventListener('click',()=>action(async()=>{const count=await downloadAll();$('batchProgress').textContent=`${count}ファイルのダウンロードを開始しました。`;}));
$('copyButton').addEventListener('click',()=>action(async()=>{
  if(!navigator.clipboard?.write||typeof ClipboardItem==='undefined')throw new Error('このブラウザでは画像コピーを利用できません。PNGを保存してください。');
  const settings=copy(current.settings);if(previewRaw){settings.crop={x:0,y:0,width:current.width,height:current.height};settings.scaleBar.visible=settings.panelLabel.visible=false;settings.output.scale=1;}
  const image=source,png=document.fonts.ready.then(()=>exportImage(image,settings,'png'));
  // Start the clipboard write in the click event; Safari requires user activation.
  // Encode with the same resolution and native annotation rendering as PNG save.
  png.catch(()=>{});
  await navigator.clipboard.write([new ClipboardItem({'image/png':png})]);
  notify(`表示中の画像を${settings.output.dpi??600} dpiでクリップボードへコピーしました。`);
}));
$('cancelBatchButton').addEventListener('click', () => { batchController?.abort(); $('batchProgress').textContent = '現在の画像の処理後に中止します…'; });
$('helpButton').addEventListener('click', () => $('helpDialog').showModal()); $('closeHelpButton').addEventListener('click', () => $('helpDialog').close());

async function demo(count = 1) {
  // One acquisition scale and image size allow the same calibration and crop.
  const width = 900, height = 650, pixelSize = 0.02;
  const examples = [
    { seed:73452,colors:['#152d29','#a2c296','#548b76','#234e42','#80ac84'] },
    { seed:21891,colors:['#211d35','#d7b1e5','#8b6dac','#43365f','#b59acc'] },
    { seed:95127,colors:['#182c3c','#a3d5ec','#538baa','#23455f','#83b5cd'] },
  ].slice(0,count);
  const files = [];
  for (const [index,example] of examples.entries()) {
    const {colors} = example;
    const demo = document.createElement('canvas'); demo.width = width; demo.height = height;
    const c = demo.getContext('2d'); c.fillStyle = colors[0]; c.fillRect(0, 0, width, height);
    // Deterministic synthetic microscopy image; no remote image requests.
    let randomState = example.seed;
    const random = () => { randomState = (randomState * 1664525 + 1013904223) >>> 0; return randomState / 4294967296; };
    for (let i = 0; i < 38; i++) {
      const x = 25 + random() * (width-50), y = 35 + random() * (height-75), r = 17 + random() * 37;
      const gradient = c.createRadialGradient(x - r * 0.2, y - r * 0.2, 2, x, y, r);
      gradient.addColorStop(0, colors[1]); gradient.addColorStop(0.5, colors[2]); gradient.addColorStop(0.85, colors[3]); gradient.addColorStop(1, colors[4]);
      c.fillStyle = gradient; c.beginPath(); c.ellipse(x, y, r, r * 0.83, random() * 3, 0, Math.PI * 2); c.fill();
    }
    const referencePixels = 5/pixelSize, y = height-70, right = 80+referencePixels;
    c.strokeStyle = colors[4]; c.lineWidth = 2; c.beginPath(); c.moveTo(80,y); c.lineTo(right,y); c.moveTo(80,y-12); c.lineTo(80,y+12); c.moveTo(right,y-12); c.lineTo(right,y+12); c.stroke();
    c.font = '16px FigureSans'; c.fillStyle = colors[1]; c.fillText(`5 µm reference · ${referencePixels} px`,80,y-23);
    const base = count === 1 ? 'sample_cells' : `sample_cells_${String.fromCharCode(97+index)}`;
    let name = `${base}.png`, suffix = 2;
    while (items.some(item=>item.name===name)) name = `${base}_${suffix++}.png`;
    files.push(new File([await canvasBlob(demo)],name,{type:'image/png'}));
    demo.width = demo.height = 0;
  }
  const added = await addFiles(files);
  for (const item of added) {
    const index = files.findIndex(file=>file===item.file), settings = copy(item.settings);
    settings.calibration = {pixelSize,unit:'µm'}; settings.scaleBar.length = 5;
    settings.panelLabel.text = item.labelText = String.fromCharCode(97+index);
    item.settings = validateSettings(settings,item.width,item.height); item.history.push(item.settings);
  }
  if (added.length) { $('knownLength').value = 5; syncInputs(); renderList(); render(); }
  if (added.length === files.length) {
    if (count > 1) { notify('同じスケールのサンプル3枚を追加しました（1 px = 0.02 µm）。上の「一括保存」から保存できます。'); }
    else notify('サンプルは校正済みです。左下の基準線は250 px = 5 µmです。');
  }
}
for (const id of ['demoButton','emptySingleDemoButton']) $(id).addEventListener('click',()=>action(()=>demo()));
for (const id of ['multiDemoButton','emptyDemoButton']) $(id).addEventListener('click',()=>action(()=>demo(3)));
setBusy(false);
await Promise.all([document.fonts.load('400 16px FigureSans'), document.fonts.load('700 16px FigureSans')]);
render();
