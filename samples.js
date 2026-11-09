import { defaultSettings, validateSettings } from './core.js?v=label-pt-v1914-1';
import { MAP_PALETTES } from './map-colorbar.js?v=79b671978f24';
import { newAnnotation } from './annotations.js?v=57c42d5b1bd8';

// Original, deterministic synthetic images. These illustrate editing, not measurements of real specimens.
export const SAMPLE_GROUPS=[{id:'all',title:'すべて'},{id:'microscopy',title:'顕微鏡画像'},{id:'maps',title:'表面・マップ'},{id:'measure',title:'計測・注釈'}];
export const SAMPLES=[
  {id:'cells',group:'microscopy',title:'蛍光・細胞',description:'細胞の模擬画像。校正、スケールバー、ラベルの基本操作。',pixelSize:.02,unit:'µm',barLength:5},
  {id:'particles',group:'microscopy',title:'SEM・粒子',description:'白黒の粒子像。トリミングや粒径の測定を試せます。',pixelSize:2,unit:'nm',barLength:500},
  {id:'steps',group:'maps',title:'AFM・段差',description:'段差の高さマップ。右側のHeightバーと範囲の設定。',pixelSize:.01,unit:'µm',barLength:2,palette:'gwyddion',min:0,max:12,mapTitle:'Height',mapUnit:'nm'},
  {id:'grains',group:'maps',title:'AFM・粒状表面',description:'凹凸の高さマップ。下側のカラーバーと配色を比較。',pixelSize:.005,unit:'µm',barLength:1,palette:'metropro',min:-5,max:25,mapTitle:'Height',mapUnit:'nm',side:'bottom'},
  {id:'phase',group:'maps',title:'位相マップ',description:'青・白・赤の位相像。Height以外のマップ名・単位の例。',pixelSize:.01,unit:'µm',barLength:2,palette:'blue-red',min:-30,max:30,mapTitle:'Phase',mapUnit:'deg'},
  {id:'measurements',group:'measure',title:'距離・直径・注釈',description:'校正済みの粒子像に距離、円の直径、改行テキストを配置。',pixelSize:2,unit:'nm',barLength:500},
];
export const SAMPLE_WIDTH=900,SAMPLE_HEIGHT=650;
function example(id,index){const sample=SAMPLES.find(s=>s.id===id);if(!sample||!Number.isInteger(index)||index<0||index>2)throw new Error('サンプルの指定が不正です。');return sample;}
function randomGenerator(seed){let state=seed;return()=>{state=(state*1664525+1013904223)>>>0;return state/4294967296;};}
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
function ramp(palette){const stops=MAP_PALETTES.find(p=>p.id===palette).stops.map(s=>({...s,rgb:rgb(s.color)}));return Array.from({length:256},(_,i)=>{const t=i/255,b=stops.find(s=>s.position>=t)||stops.at(-1),a=stops[Math.max(0,stops.indexOf(b)-1)],f=b.position===a.position?0:(t-a.position)/(b.position-a.position);return a.rgb.map((c,j)=>Math.round(c+(b.rgb[j]-c)*f));});}

export function sampleRaster(id,index=0,width=SAMPLE_WIDTH,height=SAMPLE_HEIGHT){
  const spec=example(id,index);
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>SAMPLE_WIDTH||height>SAMPLE_HEIGHT)throw new Error('サンプルの画像サイズが不正です。');
  const data=new Uint8ClampedArray(width*height*4),random=randomGenerator(73452+index*21791),colors=spec.palette?ramp(spec.palette):null;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const u=x/width,v=y/height,noise=(random()-.5)*.025;
    let value=.04+noise;
    if(id==='steps')value=.08+.115*Math.floor((u+.13*Math.sin(v*5)+index*.04)*6)+.025*Math.sin(v*36)+noise;
    if(id==='grains')value=.5+.19*Math.sin(u*31+Math.sin(v*13)+index)+.17*Math.cos(v*27+u*12)+.1*Math.sin(u*61-v*43)+noise;
    if(id==='phase')value=.5+.35*Math.tanh(2.3*Math.sin(u*18+1.7*Math.cos(v*13)+index))+.08*Math.sin(v*41+u*7)+noise;
    const shade=Math.max(0,Math.min(255,Math.round(value*255))),color=colors?colors[shade]:id==='cells'?[10,25+shade,22+shade]:[shade+12,shade+12,shade+12],p=(y*width+x)*4;
    data.set([...color,255],p);
  }
  if(!colors){
    const cell=id==='cells',shapeRandom=randomGenerator(93218+index*21791),features=Array.from({length:cell?36:65},()=>({x:40+shapeRandom()*820,y:45+shapeRandom()*550,r:cell?18+shapeRandom()*30:9+shapeRandom()*27}));
    // The two marked objects remain identifiable in every measurement set.
    if(id==='measurements')features.splice(0,2,{x:300,y:290,r:55},{x:610,y:275,r:42});
    for(const f of features){
      const ry=f.r*(cell?.8:1),sx=width/900,sy=height/650;
      for(let y=Math.max(0,Math.floor((f.y-ry)*sy));y<Math.min(height,(f.y+ry)*sy);y++)for(let x=Math.max(0,Math.floor((f.x-f.r)*sx));x<Math.min(width,(f.x+f.r)*sx);x++){
        const dx=(x/sx-f.x)/f.r,dy=(y/sy-f.y)/ry,d=Math.hypot(dx,dy);if(d>=1)continue;
        const p=(y*width+x)*4,brightness=cell?.24+.48*Math.exp(-d*d*3)+.24*Math.exp(-(((d-.85)/.09)**2)):.35+.5*Math.sqrt(1-d*d)-.1*dx;
        const color=cell?[brightness*120,brightness*225,brightness*166]:Array(3).fill(brightness*255);
        for(let k=0;k<3;k++)data[p+k]=Math.max(data[p+k],color[k]);
      }
    }
  }
  return {width,height,data};
}

export function sampleSettings(id,index=0){
  const spec=example(id,index),s=defaultSettings(SAMPLE_WIDTH,SAMPLE_HEIGHT);
  s.calibration={pixelSize:spec.pixelSize,unit:spec.unit};
  Object.assign(s.scaleBar,{length:spec.barLength,unit:spec.unit,fontPercent:4.5});
  Object.assign(s.panelLabel,{text:String.fromCharCode(97+index),fontPercent:5});
  if(spec.palette)Object.assign(s.mapColorbar,{visible:true,palette:spec.palette,min:spec.min,max:spec.max,title:spec.mapTitle,unit:spec.mapUnit,side:spec.side??'right'});
  if(id==='measurements'){
    const fontPt=3.65;
    const distance=newAnnotation('distance',{x:300,y:290},{x:610,y:275},'sample-distance',fontPt);distance.labelOffset={x:0,y:-35};distance.digits=0;
    const diameter=newAnnotation('diameter',{x:245,y:290},{x:355,y:290},'sample-diameter',fontPt);diameter.labelOffset={x:0,y:180};diameter.digits=0;
    for(const a of [distance,diameter]){a.linePt=.3;a.arrowSizePt=2.5;}
    const text=newAnnotation('text',{x:100,y:95},{x:100,y:95},'sample-text',fontPt);text.text='Synthetic particles\nDistance & diameter';text.align='left';
    s.annotations=[distance,diameter,text];
  }
  return validateSettings(s,SAMPLE_WIDTH,SAMPLE_HEIGHT);
}
