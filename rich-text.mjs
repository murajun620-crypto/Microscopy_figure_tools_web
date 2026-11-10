// The same MathJax layout and native font bridge used by Figure Studio.
import {createTexRenderer} from './tex.mjs?v=5a795d503d07';
const listeners=new Set(),nodes=new Map(),paths=new WeakMap();
let measureContext=null,readyFrame=0;
const notify=()=>{if(!readyFrame)readyFrame=requestAnimationFrame(()=>{readyFrame=0;for(const listener of listeners)listener();});};
const renderer=createTexRenderer({measure:(text,o)=>{measureContext??=document.createElement('canvas').getContext('2d');measureContext.font=`${o.italic?'italic ':''}${o.bold?'bold ':''}${o.fontSize}px ${o.fontFamily}`;return measureContext.measureText(text).width;},onReady:notify,onError:notify});
const object=(text,style={})=>({type:'text',text:String(text??''),textMode:style.textMode||'auto',fontSize:100,fontFamily:style.fontFamily||'Arial',bold:!!style.bold,italic:!!style.italic,underline:!!style.underline,textAlign:'left',textAutoSize:true,w:1});
const element=(tag,attrs={},text)=>{const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,value);if(text!==undefined)node.textContent=text;return node;};
export function onRichTextReady(listener){listeners.add(listener);return ()=>listeners.delete(listener);}
export function richTextState(text,style){const o=object(text,style);if(!renderer.hasMath(o))return '';const error=renderer.getError(o);if(error)return error.message;return renderer.getLayout(o)?'':'数式を描画しています…';}
export async function prepareRichText(entries){await renderer.prepare(entries.map(({text,...style})=>object(text,style)));}

/** Layout at a stable reference size; physical output scaling never re-typesets. */
export function richTextLayout(text,style={}){
 const o=object(text,style);if(!renderer.hasMath(o))return null;
 const layout=renderer.getLayout(o);if(!layout)return null;
 const key=renderer.key(o);let content=nodes.get(key);
 if(!content){content=layout.createNodes(element);nodes.set(key,content);if(nodes.size>256)nodes.delete(nodes.keys().next().value);}
 const scale=Number(style.fontSize)/100;
 return {nodes:content,scale,width:layout.width*scale,height:layout.height*scale,baseline:(layout.rows[0]?.y??95)*scale};
}

function transform(context,value){
 for(const match of String(value||'').matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)){
  const n=match[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
  if(match[1]==='matrix')context.transform(...n);
  else if(match[1]==='translate')context.translate(n[0]||0,n[1]||0);
  else if(match[1]==='scale')context.scale(n[0],n[1]??n[0]);
  else if(match[1]==='rotate'){context.translate(n[1]||0,n[2]||0);context.rotate(n[0]*Math.PI/180);context.translate(-(n[1]||0),-(n[2]||0));}
  else if(match[1]==='skewX')context.transform(1,0,Math.tan(n[0]*Math.PI/180),1,0,0);
  else if(match[1]==='skewY')context.transform(1,Math.tan(n[0]*Math.PI/180),0,1,0,0);
 }
}
function paintNode(context,node,style){
 context.save();transform(context,node.getAttribute('transform'));
 const attr=name=>node.getAttribute(name),number=name=>Number(attr(name)||0);
 style={...style};for(const name of ['font-family','font-size','font-weight','font-style','text-decoration'])if(attr(name)!==null)style[name]=attr(name);
 const tag=node.localName;
 if(tag==='text'||tag==='tspan'){
  const size=Number(style['font-size'])||100;
  context.font=`${style['font-style']||'normal'} ${style['font-weight']||'400'} ${size}px ${style['font-family']||'Arial'}`;
  context.textAlign=({middle:'center',end:'right'})[attr('text-anchor')]||'left';context.textBaseline='alphabetic';
  const text=[...node.childNodes].filter(child=>child.nodeType===3).map(child=>child.nodeValue).join(''),x=number('x'),y=number('y');
  context.fillText(text,x,y);
  if(style['text-decoration']==='underline'&&text){const width=context.measureText(text).width,left=x-(context.textAlign==='center'?width/2:context.textAlign==='right'?width:0);context.fillRect(left,y+size*.12,width,Math.max(.5,size/16));}
 }else if(tag==='path'){
  let path=paths.get(node);if(!path){path=new Path2D(attr('d')||'');paths.set(node,path);}context.fill(path,attr('fill-rule')||'nonzero');
 }else if(tag==='rect')context.fillRect(number('x'),number('y'),number('width'),number('height'));
 else if(['line','polyline','polygon','circle','ellipse'].includes(tag)){
  context.beginPath();
  if(tag==='line'){context.moveTo(number('x1'),number('y1'));context.lineTo(number('x2'),number('y2'));context.stroke();}
  else if(tag==='circle'||tag==='ellipse'){context.ellipse(number('cx'),number('cy'),number(tag==='circle'?'r':'rx'),number(tag==='circle'?'r':'ry'),0,0,Math.PI*2);context.fill();}
  else{const points=String(attr('points')||'').trim().split(/[\s,]+/).map(Number);for(let i=0;i+1<points.length;i+=2)i?context.lineTo(points[i],points[i+1]):context.moveTo(points[i],points[i+1]);if(tag==='polygon'){context.closePath();context.fill();}else context.stroke();}
 }
 for(const child of node.children)paintNode(context,child,style);
 context.restore();
}
export function paintRichText(context,rich,x,y){context.save();context.translate(x,y);context.scale(rich.scale,rich.scale);for(const node of rich.nodes)paintNode(context,node,{});context.restore();}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function richTextSvg(rich,x,y,color){return `<g transform="translate(${x} ${y}) scale(${rich.scale})" fill="${escape(color)}">${rich.nodes.map(node=>new XMLSerializer().serializeToString(node)).join('')}</g>`;}
