export function encodeBmp(image,dpi=300) {
  const {width,height,data}=image,row=Math.ceil(width*3/4)*4,bytes=new Uint8Array(54+row*height),v=new DataView(bytes.buffer);
  bytes[0]=66;bytes[1]=77;v.setUint32(2,bytes.length,true);v.setUint32(10,54,true);v.setUint32(14,40,true);v.setInt32(18,width,true);v.setInt32(22,height,true);v.setUint16(26,1,true);v.setUint16(28,24,true);v.setUint32(34,row*height,true);v.setInt32(38,Math.round(dpi/.0254),true);v.setInt32(42,Math.round(dpi/.0254),true);
  for(let y=0;y<height;y++) for(let x=0;x<width;x++){const source=(y*width+x)*4,target=54+(height-1-y)*row+x*3;bytes[target]=data[source+2];bytes[target+1]=data[source+1];bytes[target+2]=data[source];}
  return bytes;
}
