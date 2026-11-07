import test from 'node:test';
import assert from 'node:assert/strict';
import {ImageSettingsTable} from '../image-table.js';

class Input extends EventTarget {
  constructor(){super();this.tagName='INPUT';this.dataset={};this.value='';this.checked=false;this.nativeChangeOnBlur=false;this.blurCount=0;}
  setAttribute(){}
  checkValidity(){return true;}
  blur(){this.blurCount++;if(this.nativeChangeOnBlur)this.dispatchEvent(new Event('change'));}
}
function setup({nativeChange=false,busy=false}={}){
  globalThis.document={createElement:()=>new Input()};
  const row={item:{id:'image-1',name:'sample.png',settings:{panelLabel:{text:'original'}}},fields:new Map()};
  const edits=[],table=Object.create(ImageSettingsTable.prototype);
  let release;
  const complete=new Promise(resolve=>{release=resolve;});
  table.api={busy:()=>busy,async edit(item,path,value){edits.push({path,value});await complete;item.settings.panelLabel.text=value;},notify(message){assert.fail(message);}};
  table.rows=new Map([['image-1',row]]);table.editing=false;table.sync=()=>{};
  const input=table.field(row,'panelLabel.text','ラベル文字列','text');input.value='original';input.nativeChangeOnBlur=nativeChange;
  const enter=()=>{const event=new Event('keydown',{cancelable:true});Object.defineProperty(event,'key',{value:'Enter'});input.dispatchEvent(event);assert.equal(event.defaultPrevented,true);};
  return {input,table,row,edits,enter,async finish(){release();await new Promise(resolve=>setImmediate(resolve));}};
}

test('Enter commits restored programmatic table text when blur emits no native change',async()=>{
  const state=setup();state.input.value='UNSENT-MIFITO';
  assert.equal(state.table.pending,true);state.enter();
  assert.equal(state.input.blurCount,1);assert.deepEqual(state.edits,[{path:'panelLabel.text',value:'UNSENT-MIFITO'}]);
  await state.finish();assert.equal(state.row.item.settings.panelLabel.text,'UNSENT-MIFITO');assert.equal(state.table.pending,false);
});

test('native blur change is not committed a second time while its edit is pending',async()=>{
  const state=setup({nativeChange:true});state.input.value='typed label';state.enter();
  assert.equal(state.table.editing,true);assert.equal(state.edits.length,1);
  await state.finish();assert.equal(state.edits.length,1);assert.equal(state.table.pending,false);
});

test('Enter on an unchanged restored field creates no edit',async()=>{
  const state=setup();state.enter();assert.equal(state.input.blurCount,1);assert.equal(state.edits.length,0);
  await state.finish();assert.equal(state.table.pending,false);
});

test('Enter does not commit a pending restored value while the app is busy',async()=>{
  const state=setup({busy:true});state.input.value='pending';state.enter();assert.equal(state.edits.length,0);
  await state.finish();assert.equal(state.table.pending,true);
});
