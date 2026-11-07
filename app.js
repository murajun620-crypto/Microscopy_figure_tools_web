import {setupFigureBridge,getFigureBridgeContext} from './bridge-host.mjs?v=18508bd5a16c';
import {setupDirectSendButton} from './direct-transfer.mjs?v=18508bd5a16c';
import {readMifitoIdentity,mergeMifitoBaseline,createMifitoAcknowledgements} from './mifito-sync.mjs?v=18508bd5a16c';
import { compactHelp, documentSaver, filePickerOptions } from './ui-common.js?v=18508bd5a16c';
import { History, LIMITS, calibrationFromPoints, clamp, copy, cropFromPoints, cropPointer, defaultSettings, dimensionCrop, editCrop, fitCropAspect, parseProject, parseSession, positive, rasterMetrics, serializeProject, sessionProject, validateCrop, validateSettings, viewToImage } from './core.js?v=18508bd5a16c';
import { SUPPORTED, canvasBlob, decodeImage, download, downloadAll, clearDownloads, releaseImage, thumbnail } from './io.js?v=18508bd5a16c';
import { buildPlan, paint } from './render.js?v=18508bd5a16c';
import { batchExport, exportImage } from './export.js?v=18508bd5a16c';
import { wheelZoom, zoomText, previewTile, MIN_ZOOM, MAX_ZOOM } from './zoom.js?v=18508bd5a16c';
import { ensureWritable, writeFile, readFolder, imagePickerOptions, directoryPickerOptions, rememberSourceDirectory, restoreExportFormats } from './save-files.js?v=18508bd5a16c';
import { panelNumbering, numberedLabel, labelSequenceChanges } from './label-numbering.js?v=18508bd5a16c';
import { createProject, readProject } from './project.js?v=18508bd5a16c';
import { APP_VERSION, WorkSaveState, workspaceSnapshot } from './work-state.js?v=18508bd5a16c';
import { cropConflicts, prepareCrop, SettingsTransactions } from './crop-workflow.js?v=18508bd5a16c';
import { prepareScaleBar } from './bar-workflow.js?v=18508bd5a16c';
import { prepareCalibration } from './calibration-workflow.js?v=18508bd5a16c';
import { prepareMapRange, prepareMapDesign } from './map-workflow.js?v=18508bd5a16c';
import { AppUpdater } from './app-update.js?v=18508bd5a16c';
import { ImageOverview } from './overview.js?v=18508bd5a16c';
import { ImageSettingsTable, prepareImageTableEdit } from './image-table.js?v=18508bd5a16c';
import { SamplePicker } from './sample-picker.js?v=18508bd5a16c';
import { sampleRaster, sampleSettings, SAMPLE_WIDTH, SAMPLE_HEIGHT, SAMPLES } from './samples.js?v=18508bd5a16c';
import { prepareProjectSave } from './project-save.js?v=18508bd5a16c';
import { AnnotationUI } from './annotation-ui.js?v=18508bd5a16c';
import { setupMovableDialogs, showDialog } from './movable-dialog.js?v=18508bd5a16c';
import { estimateSourcePalette } from './palette-estimation.js?v=18508bd5a16c';
import { MAP_PALETTES, defaultMapColorbar, mapStops, paletteFromFile } from './map-colorbar.js?v=18508bd5a16c';

const $ = id => document.getElementById(id);
const canvas = $('preview'), context = canvas.getContext('2d');
const items = [];
const settingsTransactions=new SettingsTransactions();
const folderSupported=typeof window.showDirectoryPicker==='function';
const sourceFolders=new WeakMap();
const sourceHandles=new WeakMap();
let saveDirectory=null;
let projectHandle=null;
let projectName='';
let figureStudioProjectId=crypto.randomUUID(),figurePreviewProjectId='';
const figurePreviewCache=new Map(),FIGURE_PREVIEW_LIMIT=96*1024*1024;
let figureAcknowledgements=createMifitoAcknowledgements(),figureWorkspaceSavedSignature=null,figureWorkspaceFinishRestore=null,figureWorkspaceEditSerial=0;
let saveBatch=false;

