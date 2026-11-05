// Palette provenance and reference definitions: COLORBAR_PALETTES.md.
const palette=(id,name,colors)=>({id,name,stops:colors.map((color,i)=>({position:i/(colors.length-1),color}))});
export const MAP_PALETTES=[
  {"id":"gwyddion","name":"Gwyddion.net（黒・茶・金・白）","stops":[{"position":0.0,"color":"#000000"},{"position":0.344671,"color":"#a8280f"},{"position":0.687075,"color":"#f3c25d"},{"position":1.0,"color":"#ffffff"}]},
  {"id":"metropro","name":"MetroPro（虹色・Gwyddion再現）","stops":[{"position":0.0,"color":"#0008e7"},{"position":0.00229095,"color":"#0008e7"},{"position":0.0652921,"color":"#002cd3"},{"position":0.119129,"color":"#0053ad"},{"position":0.183276,"color":"#007f80"},{"position":0.233677,"color":"#00a45b"},{"position":0.304696,"color":"#00d629"},{"position":0.369989,"color":"#12ff00"},{"position":0.430699,"color":"#83ff00"},{"position":0.4937,"color":"#f6ff00"},{"position":0.575029,"color":"#ffbd00"},{"position":0.646048,"color":"#ff8700"},{"position":0.717068,"color":"#ff4c00"},{"position":0.774341,"color":"#ff1f00"},{"position":0.841924,"color":"#ff2323"},{"position":0.899198,"color":"#ff6161"},{"position":0.954181,"color":"#ff6565"},{"position":1.0,"color":"#ff6565"}]},
  palette('thermal','熱色（黒・赤・黄・白）',['#000000','#491828','#9d293d','#d44228','#efb619','#ffffff']),
  palette('gray','グレースケール',['#000000','#ffffff']),
  palette('gold','ゴールド',['#100900','#6b3508','#d78915','#ffe8a2']),
  palette('spectrum','スペクトル',['#302080','#176adb','#20bcb4','#75cf37','#f7d62d','#df422d']),
  palette('blue-red','青・白・赤',['#164792','#ffffff','#b51d30']),
  palette('blue','ブルー',['#07142b','#174f91','#2ba8bc','#e3f8ed']),
];
export const defaultMapColorbar=()=>({visible:false,side:'right',palette:'thermal',customPalette:null,reverse:false,lengthPercent:100,widthPercent:100/18,gapPercent:2,min:0,max:1,title:'Height',unit:'nm',style:'full',ticks:2,digits:3,textColor:'#000000',backgroundColor:'#ffffff',transparent:false});
const bad=()=>{throw new Error('カラーバーの設定または配色データが不正です。');};
const num=(n,a,b)=>Number.isFinite(n)&&n>=a&&n<=b?n:bad();
const col=s=>typeof s==='string'&&/^#[a-f\d]{6}$/i.test(s)?s:bad();
const str=(s,n)=>typeof s==='string'&&s.length<=n?s:bad();
const bool=b=>typeof b==='boolean'?b:bad();
const choice=(v,list)=>list.includes(v)?v:bad();
export function validateMapPalette(raw){
  if(!raw||!Array.isArray(raw.stops)||raw.stops.length<2||raw.stops.length>256)bad();
  const stops=raw.stops.map(s=>({position:num(s.position,0,1),color:col(s.color)}));
  if(stops[0].position!==0||stops.at(-1).position!==1||stops.some((s,i)=>i&&s.position<=stops[i-1].position))bad();
  return {name:str(raw.name,100),stops};
}
export function validateMapColorbar(raw){
  if(raw===undefined)return defaultMapColorbar();
  if(!raw||typeof raw!=='object')bad();const s={...defaultMapColorbar(),...raw};
  const customPalette=s.customPalette===null?null:validateMapPalette(s.customPalette);
  if(s.palette==='custom'&&!customPalette)bad();
  if(!(s.max>s.min)||!Number.isInteger(s.ticks)||!Number.isInteger(s.digits))bad();
  return {visible:bool(s.visible),side:choice(s.side,['right','bottom','top','left']),palette:choice(s.palette,[...MAP_PALETTES.map(p=>p.id),'custom']),customPalette,reverse:bool(s.reverse),lengthPercent:num(s.lengthPercent,10,100),widthPercent:num(s.widthPercent,.1,30),gapPercent:num(s.gapPercent,0,20),min:num(s.min,-1e15,1e15),max:num(s.max,-1e15,1e15),title:str(s.title,100),unit:str(s.unit,30),style:choice(s.style,['full','unit','bar-only']),ticks:num(s.ticks,2,9),digits:num(s.digits,0,8),textColor:col(s.textColor),backgroundColor:col(s.backgroundColor),transparent:bool(s.transparent)};
}
export function mapStops(s){const stops=(s.palette==='custom'?s.customPalette:MAP_PALETTES.find(p=>p.id===s.palette)).stops;return s.reverse?[...stops].reverse().map(p=>({...p,position:1-p.position})):stops;}
export function parseMapPalette(text,name='アップロード配色'){
  if(text.length>262144)throw new Error('配色ファイルは256 KB以内にしてください。');
  const clean=text.replace(/^\uFEFF/,'').trim();
  if(clean.startsWith('{'))return validateMapPalette(JSON.parse(clean));
  const gwy=clean.startsWith('Gwyddion resource GwyGradient');
  const lines=clean.split(/\r?\n/).filter(s=>s.trim()&&!s.trim().startsWith('#')&&!s.startsWith('Gwyddion resource'));
  const rows=lines.map(s=>s.trim().split(/[,;\s]+/).map(Number));
  if(rows.some(r=>r.length!==(gwy?5:4)||r.some(v=>!Number.isFinite(v))))bad();
  const divisor=gwy||rows.every(r=>r.slice(1,4).every(v=>v<=1))?1:255;
  const hex=values=>'#'+values.map(v=>Math.round(num(v,0,divisor)/divisor*255).toString(16).padStart(2,'0')).join('');
  const stops=rows.map(r=>({position:r[0],color:hex(r.slice(1,4))}));
  // Gwyddion resources can contain redundant endpoints: the last zero and
  // first one define the visible ramp (including the published MetroPro map).
  if(gwy){while(stops.length>2&&stops[1].position===0)stops.shift();while(stops.length>2&&stops.at(-2).position===1)stops.pop();}
  return validateMapPalette({name,stops});
}
export async function paletteFromFile(file){
  if(file.size>8*1024*1024)throw new Error('配色ファイルは8 MB以内にしてください。');
  const name=file.name.replace(/\.[^.]+$/,'').slice(0,100)||'アップロード配色';
  if(!/\.(png|jpe?g|webp)$/i.test(file.name))return parseMapPalette(await file.text(),name);
  const bitmap=await createImageBitmap(file);
  try{
    const w=bitmap.width,h=bitmap.height;if(w>16384||h>16384||Math.max(w,h)<Math.min(w,h)*4)throw new Error('文字や目盛りを除いた、横長または縦長のカラーバー画像を選んでください（縦横比4以上）。');
    const vertical=h>w,canvas=document.createElement('canvas');canvas.width=vertical?1:256;canvas.height=vertical?256:1;
    const c=canvas.getContext('2d');c.fillStyle='#ffffff';c.fillRect(0,0,canvas.width,canvas.height);
    if(vertical)c.drawImage(bitmap,Math.floor(w/2),0,1,h,0,0,1,256);else c.drawImage(bitmap,0,Math.floor(h/2),w,1,0,0,256,1);
    const data=c.getImageData(0,0,canvas.width,canvas.height).data;
    // Horizontal images: minimum at left. Vertical images: minimum at bottom.
    return validateMapPalette({name,stops:Array.from({length:256},(_,i)=>{const j=(vertical?255-i:i)*4;return {position:i/255,color:'#'+[data[j],data[j+1],data[j+2]].map(n=>n.toString(16).padStart(2,'0')).join('')};})});
  }finally{bitmap.close();}
}
const fmt=(n,d)=>Number(n.toFixed(d)).toLocaleString('en-US',{useGrouping:false,maximumFractionDigits:d});
export function extendMapPlan(plan,s,context){
  if(!s?.visible)return plan;
  if(!(s.max>s.min))throw new Error('カラーバーの最大値は最小値より大きくしてください。');
  const vertical=['left','right'].includes(s.side),edge=vertical?plan.imageHeight:plan.width;
  const length=edge*s.lengthPercent/100,thickness=length*s.widthPercent/100,short=Math.min(plan.width,plan.imageHeight);
  const fontSize=plan.barFontSize,pad=Math.max(2,short*.008),gap=short*s.gapPercent/100,tick=fontSize*.25,textGap=Math.max(2,fontSize*.18);
  const show=s.style!=='bar-only',title=s.style==='full'?[s.title,s.unit?`(${s.unit})`:''].filter(Boolean).join(' '):s.style==='unit'?s.unit:'';
  const labels=show?Array.from({length:Math.trunc(s.ticks)},(_,i)=>{const t=i/(Math.trunc(s.ticks)-1);return {t,text:fmt(s.min+(s.max-s.min)*t,Math.trunc(s.digits))};}):[];
  context.font=`${fontSize}px Arial`;
  // Keep the same font as the scale-bar text. Wrap long names instead of shrinking.
  const titleLines=[];let line='';
  for(const char of title){if(line&&context.measureText(line+char).width>length){titleLines.push(line.trim());line='';}line+=char;}
  if(line.trim())titleLines.push(line.trim());
  const measurements=[...labels.map(p=>p.text),...titleLines,'Mg'].map(t=>context.measureText(t));
  const ascent=Math.max(fontSize*.75,...measurements.map(m=>m.fontBoundingBoxAscent??m.actualBoundingBoxAscent??fontSize*.92));
  const descent=Math.max(fontSize*.2,...measurements.map(m=>m.fontBoundingBoxDescent??m.actualBoundingBoxDescent??fontSize*.24));
  const textHeight=ascent+descent,lineHeight=Math.max(textHeight,fontSize*1.15);
  const labelWidth=Math.max(0,...labels.map(p=>context.measureText(p.text).width));
  const titleHeight=titleLines.length?textHeight+(titleLines.length-1)*lineHeight:0;
  const extent=gap+thickness+pad+(show?tick+pad+(vertical?labelWidth:textHeight):0)+(titleHeight?textGap+titleHeight:0);
  const left=s.side==='left'?Math.ceil(extent):0,offsetY=s.side==='top'?Math.ceil(extent):0;
  const width=plan.width+(vertical?Math.ceil(extent):0),height=plan.height+(!vertical?Math.ceil(extent):0);
  const imageWidth=plan.width,top=plan.top+offsetY;
  let x,y;
  if(vertical){x=s.side==='right'?imageWidth+gap:left-gap-thickness;y=top+(plan.imageHeight-length)/2;}
  else{x=(imageWidth-length)/2;y=s.side==='bottom'?plan.height+gap:offsetY-gap-thickness;}
  const rect={x,y,width:vertical?thickness:length,height:vertical?length:thickness};
  const texts=[],lines=[];
  const add=(text,x,y,align='center',rotation=0)=>texts.push({text,x,y,align,rotation,size:fontSize,ascent,descent});
  for(const p of labels){
    if(vertical){const yy=y+length*(1-p.t),xx=s.side==='right'?x+thickness:x,sign=s.side==='right'?1:-1;
      lines.push({x1:xx,y1:yy,x2:xx+sign*tick,y2:yy});add(p.text,xx+sign*(tick+pad),Math.max(y+ascent,Math.min(y+length-descent,yy+(ascent-descent)/2)),sign===1?'left':'right');
    }else{const xx=x+length*p.t,yy=s.side==='bottom'?y+thickness:y,sign=s.side==='bottom'?1:-1;
      lines.push({x1:xx,y1:yy,x2:xx,y2:yy+sign*tick});add(p.text,xx,sign===1?yy+tick+pad+ascent:yy-tick-pad-descent,p.t===0?'left':p.t===1?'right':'center');}
  }
  titleLines.forEach((text,i)=>{
    if(vertical){const xx=s.side==='right'?x+thickness+tick+pad+labelWidth+textGap+descent+i*lineHeight:pad+descent+(titleLines.length-1-i)*lineHeight;add(text,xx,y+length/2,'center',-90);}
    else{const baseline=s.side==='bottom'?y+thickness+tick+pad+textHeight+textGap+ascent+i*lineHeight:y-tick-pad-textHeight-textGap-descent-(titleLines.length-1-i)*lineHeight;add(text,x+length/2,baseline);}
  });
  const background=vertical?{x:s.side==='left'?0:imageWidth,y:0,width:width-imageWidth,height}:{x:0,y:s.side==='top'?0:plan.height,width,height:height-plan.height};
  const fills=plan.fills.map(r=>({...r,x:r.x+left,y:r.y+offsetY}));if(!s.transparent)fills.push({...background,color:s.backgroundColor});
  const annotations=plan.annotations.map(b=>({...b,x:b.x+left,y:b.y+offsetY,area:{...b.area,x:b.area.x+left,y:b.area.y+offsetY}}));
  return {...plan,width,height,top,left,offsetY,imageWidth,fills,annotations,mapColorbar:{rect,vertical,stops:mapStops(s),texts,lines,textColor:s.textColor,lineWidth:Math.max(.5,short*.001),settings:s,fontSize}};
}
export function paintMapColorbar(c,plan){
  const b=plan.mapColorbar;if(!b)return;const r=b.rect;c.save();
  const gradient=b.vertical?c.createLinearGradient(0,r.y+r.height,0,r.y):c.createLinearGradient(r.x,0,r.x+r.width,0);
  for(const s of b.stops)gradient.addColorStop(s.position,s.color);
  c.fillStyle=gradient;c.fillRect(r.x,r.y,r.width,r.height);c.fillStyle=c.strokeStyle=b.textColor;c.lineWidth=b.lineWidth;c.strokeRect(r.x,r.y,r.width,r.height);
  for(const l of b.lines){c.beginPath();c.moveTo(l.x1,l.y1);c.lineTo(l.x2,l.y2);c.stroke();}
  for(const t of b.texts){c.save();c.translate(t.x,t.y);c.rotate(t.rotation*Math.PI/180);c.font=`${t.size}px Arial, sans-serif`;c.textAlign=t.align;c.textBaseline='alphabetic';c.fillText(t.text,0,0);c.restore();}c.restore();
}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function mapColorbarSvg(plan){
  const b=plan.mapColorbar;if(!b)return '';const r=b.rect;
  const vector=b.vertical?`x1="0" y1="${r.y+r.height}" x2="0" y2="${r.y}"`:`x1="${r.x}" y1="0" x2="${r.x+r.width}" y2="0"`;
  return `<defs><linearGradient id="mifito-map" gradientUnits="userSpaceOnUse" ${vector}>${b.stops.map(s=>`<stop offset="${s.position}" stop-color="${s.color}"/>`).join('')}</linearGradient></defs><g fill="${b.textColor}" stroke="${b.textColor}" stroke-width="${b.lineWidth}"><rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="url(#mifito-map)"/>${b.lines.map(l=>`<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}"/>`).join('')}${b.texts.map(t=>`<text x="${t.x}" y="${t.y}" stroke="none" font-family="Arial, sans-serif" font-size="${t.size}" text-anchor="${{left:'start',right:'end',center:'middle'}[t.align]}" transform="rotate(${t.rotation} ${t.x} ${t.y})">${esc(t.text)}</text>`).join('')}</g>`;
}
