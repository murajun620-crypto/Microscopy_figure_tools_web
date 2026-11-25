import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {defaultSettings} from '../core.js';
import {createProject,readProject} from '../project.js';
import {readMifitoIdentity} from '../mifito-sync.mjs';
import {WorkSaveState,workspaceSnapshot} from '../work-state.js';
import {workFolderLookup,createProjectFileLinks} from '../project-file-links.mjs';

const source=await readFile(new URL('../app.js',import.meta.url),'utf8'),start=source.indexOf('function sourceProjectSaveReady('),end=source.indexOf('// IndexedDB preserves',start),saver=source.slice(start,end);
const workFolderStart=source.indexOf('function clearStudioWorkFolderWatch()');
const workFolder=source.slice(workFolderStart,source.indexOf('figureStudioBridge=setupFigureBridge({',workFolderStart));
const projectId='test-source-project-000001';
function handle(name,blob){let bytes=blob;return {name,kind:'file',fail:false,async getFile(){return new File([bytes],name);},async queryPermission(){return 'granted';},async isSameEntry(other){return this===other;},async createWritable(){let pending;const h=this;return {async write(blob){if(h.fail)throw Error('disk full');pending=blob;},async close(){bytes=pending;},async abort(){}};}};}
async function fixture({fail=false,cancel=false,unbound=false,sourceKey,folderSearch,chooseAction,keepRegistry=false}={}){
  const items=[{id:'image-000000000000001',name:'image.png',file:new File(['independent original bytes'],'image.png',{type:'image/png',lastModified:12}),width:20,height:10,enabled:true,settings:defaultSettings(20,10)}];
  const ui={figureStudioProjectId:projectId,formats:['png'],dpi:600,includeSettings:true,colorMode:'simple'};
  const native=handle('source.mifito',await createProject(items,0,ui)),copy=handle('copy.mifito',new Blob());native.fail=copy.fail=fail;
  const records=new Map(),store={async get(key){return records.get(key);},async list(key){return [...records.values()].filter(r=>r.project===key);},async put(record){records.set(record.token,record);}};
  const pickerHost={async showSaveFilePicker(){if(cancel)throw new DOMException('cancelled','AbortError');return copy;}};
  const projectFiles=createProjectFileLinks({app:'mifito',store,host:pickerHost,choose:()=>assert.fail('Unexpected confirmation'),identify:readMifitoIdentity});
  const opened=await projectFiles.opened({file:await native.getFile(),projectId,handle:native});
  const preparations=[],prepare=projectFiles.prepare;
  projectFiles.prepare=options=>{preparations.push(options);return prepare(options);};
  const events=[],env={studioWorkFolderWatch:null,projectVersionChecking:false,window:pickerHost,chooseProjectFileAction:chooseAction??(()=>assert.fail('Unexpected confirmation')),busy:false,workspaceReady(){},checkWorkspaceRawInputs(){},pendingInputEdit:()=>false,measurementStart:null,action:async fn=>{try{await fn();}catch(e){events.push({error:e.message});}},closeProjectSaveMenu(){},projectHandle:native,projectName:'source.mifito',projectFileLink:opened.link,figureStudioBridge:{sourceKey},current:items[0],items,projectFiles,figureStudioProjectId:projectId,saveDirectory:null,download(){assert.fail('Unexpected download');},figureStudioDirectSender:null,workspaceSnapshot,notify:(message,error=false)=>events.push({message,error}),projectSaving:false,scheduleWorkState(){},createProject,prepareFigureStudioProjectReplacement:id=>events.push({replacement:id}),workSaveState:Object.assign(new WorkSaveState(),{markSaved(snapshot){this.restoreCheckpoint(snapshot);events.push({saved:snapshot});}})};
  if(folderSearch){env.projectHandle=null;projectFiles.findInWorkFolder=folderSearch;if(!keepRegistry)records.clear();}
  if(unbound){env.projectHandle=null;env.projectName='';env.projectFileLink=null;records.clear();}
  env.workFolderLookup=workFolderLookup;
  const keys=Object.keys(env),api=Function(...keys,`function setBusy(value){busy=value;}
function projectUI(){return {...${JSON.stringify(ui)},figureStudioProjectId};}\n${workFolder}\n${saver}\nreturn {watch:watchStudioWorkFolder,route:key=>{figureStudioBridge.sourceKey=key;},prepare:prepareSourceProjectSave,ready:sourceProjectSaveReady,save:saveProject,state:()=>({busy,projectHandle,projectName,projectFileLink,figureStudioProjectId,projectSaving}),expected:()=>workspaceSnapshot(items,projectUI())};`)(...keys.map(key=>env[key]));
  return {api,native,copy,opened,events,records,items,projectFiles,ui,pickerHost,preparations};
}
test('actual MiFiTo save keeps independent source image bytes and omits local target metadata from disk',async()=>{
  const f=await fixture();f.items[0].settings.panelLabel.text='(a) updated';await f.api.save(false);const state=f.api.state(),saved=await readProject(await f.native.getFile());
  assert.equal(saved.ui.figureStudioProjectId,projectId);assert.equal(saved.ui.sourceFileLink,undefined);assert.equal(saved.images[0].settings.panelLabel.text,'(a) updated');assert.equal(await saved.images[0].blob.text(),'independent original bytes');assert.equal(state.projectHandle,f.native);assert.equal(state.projectSaving,false);assert.notEqual(state.projectFileLink.fingerprint,f.opened.link.fingerprint);assert.equal(state.projectFileLink.token,f.opened.link.token);assert.equal(f.events.find(e=>e.saved)?.saved,f.api.expected());
});
test('a Studio-connected MiFiTo save passes the exact attachment key to the local target registry',async()=>{
  const sourceKey='book/figure/panel/asset',f=await fixture({unbound:true,sourceKey});
  const snapshot=await createProject(f.items,0,f.ui);
  await f.api.save(false);
  assert.equal(f.preparations[0].sourceKey,sourceKey);
  assert.equal(f.api.state().projectHandle,f.copy);
  const saved=await readProject(await f.copy.getFile());
  assert.equal(saved.ui.figureStudioProjectId,projectId);
  assert.equal(saved.ui.sourceKey,undefined);
  const reopened=await f.projectFiles.opened({file:new File([snapshot],'old-attachment.mifito'),projectId,embedded:true,sourceKey});
  assert.equal(reopened.handle,f.copy);
  assert.equal(reopened.name,f.copy.name);
});
test('restoring temporary reload handles preserves an already resolved project target',async()=>{
  const start=source.indexOf(' restoreReloadHandles(saved){'),end=source.indexOf('\n async capture(){',start);
  const restore=Function('figureStudioProjectId','projectHandle','items','scheduleWorkState',
    'let saveDirectory;const api={'+source.slice(start,end)+'};return {restore:saved=>api.restoreReloadHandles(saved),target:()=>projectHandle};');
  const recovered={kind:'file',name:'recovered.mifito'},previous={kind:'file',name:'previous.mifito'};
  const f=restore(projectId,recovered,[],()=>{});
  f.restore({projectId,projectHandle:null,items:[]});
  assert.equal(f.target(),recovered);
  const unavailable=restore(projectId,null,[],()=>{});
  unavailable.restore({projectId,projectHandle:previous,items:[]});
  assert.equal(unavailable.target(),previous);
});
test('actual MiFiTo Save As assigns a new identity after successful write and retains the old source mapping',async()=>{
  const f=await fixture(),before=await (await f.native.getFile()).arrayBuffer();await f.api.save(true);const state=f.api.state(),saved=await readProject(await f.copy.getFile());
  assert.notEqual(saved.ui.figureStudioProjectId,projectId);assert.equal(state.figureStudioProjectId,saved.ui.figureStudioProjectId);assert.equal(state.projectName,'copy.mifito');assert.equal(state.projectHandle,f.copy);assert.equal(f.records.size,2);assert.deepEqual(await (await f.native.getFile()).arrayBuffer(),before);assert.equal(f.events.find(e=>e.saved)?.saved,f.api.expected());
});
test('actual MiFiTo failed save rolls back target, project identity, saved checkpoint and portable version',async()=>{
  for(const saveAs of [false,true]){const f=await fixture({fail:true}),before=await (await f.native.getFile()).arrayBuffer();await f.api.save(saveAs);const state=f.api.state();
    assert.equal(state.projectHandle,f.native);assert.equal(state.figureStudioProjectId,projectId);assert.deepEqual(state.projectFileLink,f.opened.link);assert.equal(state.projectSaving,false);assert.deepEqual(await (await f.native.getFile()).arrayBuffer(),before);assert.equal(f.records.size,1);assert.equal(f.events.some(e=>e.saved||e.replacement),false);assert.ok(f.events.some(e=>e.error&&e.message?.includes('disk full')));
  }
});
test('cancelling MiFiTo Save As preserves the original writable binding',async()=>{
  const f=await fixture({cancel:true}),before=await (await f.native.getFile()).arrayBuffer();await f.api.save(true);const state=f.api.state();
  assert.equal(state.projectHandle,f.native);assert.equal(state.figureStudioProjectId,projectId);assert.deepEqual(state.projectFileLink,f.opened.link);assert.equal(f.events.some(e=>e.saved||e.replacement),false);assert.deepEqual(await (await f.native.getFile()).arrayBuffer(),before);assert.equal(f.records.size,1);
});
test('MiFiTo embedded snapshots reopen with a safe file token while old projects remain readable',async()=>{
  const f=await fixture(),snapshot=await createProject(f.items,0,{...f.ui,sourceFileLink:f.opened.link}),saved=await readProject(snapshot);
  assert.deepEqual(saved.ui.sourceFileLink,f.opened.link);assert.equal((await readProject(await f.native.getFile())).ui.sourceFileLink,undefined);
  const identity=await readMifitoIdentity(snapshot,{includeSourceFileLink:true});
  assert.deepEqual(identity.sourceFileLink,f.opened.link);assert.equal((await readMifitoIdentity(snapshot)).sourceFileLink,undefined);
  const target=await f.projectFiles.opened({file:new File([snapshot],f.native.name),projectId,embedded:true,link:saved.ui.sourceFileLink});assert.equal(target.handle,f.native);
});
test('Studio skips an unchanged saved MiFiTo source and includes it after a new edit',async()=>{
 const f=await fixture();
 assert.equal(f.api.ready({editedOnly:true}),true);
 await f.api.save(false);
 assert.equal(f.api.ready({editedOnly:true}),false);
 assert.equal(f.api.ready(),true);
 f.items[0].settings.panelLabel.text='(b) edited after reopening';
 assert.equal(f.api.ready({editedOnly:true}),true);
});
test('MiFiTo bulk save prepares unchanged original bytes without writing and holds its editor lock until release',async()=>{
  const f=await fixture(),before=await (await f.native.getFile()).arrayBuffer(),plan=await f.api.prepare({requireFile:true});
  assert.equal(f.api.state().busy,true);assert.equal(f.api.state().projectSaving,true);assert.deepEqual(await (await f.native.getFile()).arrayBuffer(),before);assert.equal(f.events.some(e=>e.saved),false);
  assert.equal((await plan.write({hold:true})).name,'source.mifito');assert.equal(f.api.state().busy,true);assert.equal(f.api.state().projectSaving,true);assert.ok(await readProject(await f.native.getFile()));
  await assert.rejects(plan.write({hold:true}),/終了/);plan.cancel();plan.cancel();assert.equal(f.api.state().busy,false);assert.equal(f.api.state().projectSaving,false);
});
test('MiFiTo cancellation after preparation leaves file, identity and saved checkpoint unchanged',async()=>{
  const f=await fixture(),before=await (await f.native.getFile()).arrayBuffer(),plan=await f.api.prepare({requireFile:true});plan.cancel();
  assert.deepEqual(await (await f.native.getFile()).arrayBuffer(),before);assert.equal(f.api.state().figureStudioProjectId,projectId);assert.deepEqual(f.api.state().projectFileLink,f.opened.link);assert.equal(f.events.some(e=>e.saved||e.replacement),false);assert.equal(f.api.state().busy,false);await assert.rejects(plan.write(),/終了/);
});
test('MiFiTo rejects edits made between preparing and writing a bulk save',async()=>{
  const f=await fixture(),before=await (await f.native.getFile()).arrayBuffer(),plan=await f.api.prepare({requireFile:true});f.items[0].settings.panelLabel.text='changed after preparation';
  await assert.rejects(plan.write(),/内容が変わりました/);plan.cancel();assert.deepEqual(await (await f.native.getFile()).arrayBuffer(),before);assert.equal(f.events.some(e=>e.saved),false);assert.equal(f.api.state().busy,false);
});
test('the first ordinary MiFiTo save keeps its Studio project identity while establishing a native target',async()=>{
  const f=await fixture({unbound:true}),plan=await f.api.prepare({requireFile:true});await plan.write();const saved=await readProject(await f.copy.getFile());
  assert.equal(saved.ui.figureStudioProjectId,projectId);assert.equal(f.api.state().figureStudioProjectId,projectId);assert.equal(f.api.state().projectHandle,f.copy);
});

