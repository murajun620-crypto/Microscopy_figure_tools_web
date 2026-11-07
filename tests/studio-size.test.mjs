import test from 'node:test';
import assert from 'node:assert/strict';
import {studioSvgSize,validateStudioSize} from '../studio-size.mjs';
import {defaultSettings,validateSettings,serializeProject,parseProject,sessionProject,parseSession,outputMetrics} from '../core.js';
import {renderSvg} from '../render.js';
import {exportImage} from '../export.js';
const plan={width:400,height:280,imageWidth:300,imageHeight:200,crop:{width:300,height:200},coordinateScale:1};
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);

test('width fixes only the image body and adds colorbar/label bands outside it',()=>{
 const size=studioSvgSize(plan,{axis:'width',mm:60});
 assert.deepEqual(size,{widthMm:80,heightMm:56,bodyWidthMm:60,bodyHeightMm:40});
});
test('height fixes the body height and preserves the cropped image aspect ratio',()=>{
 const size=studioSvgSize(plan,{axis:'height',mm:50});
 assert.deepEqual(size,{widthMm:100,heightMm:70,bodyWidthMm:75,bodyHeightMm:50});
});
test('output pixel scale does not change requested physical image-body dimensions',()=>{
 const scaled={width:1600,height:1120,imageWidth:1200,imageHeight:800,crop:{width:300,height:200},coordinateScale:4};
 assert.deepEqual(studioSvgSize(scaled,{axis:'width',mm:60}),studioSvgSize(plan,{axis:'width',mm:60}));
});
test('without a colorbar the cropped width is used rather than outside bands',()=>{
 const noBar={width:600,height:480,imageHeight:400,crop:{width:300,height:200},coordinateScale:2};
 const size=studioSvgSize(noBar,{axis:'height',mm:40});
 assert.deepEqual(size,{widthMm:60,heightMm:48,bodyWidthMm:60,bodyHeightMm:40});
});
test('absent Studio settings leave legacy geometry unchanged',()=>{
 assert.equal(studioSvgSize(null,null),null);assert.equal(studioSvgSize({},undefined),null);
 const settings=defaultSettings(300,200);delete settings.output.studioSize;
 assert.equal(validateSettings(settings,300,200).output.studioSize,null);
 const original=outputMetrics(plan,settings.output);settings.output.studioSize={axis:'width',mm:60};
 assert.deepEqual(outputMetrics(plan,settings.output),original);
});
test('invalid requests and body geometry cannot produce misleading physical dimensions',()=>{
 for(const size of [{axis:'both',mm:40},{axis:'width',mm:0},{axis:'height',mm:1001},{axis:'height',mm:Infinity},{axis:'height',mm:NaN},{axis:'width',mm:'40'},[],false])assert.throws(()=>validateStudioSize(size));
 for(const invalid of [{...plan,imageWidth:0},{...plan,imageHeight:NaN},{...plan,width:200},{...plan,coordinateScale:0},{}])assert.throws(()=>studioSvgSize(invalid,{axis:'width',mm:40}));
 near(studioSvgSize(plan,{axis:'width',mm:.1}).bodyWidthMm,.1);near(studioSvgSize(plan,{axis:'height',mm:1000}).bodyHeightMm,1000);
});
test('Studio size survives image settings JSON and per-image session serialization',()=>{
 const a={id:'a',name:'a.png',width:300,height:200,enabled:true,settings:defaultSettings(300,200)},b={id:'b',name:'b.png',width:300,height:200,enabled:true,settings:defaultSettings(300,200)};
 a.settings.output.studioSize={axis:'width',mm:60};b.settings.output.studioSize={axis:'height',mm:25};
 assert.deepEqual(parseProject(serializeProject(a.settings,a),a).output.studioSize,a.settings.output.studioSize);
 const restored=parseSession(sessionProject([a,b],a.settings.output),[a,b]);
 assert.deepEqual(restored.map(row=>row.settings.output.studioSize),[a.settings.output.studioSize,b.settings.output.studioSize]);
});

test('extreme image aspect ratios and outer bands cannot exceed Studio physical limits',()=>{
 const tall={width:100,height:3000,imageWidth:100,imageHeight:3000,coordinateScale:1};
 assert.throws(()=>studioSvgSize(tall,{axis:'width',mm:100}),/2000/);
 const wide={width:3000,height:100,imageWidth:3000,imageHeight:100,coordinateScale:1};
 assert.throws(()=>studioSvgSize(wide,{axis:'height',mm:100}),/2000/);
 assert.throws(()=>studioSvgSize({...plan,width:10000},{axis:'width',mm:100}),/2000/);
 near(studioSvgSize({...tall,height:2000,imageHeight:2000},{axis:'width',mm:100}).heightMm,2000);
});
test('only explicit Studio SVG export emits body dimensions and ordinary SVG stays unchanged',async()=>{
 const previousDocument=globalThis.document;
 const context={save(){},restore(){},scale(){},clearRect(){},drawImage(){}};
 globalThis.document={createElement(tag){assert.equal(tag,'canvas');return {width:0,height:0,getContext:()=>context,toDataURL:()=> 'data:image/png;base64,AA=='};}};
 try{
  const settings=defaultSettings(300,200);settings.scaleBar.visible=false;settings.panelLabel.visible=false;settings.output.studioSize={axis:'width',mm:60};
  const ordinary=renderSvg({},settings).markup;
  assert.match(ordinary,/width="4cm"/);assert.doesNotMatch(ordinary,/data-mifito-body/);
  const studio=renderSvg({},settings,{forStudio:true});
  assert.match(studio.markup,/width="60mm" height="40mm"/);assert.match(studio.markup,/data-mifito-body-width-mm="60" data-mifito-body-height-mm="40"/);assert.equal(studio.metrics.widthCm,6);
  const exported=await exportImage({},settings,'svg',{forStudio:true});assert.equal(await exported.text(),studio.markup);
  settings.output.studioSize=null;const legacy=renderSvg({},settings,{forStudio:true}).markup;assert.match(legacy,/width="4cm"/);assert.doesNotMatch(legacy,/data-mifito-body/);
 }finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
});
