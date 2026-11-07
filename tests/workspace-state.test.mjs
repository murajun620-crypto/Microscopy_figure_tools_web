import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaultSettings,validateSettings,validateCrop,History,LIMITS} from '../core.js';
import {SettingsTransactions} from '../crop-workflow.js';
import {workspaceSnapshot} from '../work-state.js';
import {MIN_ZOOM,MAX_ZOOM} from '../zoom.js';

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('const workspaceTableFields='),source.indexOf('window.FigureStudioWorkspaceState='));
const captureSource=source.slice(source.indexOf('async function captureUpdateSession('),source.indexOf('async function restoreUpdateSession('));
const ids=['pixelSize','zoomSelect'],projectLabelControls=['panelFormat'];
function fixture(){
 const ui={figureStudioProjectId:'project-1',formats:['png'],dpi:600,includeSettings:true,colorMode:'simple',cropScope:'batch',barScope:'batch',calibrationScope:'individual',mapRangeScope:'individual',labelApplySelected:false,labelControls:{panelFormat:'standard'}};
 const make=id=>{const settings=defaultSettings(200,100);return {id,figureStudioImageId:id,name:`${id}.png`,file:new File(['original bytes'],`${id}.png`,{type:'image/png',lastModified:123}),width:200,height:100,settings,history:new History(settings),enabled:true,sourceHandle:null,sourceDirectory:null,barVisible:true,labelVisible:true,labelText:'',subtext:''};};
 const items=[make('image-1'),make('image-2')],transactions=new SettingsTransactions();
 const updates=items.map(item=>{const settings=structuredClone(item.settings);settings.output.studioSize={axis:'width',mm:40};return {item,settings};});transactions.apply(updates,{origin:items[0]});
 return {ui,items,transactions,baseline:{content:workspaceSnapshot(items,ui),activeId:items[0].id,files:items.map(item=>item.file)}};
}
function environment(data){
 const inputs=ids.map(id=>({id,type:id==='zoomSelect'?'select':'number',value:id==='zoomSelect'?'fit':'',checked:id==='zoomSelect'?undefined:false,dataset:{},validity:{badInput:false},getAttribute:()=>id,closest:()=>null}));
 const details=[{id:'batchPanel',open:true}],elements=new Map([['imageTableContent',{hidden:false}],['settingsPanel',{scrollTop:10}],['previewArea',{scrollLeft:4,scrollTop:8}],['imageList',{querySelectorAll:()=>[]}]]);
 const annotationUI={selected:new Set(),clipboard:[],formState:'',mode:null,draft:null};
 const document={activeElement:null,addEventListener(){},querySelectorAll(selector){if(selector.startsWith('input'))return inputs;if(selector==='details'||selector==='details[id]')return details;if(selector==='dialog[id]')return [{id:'annotationEditor'}];if(selector==='dialog[open]')return [];return [];}};
 return {$:id=>elements.get(id),document,LIMITS,SUPPORTED:/\.(png|jpe?g|bmp|svg|tiff?)$/i,validateSettings,validateCrop,defaultSettings,buildPlan(){},context:{},MIN_ZOOM,MAX_ZOOM,projectLabelControls,
  items:data.items,current:data.items[0],projectUI:()=>data.ui,workspaceSnapshot,settingsTransactions:data.transactions,workSaveState:{checkpoint:null},projectHandle:null,projectName:'original.mifito',saveDirectory:null,pendingCrop:null,measurement:null,measurementStart:null,previewRaw:false,tool:'move',previewMode:'single',mapEstimate:null,recentColors:[],annotationUI,saveBatch:false,figureBridgeBaseline:data.baseline,
  inputs,details};
}
function compile(env){const keys=Object.keys(env);return new Function(...keys,`${helpers}\n${captureSource}\nreturn {validate:validateMiFiToWorkspaceState,strip:stripWorkspaceHandles,capture:captureUpdateSession,signature:figureWorkspaceSignature,checkRaw:checkWorkspaceRawInputs};`)(...keys.map(key=>env[key]));}
async function snapshot(data=fixture()){
 const env=environment(data),api=compile(env);
 const state=api.strip(await api.capture({figureBridgeBaseline:data.baseline,workspaceListInputs:[],workspaceFocus:null,workspaceAnnotation:{mode:null,draft:null},workspaceSaveBatch:false}));
 return {env,api,value:{version:1,app:'mifito',state,binding:null}};
}
test('portable capture keeps original bytes, history transaction aliases and source baseline File aliases',async()=>{
 const data=fixture();data.items[0].sourceDirectory={kind:'directory',name:'private directory'};
 const {value,api}=await snapshot(data),state=value.state;
 assert.equal(state.items[0].sourceDirectory,null);assert.notEqual(state.items[0].file,data.items[0].file);
 assert.equal(await state.items[0].file.text(),'original bytes');assert.equal(state.figureBridgeBaseline.files[0],state.items[0].file);
 assert.equal(state.transactions.undo[0][1][0].item,state.items[0]);assert.equal(state.transactions.undo[0][0],state.items[0].history.entries[1]);
 assert.equal(api.validate(value),state);assert.equal(data.items[0].sourceDirectory.name,'private directory');
});
test('uncommitted raw form values remain separate from committed settings',async()=>{
 const data=fixture(),env=environment(data);env.inputs[0].value='';
 const api=compile(env),state=api.strip(await api.capture({figureBridgeBaseline:data.baseline,workspaceListInputs:[{imageId:'image-1',key:'labelText',value:'pending label',checked:false}],workspaceFocus:{id:'pixelSize',start:null,end:null},workspaceAnnotation:{mode:null,draft:null},workspaceSaveBatch:false}));
 assert.equal(api.validate({version:1,app:'mifito',state}),state);assert.equal(state.inputs.find(input=>input.id==='pixelSize').value,'');
 assert.equal(state.workspaceListInputs[0].value,'pending label');assert.equal(state.items[0].settings.panelLabel.text,data.items[0].settings.panelLabel.text);
});
test('native badInput rejects capture without changing the input',()=>{
 const env=environment(fixture());env.inputs[0].validity.badInput=true;env.inputs[0].value='';const api=compile(env);
 assert.throws(()=>api.checkRaw(),/pixelSize/);assert.equal(env.inputs[0].value,'');assert.equal(env.inputs[0].type,'number');
});
test('malformed settings, transaction references, input targets, cyclic graphs and file handles are rejected',async()=>{
 const {value,api}=await snapshot();
 const cases=[v=>{v.state.items[0].settings.output.scale=99;},v=>{v.state.items[0].history.index=999;},v=>{v.state.transactions.undo[0][1][0].item=structuredClone(v.state.items[0]);},v=>{v.state.inputs[0].id='projectInput';},v=>{v.state.cycle=v.state;},v=>{v.state.items[0].sourceHandle={kind:'file'};}];
 for(const change of cases){const bad=structuredClone(value);change(bad);assert.throws(()=>api.validate(bad));}
 assert.equal(api.validate(value),value.state);
});
test('portable graph file byte limits apply before any restoration',async()=>{
 const {value,env}=await snapshot();env.LIMITS={...LIMITS,fileBytes:8};assert.throws(()=>compile(env).validate(value));
});
test('logical signature ignores File object identities and handle permissions, but detects pending inputs and image edits',async()=>{
 const data=fixture(),env=environment(data),api=compile(env),before=api.signature();
 const cloned=structuredClone(data);cloned.transactions=data.transactions;const restoredEnv=environment(cloned);restoredEnv.items.forEach(item=>{item.sourceDirectory=null;item.sourceHandle=null;});
 assert.equal(compile(restoredEnv).signature(),before);
 env.inputs[0].value='3';assert.notEqual(api.signature(),before);env.inputs[0].value='';
 data.items[1].settings.panelLabel.text='new unreflected value';assert.notEqual(api.signature(),before);
});
test('legacy null and explicit empty snapshots validate without UI changes',async()=>{
 const {api}=await snapshot();assert.equal(api.validate(null),null);assert.equal(api.validate({version:1,app:'mifito',state:null,binding:null}),null);
});
function finishHarness(){
 const match=source.match(/ finishRestore\(\)\{([\s\S]*?)\n \},\n async restoreBinding/),frames=[];let visible=false,runs=0;
 const api=new Function('workspaceFocusReady','workspaceRestoreGuard','requestAnimationFrame',`let figureWorkspaceFinishRestore=null,figureWorkspaceEditSerial=0;function finishRestore(){${match[1]}}return {finishRestore,setRecord(value){figureWorkspaceFinishRestore=value;},edit(){figureWorkspaceEditSerial++;}};`)(()=>visible,()=> 'same-model',callback=>frames.push(callback));
 api.setRecord({run(){runs++;},serial:0,guard:'same-model',pending:null});
 return {api,show(){visible=true;},flush(){while(frames.length)frames.shift()();},get runs(){return runs;}};
}
test('pending raw-control finalization waits for visibility and runs only once after layout',async()=>{
 const h=finishHarness();assert.equal(h.api.finishRestore(),false);assert.equal(h.runs,0);
 h.show();const finishing=h.api.finishRestore();assert.equal(h.runs,0);h.flush();assert.equal(await finishing,true);assert.equal(h.runs,1);assert.equal(h.api.finishRestore(),false);
});
test('deferred raw-control restoration never overwrites a subsequent user edit',async()=>{
 const h=finishHarness();h.show();const finishing=h.api.finishRestore();h.api.edit();h.flush();assert.equal(await finishing,false);assert.equal(h.runs,0);assert.equal(h.api.finishRestore(),false);
});