let current = null, source = null, plan = null, previewScale = 1, tool = 'move',previewRaw=false;
let measurement = null, measurementStart = null, drag = null, pendingCrop = null, cropStart = null, busy = false, batchController = null, toastTimer = null;
let wheelZoomFrame = 0, wheelZoomAnchor = null;
let previewFrame = 0, spacePan = false, hoverPixel = null;
let annotationUI=null,mapEstimate=null,appUpdater=null,imageOverview=null,imageTable=null,previewMode='single';
const workSaveState=new WorkSaveState();
let workStateQueued=false, leaveGuardInstalled=false, projectSaving=false;
$('appVersion').textContent=`v${APP_VERSION}`;
$('appVersion').setAttribute('aria-label',`バージョン ${APP_VERSION}`);
function projectUI() {
  return {figureStudioProjectId,formats:[...document.querySelectorAll('[data-export-format]:checked')].map(input=>input.dataset.exportFormat),dpi:Number($('saveDpi').value),includeSettings:$('includeSettings').checked,colorMode:'simple',cropScope:$('cropScope').value,barScope:$('barScope').value,calibrationScope:$('calibrationScope').value,mapRangeScope:$('mapRangeScope').value,studioSizeScope:$('studioSizeAll').checked?'batch':'individual',labelApplySelected:$('labelApplySelected').checked,labelControls:Object.fromEntries(projectLabelControls.map(id=>[id,$(id).type==='checkbox'?$(id).checked:$(id).value]))};
}
function pendingInputEdit() {
  if(!current)return false;
  if(annotationUI?.pending||imageTable?.pending)return true;
  for(const input of document.querySelectorAll('[data-setting],[data-opacity-for],#imageList [data-item-key]')) {
    let expected;
    if(input.dataset.setting){const [section,key]=input.dataset.setting.split('.');expected=current.settings[section][key];}
    else if(input.dataset.opacityFor){const [section,key]=$(input.dataset.opacityFor).dataset.setting.split('.');expected=Math.round(current.settings[section][key]*100);}
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
  const studioSize=current.settings.output.studioSize??null;
  if($('studioSizeEnabled').checked!==!!studioSize)return true;
  if(studioSize&&($('studioSizeAxis').value!==studioSize.axis||$('studioSizeMm').value===''||Number($('studioSizeMm').value)!==studioSize.mm))return true;
  return false;
}
function hasUnsavedWork() {
  return !!items.length&&(projectSaving||pendingInputEdit()||workSaveState.isDirty(workspaceSnapshot(items,projectUI()),true));
}
function confirmUnsavedLeave(event) {
  if(appUpdater?.reloading||!hasUnsavedWork())return;
  if(figureWorkspaceSavedSignature!==null&&figureWorkspaceSavedSignature===figureWorkspaceSignature())return;
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
  const label=projectName?`プロジェクト：${projectName}`:'プロジェクト';
  const state=dirty?'未保存の変更があります':'保存済み';
  const status=$('projectSaveStatus'), text=!items.length?'画像なし':projectSaving?`${label} 保存中…`:projectName?`${label}（${state}）`:`${label}：${state}`;
  $('projectSaveButtonLabel').textContent=projectHandle?'上書き保存':'プロジェクトを保存';
  $('saveProjectButton').title=projectHandle?`${projectHandle.name} に上書き保存します（Ctrl/Cmd＋S）`:'元画像と編集設定をプロジェクトに保存します（Ctrl/Cmd＋S）';
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
for (const input of document.querySelectorAll('input[type="color"][data-setting],input[type="color"][data-ann-field]')) {
  const title = input.parentElement.firstChild.textContent.trim();
  const section = input.dataset.setting?.split('.')[0];
  const name = `${section === 'scaleBar' ? 'スケールバー' : section==='panelLabel'?'パネルラベル':section==='mapColorbar'?'カラーバー':'注釈'}の${title}`;
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
  showDialog($('color-panel'));
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
compactHelp();
setupMovableDialogs();
for(const p of MAP_PALETTES)$('mapPalette').add(new Option(p.name,p.id));
$('mapPalette').add(new Option('アップロード配色','custom'));
function syncMapColorbar(){
  const s=current?.settings.mapColorbar??defaultMapColorbar(),option=$('mapPalette').querySelector('[value="custom"]');
  option.disabled=!s.customPalette;option.textContent=s.customPalette?`アップロード：${s.customPalette.name}`:'アップロード配色';
  const gradient=`linear-gradient(to right,${mapStops(s).map(p=>`${p.color} ${p.position*100}%`).join(',')})`;
  $('mapPalettePreview').style.background=gradient;
  for(const button of document.querySelectorAll('[data-map-style]')){button.disabled=busy||!current;button.setAttribute('aria-pressed',String(button.dataset.mapStyle===s.style));button.querySelector('.map-style-bar').style.background=gradient;
    const range=button.querySelector('.map-style-range'),number=value=>Number(value.toFixed(s.digits)).toLocaleString('en-US',{useGrouping:false,maximumFractionDigits:s.digits});
    if(range){range.firstChild.textContent=number(s.min);range.lastElementChild.textContent=number(s.max);}
    button.querySelector('.map-style-label').textContent=button.dataset.mapStyle==='full'?[s.title,s.unit?`(${s.unit})`:''].filter(Boolean).join(' '):button.dataset.mapStyle==='unit'?s.unit:'バーのみ';
  }
  $('mapTextGapField').hidden=s.style==='bar-only';
  $('mapTitleField').hidden=s.style!=='full';$('mapUnitField').hidden=s.style==='bar-only';$('mapRangeControls').hidden=$('mapTicksFields').hidden=s.style==='bar-only';
  $('mapRangeInfo').textContent=$('mapRangeScope').value==='individual'?'表示中の画像だけの最小・最大値を変更します。右上の◀▶で画像を切り替えて設定してください。':'値を変更すると、全画像の最小・最大値に適用します。';
  $('estimateMapPalette').disabled=busy||!current;
  $('mapEstimateResult').hidden=!mapEstimate||mapEstimate.imageId!==current?.id||mapEstimate.signature!==JSON.stringify([current?.settings.crop,s.palette,s.customPalette]);
  if(mapEstimate)$('mapEstimateResult').textContent=mapEstimate.text;
  $('uploadMapPalette').disabled=busy||!current;$('applyMapToAll').disabled=busy||!current||items.length<2;
}
$('mapRangeScope').addEventListener('change',syncMapColorbar);
for(const button of document.querySelectorAll('[data-map-style]'))button.addEventListener('click',()=>{if(busy||!current)return;const s=copy(current.settings);s.mapColorbar.style=button.dataset.mapStyle;commit(s);});
$('estimateMapPalette').addEventListener('click',()=>{
  if(!current||busy)return;
  action(async()=>{
    const candidates=current.settings.mapColorbar.customPalette?[...MAP_PALETTES,{id:'custom',...current.settings.mapColorbar.customPalette}]:MAP_PALETTES;
    const result=estimateSourcePalette(source,current.settings.crop,candidates);
    if(result.confident){const s=copy(current.settings);s.mapColorbar.palette=result.palette;s.mapColorbar.visible=true;commit(s);}
    const text=result.confident?`配色の推定：${result.name}。最小・最大値、単位、色の向きは元のマップで確認してください。`:`${result.reason} 現在の配色は変更していません。`;
    mapEstimate={imageId:current.id,text,signature:JSON.stringify([current.settings.crop,current.settings.mapColorbar.palette,current.settings.mapColorbar.customPalette])};syncMapColorbar();notify(text);
  });
});
$('uploadMapPalette').addEventListener('click',()=>{if(!busy&&current)$('mapPaletteInput').click();});
$('mapPaletteInput').addEventListener('change',()=>{
  const file=$('mapPaletteInput').files[0];$('mapPaletteInput').value='';if(!file||!current||busy)return;
  action(async()=>{const palette=await paletteFromFile(file),s=copy(current.settings);s.mapColorbar.customPalette=palette;s.mapColorbar.palette='custom';commit(s);notify(`配色「${palette.name}」を読み込みました。`);});
});
$('applyMapToAll').addEventListener('click',()=>{
  if(busy||!current)return;
  try{const updates=prepareMapDesign(items,current);for(const update of updates)buildPlan(update.settings,context);
    settingsTransactions.apply(updates,{clearCropError:false,origin:current});syncInputs();render();notify(`${items.length}枚にデザインを適用しました。各画像の最小・最大値は保持しています。`);
  }catch(error){notify(error.message,true);}
});
for (const [id,options] of [['barAnchor',[['bottom-right','右下'],['bottom-left','左下'],['top-right','右上'],['top-left','左上'],...outsideAnchors]],['labelAnchor',[['top-left','左上'],['outside-top-left','画像外・左上'],['outside-bottom-left','画像外・左下'],['outside-bottom-center','画像外・下中央'],['outside-bottom-right','画像外・右下']]]]) for(const [value,label] of options) $(id).add(new Option(label,value));

function notify(message, error = false) {
  clearTimeout(toastTimer); $('status').textContent = message; $('status').classList.toggle('error', error); $('status').hidden = false;
  toastTimer = setTimeout(() => { $('status').hidden = true; }, error ? 12000 : 6000);
}
function syncImageNavigation() {
  const index = items.indexOf(current);
  $('previewNavigator').hidden = previewMode==='all' || !current || items.length < 2;
  const counter = current ? `${index + 1} / ${items.length}` : '';
  if ($('previewImageCounter').textContent !== counter) $('previewImageCounter').textContent = counter;
  $('previousImage').disabled = busy || index <= 0;
  $('nextImage').disabled = busy || index < 0 || index >= items.length - 1;
  syncCropScope();
  syncBarScope();
  syncCalibrationScope();
  $('previewNavigator').title = current?.name ?? '';
}
for (const [id,offset] of [['previousImage',-1],['nextImage',1]]) $(id).addEventListener('click',()=>{
  if (busy || !current) return;
  const next = items[items.indexOf(current) + offset];
  if (next) action(()=>selectItem(next));
});
function setBusy(value) {
  if (value) cancelWheelZoom();
  busy = value; document.body.classList.toggle('busy', value);
  figureStudioDirectSender?.sync();
  $('projectInput').disabled=value;
  $('openProjectButton').disabled=value;
  $('newProjectButton').disabled=value;
  $('saveProjectButton').disabled=value||!items.length;
  $('projectSaveMenuButton').disabled=$('saveProjectAsButton').disabled=value||!items.length;
  if(value||!items.length)closeProjectSaveMenu();
  for(const id of ['settingsInput','openSettingsButton','settingsSaveMenuButton','saveSettingsButton','saveSessionButton'])$(id).disabled=value||!current;
  if(value||!current)closeSettingsSaveMenu();
  $('saveDpi').disabled=value||!current;
  syncStudioSizeControls();
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
  for(const input of document.querySelectorAll('[data-opacity-for]'))input.disabled=$(input.dataset.opacityFor).disabled;
  annotationUI?.sync();
  syncMapColorbar();
  syncImageNavigation();
  for(const id of ['singlePreviewButton','allPreviewButton'])$(id).disabled=value||!items.length;
  for(const id of ['zoomIn','zoomOut','zoomSelect','zoomToCrop','copyButton'])if(previewMode==='all')$(id).disabled=true;
  if(previewMode==='all')$('singleSaveButton').disabled=true;
  appUpdater?.sync();
  imageOverview?.update(previewMode==='all'&&!!current);
  imageTable?.sync();
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
  syncOpacityFields();
  syncStudioSizeControls(true);
  $('barAnchor').value = current.settings.scaleBar.anchor; $('labelAnchor').value = current.settings.panelLabel.anchor;
  const c = current.settings.crop;
  const imageCrop=current.imageCrop;
  $('selectSvgImageCrop').hidden=!imageCrop||imageCrop.x<c.x||imageCrop.y<c.y||imageCrop.x+imageCrop.width>c.x+c.width||imageCrop.y+imageCrop.height>c.y+c.height;
  updateCropInputs(pendingCrop || c);
  $('aspectRatio').value=current.settings.cropOptions.aspect;$('cropApplication').value=current.settings.cropOptions.application;$('customRatio').hidden=$('aspectRatio').value!=='custom';
  if(!pendingCrop)$('cropStatus').textContent=`適用中：元画像 x=${c.x}, y=${c.y} / ${c.width} × ${c.height} px`;
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

function syncStudioSizeControls(reset=false){
  const size=current?current.settings.output.studioSize??null:{axis:'height',mm:40};
  if(reset||!current){$('studioSizeEnabled').checked=!!size;$('studioSizeAxis').value=size?.axis??'height';$('studioSizeMm').value=size?.mm??40;}
  $('studioSizeEnabled').disabled=busy||!current;
  $('studioSizeAxis').disabled=$('studioSizeMm').disabled=busy||!current||!$('studioSizeEnabled').checked;
  $('studioSizeAll').disabled=busy||!current;
  $('studioSizeScope').textContent=current?($('studioSizeAll').checked?`設定対象：全${items.length}枚`:`設定対象：${current.name}`):'画像なし';
  $('studioSizeScope').title=current?($('studioSizeAll').checked?'サイズを変更すると全画像に適用します。':current.name):'';
}
function applyStudioSize(all=$('studioSizeAll').checked){
  if(busy||!current)return;
  try{
    let size=null;
    if($('studioSizeEnabled').checked){
      const axis=$('studioSizeAxis').value,mm=$('studioSizeMm').valueAsNumber;
      if(!['width','height'].includes(axis)||!$('studioSizeMm').checkValidity()||!Number.isFinite(mm)||mm<0.1||mm>1000)throw new Error('Studioに貼る画像本体のサイズは0.1〜1000 mmで入力してください。');
      size={axis,mm};
    }
    const updates=(all?items:[current]).map(item=>{const settings=copy(item.settings);settings.output.studioSize=copy(size);return {item,settings:validateSettings(settings,item.width,item.height)};});
    for(const update of updates)buildPlan(update.settings,context);
    settingsTransactions.apply(updates,{clearCropError:false,origin:current});
    syncInputs();render();
    if(all)notify(`全${items.length}枚にStudioへ貼るサイズ設定を適用しました。`);
  }catch(error){notify(error.message,true);syncStudioSizeControls(true);scheduleWorkState();}
}
for(const id of ['studioSizeEnabled','studioSizeAxis','studioSizeMm'])$(id).addEventListener('change',()=>applyStudioSize());
$('studioSizeMm').addEventListener('keydown',event=>{
 if(event.key!=='Enter')return;event.preventDefault();event.currentTarget.blur();
 if(!current||busy)return;
 const size=$('studioSizeEnabled').checked?{axis:$('studioSizeAxis').value,mm:$('studioSizeMm').valueAsNumber}:null;
 if(($('studioSizeAll').checked?items:[current]).some(item=>JSON.stringify(item.settings.output.studioSize??null)!==JSON.stringify(size)))applyStudioSize();
});
$('studioSizeAll').addEventListener('change',()=>{if($('studioSizeAll').checked)applyStudioSize(true);syncStudioSizeControls();scheduleWorkState();});

function syncOpacityFields(){
  for(const input of document.querySelectorAll('[data-opacity-for]'))input.value=Math.round(Number($(input.dataset.opacityFor).value)*100);
}
for(const input of document.querySelectorAll('[data-opacity-for]')){
  const slider=$(input.dataset.opacityFor);
  slider.addEventListener('input',()=>{input.value=Math.round(slider.valueAsNumber*100);});
  input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();input.blur();}});
  input.addEventListener('change',()=>{
    if(!current||busy||slider.disabled)return;
    try{
      if(!input.checkValidity()||!Number.isFinite(input.valueAsNumber))throw new Error('不透明度は0〜100%の整数で入力してください。');
      const [section,key]=slider.dataset.setting.split('.'),settings=copy(current.settings);
      settings[section][key]=input.valueAsNumber/100;commit(settings,section);
    }catch(error){notify(error.message,true);syncOpacityFields();}
  });
}

function commit(settings,shared=null) {
  if (!current) return;
  if(shared==='scaleBar'){applyScaleBar(settings);return;}
  if(shared==='mapRange'){
    const updates=prepareMapRange(items,current,settings.mapColorbar,$('mapRangeScope').value);
    for(const update of updates)buildPlan(update.settings,context);
    settingsTransactions.apply(updates,{clearCropError:false,origin:current});syncInputs();render();return;
  }
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
    if(section==='panelLabel'){const p=item.settings.panelLabel;item.settings.panelLabel={...copy(template.panelLabel),visible:p.visible,text:p.text,subtext:p.subtext,position:p.position};}
    else if(section==='output')item.settings.output={...copy(template.output),studioSize:copy(item.settings.output.studioSize??null)};
    item.history.push(item.settings);
  }
  scheduleWorkState();
}
function syncBarScope(){
  const individual=$('barScope').value==='individual';
  $('barScopeInfo').textContent=individual?'表示中の画像だけを変更します。位置のドラッグ変更もこの画像だけに適用します。':'変更したバー設定は全画像に適用します。校正値と表示・非表示は画像ごとに保持します。';
  $('applyBarToAllButton').hidden=individual;
  $('applyBarToAllButton').disabled=busy||!current?.settings.calibration||items.length<2;
}
function applyScaleBar(settings){
  const updates=prepareScaleBar(items,current,settings,$('barScope').value);
  for(const update of updates)buildPlan(update.settings,context);
  settingsTransactions.apply(updates,{clearCropError:false,origin:current});
  syncInputs();render();
}
$('barScope').addEventListener('change',syncBarScope);
$('applyBarToAllButton').addEventListener('click',()=>{
  if(busy||!current)return;
  try{applyScaleBar(current.settings);notify(`${items.length}枚にバー設定を適用しました。`);}catch(error){notify(error.message,true);}
});
function syncCalibrationScope(){
  const individual=$('calibrationScope').value==='individual',target=individual?'この画像':`全${items.length}枚`;
  $('calibrationScopeInfo').textContent=individual?'表示中の画像だけを校正します。画像を切り替えて、それぞれの値を設定できます。':'同じ撮影スケールの全画像に校正値を適用します。バーの長さ・色・配置は画像ごとに保持します。';
  $('calibrateButton').textContent=`${target}を測定から校正`;
  $('directCalibrationButton').textContent=`${target}に数値を適用`;
  $('resetCalibrationButton').textContent=`${target}の校正をリセット`;
  $('applyCalibrationToAllButton').hidden=individual;
  $('applyCalibrationToAllButton').disabled=busy||!current?.settings.calibration||items.length<2;
}
function applyCalibration(calibration){
  const updates=prepareCalibration(items,current,calibration,$('calibrationScope').value);
  for(const update of updates)buildPlan(update.settings,context);
  settingsTransactions.apply(updates,{clearCropError:false,origin:current});
  measurement=measurementStart=null;$('measurementInfo').textContent='2点をクリック、またはドラッグ';syncInputs();setTool('move');
  notify(`${updates.length}枚の校正を${calibration?'設定':'リセット'}しました。`);
}
$('calibrationScope').addEventListener('change',syncCalibrationScope);
$('applyCalibrationToAllButton').addEventListener('click',()=>{
  if(busy||!current?.settings.calibration)return;
  try{applyCalibration(current.settings.calibration);}catch(error){notify(error.message,true);}
});

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
  imageOverview?.update(previewMode==='all'&&!!current);
  imageTable?.sync();
  scheduleWorkState();
}