test('MiFiTo resolves a Studio work folder on connect and saves directly to the discovered file',async()=>{
  const editKey='book/figure/panel/asset',directory={kind:'directory',name:'work'};
  let result,lookup;
  const f=await fixture({sourceKey:editKey,folderSearch:async options=>{lookup=options;return result;}});
  result={handle:f.native,link:f.opened.link};
  f.api.watch({editKey,getWorkFolder:async()=>directory});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(lookup.directory,directory);assert.equal(lookup.sourceKey,editKey);assert.equal(lookup.name,f.native.name);
  assert.equal(f.api.state().projectHandle,f.native);
  await f.api.save(false);
  assert.equal(f.api.state().projectHandle,f.native);
  assert.equal((await f.copy.getFile()).size,0);
});

test('MiFiTo uses a relocated original and asks before replacing its different contents',async()=>{
  const editKey='book/figure/panel/asset',prompts=[];
  let accept=false;
  const f=await fixture({sourceKey:editKey,chooseAction({kind}){prompts.push(kind);return accept?'overwrite':'cancel';}});
  const additional={...f.items[0],id:'image-000000000000002',name:'another.png',file:new File(['separate image'],'another.png')};
  const relocated=handle(f.native.name,await createProject([...f.items,additional],0,f.ui));
  const before=await (await relocated.getFile()).arrayBuffer();
  f.native.getFile=async()=>{throw new DOMException('The file has moved','NotFoundError');};
  f.native.createWritable=async()=>assert.fail('The stale file must never be opened for writing');
  f.api.watch({editKey,getWorkFolder:async()=>null,findWorkFolderSource:async()=>relocated});
  await new Promise(resolve=>setImmediate(resolve));

  await assert.rejects(f.api.prepare({requireFile:true}),{name:'AbortError'});
  assert.deepEqual(prompts,['changed']);
  assert.deepEqual(await (await relocated.getFile()).arrayBuffer(),before);
  assert.equal(f.api.state().projectHandle,f.native);

  accept=true;
  const plan=await f.api.prepare({requireFile:true});
  assert.deepEqual(prompts,['changed','changed']);
  assert.equal(plan.handle,relocated);
  assert.deepEqual(await (await relocated.getFile()).arrayBuffer(),before);
  await plan.write();
  const saved=await readProject(await relocated.getFile());
  assert.equal(saved.ui.figureStudioProjectId,projectId);
  assert.equal(f.api.state().projectHandle,relocated);
  assert.equal(await f.projectFiles.resolveSource({projectId,sourceKey:editKey}),relocated);
});

