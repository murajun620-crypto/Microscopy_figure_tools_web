import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaultSettings,History} from '../core.js';

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const helper=source.slice(source.indexOf('function prepareFigureStudioProjectReplacement('),source.indexOf('function newProject('));
const newProjectSource=source.slice(source.indexOf('function newProject('),source.indexOf("$('newProjectButton').addEventListener"));
const openSource=source.slice(source.indexOf('async function openProject('),source.indexOf('async function saveSettingsFile('));
const acceptanceSource=source.slice(source.indexOf('function figureStudioResultMatchesCurrentProject('),source.indexOf('figureStudioBridge=setupFigureBridge('));

function fixture({nextId='project-new',readError=null,decodeError=null,detachError=null,directBusy=false,uninitialized=false,remember=async()=>{},preservedReconnect=true,initialBaseline={content:'old baseline'}}={}){
 const events=[],oldItem={id:'old-image',name:'old.png',thumbnail:'blob:old',settings:defaultSettings(300,200)},items=[oldItem],baseline=initialBaseline,ack={old:true,accept:()=>events.push('ack')},currentEditState={content:'current unsent settings'};
 const image={figureStudioImageId:'new-image',name:'new.png',blob:new Blob(['bytes']),type:'image/png',lastModified:1,width:300,height:200,enabled:true,settings:defaultSettings(300,200)};
 const project={images:[image],activeIndex:0,ui:{figureStudioProjectId:nextId,dpi:600,formats:['png'],includeSettings:true}};
 const elements=new Map(),env={
  figureStudioProjectId:'project-old',figureBridgeBaseline:baseline,figureBridgePreservedOnReconnect:preservedReconnect,figureBridgeEditState:()=>{events.push('capture-edit-state');return currentEditState;},figureAcknowledgements:ack,figureWorkspaceSavedSignature:'saved',figureWorkspaceFinishRestore:'pending',
  figureStudioBridge:uninitialized?undefined:{resetWorkspaceBinding(){events.push('detach');if(detachError)throw detachError;},rememberAccepted:remember},figureStudioDirectSender:uninitialized?undefined:{sender:{busy:directBusy,resetPending(){events.push('reset-pending');if(directBusy)throw Error('direct send busy');}}},createMifitoAcknowledgements:()=>({reset:true}),mergeMifitoBaseline:(before,after)=>{events.push('merge');return after;},
  notify:message=>events.push(`notify:${message}`),async readProject(){events.push('read');if(readError)throw readError;return project;},async decodeImage(){events.push('decode');if(decodeError)throw decodeError;return {width:300,height:200,source:'decoded'};},
  buildPlan(){},context:{},thumbnail:async()=>{events.push('thumbnail');return 'blob:new';},History,releaseImage:value=>events.push(`release:${value}`),requestAnimationFrame:fn=>fn(),URL:{revokeObjectURL:value=>events.push(`revoke:${value}`)},
  items,current:oldItem,figurePreviewCache:new Map([['old','preview']]),figurePreviewProjectId:'old',clearDownloads(){events.push('clear-downloads');},saveDirectory:'old-directory',previewRaw:true,projectHandle:'old-handle',projectName:'old.mifito',
  sourceHandles:new Map(),folderSupported:true,restoreExportFormats:formats=>formats,projectLabelControls:[],document:{querySelectorAll:()=>[]},
  $:id=>{if(!elements.has(id))elements.set(id,{value:'',checked:false});return elements.get(id);},pendingCrop:null,syncInputs(){},render(){},workSaveState:{markSaved(){}},workspaceSnapshot:()=>'',projectUI:()=>({}),scheduleWorkState(){},busy:false,projectSaving:false,events,
 };
 const keys=Object.keys(env),api=new Function(...keys,`${helper}\n${newProjectSource}\n${openSource}\n${acceptanceSource}\nfunction activateItem(item){current=item;events.push('activate');}\nreturn {prepare:prepareFigureStudioProjectReplacement,open:openProject,newProject,accept:acceptFigureStudioResult,acceptDirect:acceptDirectFigureStudioResult,projectLoaded:figureStudioProjectLoaded,state:()=>({projectId:figureStudioProjectId,baseline:figureBridgeBaseline,ack:figureAcknowledgements,saved:figureWorkspaceSavedSignature,finish:figureWorkspaceFinishRestore,items:[...items],cache:figurePreviewCache})};`)(...keys.map(key=>env[key]));
 return {api,events,oldItem,baseline,ack,currentEditState,file:new File(['project'],'new.mifito')};
}

test('successful user project switch detaches only after decode and before replacing old content',async()=>{
 const {api,events,file,oldItem}=fixture();await api.open(file);
 assert.ok(events.indexOf('detach')>events.indexOf('thumbnail'));assert.ok(events.indexOf('detach')<events.indexOf('revoke:blob:old'));
 assert.ok(events.indexOf('reset-pending')>events.indexOf('detach'));assert.ok(events.indexOf('reset-pending')<events.indexOf('revoke:blob:old'));
 const state=api.state();assert.equal(state.projectId,'project-new');assert.notEqual(state.items[0],oldItem);assert.equal(state.baseline,null);assert.deepEqual(state.ack,{reset:true});assert.equal(state.saved,null);assert.equal(state.finish,null);
});