async function selectItem(item) {
  const decoded = await decodeImage(item.file,item);
  activateItem(item,decoded);
  if(item.cropError)notify(`${item.name}：${item.cropError} トリミング範囲を変更するか、全体に戻してください。`,true);
}
function activateItem(item,decoded) {
  if (source) releaseImage(source);
  source = decoded.source; current = item; measurement = measurementStart = pendingCrop = drag = null;
  item.imageCrop=decoded.imageCrop??null;
  pendingCrop=item.settings.cropOptions.pending?copy(item.settings.cropOptions.pending):null;
  $('measurementInfo').textContent = '2点をクリック、またはドラッグ';
  setTool(pendingCrop?'crop':'move'); syncInputs(); renderList(); render();
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
      const imageId=crypto.randomUUID();
      const item = { id:imageId,figureStudioImageId:imageId, name: file.name, file, sourceDirectory:sourceFolders.get(file)||null, sourceHandle:sourceHandles.get(file)||null, width: decoded.width, height: decoded.height, thumbnail: await thumbnail(decoded.source), settings, history: new History(settings), enabled: true,barVisible:true,labelVisible:true,labelText:'',subtext:'' };
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

async function editImageTable(item,path,value){
  if(busy||!items.includes(item))return;
  if(path==='enabled'){item.enabled=value;renderList();render();return;}
  const settings=prepareImageTableEdit(item,path,value);buildPlan(settings,context);
  await action(async()=>{
    const mode=previewMode;
    if(item!==current)await selectItem(item);
    settingsTransactions.apply([{item,settings}],{clearCropError:path.startsWith('crop.'),origin:item});
    item.barVisible=item.settings.scaleBar.visible;item.labelVisible=item.settings.panelLabel.visible;item.labelText=item.settings.panelLabel.text;item.subtext=item.settings.panelLabel.subtext;
    measurement=measurementStart=drag=cropStart=null;pendingCrop=item.settings.cropOptions.pending??null;
    previewMode=mode;syncInputs();renderList();render();
  });
}

function setPreviewMode(mode){
  if(busy||!current)return;
  cancelWheelZoom();annotationUI?.cancelDrawing();drag=null;measurementStart=cropStart=null;
  previewMode=mode;setBusy(busy);render();
}
$('singlePreviewButton').addEventListener('click',()=>setPreviewMode('single'));
$('allPreviewButton').addEventListener('click',()=>setPreviewMode('all'));

function render() {
  scheduleWorkState();imageTable?.sync();
  const overview=previewMode==='all'&&!!current;
  $('emptyState').hidden = !!current; $('canvasFrame').hidden = !current||overview;
  $('previewArea').classList.toggle('overview-mode',overview);
  $('previewNavigator').hidden=overview||!current||items.length<2;
  for(const [id,mode] of [['singlePreviewButton','single'],['allPreviewButton','all']]){$(id).classList.toggle('active',previewMode===mode);$(id).setAttribute('aria-pressed',String(previewMode===mode));}
  imageOverview?.update(overview);
  if(overview){plan=null;$('imageName').textContent=`全画像（${items.length}枚）`;$('imageDimensions').textContent='画像をクリックして個別表示・編集';$('outputInfo').textContent='';$('viewInfo').textContent='各画像の処理後プレビュー';$('instruction').hidden=true;return;}
  if(current){$('imageName').textContent=current.name;$('imageDimensions').textContent=`元画像 ${current.width.toLocaleString()} × ${current.height.toLocaleString()} px`;}

  if (!current || !source) { plan = null; canvas.width = canvas.height = 1; return; }
  const settings = current.settings, raw = tool === 'crop'||previewRaw;
  try {
    const rawCrop=previewRaw&&tool!=='crop'?{x:0,y:0,width:current.width,height:current.height}:settings.crop;
    plan = raw ? { width:rawCrop.width,height:rawCrop.height,imageHeight:rawCrop.height,top:0,bottom:0,crop:rawCrop,annotations:[],warnings:[],fills:[] } : buildPlan(settings, context);
    const area = $('previewArea'), zoom = $('zoomSelect').value;
    if (!area.clientWidth) return;
    const displayScale = zoom === 'fit' ? Math.min((area.clientWidth - 58) / plan.width, (area.clientHeight - 58) / plan.height, 1) : Number(zoom);
    const cssWidth = Math.max(1, plan.width * Math.max(0.01, displayScale)), cssHeight = Math.max(1, plan.height * Math.max(0.01, displayScale));
    previewScale = cssWidth / plan.width;
    $('canvasFrame').style.width = `${cssWidth}px`; $('canvasFrame').style.height = `${cssHeight}px`;
    paintPreview();
    const finalPlan = buildPlan(settings,context,false,settings.output.scale);
    const metrics = rasterMetrics(finalPlan, settings.output);
    $('outputInfo').textContent = `PNG ${metrics.width} × ${metrics.height} px · ${metrics.widthCm.toFixed(2)} × ${metrics.heightCm.toFixed(2)} cm · ${metrics.dpi} dpi`;
    $('viewInfo').textContent = `${tool==='crop'?'現在の画像（トリミング選択）':previewRaw?'元画像':'処理後画像'} · 表示 ${zoomText(displayScale)}`;
    const barBox = finalPlan.annotations.find(box=>box.kind==='scaleBar');
    $('barThicknessInfo').textContent = barBox ? `太さ ${barBox.thickness / settings.output.scale} px（画像座標）` : '';
    const warnings = finalPlan.warnings;
    $('instruction').classList.toggle('warning', warnings.length > 0 && tool === 'move');
    $('instruction').title = tool === 'measure' ? '2点をクリック、またはドラッグ。通常は水平、Shiftを押すと自由な角度です。' : tool === 'crop' ? '2点をクリック、またはドラッグして選択。画像端はすぐ外側の余白からも指定できます。四隅・辺でサイズ、中央で位置を調整します。' : warnings[0] || '注釈をドラッグして配置できます。画像外でも領域内で移動できます。';
    $('instruction').textContent = tool === 'crop' ? `範囲を選び、左の「${$('applyCropButton').textContent}」を押してください。` : tool === 'move' ? warnings[0] || '' : '';
    $('instruction').hidden = !$('instruction').textContent;
    $('previewArea').title = $('instruction').title;
  } catch (error) { $('instruction').hidden=false; $('instruction').textContent = error.message; $('instruction').classList.add('warning'); }
}

function paintPreview() {
  if (!current || !source || !plan || $('canvasFrame').hidden) return;
  const frame = $('canvasFrame').getBoundingClientRect(), area = $('previewArea'), bounds = area.getBoundingClientRect();
  const tile = previewTile(frame, {left:bounds.left+area.clientLeft,top:bounds.top+area.clientTop,width:area.clientWidth,height:area.clientHeight}, devicePixelRatio);
  canvas.style.left = `${tile.left}px`; canvas.style.top = `${tile.top}px`;
  canvas.style.width = `${tile.width}px`; canvas.style.height = `${tile.height}px`;
  canvas.width = tile.pixelWidth; canvas.height = tile.pixelHeight;
  context.setTransform(canvas.width/tile.width,0,0,canvas.height/tile.height,0,0);
  context.translate(-tile.left,-tile.top); context.scale(previewScale,previewScale);
  const settings = tool==='crop' && previewScale>=4 ? {...current.settings,output:{...current.settings.output,resampling:'nearest'}} : current.settings;
  paint(context,source,plan,settings,{annotations:tool!=='crop'&&!previewRaw});
  drawGuides(); context.setTransform(1,0,0,1,0,0);
}
function schedulePreview() {
  if (!previewFrame) previewFrame=requestAnimationFrame(()=>{previewFrame=0;paintPreview();});
}
$('previewArea').addEventListener('scroll',schedulePreview,{passive:true});

function sourcePoint(event) {
  const p=viewToImage({ x: event.clientX, y: event.clientY }, $('canvasFrame').getBoundingClientRect(), plan.width, plan.height, plan.crop, plan.top);
  return {...p,x:p.x-(plan.left??0)};
}
function canvasPoint(event) {
  const p = sourcePoint(event);
  return { x: p.x - current.settings.crop.x+(plan.left??0), y: p.y - current.settings.crop.y + plan.top };
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
  context.save(); context.lineWidth = 1.5 / previewScale; context.font = `${12 / previewScale}px sans-serif`;
  if (measurement && tool !== 'crop') {
    const c = current.settings.crop, a = { x: measurement[0].x - c.x+(plan.left??0), y: measurement[0].y - c.y + plan.top }, b = { x: measurement[1].x - c.x+(plan.left??0), y: measurement[1].y - c.y + plan.top };
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
  if(tool==='crop' && hoverPixel && previewScale>=4) {
    const x=hoverPixel.x-plan.crop.x,y=hoverPixel.y-plan.crop.y;
    context.strokeStyle='#ffde59';context.lineWidth=1/previewScale;
    context.strokeRect(x,y,1,1);
  }
  context.restore();annotationUI?.guides(context);
}
function setTool(value) {
  previewMode='single';
  annotationUI?.cancelDrawing();
  tool = value; measurementStart = cropStart = drag = null;
  hoverPixel=null;$('pointerCoordinates').textContent='';
  previewRaw=false;$('rawPreviewButton').classList.remove('active');$('processedPreviewButton').classList.add('active');
  for (const mode of ['move', 'measure', 'crop']) { $(`${mode}Tool`).classList.toggle('active', mode === value); $(`${mode}Tool`).setAttribute('aria-pressed', String(mode === value)); }
  canvas.style.cursor = value === 'move' ? 'default' : 'crosshair'; setBusy(busy);render();
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
  syncCropScope();
}
function syncCropScope() {
  const individual=$('cropScope').value==='individual';
  $('applyCropButton').textContent=individual?'この画像にトリミングを適用':items.length>1?`全${items.length}枚にトリミングを適用`:'トリミングを適用';
  $('resetCropButton').textContent=individual?'この画像を全体に戻す':'全画像を全体に戻す';
  const conflicts=current&&!individual?cropConflicts(items,pendingCrop||current.settings.crop):[];
  $('cropScopeInfo').textContent=individual?'表示中の画像だけを変更します。他の画像の範囲は保持します。':conflicts.length?`範囲外：${conflicts.map(item=>`${item.name}（${item.width} × ${item.height} px）`).join('、')}。範囲を変更するか個別設定を選んでください。`:'全画像に同じ位置・サイズ（px）を適用します。画像ごとに変える場合は個別設定を選んでください。';
  $('cropScopeInfo').classList.toggle('error',!!conflicts.length);
}
$('cropScope').addEventListener('change',()=>{syncCropScope();render();});
function cropHit(p) {
  if(!pendingCrop)return null;
  const c=pendingCrop,tolerance=8/previewScale,left=Math.abs(p.x-c.x)<tolerance,right=Math.abs(p.x-(c.x+c.width))<tolerance,top=Math.abs(p.y-c.y)<tolerance,bottom=Math.abs(p.y-(c.y+c.height))<tolerance;
  if(p.x<c.x-tolerance||p.x>c.x+c.width+tolerance||p.y<c.y-tolerance||p.y>c.y+c.height+tolerance)return null;
  if(top&&left)return 'top-left';if(top&&right)return 'top-right';if(bottom&&left)return 'bottom-left';if(bottom&&right)return 'bottom-right';
  if(!aspect()){if(top)return 'top';if(bottom)return 'bottom';if(left)return 'left';if(right)return 'right';}
  return p.x>=c.x&&p.x<=c.x+c.width&&p.y>=c.y&&p.y<=c.y+c.height?'move':null;
}
function constrainedPoint(point,start,event){return event.shiftKey?point:{x:point.x,y:start.y};}
function distanceToLine(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy,t=length?clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/length,0,1):0;return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
function moveMeasurement(operation,p){const c=current.settings.crop,[a,b]=operation.beforeMeasurement,dx=clamp(p.x-operation.down.x,c.x-Math.min(a.x,b.x),c.x+c.width-Math.max(a.x,b.x)),dy=clamp(p.y-operation.down.y,c.y-Math.min(a.y,b.y),c.y+c.height-Math.max(a.y,b.y));return [{x:a.x+dx,y:a.y+dy},{x:b.x+dx,y:b.y+dy}];}

$('previewArea').addEventListener('pointerdown', event => {
  if (!current || busy || !plan || ![0,1].includes(event.button) || event.pointerType === 'touch') return;
  if(event.target!==canvas && (tool!=='crop' || previewRaw || !cropPointer(sourcePoint(event),current.settings.crop,previewScale))) return;
  event.preventDefault();canvas.focus({preventScroll:true});
  if(previewRaw || spacePan || event.button===1) {
    canvas.setPointerCapture(event.pointerId);
    drag={mode:'pan',x:event.clientX,y:event.clientY,left:$('previewArea').scrollLeft,top:$('previewArea').scrollTop};
    return;
  }
  const p = tool==='crop' ? cropPointer(sourcePoint(event),current.settings.crop,previewScale) : sourcePoint(event);
  if(!p)return;
  if (tool !== 'move' && !insideImage(p)) return;
  canvas.setPointerCapture(event.pointerId);
  if (tool === 'measure') {
    const tolerance=8/previewScale;
    let hit=measurement&&!measurementStart?measurement.findIndex(q=>Math.hypot(p.x-q.x,p.y-q.y)<tolerance):-1;
    if(hit<0&&measurement&&!measurementStart&&distanceToLine(p,...measurement)<tolerance)hit=2;
    const start = measurementStart || p;
    drag = { mode: 'measure', start, down: p, downView:{x:event.clientX,y:event.clientY}, secondClick: !!measurementStart, moved: false,handle:hit,beforeMeasurement:measurement?copy(measurement):null };
    if(hit<0) measurement=[start,constrainedPoint(p,start,event)];render();
  } else if (tool === 'crop' || pendingCrop && cropHit(p)) {
    try { const edit=cropStart?null:cropHit(p);drag={mode:'crop',start:cropStart||p,down:p,downView:{x:event.clientX,y:event.clientY},ratio:aspect(),edit,origin:pendingCrop?copy(pendingCrop):null,moved:false,secondClick:!!cropStart}; } catch (error) { notify(error.message, true); }
  } else {
    const q = canvasPoint(event), hit = [...plan.annotations].reverse().find(box => q.x >= box.x && q.x <= box.x + box.width && q.y >= box.y && q.y <= box.y + box.height);
    if (hit) { drag = { mode: 'move', kind: hit.kind, offset: { x: q.x - hit.x, y: q.y - hit.y }, before: copy(current.settings) }; canvas.style.cursor = 'grabbing'; }
    else drag={mode:'pan',x:event.clientX,y:event.clientY,left:$('previewArea').scrollLeft,top:$('previewArea').scrollTop};
  }
});
$('previewArea').addEventListener('pointermove', event => {
  if (!current || !plan || busy) return;
  if(tool==='crop') {
    const p=cropPointer(sourcePoint(event),current.settings.crop,previewScale),c=current.settings.crop;
    hoverPixel=p?{x:Math.min(c.x+c.width-1,Math.floor(p.x)),y:Math.min(c.y+c.height-1,Math.floor(p.y))}:null;
    $('pointerCoordinates').textContent=hoverPixel?`元画像 x=${hoverPixel.x}, y=${hoverPixel.y}`:'';
    if(!drag)schedulePreview();
  }
  if(!drag)return;
  const p = boundedPoint(sourcePoint(event));
  if(drag.mode==='pan'){$('previewArea').scrollLeft=drag.left+drag.x-event.clientX;$('previewArea').scrollTop=drag.top+drag.y-event.clientY;return;}
  if (drag.mode === 'measure') {if(drag.handle===2)measurement=moveMeasurement(drag,p);else if(drag.handle>=0) measurement[drag.handle]=constrainedPoint(p,measurement[1-drag.handle],event);else measurement[1]=constrainedPoint(p,drag.start,event); drag.moved ||= Math.hypot(event.clientX-drag.downView.x,event.clientY-drag.downView.y)>3; updateMeasurement(); }
  else if (drag.mode === 'crop') {
    const c=current.settings.crop;
    if(drag.edit){const r=editCrop({...drag.origin,x:drag.origin.x-c.x,y:drag.origin.y-c.y},drag.edit,{x:drag.down.x-c.x,y:drag.down.y-c.y},{x:p.x-c.x,y:p.y-c.y},c.width,c.height,drag.ratio);pendingCrop={...r,x:r.x+c.x,y:r.y+c.y};}else pendingCrop=cropFromDrag(drag.start,p,drag.ratio);
    drag.moved ||= Math.hypot(event.clientX-drag.downView.x,event.clientY-drag.downView.y)>3;updateCropInputs(pendingCrop);
  } else {
    const q = canvasPoint(event), box = plan.annotations.find(annotation => annotation.kind === drag.kind), c = current.settings.crop;
    current.settings[drag.kind].position = { x: clamp(q.x - drag.offset.x-(plan.left??0), 0, Math.max(0,c.width - box.width)), y: clamp(q.y - drag.offset.y, box.area.y, Math.max(box.area.y,box.area.y+box.area.height-box.height))-(box.band==='top'?(plan.offsetY??0):plan.top) };
  }
  render();
});
const cropFromDrag = (start,end,ratio) => {
  const c=current.settings.crop,r=cropFromPoints({x:start.x-c.x,y:start.y-c.y},{x:end.x-c.x,y:end.y-c.y},c.width,c.height,ratio);
  return {...r,x:r.x+c.x,y:r.y+c.y};
};
$('previewArea').addEventListener('pointerup', event => {
  if (!drag) return;
  const operation = drag;
  if (operation.mode === 'measure') {
    const p=boundedPoint(sourcePoint(event));
    if(operation.handle===2)measurement=moveMeasurement(operation,p);else if(operation.handle>=0) measurement[operation.handle]=constrainedPoint(p,measurement[1-operation.handle],event);else measurement[1]=constrainedPoint(p,operation.start,event);
    if (operation.moved || operation.secondClick||operation.handle>=0) measurementStart = null;
    else measurementStart = operation.start;
    updateMeasurement();
  } else if(operation.mode==='crop') {
    if(operation.edit) {
      const c=current.settings.crop,p=boundedPoint(sourcePoint(event));
      const r=editCrop({...operation.origin,x:operation.origin.x-c.x,y:operation.origin.y-c.y},operation.edit,{x:operation.down.x-c.x,y:operation.down.y-c.y},{x:p.x-c.x,y:p.y-c.y},c.width,c.height,operation.ratio);
      pendingCrop={...r,x:r.x+c.x,y:r.y+c.y};
    } else {
      pendingCrop=cropFromDrag(operation.start,boundedPoint(sourcePoint(event)),operation.ratio);
      cropStart=operation.moved||operation.secondClick?null:operation.start;
    }
    if(pendingCrop) {updateCropInputs(pendingCrop);current.settings.cropOptions.pending=copy(pendingCrop);current.history.push(current.settings);}
  } else if (operation.mode === 'move') {
    if(operation.kind==='scaleBar'){
      const settings=copy(current.settings);current.settings=operation.before;
      try{applyScaleBar(settings);}catch(error){notify(error.message,true);}
    }else current.history.push(current.settings);
    syncInputs();
  }
  drag = null; canvas.style.cursor = spacePan ? 'grab' : tool === 'move' ? 'default' : 'crosshair';
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); render();
});
$('previewArea').addEventListener('pointercancel', event => {
  if (drag?.before) current.settings = drag.before;
  drag=null; measurementStart=null; if (current) { syncInputs(); render(); }
});
$('previewArea').addEventListener('pointerleave',()=>{hoverPixel=null;$('pointerCoordinates').textContent='';if(!drag)schedulePreview();});
canvas.addEventListener('contextmenu',event=>{if(tool==='crop'){event.preventDefault();pendingCrop=cropStart=drag=null;current.settings.cropOptions.pending=null;current.history.push(current.settings);syncInputs();render();}});
function queuePreviewZoom(zoom, anchor) {
  const select = $('zoomSelect'), area = $('previewArea');
  if (![...select.options].some(option=>!option.dataset.customZoom && option.value===String(zoom))) {
    let option = select.querySelector('[data-custom-zoom]');
    if (!option) { option = document.createElement('option'); option.dataset.customZoom = 'true'; select.add(option); }
    option.value = String(zoom); option.textContent = zoomText(zoom);
  }
  select.value = String(zoom);
  wheelZoomAnchor = anchor;
  if (!wheelZoomFrame) wheelZoomFrame = requestAnimationFrame(()=>{
    wheelZoomFrame = 0;
    const anchor = wheelZoomAnchor; wheelZoomAnchor = null;
    if (!plan || !current || !anchor) return;
    render();
    const after = $('canvasFrame').getBoundingClientRect();
    area.scrollLeft += after.left + after.width * anchor.u - anchor.x;
    area.scrollTop += after.top + after.height * anchor.v - anchor.y;
  });
}
$('previewShell').addEventListener('wheel',event=>{
  if (!event.ctrlKey) return;
  event.preventDefault();
  if (!plan || busy) return;
  const bounds=$('canvasFrame').getBoundingClientRect(), select=$('zoomSelect'), area=$('previewArea');
  const scale=select.value==='fit'?bounds.width/plan.width:Number(select.value), zoom=wheelZoom(scale,event.deltaY,event.deltaMode,area.clientHeight);
  // In the surrounding gutter, anchor to the nearest image edge instead of
  // extrapolating a point outside the image and moving it out of the viewport.
  const x=clamp(event.clientX,bounds.left,bounds.right),y=clamp(event.clientY,bounds.top,bounds.bottom);
  if (zoom!==scale) queuePreviewZoom(zoom,{x,y,u:(x-bounds.left)/bounds.width,v:(y-bounds.top)/bounds.height});
},{passive:false});
for (const [id,factor] of [['zoomIn',1.15],['zoomOut',1/1.15]]) $(id).addEventListener('click',()=>{
  if (!plan || !current || busy) return;
  const bounds=$('canvasFrame').getBoundingClientRect(), area=$('previewArea'), viewport=area.getBoundingClientRect(), select=$('zoomSelect');
  const scale=select.value==='fit'?bounds.width/plan.width:Number(select.value), x=viewport.left+area.clientWidth/2,y=viewport.top+area.clientHeight/2;
  queuePreviewZoom(clamp(scale*factor,MIN_ZOOM,MAX_ZOOM),{x,y,u:(x-bounds.left)/bounds.width,v:(y-bounds.top)/bounds.height});
});
$('zoomToCrop').addEventListener('click',()=>{
  if(!current||!plan||busy)return;
  const c=pendingCrop||current.settings.crop, area=$('previewArea'), viewport=area.getBoundingClientRect();
  const zoom=clamp(Math.min((area.clientWidth-80)/c.width,(area.clientHeight-80)/c.height),MIN_ZOOM,MAX_ZOOM);
  queuePreviewZoom(zoom,{x:viewport.left+area.clientLeft+area.clientWidth/2,y:viewport.top+area.clientTop+area.clientHeight/2,u:(c.x-plan.crop.x+c.width/2+(plan.left??0))/plan.width,v:(c.y-plan.crop.y+c.height/2+plan.top)/plan.height});
});

for (const input of document.querySelectorAll('[data-setting]')) {
  input.addEventListener('change', () => {
  if (!current || busy) return;
  const [section, key] = input.dataset.setting.split('.'), settings = copy(current.settings);
    settings[section][key] = input.type === 'checkbox' ? input.checked : input.type === 'number' || input.type === 'range' || input.hasAttribute('data-number') ? (section==='scaleBar'&&key==='length'&&!input.value?null:Number(input.value)) : input.value;
  if (key === 'anchor') {
    settings[section].position = null;
  }
  try { if (!input.checkValidity()) throw new Error('入力値が範囲外です。'); commit(settings,section==='mapColorbar'&&['min','max'].includes(key)?'mapRange':['scaleBar','panelLabel','output'].includes(section)&&!['visible','text','subtext'].includes(key)?section:null); if(section==='cropOptions') updateAspectPreview(); } catch (error) { notify(error.message, true); syncInputs(); }
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
$('resetCalibrationButton').addEventListener('click',()=>{
  if(busy||!current)return;
  try{applyCalibration(null);}catch(error){notify(error.message,true);}
});
$('selectSvgImageCrop').addEventListener('click',()=>{
  if(!current?.imageCrop||busy)return;
  pendingCrop=copy(current.imageCrop);current.settings.cropOptions={...current.settings.cropOptions,aspect:'free',application:'selection',pending:copy(pendingCrop)};
  current.history.push(current.settings);setTool('crop');syncInputs();render();
});
$('calibrateButton').addEventListener('click', () => {
  try {
    if (!measurement || measurementStart) throw new Error('画像上の2点を測定してください。');
    applyCalibration(calibrationFromPoints(...measurement, $('knownLength').valueAsNumber, $('calibrationUnit').value));
  } catch (error) { notify(error.message, true); }
});
$('directCalibrationButton').addEventListener('click', () => {
  try {
    applyCalibration({pixelSize:positive($('pixelSize').valueAsNumber,'1 pxあたりの長さ'),unit:$('calibrationUnit').value});
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
    const updates=prepareCrop(items,current,next,$('cropScope').value);
    for(const update of updates)buildPlan(update.settings,context);
    settingsTransactions.apply(updates);pendingCrop=measurement=cropStart=null;syncInputs();setTool('move');
    notify(`${updates.length}枚にトリミングを適用しました（元画像 x=${next.x}, y=${next.y} / ${next.width} × ${next.height} px）。`);
  } catch (error) { notify(error.message, true); }
});
$('resetCropButton').addEventListener('click', () => {
  try {const updates=prepareCrop(items,current,null,$('cropScope').value,true);for(const update of updates)buildPlan(update.settings,context);settingsTransactions.apply(updates);pendingCrop=measurement=cropStart=null;syncInputs();setTool('move');notify(`${updates.length}枚を元画像全体に戻しました。`);} catch (error) { notify(error.message, true); }
});
function undo(redo = false) {
  if (!current || busy) return;
  if(!settingsTransactions.step(current,redo,items)) {
    const before=current.settings;current.settings=redo?current.history.redo():current.history.undo();
    for(const section of ['panelLabel','output']){
      const old=copy(before[section]),next=copy(current.settings[section]);
      if(section==='panelLabel')for(const key of ['visible','text','subtext','position']){delete old[key];delete next[key];}
      if(section==='output'){delete old.studioSize;delete next.studioSize;}
      if(JSON.stringify(old)!==JSON.stringify(next))shareSettings(section);
    }
  }
  current.barVisible=current.settings.scaleBar.visible;current.labelVisible=current.settings.panelLabel.visible;current.labelText=current.settings.panelLabel.text;current.subtext=current.settings.panelLabel.subtext;
  measurement=measurementStart=drag=cropStart=null;pendingCrop=current.settings.cropOptions.pending??null;syncInputs();render();
}
$('undoButton').addEventListener('click', () => undo()); $('redoButton').addEventListener('click', () => undo(true));
$('zoomSelect').addEventListener('change',()=>{
  cancelWheelZoom();
  if(!current || !plan || $('zoomSelect').value==='fit'){render();return;}
  const bounds=$('canvasFrame').getBoundingClientRect(),area=$('previewArea'),viewport=area.getBoundingClientRect();
  const x=viewport.left+area.clientLeft+area.clientWidth/2,y=viewport.top+area.clientTop+area.clientHeight/2;
  queuePreviewZoom(Number($('zoomSelect').value),{x,y,u:(x-bounds.left)/bounds.width,v:(y-bounds.top)/bounds.height});
});
for(const [id,raw] of [['rawPreviewButton',true],['processedPreviewButton',false]]) $(id).addEventListener('click',()=>{setTool('move');previewRaw=raw;$('rawPreviewButton').classList.toggle('active',raw);$('processedPreviewButton').classList.toggle('active',!raw);render();});
let resizeFrame; new ResizeObserver(() => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(render); }).observe($('previewArea'));
document.addEventListener('keydown', event => {
  if(document.querySelector('dialog[open]'))return;
  const editing = event.target.matches('input, textarea, select');
  if(!editing && current && !busy && event.code==='Space' && (event.target===canvas || event.target===document.body)) {event.preventDefault();spacePan=true;canvas.style.cursor='grab';return;}
  if(!editing && current && !busy && tool==='crop' && pendingCrop && !drag && !event.ctrlKey && !event.metaKey && !event.altKey && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
    event.preventDefault();const step=event.shiftKey?10:1,base=current.settings.crop;
    const local={...pendingCrop,x:pendingCrop.x-base.x,y:pendingCrop.y-base.y};
    const next=editCrop(local,'move',{x:0,y:0},{x:event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,y:event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0},base.width,base.height);
    pendingCrop={...next,x:next.x+base.x,y:next.y+base.y};cropStart=null;
    current.settings.cropOptions.pending=copy(pendingCrop);current.history.push(current.settings);updateCropInputs(pendingCrop);render();return;
  }
  if (event.key === 'Escape' && current && !busy) { if (drag?.before) current.settings = drag.before; drag = pendingCrop = cropStart = measurementStart = measurement = null; current.settings.cropOptions.pending=null;current.history.push(current.settings);setTool('move'); syncInputs(); }
  if (!editing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(event.shiftKey); }
  if((event.ctrlKey||event.metaKey)&&!editing) {
    const key=event.key.toLowerCase();
    if(key==='s'){event.preventDefault();$(event.shiftKey?'settingsSaveMenuButton':'saveProjectButton').click();}
    if(key==='o'){event.preventDefault();$(event.altKey?'imageInput':event.shiftKey?'openSettingsButton':'openProjectButton').click();}
    if(key==='n'){event.preventDefault();$('newProjectButton').click();}
    if(key==='c'&&event.shiftKey){event.preventDefault();$('copyButton').click();}
  }
});
document.addEventListener('keyup',event=>{if(event.code==='Space'){spacePan=false;canvas.style.cursor=tool==='move'?'default':'crosshair';}});
window.addEventListener('blur',()=>{spacePan=false;});
for (const eventName of ['dragenter', 'dragover']) $('previewArea').addEventListener(eventName, event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } });
$('previewArea').addEventListener('drop',event=>{
  event.preventDefault();event.stopPropagation();if(!busy)action(()=>openDroppedFiles([...event.dataTransfer.files]));
});
async function openDroppedFiles(files){
  if(files.length===1&&/\.mifito$/i.test(files[0].name))return openProject(files[0]);
  if(files.length===1&&/\.json$/i.test(files[0].name)){
    if(!current)throw new Error('設定を開く前に画像を開いてください。');
    return openSettingsFile(files[0]);
  }
  const added=await addFiles(files);
  if(added.length){$('saveDestination').value=folderSupported?'source':'download';refreshSaveUI();}
}
window.addEventListener('dragover',event=>event.preventDefault());
window.addEventListener('drop',event=>{
  event.preventDefault();if(!busy)action(()=>openDroppedFiles([...event.dataTransfer.files]));
});
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
  if(!items.length){projectHandle=null;projectName='';}
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
function newProject(){
  if(busy||projectSaving)return;
  cancelWheelZoom();cancelAnimationFrame(previewFrame);previewFrame=0;
  annotationUI?.reset();
  for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
  if(source)releaseImage(source);
  for(const item of items)URL.revokeObjectURL(item.thumbnail);
  items.length=0;source=current=plan=null;previewMode='single';
  projectHandle=null;projectName='';saveDirectory=null;saveBatch=false;
  figureStudioProjectId=crypto.randomUUID();figurePreviewCache.clear();figurePreviewProjectId='';
  measurement=measurementStart=pendingCrop=drag=cropStart=null;hoverPixel=null;spacePan=false;previewScale=1;
  colorTarget=null;recentColors.length=0;clearDownloads();
  for(const input of document.querySelectorAll('input,select,textarea')){
    if(input.tagName==='SELECT')input.selectedIndex=Math.max(0,[...input.options].findIndex(option=>option.defaultSelected));
    else if(input.type==='checkbox'||input.type==='radio')input.checked=input.defaultChecked;
    else input.value=input.type==='file'?'':input.defaultValue;
  }
  $('saveDestination').value=folderSupported?'source':'download';
  imageTable?.setCollapsed(false);$('zoomSelect').value='fit';setTool('move');
  $('previewArea').scrollLeft=$('previewArea').scrollTop=0;
  $('measurementInfo').textContent='2点をクリック、またはドラッグ';
  $('cropStatus').textContent='選択範囲なし';$('cropBadge').textContent='全体';
  $('customRatio').hidden=true;$('selectSvgImageCrop').hidden=true;$('barThicknessInfo').textContent='';
  $('calibrationBadge').textContent='未設定';$('calibrationInfo').textContent='スケールバーには校正が必要です';
  $('imageName').textContent='画像なし';$('imageDimensions').textContent=$('outputInfo').textContent='—';
  $('viewInfo').textContent='プレビュー';
  $('pointerCoordinates').textContent='';$('batchProgress').textContent='';
  $('instruction').textContent='';$('instruction').hidden=true;$('instruction').classList.remove('warning');
  $('previewArea').removeAttribute('title');
  renderList();updateLabelFormat();syncOpacityFields();setBusy(false);render();
  workSaveState.markSaved(workspaceSnapshot(items,projectUI()));refreshWorkState();
  notify('新規プロジェクトを作成しました。画像を開いて始めてください。');
}
$('newProjectButton').addEventListener('click',()=>{
  if(busy||projectSaving)return;
  if(hasUnsavedWork())showDialog($('newProjectDialog'));else newProject();
});
for(const id of ['closeNewProjectDialog','cancelNewProjectButton'])$(id).addEventListener('click',()=>$('newProjectDialog').close());
$('discardProjectButton').addEventListener('click',newProject);
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
function closeProjectSaveMenu(){ $('projectSaveMenu').hidden=true;$('projectSaveMenuButton').setAttribute('aria-expanded','false'); }
$('projectSaveMenuButton').addEventListener('click',()=>{if(busy||!items.length)return;const open=$('projectSaveMenu').hidden;$('projectSaveMenu').hidden=!open;$('projectSaveMenuButton').setAttribute('aria-expanded',String(open));});
document.addEventListener('click',event=>{if(!$('projectSaveDropdown').contains(event.target))closeProjectSaveMenu();});
$('projectSaveDropdown').addEventListener('focusout',event=>{if(!$('projectSaveDropdown').contains(event.relatedTarget))closeProjectSaveMenu();});
$('projectSaveDropdown').addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('projectSaveMenu').hidden){event.preventDefault();event.stopPropagation();closeProjectSaveMenu();$('projectSaveMenuButton').focus();}});
$('saveProjectButton').addEventListener('click',()=>saveProject(false));
$('saveProjectAsButton').addEventListener('click',()=>saveProject(true));
function saveProject(saveAs){return action(async()=>{
  closeProjectSaveMenu();
  const name=projectHandle?.name||projectName||`${current.name.replace(/\.[^.]+$/, '').replace(/[\\/\x00-\x1f<>:"|?*]/g,'_')}_project.mifito`;
  let target;
  try {target=await prepareProjectSave({handle:projectHandle,saveAs,name,startIn:projectHandle||saveDirectory||current.sourceDirectory||current.sourceHandle,fallback:async(blob,filename)=>{download(blob,filename);return filename;}});}
  catch(error){if(error.name==='AbortError'){notify('プロジェクトの保存をキャンセルしました。');return;}throw error;}
  const ui=projectUI(), savedSnapshot=workspaceSnapshot(items,ui);
  notify('元画像と編集設定をプロジェクトに保存しています…');
  projectSaving=true;scheduleWorkState();
  try {
    const blob=await createProject(items,items.indexOf(current),ui);
    await target.write(blob);
    const overwritten=target.handle===projectHandle&&!!projectHandle;
    projectHandle=target.handle;projectName=target.name;
    notify(target.handle?`${target.name} に${overwritten?'上書き':''}保存しました（元画像${items.length}枚と編集設定）。`:'プロジェクトをダウンロードしました。このブラウザではファイルへ直接上書きできません。');
    workSaveState.markSaved(savedSnapshot);
  }finally{projectSaving=false;scheduleWorkState();}
});}
// IndexedDB preserves one shared object graph, including histories, grouped undo
// records and file handles. Temporary updates never mark a project as saved.
async function captureUpdateSession(extra={}){
  const snapshot=structuredClone({ui:projectUI(),items:[...items],activeIndex:items.indexOf(current),transactions:settingsTransactions.snapshot(items),checkpoint:workSaveState.checkpoint,
    projectHandle,projectName,saveDirectory,pendingCrop,measurement,measurementStart,previewRaw,tool,previewMode,mapEstimate,recentColors:[...recentColors],
    annotation:{selected:[...annotationUI.selected],clipboard:annotationUI.clipboard,formState:annotationUI.formState},
    inputs:[...document.querySelectorAll('input[id],select[id],textarea[id]')].filter(input=>input.type!=='file').map(input=>({id:input.id,value:input.value,checked:!!input.checked})),
    details:[...document.querySelectorAll('details')].map((node,index)=>({id:node.id,index,open:node.open})),
    dialogs:[...document.querySelectorAll('dialog[open]')].filter(node=>node.id!=='updateDialog').map(node=>({id:node.id,left:node.style.left,top:node.style.top})),
    imageTableCollapsed:$('imageTableContent').hidden,
    view:{sidebar:$('settingsPanel').scrollTop,left:$('previewArea').scrollLeft,top:$('previewArea').scrollTop},...extra});
  // Make independent bytes, including when the originals came from an open file.
  const copiedFiles=new Map();
  const copyFile=async file=>{if(!copiedFiles.has(file))copiedFiles.set(file,new File([await file.arrayBuffer()],file.name,{type:file.type,lastModified:file.lastModified}));return copiedFiles.get(file);};
  for(const item of snapshot.items)item.file=await copyFile(item.file);
  if(snapshot.figureBridgeBaseline?.files)for(let index=0;index<snapshot.figureBridgeBaseline.files.length;index++)snapshot.figureBridgeBaseline.files[index]=await copyFile(snapshot.figureBridgeBaseline.files[index]);
  return snapshot;
}
async function restoreUpdateSession(saved){
  if(saved.items.length>LIMITS.files||saved.items.reduce((n,item)=>n+item.file.size,0)>LIMITS.batchBytes||
    (saved.items.length&&(!Number.isInteger(saved.activeIndex)||!saved.items[saved.activeIndex])))throw new Error('一時保存した画像一覧が不正です。');
  let activeDecoded=null;const restored=[];
  try{
    for(const [index,item] of saved.items.entries()){
      validateSettings(item.settings,item.width,item.height);buildPlan(item.settings,context);
      if(!item.history||!Array.isArray(item.history.entries)||!item.history.entries.length||!Number.isInteger(item.history.index)||!item.history.entries[item.history.index])throw new Error('編集履歴を復元できませんでした。');
      for(const entry of item.history.entries)validateSettings(entry,item.width,item.height);
      item.history=Object.assign(new History(item.settings),item.history);
      const decoded=await decodeImage(item.file,item);
      try{
        if(decoded.width!==item.width||decoded.height!==item.height)throw new Error('元画像のサイズが一致しません。');
        item.thumbnail=await thumbnail(decoded.source);restored.push(item);
        if(index===saved.activeIndex)activeDecoded=decoded;
      }finally{if(decoded!==activeDecoded)releaseImage(decoded.source);}
    }
    // Validate transaction structure before replacing the visible workspace.
    const restoredTransactions=new SettingsTransactions();restoredTransactions.restore(saved.transactions);
  }catch(error){for(const item of restored)URL.revokeObjectURL(item.thumbnail);if(activeDecoded)releaseImage(activeDecoded.source);throw error;}
  annotationUI.reset();for(const item of items)URL.revokeObjectURL(item.thumbnail);
  items.splice(0,items.length,...restored);settingsTransactions.restore(saved.transactions);
  figureStudioProjectId=saved.ui.figureStudioProjectId||crypto.randomUUID();figurePreviewCache.clear();figurePreviewProjectId='';
  for(const item of items)item.figureStudioImageId??=item.id;
  ({projectHandle,projectName,saveDirectory}=saved);
  let checkpoint=saved.checkpoint;
  if(!saved.ui.figureStudioProjectId&&typeof checkpoint==='string')try{const value=JSON.parse(checkpoint);value.ui={figureStudioProjectId,...value.ui};checkpoint=JSON.stringify(value);}catch{}
  workSaveState.restoreCheckpoint(checkpoint);
  const restoreInputs=()=>{for(const entry of saved.inputs){const input=$(entry.id);if(!input||input.type==='file')continue;
    if(input.id==='zoomSelect'&&![...input.options].some(option=>option.value===entry.value))input.add(new Option(zoomText(Number(entry.value)),entry.value));
    input.value=entry.value;if(input.type==='checkbox'||input.type==='radio')input.checked=entry.checked;
  }};
  for(const input of document.querySelectorAll('[data-export-format]'))input.checked=saved.ui.formats.includes(input.dataset.exportFormat);
  $('studioSizeAll').checked=saved.ui.studioSizeScope!=='individual';restoreInputs();previewRaw=saved.previewRaw;mapEstimate=saved.mapEstimate;recentColors.splice(0,recentColors.length,...saved.recentColors);
  if(items.length)activateItem(items[saved.activeIndex],activeDecoded);
  else{if(source)releaseImage(source);source=current=null;renderList();}
  pendingCrop=saved.pendingCrop;measurement=saved.measurement;measurementStart=saved.measurementStart;setTool(saved.tool);previewMode=saved.previewMode==='all'?'all':'single';
  annotationUI.itemId=current?.id;annotationUI.selected=new Set(saved.annotation.selected);annotationUI.clipboard=saved.annotation.clipboard;
  annotationUI.sync();render();
  for(const entry of saved.details){const node=entry.id?$(entry.id):document.querySelectorAll('details')[entry.index];if(node)node.open=entry.open;}
  for(const entry of saved.dialogs){const node=$(entry.id);if(node){showDialog(node);if(entry.left&&entry.top)Object.assign(node.style,{position:'fixed',inset:'auto',margin:'0',left:entry.left,top:entry.top});}}
  // Keep uncommitted input text as well as the committed image settings.
  return ()=>{
    restoreInputs();annotationUI.formState=saved.annotation.formState;
    imageTable?.setCollapsed(saved.imageTableCollapsed===true);
    syncColorFields();syncMapColorbar();$('settingsPanel').scrollTop=saved.view.sidebar;
    $('previewArea').scrollLeft=saved.view.left;$('previewArea').scrollTop=saved.view.top;scheduleWorkState();
  };
}
async function downloadUpdateBackup(saved){
  if(!saved.items.length)return;
  const blob=await createProject(saved.items,saved.activeIndex,saved.ui);download(blob,saved.projectName||'mifito_recovered.mifito');
}

