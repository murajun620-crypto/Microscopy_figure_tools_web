import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultSettings,validateSettings,serializeProject,parseProject,outputMetrics,pyRound} from '../core.js';
import {buildPlan,renderSvg} from '../render.js';
import {studioSvgSize} from '../studio-size.mjs';
import {createProject,readProject} from '../project.js';
const context={font:'',measureText(text){const n=parseFloat(this.font)||20;return {width:text.length*n*.6,actualBoundingBoxLeft:0,actualBoundingBoxRight:text.length*n*.6,actualBoundingBoxAscent:n*.75,actualBoundingBoxDescent:n*.2,fontBoundingBoxAscent:n*.9,fontBoundingBoxDescent:n*.22};},save(){},restore(){},scale(){},clearRect(){},drawImage(){}};
const labelBox=plan=>plan.annotations.find(b=>b.kind==='panelLabel');
const near=(actual,expected,tolerance=.011)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);
function fixture(w,h){const s=defaultSettings(w,h);s.scaleBar.visible=false;Object.assign(s.panelLabel,{text:'XZ image',parentheses:false});return s;}

test('new labels default to 9 pt while percent-only projects retain their appearance',()=>{
 const s=fixture(1200,108);assert.equal(s.panelLabel.fontUnit,'pt');assert.equal(s.panelLabel.fontPt,9);
 delete s.panelLabel.fontUnit;delete s.panelLabel.fontPt;s.panelLabel.fontPercent=20;
 const legacy=validateSettings(s,1200,108);assert.equal(legacy.panelLabel.fontUnit,'percent');
 near(labelBox(buildPlan(legacy,context)).fontSize,pyRound(108*.2));
 for(const value of ['pixels',null,10]){s.panelLabel.fontUnit=value;if(value===null)continue;assert.throws(()=>validateSettings(s,1200,108),/単位/);}
 s.panelLabel.fontUnit='pt';for(const value of [0,-1,201,NaN]){s.panelLabel.fontPt=value;assert.throws(()=>validateSettings(s,1200,108),/サイズ/);}
});

test('pt labels have the requested physical size across aspect ratios, scales and inside/outside positions',()=>{
 for(const [w,h]of [[1200,108],[108,1200],[900,650]])for(const scale of [1,2,4])for(const axis of ['width','height'])for(const anchor of ['top-left','outside-top-left','outside-bottom-right']){
  const s=fixture(w,h);s.output.sizeAxis=axis;s.output.sizeCm=8;s.panelLabel.anchor=anchor;s.panelLabel.background=true;
  const plan=buildPlan(s,context,true,scale),m=outputMetrics(plan,s.output),box=labelBox(plan);
  near(box.fontSize*m.widthCm/2.54*72/plan.width,9);
  assert.ok(box.runs.every(run=>run.size>0));assert.ok(plan.height>=h*scale);
 }
});

test('Studio pt labels use the image body size including extremely thin crops and independent save sizes',()=>{
 for(const [w,h]of [[1200,108],[108,1200]])for(const axis of ['width','height'])for(const anchor of ['top-left','outside-top-left']){
  const s=fixture(w,h);s.output.sizeCm=12;s.output.studioSize={axis,mm:40};s.panelLabel.anchor=anchor;s.panelLabel.fontPt=7.5;
  const plan=buildPlan(s,context,true,2,true,{forStudio:true}),size=studioSvgSize(plan,s.output.studioSize);
  near(labelBox(plan).fontSize*size.widthMm/plan.width*72/25.4,7.5);
 }
});

test('pt unit and fractional size survive settings and full project round trips',async()=>{
 const settings=fixture(1200,108);settings.panelLabel.fontPt=8.3;
 const image={id:crypto.randomUUID(),name:'strip.png',width:1200,height:108,enabled:true,settings,file:new File(['test'],'strip.png',{type:'image/png'})};
 const restored=parseProject(serializeProject(settings,image),image);assert.equal(restored.panelLabel.fontUnit,'pt');assert.equal(restored.panelLabel.fontPt,8.3);
 const project=await readProject(await createProject([image],0,{formats:['png'],dpi:600,includeSettings:true,colorMode:'simple'}));
 assert.equal(project.images[0].settings.panelLabel.fontUnit,'pt');assert.equal(project.images[0].settings.panelLabel.fontPt,8.3);
});

test('ordinary and Studio SVGs produce the requested physical pt size using their own dimensions',()=>{
 const previous=globalThis.document;globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>context,toDataURL:()=> 'data:image/png;base64,AA=='})};
 try{
  const s=fixture(1200,108);s.panelLabel.anchor='outside-top-left';s.output.studioSize={axis:'width',mm:60};
  for(const forStudio of [false,true]){
   const result=renderSvg({},s,{forStudio}),size=Number(result.markup.match(/<text[^>]*font-size="([^"]+)"/)[1]),width=Number(result.markup.match(/viewBox="0 0 ([^ ]+)/)[1]);
   near(size*result.metrics.widthCm/width/2.54*72,9);
  }
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

test('an outside label larger than the entire requested output height has a clear error',()=>{
 const s=fixture(900,650);s.output.sizeAxis='height';s.output.sizeCm=.1;s.panelLabel.anchor='outside-top-left';
 assert.throws(()=>buildPlan(s,context,true),/保存サイズ/);
});