test('reopening the same stable project keeps its active bridge binding',async()=>{
 const {api,events,file,baseline,ack}=fixture({nextId:'project-old'});await api.open(file);
 assert.equal(events.includes('detach'),false);assert.equal(events.includes('reset-pending'),false);assert.equal(api.state().baseline,baseline);assert.equal(api.state().ack,ack);
});

test('Studio-requested load preserves the binding despite changing project identity',async()=>{
 const {api,events,file,baseline}=fixture();await api.open(file,{fromBridge:true});
 assert.equal(api.state().projectId,'project-new');assert.equal(events.includes('detach'),false);assert.equal(api.state().baseline,baseline);
});

test('workspace restore bypasses detach while its parent restores binding separately',()=>{
 const {api,events,baseline}=fixture({detachError:Error('host busy')});api.prepare('restored-project',{fromWorkspace:true});
 assert.equal(events.includes('detach'),false);assert.equal(events.includes('reset-pending'),true);assert.equal(api.state().baseline,baseline);
});

test('failed or cancelled imports leave old content and bridge untouched',async()=>{
 for(const options of [{readError:Error('invalid project')},{readError:new DOMException('cancelled','AbortError')},{decodeError:Error('invalid image')}]){
  const {api,events,file,baseline,ack,oldItem}=fixture(options);await assert.rejects(api.open(file));
  assert.equal(events.includes('detach'),false);assert.equal(events.includes('revoke:blob:old'),false);assert.equal(api.state().items[0],oldItem);assert.equal(api.state().projectId,'project-old');assert.equal(api.state().baseline,baseline);assert.equal(api.state().ack,ack);
 }
});

test('busy bridge prevents replacement and releases only staged image resources',async()=>{
 const {api,events,file,baseline,ack,oldItem}=fixture({detachError:Error('host busy')});await assert.rejects(api.open(file),/host busy/);
 assert.equal(api.state().items[0],oldItem);assert.equal(api.state().projectId,'project-old');assert.equal(api.state().baseline,baseline);assert.equal(api.state().ack,ack);assert.equal(api.state().cache.get('old'),'preview');
 assert.ok(events.includes('revoke:blob:new'));assert.ok(events.includes('release:decoded'));assert.equal(events.includes('revoke:blob:old'),false);
});

test('pending direct send prevents switching to a different project',async()=>{
 const {api,events,file,oldItem}=fixture({directBusy:true});await assert.rejects(api.open(file),/送信が完了/);
 assert.equal(events.includes('detach'),false);assert.equal(api.state().items[0],oldItem);
});

test('New Project blocked by a busy bridge preserves the existing document',()=>{
 const {api,events,baseline,oldItem}=fixture({detachError:Error('host busy')});api.newProject();
 assert.equal(api.state().items[0],oldItem);assert.equal(api.state().projectId,'project-old');assert.equal(api.state().baseline,baseline);assert.ok(events.includes('notify:host busy'));
});

test('early gallery loading before bridge setup still opens a project',async()=>{
 const {api,file}=fixture({uninitialized:true});await api.open(file);assert.equal(api.state().projectId,'project-new');
});

test('late acknowledgement for a replaced project cannot restore its baseline or acknowledgement state',async()=>{
 let remembered=0;const {api,file,events}=fixture({remember:async()=>{remembered++;}});await api.open(file);
 const stale={batch:{projectId:'project-old'},bridgeState:{content:'stale'}};
 assert.equal(api.accept(stale),false);await api.acceptDirect(stale);
 assert.equal(remembered,0);assert.equal(events.includes('ack'),false);assert.equal(events.includes('merge'),false);assert.equal(api.state().baseline,null);
});

test('project replacement during asynchronous ACK hashing prevents a late baseline merge',async()=>{
 let finish;const pending=new Promise(resolve=>{finish=resolve;}),{api,file,events}=fixture({remember:()=>pending});
 const accepted=api.acceptDirect({image:{projectId:'project-old'},bridgeState:{content:'stale'}});await api.open(file);finish();await accepted;
 assert.equal(events.includes('ack'),false);assert.equal(events.includes('merge'),false);assert.equal(api.state().baseline,null);
});

test('acknowledgement for the current project still records its exact captured baseline',async()=>{
 const {api,events}=fixture(),bridgeState={content:'captured'};await api.acceptDirect({batch:{projectId:'project-old'},bridgeState});
 assert.equal(events.filter(value=>value==='ack').length,1);assert.equal(events.filter(value=>value==='merge').length,1);assert.equal(api.state().baseline,bridgeState);
});

test('adopting a direct-send project retains its accepted checkpoint without marking later edits clean',async()=>{
 const {api,events}=fixture(),acceptedState={content:'last accepted settings'};
 await api.acceptDirect({batch:{projectId:'project-old'},bridgeState:acceptedState});api.projectLoaded();
 assert.equal(api.state().baseline,acceptedState);assert.equal(events.includes('capture-edit-state'),false);
});

test('reconnecting without a checkpoint keeps the baseline conservatively null',()=>{
 const {api,events}=fixture({initialBaseline:null});api.projectLoaded();
 assert.equal(api.state().baseline,null);assert.equal(events.includes('capture-edit-state'),false);
});

test('ordinary Studio project loading establishes the newly loaded edit baseline',()=>{
 const {api,events,currentEditState}=fixture({preservedReconnect:false});api.projectLoaded();
 assert.equal(api.state().baseline,currentEditState);assert.equal(events.filter(value=>value==='capture-edit-state').length,1);
});
