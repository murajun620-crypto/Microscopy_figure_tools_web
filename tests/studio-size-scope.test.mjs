import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {copy,defaultSettings,History,validateSettings} from '../core.js';
import {SettingsTransactions} from '../crop-workflow.js';
import {buildPlan} from '../render.js';

const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const begin=source.indexOf('function syncStudioSizeControls('),end=source.indexOf('function syncOpacityFields(',begin);
assert.ok(begin>=0&&end>begin);
const implementation=source.slice(begin,end);

function environment({plan=buildPlan}={}){
 const controls=new Map(),messages=[];
 for(const id of ['studioSizeEnabled','studioSizeAxis','studioSizeMm','studioSizeAll','studioSizeScope']){
  const markup=html.match(new RegExp(`<[^>]+id="${id}"[^>]*>`))?.[0]||'',listeners=new Map();
  controls.set(id,{checked:/\bchecked\b/.test(markup),value:id==='studioSizeAxis'?'height':id==='studioSizeMm'?'40':'',disabled:true,valid:true,
   get valueAsNumber(){return Number(this.value);},checkValidity(){return this.valid&&this.value!==''&&Number.isFinite(this.valueAsNumber)&&this.valueAsNumber>=.1&&this.valueAsNumber<=1000;},
   addEventListener(type,fn){listeners.set(type,fn);},change(){listeners.get('change')?.();},blur(){this.onBlur?.();},enter(){listeners.get('keydown')?.({key:'Enter',preventDefault(){},currentTarget:this});}});
 }
 const items=['one','two','three'].map(name=>{const settings=defaultSettings(300,200);settings.panelLabel.visible=false;settings.scaleBar.visible=false;return {id:name,name:`${name}.png`,width:300,height:200,settings,history:new History(settings),cropError:'existing crop warning'};});
 const transactions=new SettingsTransactions(),$=id=>controls.get(id);
 const api=Function('$','items','copy','validateSettings','buildPlan','context','settingsTransactions','notify','render','scheduleWorkState',
  `let current=items[0],busy=false;function syncInputs(){syncStudioSizeControls(true);}${implementation}return {apply:applyStudioSize,sync:syncStudioSizeControls,current:()=>current,setCurrent(value){current=value;},setBusy(value){busy=value;}};`
 )($,items,copy,validateSettings,plan,{},transactions,(...args)=>messages.push(args),()=>{},()=>{});
 api.sync(true);
 return {...api,$,items,transactions,messages,sizes:()=>items.map(item=>item.settings.output.studioSize)};
}

test('checked default scope applies a size edit to every image without sharing mutable settings',()=>{
 const e=environment();assert.equal(e.$('studioSizeAll').checked,true);assert.equal(e.$('studioSizeEnabled').checked,true);assert.equal(e.$('studioSizeAxis').value,'height');assert.equal(Number(e.$('studioSizeMm').value),40);
 e.$('studioSizeMm').value='55';e.$('studioSizeMm').change();
 assert.deepEqual(e.sizes(),Array.from({length:3},()=>({axis:'height',mm:55})));
 assert.match(e.$('studioSizeScope').textContent,/全3枚/);
 e.items[0].settings.output.studioSize.mm=99;assert.equal(e.items[1].settings.output.studioSize.mm,55);
});

test('turning all-images off changes only the current image on later edits',()=>{
 const e=environment();e.$('studioSizeAll').checked=false;e.$('studioSizeAll').change();
 assert.deepEqual(e.items.map(item=>item.history.index),[0,0,0]);
 e.setCurrent(e.items[1]);e.sync(true);e.$('studioSizeAxis').value='width';e.$('studioSizeMm').value='62';e.$('studioSizeAxis').change();
 assert.deepEqual(e.sizes(),[{axis:'height',mm:40},{axis:'width',mm:62},{axis:'height',mm:40}]);
 assert.match(e.$('studioSizeScope').textContent,/two\.png/);assert.deepEqual(e.items.map(item=>item.history.index),[0,1,0]);
});

test('one Undo and Redo covers the whole batch, including an unchanged current image',()=>{
 const e=environment();
 for(const [index,mm]of [[1,28],[2,70]]){e.items[index].settings.output.studioSize={axis:'width',mm};e.items[index].history=new History(e.items[index].settings);}
 const before=copy(e.sizes());
 e.$('studioSizeAll').change();assert.deepEqual(e.sizes(),Array.from({length:3},()=>({axis:'height',mm:40})));
 assert.equal(e.transactions.step(e.current(),false,e.items),true);assert.deepEqual(e.sizes(),before);
 assert.equal(e.transactions.step(e.current(),true,e.items),true);assert.deepEqual(e.sizes(),Array.from({length:3},()=>({axis:'height',mm:40})));
 assert.ok(e.items.every(item=>item.cropError==='existing crop warning'));
});

test('disabling size with all-images selected clears every size in one undoable action',()=>{
 const e=environment();e.$('studioSizeEnabled').checked=false;e.$('studioSizeEnabled').change();
 assert.deepEqual(e.sizes(),[null,null,null]);assert.equal(e.$('studioSizeAxis').disabled,true);assert.equal(e.$('studioSizeMm').disabled,true);
 assert.equal(e.transactions.step(e.current(),false,e.items),true);assert.deepEqual(e.sizes(),Array.from({length:3},()=>({axis:'height',mm:40})));
});

test('invalid input and a later image validation failure never partially update the batch',()=>{
 for(const value of ['', '0', '1001', 'NaN']){
  const e=environment(),before=copy(e.items.map(item=>item.settings));e.$('studioSizeMm').value=value;e.apply();
  assert.deepEqual(e.items.map(item=>item.settings),before);assert.deepEqual(e.items.map(item=>item.history.index),[0,0,0]);assert.equal(e.messages.at(-1)[1],true);
 }
 let plans=0;const e=environment({plan(settings,context){if(++plans===2)throw Error('second image cannot render');return buildPlan(settings,context);}}),before=copy(e.sizes());
 e.$('studioSizeMm').value='65';e.apply();assert.equal(plans,2);assert.deepEqual(e.sizes(),before);assert.deepEqual(e.items.map(item=>item.history.index),[0,0,0]);assert.deepEqual(e.messages.at(-1),['second image cannot render',true]);
});

test('busy or empty editors cannot edit sizes and retain the default controls for the next image',()=>{
 const e=environment();e.setBusy(true);e.sync();e.$('studioSizeMm').value='75';e.apply();assert.equal(e.$('studioSizeAll').disabled,true);assert.deepEqual(e.items.map(item=>item.history.index),[0,0,0]);
 e.setBusy(false);e.setCurrent(null);e.sync();assert.equal(e.$('studioSizeEnabled').checked,true);assert.equal(e.$('studioSizeAxis').value,'height');assert.equal(Number(e.$('studioSizeMm').value),40);assert.equal(e.$('studioSizeAll').disabled,true);e.apply();assert.deepEqual(e.items.map(item=>item.history.index),[0,0,0]);
});

test('Enter commits restored numeric text even when blur emits no native change',()=>{
 const e=environment();e.$('studioSizeMm').value='45';e.$('studioSizeMm').enter();assert.deepEqual(e.sizes(),Array.from({length:3},()=>({axis:'height',mm:45})));assert.deepEqual(e.items.map(item=>item.history.index),[1,1,1]);
});
test('Enter does not repeat an edit already committed by native blur change',()=>{
 const e=environment(),input=e.$('studioSizeMm');input.value='45';input.onBlur=()=>input.change();input.enter();assert.equal(e.messages.length,1);assert.deepEqual(e.items.map(item=>item.history.index),[1,1,1]);
});
