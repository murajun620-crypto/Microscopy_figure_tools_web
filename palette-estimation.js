import { MAP_PALETTES } from './map-colorbar.js?v=3747ad9b9fe8';

// Compare the source image with the RGB ramps in perceptual Lab space.
// Values/units and gradient direction cannot be recovered from image colors.
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const lab=([r,g,b])=>{
  [r,g,b]=[r,g,b].map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
  const f=v=>v>.008856?Math.cbrt(v):7.787*v+16/116;
  const x=f((.4124564*r+.3575761*g+.1804375*b)/.95047),y=f(.2126729*r+.7151522*g+.072175*b),z=f((.0193339*r+.119192*g+.9503041*b)/1.08883);
  return [116*y-16,500*(x-y),200*(y-z)];
};
const norm=v=>v.reduce((n,x)=>n+x*x,0);
function ramp(stops){
  const points=[];
  for(let i=1;i<stops.length;i++){
    const a=stops[i-1],b=stops[i],ca=rgb(a.color),cb=rgb(b.color),steps=Math.max(1,Math.ceil((b.position-a.position)*64));
    for(let j=i===1?0:1;j<=steps;j++){const t=j/steps;points.push({t:a.position+(b.position-a.position)*t,color:lab(ca.map((c,k)=>c+(cb[k]-c)*t))});}
  }
  return points;
}
function nearest(color,points){
  let best={distance:Infinity,t:0};
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],v=b.color.map((x,k)=>x-a.color[k]),w=color.map((x,k)=>x-a.color[k]);
    const t=Math.max(0,Math.min(1,w.reduce((n,x,k)=>n+x*v[k],0)/(norm(v)||1)));
    const distance=norm(w.map((x,k)=>x-v[k]*t));
    if(distance<best.distance)best={distance,t:a.t+(b.t-a.t)*t};
  }
  return best;
}
const quantile=(points,q)=>{let n=0,total=points.reduce((n,p)=>n+p.weight,0);for(const p of points){n+=p.weight;if(n>=total*q)return p.t;}return points.at(-1).t;};
export function estimateMapPalette(pixels,palettes=MAP_PALETTES){
  if(!pixels||!pixels.length||pixels.length%4)throw new Error('推定する画像データが不正です。');
  const bins=new Map();
  for(let i=0;i<pixels.length;i+=4){
    const c=Array.from(pixels.slice(i,i+3));if(pixels[i+3]<240||Math.max(...c)<6||Math.min(...c)>249)continue;
    const key=(c[0]>>3)*1024+(c[1]>>3)*32+(c[2]>>3),bin=bins.get(key)??{count:0,sum:[0,0,0]};
    bin.count++;c.forEach((v,k)=>bin.sum[k]+=v);bins.set(key,bin);
  }
  let colors=[...bins.values()].filter(b=>b.count>=2).map(b=>{const color=b.sum.map(v=>v/b.count);return {color:lab(color),weight:Math.sqrt(b.count),colored:Math.max(...color)-Math.min(...color)>16};});
  if(colors.length<12)return {confident:false,reason:'色の種類が少なく、配色を判別できません。'};
  const total=colors.reduce((n,c)=>n+c.weight,0),colored=colors.reduce((n,c)=>n+(c.colored?c.weight:0),0);
  if(colored/total>.2)colors=colors.filter(c=>c.colored);
  if(colors.length<12)return {confident:false,reason:'色の種類が少なく、配色を判別できません。'};
  const candidates=palettes.map(p=>{
    const points=ramp(p.stops),matches=colors.map(c=>({...nearest(c.color,points),weight:c.weight}));
    const sorted=[...matches].sort((a,b)=>a.distance-b.distance),limit=matches.reduce((n,p)=>n+p.weight,0)*.9;
    let error=0,weight=0;for(const p of sorted){const w=Math.min(p.weight,limit-weight);if(w<=0)break;error+=p.distance*w;weight+=w;}
    const positions=[...matches].sort((a,b)=>a.t-b.t),coverage=quantile(positions,.9)-quantile(positions,.1);
    const matched=matches.reduce((n,p)=>n+(p.distance<64?p.weight:0),0)/matches.reduce((n,p)=>n+p.weight,0);
    return {palette:p.id,name:p.name,error:Math.sqrt(error/weight),coverage,matched};
  }).sort((a,b)=>a.error-b.error);
  const best=candidates[0],runner=candidates[1],distinct=!runner||runner.error-best.error>.8;
  const confident=best.error<5&&best.matched>.85&&best.coverage>.3&&distinct;
  return {...best,confident,reason:confident?'':best.coverage<=.3?'画像に含まれる色の範囲が狭く、配色を確定できません。':!distinct?'似た配色が複数あり、判別できません。':'標準配色に十分一致しません。配色を選ぶか、バー画像を読み込んでください。'};
}

export function estimateSourcePalette(source,crop,palettes=MAP_PALETTES){
  const canvas=document.createElement('canvas'),scale=Math.min(1,192/Math.max(crop.width,crop.height));
  canvas.width=Math.max(1,Math.round(crop.width*scale));canvas.height=Math.max(1,Math.round(crop.height*scale));
  try{const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(source,crop.x,crop.y,crop.width,crop.height,0,0,canvas.width,canvas.height);return estimateMapPalette(c.getImageData(0,0,canvas.width,canvas.height).data,palettes);}
  finally{canvas.width=canvas.height=0;}
}