test('a Studio filename-only result reaches the MiFiTo confirmation without asking for a file picker',async()=>{
  const editKey='book/figure/panel/asset',prompts=[];
  const f=await fixture({sourceKey:editKey,folderSearch:()=>assert.fail('unexpected fallback scan'),
    chooseAction(info){prompts.push(info.kind);return 'cancel';}});
  const candidate=handle(f.native.name,await createProject(f.items,0,{...f.ui,figureStudioProjectId:'other-source-project-000002'}));
  const original=await (await candidate.getFile()).arrayBuffer();
  f.api.watch({editKey,getWorkFolder:async()=>null,findWorkFolderSource:async()=>({
    name:candidate.name,handle:candidate,verified:false,sameName:true,multiple:false
  })});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.api.state().projectHandle,null);
  await assert.rejects(f.api.prepare({requireFile:true}),{name:'AbortError'});
  assert.deepEqual(prompts,['unverified']);
  assert.deepEqual(await (await candidate.getFile()).arrayBuffer(),original);
});

test('MiFiTo never waits for an unfinished fallback lookup after the remembered file fails',async()=>{
  const editKey='book/figure/panel/asset',prompts=[];
  let complete;
  const pending=new Promise(resolve=>{complete=resolve;});
  const f=await fixture({sourceKey:editKey,chooseAction({kind}){prompts.push(kind);return 'cancel';}});
  const relocated=handle(f.native.name,await f.native.getFile());
  f.native.getFile=async()=>{throw new DOMException('The file has moved','NotFoundError');};
  let signal;
  f.api.watch({editKey,getWorkFolder:async()=>null,findWorkFolderSource:(_file,searchSignal)=>{signal=searchSignal;return pending;}});
  await assert.rejects(f.api.prepare({requireFile:true}),{name:'AbortError'});
  assert.deepEqual(prompts,['missing']);
  assert.equal(signal.aborted,false);
  complete(relocated);
  await new Promise(resolve=>setImmediate(resolve));

  const plan=await f.api.prepare({requireFile:true});
  assert.equal(plan.handle,relocated);
  assert.deepEqual(prompts,['missing']);
  plan.cancel();
});

