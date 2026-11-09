import { LIMITS, validateSize } from './core.js?v=ffbc761e0d41';

export function svgLength(value) {
  const match=String(value??'').trim().match(/^([+]?(?:\d*\.\d+|\d+\.?)(?:e[+-]?\d+)?)\s*(px|pt|pc|in|cm|mm)?$/i);
  if(!match)return null;
  const number=Number(match[1])*({px:1,pt:96/72,pc:16,in:96,cm:96/2.54,mm:96/25.4}[match[2]?.toLowerCase()??'px']);
  return Number.isFinite(number)&&number>=0?number:null;
}
export function svgCoordinate(value) {
  const text=String(value??'').trim(),negative=text.startsWith('-'),length=svgLength(negative?text.slice(1):text);
  return length===null?null:negative?-length:length;
}
export const identity=()=>[1,0,0,1,0,0];
export function multiply(a,b) {
  return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
}
export function svgTransform(value) {
  const text=String(value??''),pattern=/([a-zA-Z]+)\s*\(([^)]*)\)/g;
  if(text.replace(pattern,'').replace(/[\s,]/g,''))return null;
  let matrix=identity();
  for(const [,name,args] of text.matchAll(pattern)) {
    if(args.replace(/[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi,'').replace(/[\s,]/g,''))return null;
    const n=(args.match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi)??[]).map(Number);
    let next;
    if(name==='matrix'&&n.length===6)next=n;
    else if(name==='translate'&&n.length)next=[1,0,0,1,n[0],n[1]??0];
    else if(name==='scale'&&n.length)next=[n[0],0,0,n[1]??n[0],0,0];
    else if(name==='rotate'&&n.length){const r=n[0]*Math.PI/180,c=Math.cos(r),s=Math.sin(r);next=[c,s,-s,c,0,0];if(n.length===3)next=multiply(multiply([1,0,0,1,n[1],n[2]],next),[1,0,0,1,-n[1],-n[2]]);}
    else if(name==='skewX'&&n.length)next=[1,0,Math.tan(n[0]*Math.PI/180),1,0,0];
    else if(name==='skewY'&&n.length)next=[1,Math.tan(n[0]*Math.PI/180),0,1,0,0];
    else return null;
    if(!next.every(Number.isFinite))return null;
    matrix=multiply(matrix,next);
  }
  return matrix;
}
export function transformedImage(x,y,width,height,matrix,nativeWidth=width,nativeHeight=height) {
  // Only axis-aligned, uniformly scaled image pixels can share a crop grid.
  if(!matrix||Math.abs(matrix[1])>1e-8||Math.abs(matrix[2])>1e-8)return null;
  const a=matrix[0],d=matrix[3],w=Math.abs(a*width),h=Math.abs(d*height);
  if(!(w>0&&h>0&&nativeWidth>0&&nativeHeight>0))return null;
  if(Math.abs(w/nativeWidth-h/nativeHeight)>1e-6*Math.max(w/nativeWidth,h/nativeHeight))return null;
  return {x:Math.min(a*x+matrix[4],a*(x+width)+matrix[4]),y:Math.min(d*y+matrix[5],d*(y+height)+matrix[5]),width:w,height:h,nativeWidth,nativeHeight};
}

export function svgRasterPlan(view,width,height,images=[]) {
  validateSize(Math.ceil(width),Math.ceil(height));
  const factor=Math.max(1,Math.min(8,1024/Math.max(width,height)));
  const ordinary={width:Math.ceil(width*factor),height:Math.ceil(height*factor),view:null,imageCrop:null};
  validateSize(ordinary.width,ordinary.height);
  if(!view||view.length!==4||!view.every(Number.isFinite)||view[2]<=0||view[3]<=0||Math.abs(width/height-view[2]/view[3])>1e-5)return ordinary;
  const epsilon=1e-5*Math.max(view[2],view[3]);
  const candidates=images.filter(b=>b.x>=view[0]&&b.y>=view[1]&&b.x+b.width<=view[0]+view[2]+epsilon&&b.y+b.height<=view[1]+view[3]+epsilon);
  const primary=candidates.sort((a,b)=>b.width*b.height-a.width*a.height)[0];
  if(!primary)return ordinary;
  const nativeScale=primary.nativeWidth/primary.width;
  const scale=nativeScale*Math.max(1,Math.ceil(width*factor/view[2]/nativeScale-1e-8));
  if(!Number.isFinite(scale)||scale<=0)return ordinary;
  const dx=(primary.x-view[0])*scale,dy=(primary.y-view[1])*scale;
  const padX=Math.ceil(dx-1e-8)-dx,padY=Math.ceil(dy-1e-8)-dy;
  const outputWidth=Math.ceil(view[2]*scale+padX-1e-8),outputHeight=Math.ceil(view[3]*scale+padY-1e-8);
  if(!Number.isSafeInteger(outputWidth)||!Number.isSafeInteger(outputHeight)||outputWidth>LIMITS.edge||outputHeight>LIMITS.edge||outputWidth*outputHeight>LIMITS.sourcePixels)return ordinary;
  return {width:outputWidth,height:outputHeight,
    view:[view[0]-padX/scale,view[1]-padY/scale,outputWidth/scale,outputHeight/scale],
    imageCrop:{x:Math.round(dx+padX),y:Math.round(dy+padY),width:Math.round(primary.width*scale),height:Math.round(primary.height*scale)}};
}
