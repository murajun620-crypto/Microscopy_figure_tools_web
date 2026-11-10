/** Crop the vector colorbar to its actual paint bounds, retaining labels. */
export function colorbarOnlyPlan(plan,context){
 const bar=plan.mapColorbar;if(!bar)throw Error('カラーバーを表示してから出力してください。');
 const r=bar.rect,points=[{x:r.x,y:r.y},{x:r.x+r.width,y:r.y+r.height}];
 for(const line of bar.lines)points.push({x:line.x1,y:line.y1},{x:line.x2,y:line.y2});
 for(const text of bar.texts){
  context.font=`${text.size}px Arial, sans-serif`;
  const m=context.measureText(text.text),width=m.width,left=text.align==='right'?-width:text.align==='center'?-width/2:0;
  const top=-Math.max(text.ascent,m.actualBoundingBoxAscent||0),bottom=Math.max(text.descent,m.actualBoundingBoxDescent||0),angle=text.rotation*Math.PI/180;
  for(const [x,y]of [[left,top],[left+width,top],[left+width,bottom],[left,bottom]])points.push({x:text.x+x*Math.cos(angle)-y*Math.sin(angle),y:text.y+x*Math.sin(angle)+y*Math.cos(angle)});
 }
 const pad=Math.max(2,bar.lineWidth,textPad(bar)),x=Math.floor(Math.min(...points.map(p=>p.x))-pad),y=Math.floor(Math.min(...points.map(p=>p.y))-pad);
 const width=Math.ceil(Math.max(...points.map(p=>p.x))+pad-x),height=Math.ceil(Math.max(...points.map(p=>p.y))+pad-y);
 const shifted={...bar,rect:{...r,x:r.x-x,y:r.y-y},lines:bar.lines.map(l=>({...l,x1:l.x1-x,x2:l.x2-x,y1:l.y1-y,y2:l.y2-y})),texts:bar.texts.map(t=>({...t,x:t.x-x,y:t.y-y}))};
 return {...plan,width,height,imageWidth:width,imageHeight:height,left:0,top:0,bottom:0,colorbarOnly:true,annotations:[],measurements:[],fills:bar.settings.transparent?[]:[{x:0,y:0,width,height,color:bar.settings.backgroundColor}],mapColorbar:shifted};
}
const textPad=bar=>(bar.fontSize||1)*.08;