async function prepareDocumentSaver(name, description, extension) {
  return documentSaver({name,id:'mifito-images',description,accept:{'application/octet-stream':[extension]},startIn:saveDirectory||current?.sourceDirectory||current?.sourceHandle||projectHandle,fallback:()=>async(blob,filename)=>{download(blob,filename);return filename;}});
}
$('projectInput').addEventListener('click',event=>{
  if(typeof window.showOpenFilePicker!=='function')return;
  event.preventDefault();action(async()=>{
    let handle;
    try{[handle]=await window.showOpenFilePicker({...filePickerOptions('mifito-images','MiFiToプロジェクト',{'application/octet-stream':['.mifito']},saveDirectory||current?.sourceDirectory||current?.sourceHandle||projectHandle),multiple:false});}
    catch(error){if(error.name==='AbortError')return;throw error;}
    const file=await handle.getFile();sourceHandles.set(file,handle);await openProject(file);
  });
});
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
      const decoded=await decodeImage(original,record);
      try{
        if(decoded.width!==record.width||decoded.height!==record.height)throw new Error(`${record.name} の画像サイズが設定と一致しません。`);
        buildPlan(record.settings,context);
        const item={id:record.figureStudioImageId,figureStudioImageId:record.figureStudioImageId,name:record.name,file:original,width:record.width,height:record.height,thumbnail:await thumbnail(decoded.source),settings:record.settings,history:new History(record.settings),enabled:record.enabled,barVisible:record.settings.scaleBar.visible,labelVisible:record.settings.panelLabel.visible,labelText:record.settings.panelLabel.text,subtext:record.settings.panelLabel.subtext,sourceDirectory:null,sourceHandle:null};
        restored.push(item);
        if(restored.length-1===project.activeIndex)activeDecoded=decoded;
      }finally{if(decoded!==activeDecoded)releaseImage(decoded.source);}
      await new Promise(resolve=>requestAnimationFrame(resolve));
    }
  }catch(error){for(const item of restored)URL.revokeObjectURL(item.thumbnail);if(activeDecoded)releaseImage(activeDecoded.source);throw error;}
  // Replace the current work only after every embedded image/settings pair is valid.
  for(const item of items)URL.revokeObjectURL(item.thumbnail);
  items.splice(0,items.length,...restored);
  figureStudioProjectId=project.ui.figureStudioProjectId;figurePreviewCache.clear();figurePreviewProjectId='';
  clearDownloads();saveDirectory=null;previewRaw=false;$('zoomSelect').value='fit';
  projectHandle=sourceHandles.get(file)||null;
  projectName=file.name;
  $('saveDestination').value=folderSupported?'source':'download';
  $('saveDpi').value=String(project.ui.dpi);$('includeSettings').checked=project.ui.includeSettings;
  const formats=restoreExportFormats(project.ui.formats);
  for(const input of document.querySelectorAll('[data-export-format]'))input.checked=formats.includes(input.dataset.exportFormat);
  for(const id of projectLabelControls)if(typeof project.ui.labelControls?.[id]==='string'||typeof project.ui.labelControls?.[id]==='boolean'){
    const input=$(id),value=project.ui.labelControls[id];
    if(input.type==='checkbox')input.checked=value===true;
    else if(typeof value==='string'&&(input.tagName!=='SELECT'||[...input.options].some(option=>option.value===value)))input.value=value;
  }
  $('labelApplySelected').checked=project.ui.labelApplySelected===true;
  $('cropScope').value=project.ui.cropScope??'batch';
  $('barScope').value=project.ui.barScope??'batch';
  $('calibrationScope').value=project.ui.calibrationScope??'individual';
  $('mapRangeScope').value=project.ui.mapRangeScope??'individual';
  $('studioSizeAll').checked=project.ui.studioSizeScope!=='individual';
  activateItem(items[project.activeIndex],activeDecoded);
  pendingCrop=current.settings.cropOptions.pending??null;syncInputs();render();
  workSaveState.markSaved(workspaceSnapshot(items,projectUI()));scheduleWorkState();
  notify(`プロジェクトを開きました（${items.length}枚）。編集を再開できます。`);
}
async function saveSettingsFile(session) {
  if(busy||!current)return;closeSettingsSaveMenu();
  await action(async()=>{
    const name=session?'microscopy_batch.json':`${current.name.replace(/\.[^.]+$/, '')}_settings.json`;
    let saveFile;
    try{saveFile=await prepareDocumentSaver(name,'設定JSON','.json');}
    catch(error){if(error.name==='AbortError'){notify('設定の保存をキャンセルしました。');return;}throw error;}
    const saved=session?sessionProject(items,current.settings.output,exportFormats()):serializeProject(current.settings,current);
    await saveFile(new Blob([JSON.stringify(saved,null,2)],{type:'application/json'}),name);
    notify(session?'一覧の設定を保存しました。':'設定を保存しました。');
  });
}
$('saveSettingsButton').addEventListener('click',()=>saveSettingsFile(false));
$('saveSessionButton').addEventListener('click',()=>saveSettingsFile(true));
$('settingsInput').addEventListener('change', () => {
  const file=$('settingsInput').files[0];$('settingsInput').value='';
  if(file)action(()=>openSettingsFile(file));
});
$('settingsInput').addEventListener('click',event=>{
  if(typeof window.showOpenFilePicker!=='function')return;
  event.preventDefault();action(async()=>{
    let handle;
    try{[handle]=await window.showOpenFilePicker({...filePickerOptions('mifito-images','設定JSON',{'application/json':['.json']},saveDirectory||current?.sourceDirectory||current?.sourceHandle||projectHandle),multiple:false});}
    catch(error){if(error.name==='AbortError')return;throw error;}
    await openSettingsFile(await handle.getFile());
  });
});
async function openSettingsFile(file){
    if (!file) return;if(file.size>4000000)throw new Error('設定JSONが大きすぎます。');const text=await file.text();let data;try{data=JSON.parse(text);}catch{throw new Error('設定JSONを読み取れませんでした。');}
    if(data?.session_type==='microscopy_batch'){
      const records=parseSession(data,items);for(const {image,settings,enabled} of records){image.settings=settings;image.history=new History(settings);image.enabled=enabled;image.barVisible=settings.scaleBar.visible;image.labelVisible=settings.panelLabel.visible;image.labelText=settings.panelLabel.text;image.subtext=settings.panelLabel.subtext;image.cropError=null;}
      const previous=[...items];items.splice(0,items.length,...records.map(r=>r.image));for(const item of previous)if(!items.includes(item))URL.revokeObjectURL(item.thumbnail);
      await selectItem(items[0]);
      const formats=restoreExportFormats(data.output_formats??[data.output_format??'.png']);
      for(const input of document.querySelectorAll('[data-export-format]'))input.checked=formats.includes(input.dataset.exportFormat);
    }else{const settings=parseProject(data,current);pendingCrop=null;commit(settings);setTool('move');}
    notify('設定を読み込みました。');

}
function exportFormats(){const formats=[...document.querySelectorAll('[data-export-format]:checked')].map(input=>input.dataset.exportFormat);if(!formats.length)throw new Error('保存形式を1つ以上選択してください。');return formats;}
function refreshSaveUI() {
  const count=items.filter(item=>item.enabled).length;
  $('singleSaveButton').disabled=busy||!current||previewMode==='all';
  $('batchSaveButton').textContent=`一括保存（${count}枚）`;
  $('batchSaveButton').disabled=busy||!current||!count;
  $('saveDialogTitle').textContent=saveBatch?'一括保存':'この画像を保存';
  $('exportButton').textContent=saveBatch?`${count}枚を一括保存`:'保存';
  $('exportButton').disabled=busy||!current||(saveBatch&&!count);
  $('saveTargetInfo').textContent=saveBatch?`保存する画像：チェックした${count}枚`:(current?current.name:'画像を開いてください');
  $('saveBatchHint').hidden=!saveBatch;
  $('copyButton').title=`表示中の画像を${current?.settings.output.dpi??600} dpiでコピー（プレビュー右上の解像度で変更）`;
  const mode=$('saveDestination').value;
  $('chooseSaveFolder').hidden=mode!=='folder';
  $('saveFolderInfo').textContent=mode==='download'?'ブラウザの保存先':(mode==='source'?current?.sourceDirectory:saveDirectory)?.name || '未選択';
  $('saveFolderInfo').title='初回保存時にフォルダを確認します。非対応ブラウザではダウンロードします。';
}
for(const [id,batch] of [['singleSaveButton',false],['batchSaveButton',true]]) $(id).addEventListener('click',()=>{
  if(busy||!current)return;
  saveBatch=batch;refreshSaveUI();showDialog($('saveDialog'));
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
  try{saveDirectory=await window.showDirectoryPicker(directoryPickerOptions(saveDirectory||current?.sourceDirectory||current?.sourceHandle||projectHandle));refreshSaveUI();}
  catch(error){if(error.name!=='AbortError')throw error;}
}));
$('openSourceFolder').addEventListener('click',()=>action(async()=>{
  let directory;
  try{directory=await window.showDirectoryPicker(directoryPickerOptions(saveDirectory||current?.sourceDirectory||current?.sourceHandle||projectHandle));}
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
    const directory=await window.showDirectoryPicker(directoryPickerOptions(mode==='source'?first.sourceHandle||projectHandle:saveDirectory||first.sourceDirectory||first.sourceHandle||projectHandle));
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
    const template=copy(current.settings);
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
  const settings=copy(current.settings);if(previewRaw){settings.crop={x:0,y:0,width:current.width,height:current.height};settings.scaleBar.visible=settings.panelLabel.visible=settings.mapColorbar.visible=false;settings.output.scale=1;}
  const image=source,png=document.fonts.ready.then(()=>exportImage(image,settings,'png'));
  // Start the clipboard write in the click event; Safari requires user activation.
  // Encode with the same resolution and native annotation rendering as PNG save.
  png.catch(()=>{});
  await navigator.clipboard.write([new ClipboardItem({'image/png':png})]);
  notify(`表示中の画像を${settings.output.dpi??600} dpiでクリップボードへコピーしました。`);
}));
$('cancelBatchButton').addEventListener('click', () => { batchController?.abort(); $('batchProgress').textContent = '現在の画像の処理後に中止します…'; });
$('helpButton').addEventListener('click', () => showDialog($('helpDialog'))); $('closeHelpButton').addEventListener('click', () => $('helpDialog').close());

