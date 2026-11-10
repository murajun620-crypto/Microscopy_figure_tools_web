import {richTextLayout} from './rich-text.mjs?v=5a795d503d07';
export const ANNOTATION_NAMES={distance:'2点間距離',diameter:'円の直径',text:'テキスト',segment:'線',arrow:'矢印'};
export const ANNOTATION_FONTS=['Arial','Helvetica','Times New Roman','Georgia','Yu Gothic','Meiryo','Courier New','sans-serif','serif','monospace'];
const units={nm:.001,'µm':1,mm:1000};
const finite=(n,min,max)=>{if(!Number.isFinite(n)||n<min||n>max)throw new Error('注釈の数値が範囲外です。');return n;};
const color=s=>{if(typeof s!=='string'||!/^#[a-f\d]{6}$/i.test(s))throw new Error('注釈の色が不正です。');return s;};
const bool=v=>{if(typeof v!=='boolean')throw new Error('注釈の表示設定が不正です。');return v;};
const choice=(v,values)=>{if(!values.includes(v))throw new Error('注釈の設定が不正です。');return v;};
export function defaultAnnotationFontPt(settings,plan){
  const axis=settings.output.sizeAxis==='width'?plan.width:plan.height;
  return plan.barFontSize*(settings.output.sizeCm/2.54*72)/axis;
}
export function newAnnotation(type,a,b=a,id=crypto.randomUUID(),fontPt=9){
  return {id,type,points:[{...a},{...b}],text:type==='text'?'テキスト':'',visible:true,locked:false,color:'#ffffff',opacity:1,fontPt,fontFamily:'Arial',textMode:'auto',bold:false,italic:false,underline:false,rotation:0,align:type==='text'?'left':'center',linePt:.5,lineStyle:'-',arrowStyle:type==='distance'||type==='diameter'?'<->':'->',arrowSizePt:5,unit:'auto',digits:3,labelOffset:{x:0,y:0},background:false,backgroundColor:'#000000',backgroundOpacity:.65};
}
export function validateAnnotations(value=[],width,height){
  if(!Array.isArray(value)||value.length>200)throw new Error('注釈は200個以内にしてください。');
  const ids=new Set();
  return value.map(raw=>{
    if(!raw||typeof raw.id!=='string'||!raw.id||raw.id.length>128||ids.has(raw.id)||!Object.hasOwn(ANNOTATION_NAMES,raw.type))throw new Error('注釈の種類またはIDが不正です。');ids.add(raw.id);
    if(!Array.isArray(raw.points)||raw.points.length!==2)throw new Error('注釈の端点が不正です。');
    const point=p=>({x:finite(p?.x,0,width),y:finite(p?.y,0,height)});
    const a={...newAnnotation(raw.type,{x:0,y:0},{x:0,y:0},raw.id),...raw};
    if(typeof a.text!=='string'||a.text.length>1000)throw new Error('注釈の文字は1000文字以内にしてください。');
    return {id:a.id,type:a.type,points:a.points.map(point),text:a.text,textMode:choice(a.textMode??'auto',['auto','tex','plain']),visible:bool(a.visible),locked:bool(a.locked),color:color(a.color),opacity:finite(a.opacity,0,1),fontPt:finite(a.fontPt,.000001,10000),fontFamily:choice(a.fontFamily,ANNOTATION_FONTS),bold:bool(a.bold),italic:bool(a.italic),underline:bool(a.underline),rotation:finite(a.rotation,-360,360),align:choice(a.align,['left','center','right','justify']),linePt:finite(a.linePt,.05,20),lineStyle:choice(a.lineStyle,['-','--','-.',':']),arrowStyle:choice(a.arrowStyle,['->','<->','-|>','o-','o-o']),arrowSizePt:finite(a.arrowSizePt,1,40),unit:choice(a.unit,['auto','nm','µm','mm']),digits:finite(a.digits,0,6),labelOffset:{x:finite(a.labelOffset?.x,-width,width),y:finite(a.labelOffset?.y,-height,height)},background:bool(a.background),backgroundColor:color(a.backgroundColor),backgroundOpacity:finite(a.backgroundOpacity,0,1)};
  });
}
export function annotationValue(a,calibration){
  if(!['distance','diameter'].includes(a.type))return a.text;
  if(!calibration)return '未校正';
  const unit=a.unit==='auto'?calibration.unit:a.unit;
  const value=Math.hypot(a.points[1].x-a.points[0].x,a.points[1].y-a.points[0].y)*calibration.pixelSize*units[calibration.unit]/units[unit];
  const digits=Math.trunc(a.digits),formatted=Number(value.toFixed(digits)).toLocaleString('en-US',{useGrouping:false,maximumFractionDigits:digits});
  return `${a.text?a.text+' ':''}${a.type==='diameter'?'⌀ ':''}${formatted} ${unit}`;
}
export function translateAnnotations(annotations,ids,dx,dy,width,height){
  const selected=annotations.filter(a=>ids.has(a.id)&&!a.locked);if(!selected.length)return structuredClone(annotations);
  const points=selected.flatMap(a=>a.points);
  dx=Math.max(-Math.min(...points.map(p=>p.x)),Math.min(dx,width-Math.max(...points.map(p=>p.x))));
  dy=Math.max(-Math.min(...points.map(p=>p.y)),Math.min(dy,height-Math.max(...points.map(p=>p.y))));
  return annotations.map(a=>ids.has(a.id)&&!a.locked?{...structuredClone(a),points:a.points.map(p=>({x:p.x+dx,y:p.y+dy}))}:structuredClone(a));
}
export function measurementLayout(settings,plan,context){
  const scale=plan.coordinateScale??1,c=settings.crop,axis=settings.output.sizeAxis==='width'?plan.width:plan.height;
  const pt=axis/(settings.output.sizeCm/2.54*72);
  return (settings.annotations??[]).filter(a=>a.visible).map(a=>{
    const left=plan.left??0,right=left+(plan.imageWidth??plan.width);
    const points=a.points.map(p=>({x:(p.x-c.x)*scale+left,y:(p.y-c.y)*scale+plan.top})),[p,q]=points,mid={x:(p.x+q.x)/2,y:(p.y+q.y)/2};
    const fontSize=a.fontPt*pt,font=`${a.italic?'italic ':''}${a.bold?'bold ':''}${fontSize}px ${a.fontFamily}`;
    context.font=font;const text=annotationValue(a,settings.calibration),rich=richTextLayout(text,{...a,fontSize}),lines=text.replace(/\r\n?/g,'\n').split('\n'),lineHeight=fontSize*1.2,tw=rich?rich.width:Math.max(...lines.map(line=>context.measureText(line).width)),th=rich?rich.height:lineHeight*lines.length;
    let anchor={...p};
    if(a.type==='diameter'){
      const radius=Math.hypot(q.x-p.x,q.y-p.y)/2,gap=fontSize*.3;
      const above=mid.y-radius-gap-(th-lineHeight);
      anchor={x:mid.x,y:above-fontSize>=plan.top?above:mid.y+radius+fontSize+gap};
    }else if(a.type!=='text'){
      const length=Math.hypot(q.x-p.x,q.y-p.y)||1;
      let nx=(q.y-p.y)/length,ny=-(q.x-p.x)/length;
      if(ny>0){nx=-nx;ny=-ny;}
      const clearance=Math.abs(nx)*tw/2+Math.abs(ny)*th/2+fontSize*.3;
      const baseline=fontSize*.35-(th-lineHeight)/2;
      anchor={x:mid.x+nx*clearance,y:mid.y+ny*clearance+baseline};
      const left=anchor.x-(a.align==='center'?tw/2:a.align==='right'?tw:0);
      if(left<(plan.left??0)||left+tw>right||anchor.y-fontSize<plan.top||anchor.y-fontSize+th>plan.top+plan.imageHeight)anchor={x:mid.x-nx*clearance,y:mid.y-ny*clearance+baseline};
    }
    if(a.type!=='text'){
      const inset=a.align==='center'?tw/2:a.align==='right'?tw:0;
      anchor.x=Math.max(left+inset,Math.min(right-tw+inset,anchor.x));
      anchor.y=Math.max(plan.top+fontSize,Math.min(plan.top+plan.imageHeight-th+fontSize,anchor.y));
    }
    const label={x:anchor.x+a.labelOffset.x*scale,y:anchor.y+a.labelOffset.y*scale};
    const tx=label.x-(a.align==='center'?tw/2:a.align==='right'?tw:0),ty=label.y-(rich?rich.baseline:fontSize);
    const primitives=[],lineWidth=a.linePt*pt,head=a.arrowSizePt*pt;
    const line=(from,to)=>primitives.push({type:'line',from,to,color:a.color,width:lineWidth,dash:a.lineStyle,opacity:a.opacity});
    if(a.type==='diameter')primitives.push({type:'circle',center:mid,radius:Math.hypot(q.x-p.x,q.y-p.y)/2,color:a.color,width:lineWidth,dash:a.lineStyle,opacity:a.opacity});
    if(a.type!=='text'){
      line(p,q);
      if(['arrow','distance','diameter'].includes(a.type)){
        const angle=Math.atan2(q.y-p.y,q.x-p.x),arrow=(tip,angle)=>{
          const r={x:tip.x-head*Math.cos(angle-.4),y:tip.y-head*Math.sin(angle-.4)},s={x:tip.x-head*Math.cos(angle+.4),y:tip.y-head*Math.sin(angle+.4)};
          if(a.arrowStyle==='-|>')primitives.push({type:'polygon',points:[tip,r,s],color:a.color,opacity:a.opacity});else{line(tip,r);line(tip,s);}
        };
        if(['o-','o-o'].includes(a.arrowStyle)){
          for(const center of a.arrowStyle==='o-o'?[p,q]:[p])primitives.push({type:'dot',center,radius:head/2,color:a.color,opacity:a.opacity});
        }
        else if(Math.hypot(q.x-p.x,q.y-p.y)>0){arrow(q,angle);if(a.arrowStyle==='<->')arrow(p,angle+Math.PI);}
      }
    }
    const hasText=['text','distance','diameter'].includes(a.type);
    if(hasText&&text){
      if(a.background)primitives.push({type:'rect',x:tx-fontSize*.15,y:ty-fontSize*.1,width:tw+fontSize*.3,height:th+fontSize*.2,color:a.backgroundColor,opacity:a.opacity*a.backgroundOpacity,rotation:a.rotation,origin:label});
      primitives.push({type:'text',x:label.x,y:label.y,rich,richX:tx-label.x,richY:ty-label.y,text,lines,lineHeight,color:a.color,opacity:a.opacity,font,fontSize,fontFamily:a.fontFamily,bold:a.bold,italic:a.italic,underline:a.underline,align:a.align,width:tw,rotation:a.rotation});
    }
    const corners=[[tx,ty],[tx+tw,ty],[tx+tw,ty+th],[tx,ty+th]].map(([x,y])=>{const r=a.rotation*Math.PI/180;return {x:label.x+(x-label.x)*Math.cos(r)-(y-label.y)*Math.sin(r),y:label.y+(x-label.x)*Math.sin(r)+(y-label.y)*Math.cos(r)};});
    const textBox=hasText?{x:Math.min(...corners.map(p=>p.x)),y:Math.min(...corners.map(p=>p.y)),width:Math.max(...corners.map(p=>p.x))-Math.min(...corners.map(p=>p.x)),height:Math.max(...corners.map(p=>p.y))-Math.min(...corners.map(p=>p.y))}:null;
    return {id:a.id,annotation:a,points,mid,radius:a.type==='diameter'?Math.hypot(q.x-p.x,q.y-p.y)/2:null,textBox,primitives};
  });
}
export function hitAnnotation(layout,p,tolerance=6){
  for(const box of [...layout].reverse()){
    const t=box.textBox;
    if(t&&p.x>=t.x-tolerance&&p.x<=t.x+t.width+tolerance&&p.y>=t.y-tolerance&&p.y<=t.y+t.height+tolerance)return {box,part:box.annotation.type==='text'?'move':'label'};
    const [a,b]=box.points;
    for(const dot of box.primitives.filter(s=>s.type==='dot'))if(Math.hypot(p.x-dot.center.x,p.y-dot.center.y)<=dot.radius+tolerance)return {box,part:'move'};
    if(box.radius!==null&&Math.abs(Math.hypot(p.x-box.mid.x,p.y-box.mid.y)-box.radius)<=tolerance)return {box,part:'move'};
    if(box.annotation.type!=='text'){
      const dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy,t=len?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/len)):0;
      if(Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)<=tolerance)return {box,part:'move'};
    }
  }return null;
}
