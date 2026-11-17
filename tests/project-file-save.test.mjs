import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {defaultSettings} from '../core.js';
import {createProject,readProject} from '../project.js';
import {readMifitoIdentity} from '../mifito-sync.mjs';
import {workspaceSnapshot} from '../work-state.js';
import {createProjectFileLinks} from '../project-file-links.mjs';

const source=await readFile(new URL('../app.js',import.meta.url),'utf8'),start=source.indexOf('function saveProject(saveAs)'),end=source.indexOf('// IndexedDB preserves',start),saver=source.slice(start,end);
const projectId='test-source-project-000001';
function handle(name,blob){let bytes=blob;return {name,kind:'file',fail:false,async getFile(){return new File([bytes],name);},async queryPermission(){return 'granted';},async isSameEntry(other){return this===other;},async createWritable(){let pending;const h=this;return {async write(blob){if(h.fail)throw Error('disk full');pending=blob;},async close(){bytes=pending;},async abort(){}};}};}
async function fixture({fail=false,cancel=false}={}){
  const items=[{id:'image-000000000000001',name:'image.png',file:new File(['independent original bytes'],'image.png',{type:'image/png',lastModified:12}),width:20,height:10,enabled:true,settings:defaultSettings(20,10)}];
  const ui={figureStudioProjectId:projectId,formats:['png'],dpi:600,includeSettings:true,colorMode:'simple'};
  const native=handle('source.mifito',await createProject(items,0,ui)),copy=handle('copy.mifito',new Blob());native.fail=copy.fail=fail;
  const records=new Map(),store={async get(key){return records.get(key);},async list(key){return [...records.values()].filter(r=>r.project===key);},async put(record){records.set(record.token,record);}};
  const projectFiles=createProjectFileLinks({app:'mifito',store,host:{async showSaveFilePicker(){if(cancel)throw new DOMException('cancelled','AbortError');return copy;}},choose:()=>assert.fail('Unexpected confirmation'),identify:readMifitoIdentity});
  const opened=await projectFiles.opened({file:await native.getFile(),projectId,handle:native});
  const events=[],env={action:async fn=>{try{await fn();}catch(e){events.push({error:e.message});}},closeProjectSaveMenu(){},projectHandle:native,projectName:'source.mifito',projectFileLink:opened.link,current:items[0],items,projectFiles,figureStudioProjectId:projectId,saveDirectory:null,download(){assert.fail('Unexpected download');},figureStudioDirectSender:null,workspaceSnapshot,notify:message=>events.push({message}),projectSaving:false,scheduleWorkState(){},createProject,prepareFigureStudioProjectReplacement:id=>events.push({replacement:id}),workSaveState:{markSaved:snapshot=>events.push({saved:snapshot})}};
  const keys=Object.keys(env),api=Function(...keys,`function projectUI(){return {...${JSON.stringify(ui)},figureStudioProjectId};}\n${saver}\nreturn {save:saveProject,state:()=>({projectHandle,projectName,projectFileLink,figureStudioProjectId,projectSaving}),expected:()=>workspaceSnapshot(items,projectUI())};`)(...keys.map(key=>env[key]));
  return {api,native,copy,opened,events,records,items,projectFiles,ui};
}
test('actual MiFiTo save keeps independent source image bytes and omits local target metadata from disk',async()=>{
  const f=await fixture();f.items[0].settings.panelLabel.text='(a) updated';await f.api.save(false);const state=f.api.state(),saved=await readProject(await f.native.getFile());
  assert.equal(saved.ui.figureStudioProjectId,projectId);assert.equal(saved.ui.sourceFileLink,undefined);assert.equal(saved.images[0].settings.panelLabel.text,'(a) updated');assert.equal(await saved.images[0].blob.text(),'independent original bytes');assert.equal(state.projectHandle,f.native);assert.equal(state.projectSaving,false);assert.notEqual(state.projectFileLink.fingerprint,f.opened.link.fingerprint);assert.equal(state.projectFileLink.token,f.opened.link.token);assert.equal(f.events.find(e=>e.saved)?.saved,f.api.expected());
});
test('actual MiFiTo Save As assigns a new identity after successful write and retains the old source mapping',async()=>{
  const f=await fixture(),before=await (await f.native.getFile()).arrayBuffer();await f.api.save(true);const state=f.api.state(),saved=await readProject(await f.copy.getFile());
  assert.notEqual(saved.ui.figureStudioProjectId,projectId);assert.equal(state.figureStudioProjectId,saved.ui.figureStudioProjectId);assert.equal(state.projectName,'copy.mifito');assert.equal(state.projectHandle,f.copy);assert.equal(f.records.size,2);assert.deepEqual(await (await f.native.getFile()).arrayBuffer(),before);assert.equal(f.events.find(e=>e.saved)?.saved,f.api.expected());
});
test('actual MiFiTo failed save rolls back target, project identity, saved checkpoint and portable version',async()=>{
  for(const saveAs of [false,true]){const f=await fixture({fail:true}),before=await (await f.native.getFile()).arrayBuffer();await f.api.save(saveAs);const state=f.api.state();
    assert.equal(state.projectHandle,f.native);assert.equal(state.figureStudioProjectId,projectId);assert.deepEqual(state.projectFileLink,f.opened.link);assert.equal(state.projectSaving,false);assert.deepEqual(await (await f.native.getFile()).arrayBuffer(),before);assert.equal(f.records.size,1);assert.equal(f.events.some(e=>e.saved||e.replacement),false);assert.ok(f.events.some(e=>e.error?.includes('disk full')));
  }
});
test('cancelling MiFiTo Save As preserves the original writable binding',async()=>{
  const f=await fixture({cancel:true}),before=await (await f.native.getFile()).arrayBuffer();await f.api.save(true);const state=f.api.state();
  assert.equal(state.projectHandle,f.native);assert.equal(state.figureStudioProjectId,projectId);assert.deepEqual(state.projectFileLink,f.opened.link);assert.equal(f.events.some(e=>e.saved||e.replacement),false);assert.deepEqual(await (await f.native.getFile()).arrayBuffer(),before);assert.equal(f.records.size,1);
});
test('MiFiTo embedded snapshots reopen with a safe file token while old projects remain readable',async()=>{
  const f=await fixture(),snapshot=await createProject(f.items,0,{...f.ui,sourceFileLink:f.opened.link}),saved=await readProject(snapshot);
  assert.deepEqual(saved.ui.sourceFileLink,f.opened.link);assert.equal((await readProject(await f.native.getFile())).ui.sourceFileLink,undefined);
  const target=await f.projectFiles.opened({file:new File([snapshot],f.native.name),projectId,embedded:true,link:saved.ui.sourceFileLink});assert.equal(target.handle,f.native);
});