test('MiFiTo saving leaves an unfinished work folder lookup running without waiting or replacing the saved file',async()=>{
  const editKey='book/figure/panel/asset',directory={kind:'directory',name:'work'};
  let resolveLookup,notifyStarted;
  const pending=new Promise(resolve=>resolveLookup=resolve),started=new Promise(resolve=>notifyStarted=resolve);
  const f=await fixture({sourceKey:editKey,keepRegistry:true,folderSearch:async options=>{notifyStarted(options.signal);return pending;}});
  f.api.watch({editKey,getWorkFolder:()=>directory});
  const signal=await started;
  await f.api.save(false);
  assert.equal(signal.aborted,false);
  assert.equal(f.api.state().projectHandle,f.native);
  resolveLookup({handle:f.copy,link:null});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.api.state().projectHandle,f.native);
});

test('MiFiTo shares the ongoing Studio lookup and adopts its answer after a cancelled save',async()=>{
  const editKey='book/figure/panel/asset';
  let finishSearch,finishChoice,notifyChoice,lookupCalls=0;
  const pendingSearch=new Promise(resolve=>finishSearch=resolve);
  const pendingChoice=new Promise(resolve=>finishChoice=resolve);
  const choosing=new Promise(resolve=>notifyChoice=resolve);
  let signal;
  const f=await fixture({
    sourceKey:editKey,
    folderSearch:()=>assert.fail('A Studio lookup must not start a second editor scan'),
    chooseAction({kind}){assert.equal(kind,'missing');notifyChoice();return pendingChoice;}
  });
  f.api.watch({
    editKey,getWorkFolder:()=>new Promise(()=>{}),
    findWorkFolderSource(details,searchSignal){
      lookupCalls++;
      assert.deepEqual(details,{projectId:projectId,name:f.native.name});
      signal=searchSignal;
      return pendingSearch;
    }
  });
  const saving=f.api.save(false);
  await choosing;
  assert.equal(lookupCalls,1);assert.equal(signal.aborted,false);
  finishSearch(f.native);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.api.state().projectHandle,null);
  finishChoice('cancel');
  await saving;
  assert.equal(f.api.state().projectHandle,f.native);
  assert.deepEqual(f.api.state().projectFileLink,f.opened.link);
  await f.api.save(false);
  assert.equal(f.api.state().projectHandle,f.native);
  assert.equal(lookupCalls,1);
});

