import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultSettings,pyRound} from '../core.js';
import {buildPlan} from '../render.js';
const context={font:'',measureText(text){const size=parseFloat(this.font)||20;return{width:text.length*size*.6,actualBoundingBoxLeft:size*.03,actualBoundingBoxRight:text.length*size*.6,fontBoundingBoxAscent:size*.9,fontBoundingBoxDescent:size*.22,actualBoundingBoxAscent:size*.75,actualBoundingBoxDescent:size*.2}}};
test('individual label backgrounds leave readable padding at every anchor and output scale',()=>{
 for(const anchor of ['top-left','top-center','top-right','bottom-left','bottom-right','outside-top-left','outside-top-right','outside-bottom-center'])for(const scale of [.5,1,2]){
  const settings=defaultSettings(900,650);settings.scaleBar.visible=false;Object.assign(settings.panelLabel,{text:'Si map',subtext:'',parentheses:false,background:true,fontPercent:9,anchor});
  const plan=buildPlan(settings,context,true,scale),box=plan.annotations.find(b=>b.kind==='panelLabel'),run=box.runs[0],size=box.fontSize;
  const left=run.x-size*.03,right=run.x+'Si map'.length*size*.6,top=run.y-size*.75,bottom=run.y+size*.2;
  assert.ok(left>=size*.3-1);assert.ok(box.backgroundRect.width-right>=size*.3-1);assert.ok(top>=size*.22-1);assert.ok(box.backgroundRect.height-bottom>=size*.22-1);
  assert.ok(box.x>=0&&box.y>=0);if(box.band)assert.ok(box.bandHeight>=box.height);
 }
});
test('supplemental and scripted text receive the same background inset and no-background layout stays tight',()=>{
 const settings=defaultSettings(900,650);settings.scaleBar.visible=false;Object.assign(settings.panelLabel,{text:'',subtext:'Si map x^{2}',parentheses:false,background:false});
 const plain=buildPlan(settings,context).annotations.find(b=>b.kind==='panelLabel');assert.equal(plain.backgroundRect,null);assert.equal(plain.pad,0);
 settings.panelLabel.background=true;const box=buildPlan(settings,context).annotations.find(b=>b.kind==='panelLabel');assert.equal(box.width,plain.width+2*Math.max(2,pyRound(box.fontSize*.3)));assert.equal(box.height,plain.height+2*Math.max(2,pyRound(box.fontSize*.22)));assert.ok(box.runs.every(r=>r.x>plain.runs[0].x));
});