async function loadSample(id,count){
  if(busy||![1,3].includes(count))return;
  setBusy(true);
  try{
    const records=[];
    for(let index=0;index<count;index++){
      const raster=sampleRaster(id,index),canvas=document.createElement('canvas');canvas.width=SAMPLE_WIDTH;canvas.height=SAMPLE_HEIGHT;
      let file;
      try{canvas.getContext('2d').putImageData(new ImageData(raster.data,raster.width,raster.height),0,0);file=new File([await canvasBlob(canvas)],`sample_${id}_${String.fromCharCode(97+index)}.png`,{type:'image/png'});}
      finally{canvas.width=canvas.height=0;}
      records.push({name:file.name,file,width:SAMPLE_WIDTH,height:SAMPLE_HEIGHT,settings:sampleSettings(id,index),enabled:true});
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    const labelControls=Object.fromEntries(projectLabelControls.map(id=>{const input=$(id);return [id,input.type==='checkbox'?input.defaultChecked:input.tagName==='SELECT'?([...input.options].find(o=>o.defaultSelected)||input.options[0]).value:input.defaultValue];}));
    const ui={...projectUI(),figureStudioProjectId:crypto.randomUUID(),formats:['png'],dpi:600,includeSettings:true,cropScope:'batch',barScope:'batch',calibrationScope:'individual',mapRangeScope:'individual',studioSizeScope:'batch',labelApplySelected:false,labelControls};
    const blob=await createProject(records,0,ui);
    await openProject(new File([blob],`sample_${id}.mifito`,{type:'application/octet-stream'}));
    projectName='';projectHandle=null;workSaveState.restoreCheckpoint(null);
    imageTable.setCollapsed(false);previewMode=count===3?'all':'single';render();scheduleWorkState();
    notify(`${SAMPLES.find(s=>s.id===id).title}を読み込みました（${count}枚）。模擬画像・校正済みです。`);
  }finally{setBusy(false);}
}
const samplePicker=new SamplePicker({busy:()=>busy,dirty:hasUnsavedWork,load:loadSample});
for(const id of ['demoButton','emptySingleDemoButton'])$(id).addEventListener('click',()=>samplePicker.open(1));
for(const id of ['multiDemoButton','emptyDemoButton'])$(id).addEventListener('click',()=>samplePicker.open(3));
annotationUI=new AnnotationUI({current:()=>current,busy:()=>busy,plan:()=>plan,scale:()=>previewScale,sourcePoint,active:()=>previewMode==='single'&&!!current&&!busy&&tool==='move'&&!previewRaw,panning:()=>spacePan,placeMode:()=>setTool('move'),commit,render,notify,colors:syncColorFields});
imageTable=new ImageSettingsTable({items:()=>items,current:()=>current,busy:()=>busy,edit:editImageTable,select:item=>action(()=>selectItem(item)),notify});
imageOverview=new ImageOverview($('imageOverview'),{items:()=>items,current:()=>current,busy:()=>busy,select:item=>action(()=>selectItem(item))});
appUpdater=new AppUpdater({version:APP_VERSION,busy:()=>busy||projectSaving,hasWork:()=>!!items.length,lock:setBusy,capture:captureUpdateSession,restore:restoreUpdateSession,backup:downloadUpdateBackup,notify});
setBusy(false);
await Promise.all([document.fonts.load('400 16px FigureSans'), document.fonts.load('700 16px FigureSans')]);
render();
const galleryProject = new URLSearchParams(location.search).get('gallery');
if (!await appUpdater.restore() && !getFigureBridgeContext() && galleryProject && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(galleryProject)) {
  await action(async () => {
    const response = await fetch(new URL(`gallery/projects/${galleryProject}.mifito`, import.meta.url));
    if (!response.ok) throw new Error('ギャラリーのプロジェクトを開けませんでした。');
    await openProject(new File([await response.blob()], `${galleryProject}.mifito`, {type:'application/octet-stream'}));
  });
}

// Figure Studio bridge: included in the source application's module scope.
var figureStudioDirectSender;
let figureBridgeBaseline=null,figureBridgePreservedOnReconnect=false;
function figureBridgeEditState(){return {content:workspaceSnapshot(items,projectUI()),activeId:current?.id,files:items.map(item=>item.file)};}
function figureBridgeIsDirty(){
  if(busy||projectSaving||drag||cropStart||measurementStart||pendingInputEdit())return true;
  const state=figureBridgeEditState(),baseline=figureBridgeBaseline;
  return !baseline||state.content!==baseline.content||state.files.length!==baseline.files.length||state.files.some((file,index)=>file!==baseline.files[index]);
}
function syncFigurePreviewCache(identity){
  if(figurePreviewProjectId!==identity.projectId){figurePreviewCache.clear();figurePreviewProjectId=identity.projectId;}
  const ids=new Set(identity.images.map(image=>image.imageId));
  for(const id of figurePreviewCache.keys())if(!ids.has(id))figurePreviewCache.delete(id);
}
function cacheFigurePreview(image,preview){
  if(preview.size>FIGURE_PREVIEW_LIMIT)throw new Error('Figure Studioへ送る画像は合計96 MB以内にしてください。');
  figurePreviewCache.delete(image.imageId);figurePreviewCache.set(image.imageId,{fingerprint:image.fingerprint,preview});
  let size=[...figurePreviewCache.values()].reduce((sum,value)=>sum+value.preview.size,0);
  for(const [id,value]of figurePreviewCache){if(size<=FIGURE_PREVIEW_LIMIT)break;figurePreviewCache.delete(id);size-=value.preview.size;}
}
async function captureFigureStudioImages(batch=false) {
  if (busy || projectSaving || drag || cropStart || measurementStart || !current || !source) throw new Error('画像の処理が完了してから反映してください。');
  if (pendingInputEdit()) throw new Error('入力中の設定を確定してから反映してください。');
  setBusy(true);
  try {
    await document.fonts.ready;
    const activeIndex=items.indexOf(current),ui=projectUI(),bridgeState=figureBridgeEditState();
    const records=items.map(item=>({...item,settings:copy(item.settings)}));
    const project=await createProject(records,activeIndex,ui),identity=await readMifitoIdentity(project);
    syncFigurePreviewCache(identity);
    const targets=batch?records.map((_,index)=>index):[activeIndex],images=[];let total=0;
    for(const index of targets){
      const descriptor=identity.images[index],item=records[index],cached=figurePreviewCache.get(descriptor.imageId);
      let preview=cached?.fingerprint===descriptor.fingerprint?cached.preview:null;
      if(!preview){
        if(item.cropError)throw new Error(`${item.name}：${item.cropError}`);
        let decoded;
        try{decoded=await decodeImage(item.file,item);preview=await exportImage(decoded.source,item.settings,'svg',{forStudio:true});}
        finally{if(decoded)releaseImage(decoded.source);}
        cacheFigurePreview(descriptor,preview);
      }
      total+=preview.size;if(total>FIGURE_PREVIEW_LIMIT)throw new Error('Figure Studioへ送る画像は合計96 MB以内にしてください。');
      images.push({...descriptor,preview,...(batch&&figureAcknowledgements.isUnchanged(identity.projectId,descriptor)?{unchanged:true}:{})});
      if(batch)await new Promise(resolve=>setTimeout(resolve,0));
    }
    const result={project,sourceName:projectName||'figure.mifito',bridgeState};
    if(batch)return {...result,batch:{projectId:identity.projectId,images}};
    const {preview,...image}=images[0];return {...result,preview,image:{projectId:identity.projectId,...image}};
  } finally {setBusy(false);}
}
const captureFigureStudioResult=()=>captureFigureStudioImages(false);
const captureFigureStudioBatch=()=>captureFigureStudioImages(true);
async function chooseFigureStudioImage(imageId){
  const item=items.find(item=>item.figureStudioImageId===imageId);
  if(!item)throw new Error('対象の画像がMiFiTo内にありません。Figure Studioから元プロジェクトを開き直してください。');
  if(item!==current)await selectItem(item);
  previewMode='single';render();
}
const figureStudioBridge=setupFigureBridge({
  app:'mifito',
  hasContent:()=>items.length>0,
  canAdoptAccepted(result){
    if((result?.batch?.projectId??result?.image?.projectId)!==figureStudioProjectId||!Array.isArray(result?.bridgeState?.files)||items.length!==result.bridgeState.files.length)return false;
    const files=[...result.bridgeState.files];
    return items.every(item=>{const index=files.indexOf(item.file);if(index<0)return false;files.splice(index,1);return true;});
  },
  onConnectionChange(connected){figureStudioDirectSender?.setBridgeConnected(connected);},
  async loadProject(file,{reconnect,imageId}={}) {
    if (busy) throw new Error('画像の処理中です。少し待ってから開き直してください。');
    figureBridgePreservedOnReconnect=!!(reconnect&&current&&source);
    setBusy(true);
    try {
      if(!figureBridgePreservedOnReconnect){
        if(imageId&&!(await readMifitoIdentity(file)).images.some(image=>image.imageId===imageId))throw new Error('元プロジェクトに対象の画像が見つかりません。');
        await openProject(file);
      }
      if(imageId)await chooseFigureStudioImage(imageId);
    }
    finally {setBusy(false);}
  },
  async selectImage(imageId){
    if(busy||projectSaving||drag||cropStart||measurementStart||pendingInputEdit())throw new Error('入力中の編集を確定してから、対象の画像を開き直してください。');
    setBusy(true);try{await chooseFigureStudioImage(imageId);}finally{setBusy(false);}
  },
  captureResult:captureFigureStudioResult,
  captureBatchResult:captureFigureStudioBatch,
  isDirty:figureBridgeIsDirty,
  onProjectLoaded(){figureBridgeBaseline=figureBridgePreservedOnReconnect?null:figureBridgeEditState();},
  onAccepted(result){figureAcknowledgements.accept(result);figureBridgeBaseline=mergeMifitoBaseline(figureBridgeBaseline,result?.bridgeState,!!result?.batch);}
});
figureStudioDirectSender = setupDirectSendButton({app:'mifito',captureResult:captureFigureStudioResult,captureBatchResult:captureFigureStudioBatch,
  async onAccepted(result){await figureStudioBridge?.rememberAccepted(result);figureAcknowledgements.accept(result);figureBridgeBaseline=mergeMifitoBaseline(figureBridgeBaseline,result?.bridgeState,!!result?.batch);},
  container:'.header-actions',isReady:()=>!busy&&!projectSaving&&!!current&&!!source});
figureStudioDirectSender?.setBridgeConnected(figureStudioBridge?.isConnected===true);

// Portable workspace state keeps editing history and unfinished form text. It
// never exports a preview or sends a change back to the Studio canvas.
const workspaceTableFields=['enabled','calibration.pixelSize','calibration.unit','scaleBar.visible','scaleBar.length','scaleBar.unit','panelLabel.visible','panelLabel.text','panelLabel.subtext','mapColorbar.visible','mapColorbar.min','mapColorbar.max','mapColorbar.title','mapColorbar.unit','mapColorbar.labelGapPercent','crop.x','crop.y','crop.width','crop.height'];
const workspaceItemFields=['barVisible','labelVisible','labelText','subtext'];
const workspaceStaticInputs=new Set([...document.querySelectorAll('input[id],select[id],textarea[id]')].filter(input=>input.type!=='file'&&!input.dataset.imageField).map(input=>input.id));
const workspaceDialogs=new Set([...document.querySelectorAll('dialog[id]')].filter(node=>node.id!=='updateDialog').map(node=>node.id));
for(const event of ['input','change','pointerdown','keydown','wheel'])document.addEventListener(event,()=>{figureWorkspaceEditSerial++;});
function workspaceFocusReady(){const frame=window.frameElement;return !document.hidden&&(!frame||!frame.inert&&!frame.hidden&&frame.getClientRects().length>0);}
function workspaceRestoreGuard(){return JSON.stringify({content:workspaceSnapshot(items,projectUI()),activeId:current?.id,tool,previewMode,mode:annotationUI.mode,draft:annotationUI.draft});}
function workspaceListInputs(){return [...$('imageList').querySelectorAll('[data-item-key]')].map(input=>({imageId:input.closest('[data-image-id]').dataset.imageId,key:input.dataset.itemKey,value:input.value,checked:input.checked}));}
function workspaceRawInputs(){return [...document.querySelectorAll('input[id],select[id],textarea[id]')].filter(input=>input.type!=='file').map(input=>({id:input.id,value:input.value,checked:!!input.checked,badInput:!!input.validity?.badInput}));}
function workspaceFocus(){const input=document.activeElement;if(!input?.matches('input,select,textarea')||input.type==='file')return null;const row=input.closest('#imageList [data-image-id]');if(!input.id&&(!row||!workspaceItemFields.includes(input.dataset.itemKey)))return null;return {id:input.id||'',...(row?{imageId:row.dataset.imageId,key:input.dataset.itemKey}:{}),start:input.selectionStart??null,end:input.selectionEnd??null};}
function workspaceLogicalState(){
 if(!items.length)return {empty:true};
 return {content:workspaceSnapshot(items,projectUI()),activeId:current?.id??null,files:items.map(item=>[item.id,item.file.name,item.file.size,item.file.type,item.file.lastModified,item.width,item.height]),history:items.map(item=>[item.id,item.history.index,item.history.entries.length]),
  inputs:workspaceRawInputs().sort((a,b)=>a.id.localeCompare(b.id)),listInputs:workspaceListInputs(),pendingCrop,measurement,measurementStart,previewRaw,tool,previewMode,saveBatch,
  annotation:{selected:[...annotationUI.selected].sort(),clipboard:annotationUI.clipboard,formState:annotationUI.formState,mode:annotationUI.mode,draft:annotationUI.draft},
  details:[...document.querySelectorAll('details')].map((node,index)=>[node.id||index,node.open]),dialogs:[...document.querySelectorAll('dialog[open]')].filter(node=>node.id!=='updateDialog').map(node=>node.id).sort(),imageTableCollapsed:$('imageTableContent').hidden,
  projectName,baseline:figureBridgeBaseline?{content:figureBridgeBaseline.content,activeId:figureBridgeBaseline.activeId,files:figureBridgeBaseline.files.map(file=>[file.name,file.size,file.type,file.lastModified])}:null};
}
function figureWorkspaceSignature(){return JSON.stringify(workspaceLogicalState());}
function workspaceReady(){if(busy||projectSaving||imageTable?.editing||drag||cropStart||annotationUI?.gesture||figureStudioDirectSender?.sender.busy)throw Error('MiFiToの処理またはドラッグが完了してから保存・復元してください。');}
function checkWorkspaceRawInputs(){for(const input of document.querySelectorAll('input'))if(input.validity?.badInput)throw Error(`${input.getAttribute('aria-label')||input.closest('label')?.textContent.trim()||'数値入力'}の入力途中の数値を確定するか、空欄にしてから保存してください。`);}
function stripWorkspaceHandles(state){
 const seen=new WeakSet(),keys=new Set(['projectHandle','saveDirectory','sourceHandle','sourceDirectory']);
 const visit=value=>{if(!value||typeof value!=='object'||value instanceof Blob||seen.has(value))return;seen.add(value);for(const key of Object.keys(value)){if(keys.has(key))value[key]=null;else visit(value[key]);}};
 visit(state);for(const item of state.items)delete item.thumbnail;return state;
}
function validateMiFiToWorkspaceState(snapshot){
 const fail=()=>{throw Error('MiFiToの作業状態が破損しているか、対応範囲を超えています。');};
 if(snapshot===null)return null;
 if(!snapshot||snapshot.version!==1||snapshot.app!=='mifito')fail();
 const state=snapshot.state;if(state===null)return null;
 const id=value=>typeof value==='string'&&/^[a-zA-Z0-9-]{1,200}$/.test(value);
 const text=(value,max=65536)=>typeof value==='string'&&value.length<=max;
 const finite=(value,max=1e9)=>Number.isFinite(value)&&Math.abs(value)<=max;
 const list=(value,max)=>Array.isArray(value)&&value.length<=max;
 let nodes=0,characters=0,bytes=0;const seen=new WeakSet(),active=new WeakSet();
 const walk=(value,depth=0)=>{
  if(depth>70||++nodes>1500000)fail();
  if(typeof value==='string'){characters+=value.length;if(value.length>32*1024*1024||characters>64*1024*1024)fail();return;}
  if(value===null||value===undefined||typeof value==='boolean')return;
  if(typeof value==='number'){if(!Number.isFinite(value))fail();return;}
  if(typeof value!=='object'||active.has(value))fail();if(seen.has(value))return;seen.add(value);
  if(value instanceof File){bytes+=value.size;if(!value.size||value.size>LIMITS.fileBytes||bytes>2*LIMITS.batchBytes||!text(value.name,255)||!text(value.type,100)||!Number.isSafeInteger(value.lastModified)||value.lastModified<0)fail();return;}
  const prototype=Object.getPrototypeOf(value);if(!Array.isArray(value)&&prototype!==Object.prototype&&prototype!==null)fail();
  active.add(value);for(const [key,descriptor]of Object.entries(Object.getOwnPropertyDescriptors(value))){if(key==='__proto__'||key==='constructor'||key==='prototype'||descriptor.get||descriptor.set)fail();if(['projectHandle','saveDirectory','sourceHandle','sourceDirectory'].includes(key)&&descriptor.value!=null)fail();walk(descriptor.value,depth+1);}active.delete(value);
 };
 walk(state);
 if(!state||!list(state.items,LIMITS.files)||!Number.isInteger(state.activeIndex)||(state.items.length?!state.items[state.activeIndex]:state.activeIndex!==-1)||state.projectHandle!==null||state.saveDirectory!==null||!text(state.projectName,255)||!(state.checkpoint===null||text(state.checkpoint,32*1024*1024)))fail();
 const ui=state.ui,formats=['png','jpeg','svg','pdf','bmp','tiff','pptx'];
 if(!ui||!id(ui.figureStudioProjectId)||!list(ui.formats,formats.length)||ui.formats.some(value=>!formats.includes(value))||![300,600,1200].includes(ui.dpi)||typeof ui.includeSettings!=='boolean'||!['simple','detailed'].includes(ui.colorMode)||typeof ui.labelApplySelected!=='boolean')fail();
 for(const key of ['cropScope','barScope','calibrationScope','mapRangeScope'])if(!['batch','individual'].includes(ui[key]))fail();
 if(ui.studioSizeScope!==undefined&&!['batch','individual'].includes(ui.studioSizeScope))fail();
 if(!ui.labelControls||Object.keys(ui.labelControls).some(key=>!projectLabelControls.includes(key)||!(typeof ui.labelControls[key]==='boolean'||text(ui.labelControls[key]))))fail();
 const itemIds=new Set(),imageIds=new Set(),entries=new Set(),inputIds=new Set(workspaceStaticInputs);let total=0;
 for(const item of state.items){
  if(!item||!id(item.id)||itemIds.has(item.id)||!id(item.figureStudioImageId)||imageIds.has(item.figureStudioImageId)||!text(item.name,255)||!SUPPORTED.test(item.name)||!(item.file instanceof File)||typeof item.enabled!=='boolean'||item.sourceHandle!=null||item.sourceDirectory!=null)fail();
  itemIds.add(item.id);imageIds.add(item.figureStudioImageId);total+=item.file.size;if(total>LIMITS.batchBytes)fail();
  validateSettings(item.settings,item.width,item.height);buildPlan(item.settings,context);
  const history=item.history;if(!history||!list(history.entries,100)||!history.entries.length||!Number.isInteger(history.index)||!history.entries[history.index]||!Number.isInteger(history.limit)||history.limit<1||history.limit>100)fail();
  for(const entry of history.entries){validateSettings(entry,item.width,item.height);entries.add(entry);}
  for(const key of workspaceTableFields)inputIds.add(`imageTable_${item.id}_${key.replace('.','_')}`);
 }
 for(const kind of ['undo','redo']){
  if(!state.transactions||!list(state.transactions[kind],10000))fail();
  for(const pair of state.transactions[kind]){
   if(!Array.isArray(pair)||pair.length!==2||!entries.has(pair[0])||!list(pair[1],LIMITS.files))fail();
   for(const record of pair[1]){if(!record||!state.items.includes(record.item))fail();validateSettings(record.before,record.item.width,record.item.height);validateSettings(record.after,record.item.width,record.item.height);for(const key of ['beforeError','afterError'])if(record[key]!=null&&!text(record[key],4096))fail();}
  }
 }
 if(!list(state.inputs,5000)||!list(state.workspaceListInputs,400))fail();const usedInputs=new Set();
 for(const input of state.inputs){if(!input||!inputIds.has(input.id)||usedInputs.has(input.id)||!text(input.value)||typeof input.checked!=='boolean')fail();usedInputs.add(input.id);if(input.id==='zoomSelect'&&input.value!=='fit'&&(!finite(Number(input.value))||Number(input.value)<MIN_ZOOM||Number(input.value)>MAX_ZOOM))fail();}
 const usedList=new Set();for(const input of state.workspaceListInputs){const key=`${input?.imageId}/${input?.key}`;if(!input||!itemIds.has(input.imageId)||!workspaceItemFields.includes(input.key)||usedList.has(key)||!text(input.value)||typeof input.checked!=='boolean')fail();usedList.add(key);}
 if(!list(state.details,1000)||!list(state.dialogs,100)||!list(state.recentColors,12)||state.recentColors.some(color=>!/^#[a-f\d]{6}$/i.test(color))||typeof state.imageTableCollapsed!=='boolean'||typeof state.previewRaw!=='boolean'||typeof state.workspaceSaveBatch!=='boolean'||!['move','measure','crop'].includes(state.tool)||!['single','all'].includes(state.previewMode))fail();
 const detailsIds=new Set([...document.querySelectorAll('details[id]')].map(node=>node.id));
 for(const entry of state.details)if(!entry||!text(entry.id,200)||(entry.id&&!detailsIds.has(entry.id))||!Number.isInteger(entry.index)||entry.index<0||entry.index>=1000||typeof entry.open!=='boolean')fail();
 for(const entry of state.dialogs)if(!entry||!workspaceDialogs.has(entry.id)||![entry.left,entry.top].every(value=>text(value,40)&&(!value||/^-?\d+(?:\.\d+)?px$/.test(value))))fail();
 if(!state.view||!['sidebar','left','top'].every(key=>finite(state.view[key])&&state.view[key]>=0))fail();
 const currentItem=state.items[state.activeIndex];if(state.pendingCrop){if(!currentItem)fail();validateCrop(state.pendingCrop,currentItem.width,currentItem.height);}
 const point=value=>value&&finite(value.x,1e7)&&finite(value.y,1e7);
 if(state.measurement!==null&&(!Array.isArray(state.measurement)||state.measurement.length!==2||!state.measurement.every(point)))fail();if(state.measurementStart!==null&&!point(state.measurementStart))fail();
 if(state.mapEstimate!==null&&(!state.mapEstimate||!id(state.mapEstimate.imageId)||!text(state.mapEstimate.text)||!text(state.mapEstimate.signature,4*1024*1024)))fail();
 const annotation=state.annotation,extra=state.workspaceAnnotation;
 if(!annotation||!list(annotation.selected,200)||annotation.selected.some(value=>!text(value,128))||!list(annotation.clipboard,200)||!text(annotation.formState)||!extra||![null,'distance','diameter','text','segment','arrow'].includes(extra.mode))fail();
 if(annotation.clipboard.length){const points=annotation.clipboard.flatMap(a=>a.points??[]),width=Math.max(1,...points.map(p=>Math.ceil(p.x)),...annotation.clipboard.map(a=>Math.ceil(Math.abs(a.labelOffset?.x??0)))),height=Math.max(1,...points.map(p=>Math.ceil(p.y)),...annotation.clipboard.map(a=>Math.ceil(Math.abs(a.labelOffset?.y??0))));validateSettings({...defaultSettings(width,height),annotations:annotation.clipboard},width,height);}
 if(extra.draft!==null){if(!currentItem)fail();validateSettings({...currentItem.settings,annotations:[extra.draft]},currentItem.width,currentItem.height);}
 const focus=state.workspaceFocus;if(focus!==null&&(!focus||!(inputIds.has(focus.id)||itemIds.has(focus.imageId)&&workspaceItemFields.includes(focus.key))||![focus.start,focus.end].every(value=>value===null||Number.isInteger(value)&&value>=0&&value<=65536)))fail();
 const baseline=state.figureBridgeBaseline;
 if(baseline!==null){if(!baseline||!text(baseline.content,32*1024*1024)||!id(baseline.activeId)||!list(baseline.files,LIMITS.files)||baseline.files.some(file=>!(file instanceof File)))fail();let content;try{content=JSON.parse(baseline.content);}catch{fail();}if(!content||!list(content.images,LIMITS.files)||content.images.length!==baseline.files.length||content.images.some(image=>!id(image.id)))fail();}
 return state;
}
window.FigureStudioWorkspaceState={
 version:1,app:'mifito',
 async capture(){
  workspaceReady();checkWorkspaceRawInputs();const signature=figureWorkspaceSignature();
  if(!items.length)return {version:1,app:'mifito',state:null,binding:null};
  const state=stripWorkspaceHandles(await captureUpdateSession({figureBridgeBaseline,workspaceListInputs:workspaceListInputs(),workspaceFocus:workspaceFocus(),workspaceAnnotation:{mode:annotationUI.mode,draft:annotationUI.draft},workspaceSaveBatch:saveBatch}));
  const binding=await figureStudioBridge.captureWorkspaceBinding();
  workspaceReady();checkWorkspaceRawInputs();if(signature!==figureWorkspaceSignature())throw Error('MiFiToの保存中に編集がありました。もう一度保存してください。');
  const snapshot={version:1,app:'mifito',state,binding};validateMiFiToWorkspaceState(snapshot);return snapshot;
 },
 async validate(snapshot){validateMiFiToWorkspaceState(structuredClone(snapshot));return true;},
 async restore(snapshot){
  workspaceReady();const saved=validateMiFiToWorkspaceState(structuredClone(snapshot));figureWorkspaceSavedSignature=null;figureWorkspaceFinishRestore=null;
  if(!saved){newProject();settingsTransactions.restore({undo:[],redo:[]});figureBridgeBaseline=null;figureAcknowledgements=createMifitoAcknowledgements();return;}
  let finish=null;setBusy(true);
  try{finish=await restoreUpdateSession(saved);figureBridgeBaseline=saved.figureBridgeBaseline;figureAcknowledgements=createMifitoAcknowledgements();saveBatch=saved.workspaceSaveBatch;for(const dialog of document.querySelectorAll('dialog[open]'))if(!saved.dialogs.some(entry=>entry.id===dialog.id))dialog.close();}
  finally{setBusy(false);}
  // setTool and busy-state synchronization intentionally precede raw input restore.
  previewRaw=saved.previewRaw;measurementStart=saved.measurementStart;annotationUI.mode=saved.workspaceAnnotation.mode;annotationUI.draft=saved.workspaceAnnotation.draft;
  $('rawPreviewButton').classList.toggle('active',previewRaw);$('processedPreviewButton').classList.toggle('active',!previewRaw);canvas.style.cursor=annotationUI.mode?'crosshair':tool==='move'?'default':'crosshair';render();
  const restoreRaw=(focusInput=true)=>{
   finish?.();for(const entry of saved.workspaceListInputs){const input=$('imageList').querySelector(`[data-image-id="${entry.imageId}"] [data-item-key="${entry.key}"]`);if(input){input.value=entry.value;input.checked=entry.checked;}}
   const focus=saved.workspaceFocus,input=focus&&(focus.id?$(focus.id):$('imageList').querySelector(`[data-image-id="${focus.imageId}"] [data-item-key="${focus.key}"]`));if(focusInput&&input&&!input.disabled){input.focus({preventScroll:true});if(focus.start!==null)try{input.setSelectionRange(focus.start,focus.end);}catch{}}scheduleWorkState();
  };
  restoreRaw(false);figureWorkspaceFinishRestore={run:restoreRaw,serial:figureWorkspaceEditSerial,guard:workspaceRestoreGuard(),pending:null};
 },
 finishRestore(){
  const record=figureWorkspaceFinishRestore;if(!record||!workspaceFocusReady())return false;if(record.pending)return record.pending;
  record.pending=new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
   if(figureWorkspaceFinishRestore!==record){resolve(false);return;}
   if(!workspaceFocusReady()){record.pending=null;resolve(false);return;}
   figureWorkspaceFinishRestore=null;
   if(record.serial!==figureWorkspaceEditSerial||record.guard!==workspaceRestoreGuard()){resolve(false);return;}
   record.run();resolve(true);
  })));return record.pending;
 },
 async restoreBinding(binding){if(binding)await figureStudioBridge.restoreWorkspaceBinding(structuredClone(binding));else figureStudioBridge.resetWorkspaceBinding();},
 signature:figureWorkspaceSignature,
 hasWork:()=>!!items.length||!!annotationUI?.pending||!!annotationUI?.draft||!!imageTable?.pending,
 markSaved(signature){if(typeof signature==='string'&&signature===figureWorkspaceSignature())figureWorkspaceSavedSignature=signature;}
};
window.addEventListener('focus',()=>window.FigureStudioWorkspaceState.finishRestore());