test('MiFiTo switches pending targets with the Studio work folder and keeps a completed save target',async()=>{
  const editKey='book/figure/panel/asset',first={kind:'directory',name:'first'},second={kind:'directory',name:'second'};
  let directory=first,folderChanged,firstHandle,secondHandle;
  const f=await fixture({sourceKey:editKey,folderSearch:async options=>({handle:options.directory===first?firstHandle:secondHandle,link:f.opened.link})});
  firstHandle=f.native;
  secondHandle=handle(f.native.name,await f.native.getFile());
  f.api.watch({editKey,getWorkFolder:()=>directory,subscribeWorkFolder:fn=>{folderChanged=fn;return ()=>{};}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.api.state().projectHandle,firstHandle);
  directory=null;folderChanged();
  assert.equal(f.api.state().projectHandle,null);
  directory=second;folderChanged();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.api.state().projectHandle,secondHandle);
  await f.api.save(false);
  directory=first;folderChanged();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.api.state().projectHandle,secondHandle);
});

test('MiFiTo cannot apply a lookup from a previous Studio attachment to a later route',async()=>{
  const firstKey='book/figure/panel/asset',secondKey='book/figure/next/another-asset',directory={kind:'directory',name:'work'};
  let stopCalls=0,resolveLookup,notifyStarted;
  const pending=new Promise(resolve=>resolveLookup=resolve),started=new Promise(resolve=>notifyStarted=resolve);
  const f=await fixture({sourceKey:firstKey,folderSearch:async options=>{
    if(options.sourceKey===firstKey){notifyStarted(options.signal);return pending;}
    assert.equal(options.sourceKey,secondKey);
    return {handle:f.native,link:f.opened.link};
  }});
  f.api.watch({editKey:firstKey,getWorkFolder:()=>directory,subscribeWorkFolder:()=>()=>{stopCalls++;}});
  const previousSignal=await started;
  f.api.route(secondKey);
  f.api.watch({editKey:secondKey,getWorkFolder:()=>directory});
  assert.equal(previousSignal.aborted,true);assert.equal(stopCalls,1);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.api.state().projectHandle,f.native);
  resolveLookup({handle:f.copy,link:null});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.api.state().projectHandle,f.native);
});
