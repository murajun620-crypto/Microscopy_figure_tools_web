const dash=(style,width)=>style==='--'?[6*width,3*width]:style==='-.'?[6*width,3*width,width,3*width]:style===':'?[width,2*width]:[];
export function paintMeasurements(context,plan){
  if(!plan.measurements?.length)return;
  context.save();context.beginPath();context.rect(plan.left??0,plan.top,plan.imageWidth??plan.width,plan.imageHeight);context.clip();
  for(const box of plan.measurements??[])for(const s of box.primitives){
    context.save();context.globalAlpha=s.opacity;context.strokeStyle=context.fillStyle=s.color;
    if(s.type==='line'||s.type==='circle'){context.lineWidth=s.width;context.setLineDash(dash(s.dash,s.width));context.beginPath();if(s.type==='line'){context.moveTo(s.from.x,s.from.y);context.lineTo(s.to.x,s.to.y);}else context.arc(s.center.x,s.center.y,s.radius,0,Math.PI*2);context.stroke();}
    else if(s.type==='dot'){context.beginPath();context.arc(s.center.x,s.center.y,s.radius,0,Math.PI*2);context.fill();}
    else if(s.type==='polygon'){context.beginPath();s.points.forEach((p,i)=>i?context.lineTo(p.x,p.y):context.moveTo(p.x,p.y));context.closePath();context.fill();}
    else if(s.type==='rect'){context.translate(s.origin.x,s.origin.y);context.rotate(s.rotation*Math.PI/180);context.fillRect(s.x-s.origin.x,s.y-s.origin.y,s.width,s.height);}
    else {context.translate(s.x,s.y);context.rotate(s.rotation*Math.PI/180);context.font=s.font;context.textAlign=s.align==='justify'?'left':s.align;context.textBaseline='alphabetic';s.lines.forEach((line,i)=>{const y=i*s.lineHeight,words=line.split(/ +/),justify=s.align==='justify'&&i<s.lines.length-1&&words.length>1;if(justify){const gap=(s.width-words.reduce((sum,word)=>sum+context.measureText(word).width,0))/(words.length-1);let x=0;for(const word of words){context.fillText(word,x,y);x+=context.measureText(word).width+gap;}}else context.fillText(line,0,y);if(s.underline&&line){const width=justify?s.width:context.measureText(line).width,x=s.align==='center'?-width/2:s.align==='right'?-width:0;context.lineWidth=Math.max(.5,s.fontSize/16);context.setLineDash([]);context.beginPath();context.moveTo(x,y+s.fontSize*.12);context.lineTo(x+width,y+s.fontSize*.12);context.stroke();}});}
    context.restore();
  }context.restore();
}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function measurementsSvg(plan){
  const shapes=[];
  for(const box of plan.measurements??[])for(const s of box.primitives){
    const common=`opacity="${s.opacity}"`,stroke=`stroke="${s.color}" stroke-width="${s.width}" stroke-dasharray="${dash(s.dash,s.width).join(' ')}" fill="none" ${common}`;
    if(s.type==='line')shapes.push(`<line x1="${s.from.x}" y1="${s.from.y}" x2="${s.to.x}" y2="${s.to.y}" ${stroke}/>`);
    else if(s.type==='circle')shapes.push(`<circle cx="${s.center.x}" cy="${s.center.y}" r="${s.radius}" ${stroke}/>`);
    else if(s.type==='dot')shapes.push(`<circle cx="${s.center.x}" cy="${s.center.y}" r="${s.radius}" fill="${s.color}" ${common}/>`);
    else if(s.type==='polygon')shapes.push(`<polygon points="${s.points.map(p=>`${p.x},${p.y}`).join(' ')}" fill="${s.color}" ${common}/>`);
    else if(s.type==='rect')shapes.push(`<rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" fill="${s.color}" ${common} transform="rotate(${s.rotation} ${s.origin.x} ${s.origin.y})"/>`);
    else shapes.push(`<text x="${s.x}" y="${s.y}" font-family="${esc(s.fontFamily)}" font-size="${s.fontSize}" font-weight="${s.bold?'700':'400'}" font-style="${s.italic?'italic':'normal'}" text-decoration="${s.underline?'underline':'none'}" text-anchor="${{left:'start',center:'middle',right:'end',justify:'start'}[s.align]}" fill="${s.color}" ${common} xml:space="preserve" transform="rotate(${s.rotation} ${s.x} ${s.y})">${s.lines.map((line,i)=>`<tspan x="${s.x}" y="${s.y+i*s.lineHeight}" ${s.align==='justify'&&i<s.lines.length-1&&/\S +\S/.test(line)?'textLength="'+s.width+'" lengthAdjust="spacing"':''}>${esc(line)}</tspan>`).join('')}</text>`);
  }
  return `<defs><clipPath id="mifito-measurements"><rect x="${plan.left??0}" y="${plan.top}" width="${plan.imageWidth??plan.width}" height="${plan.imageHeight}"/></clipPath></defs><g clip-path="url(#mifito-measurements)">${shapes.join('')}</g>`;
}
