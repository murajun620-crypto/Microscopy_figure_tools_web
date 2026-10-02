// Canvas JPEG encoders do not expose print resolution. Set the JFIF density
// without re-encoding the image, matching Pillow's dpi=(300, 300) export.
export function jpegWithDpi(input,dpi=300){
  const bytes=new Uint8Array(input),density=Math.round(dpi);
  if(bytes[0]!==255||bytes[1]!==216||!Number.isFinite(dpi)||density<1||density>65535)throw new Error('JPEGまたは解像度が不正です。');
  for(let offset=2;offset+4<=bytes.length;){
    if(bytes[offset]!==255)throw new Error('JPEGヘッダーが不正です。');
    const marker=bytes[offset+1];if(marker===218||marker===217)break;
    const length=bytes[offset+2]*256+bytes[offset+3];if(length<2||offset+2+length>bytes.length)throw new Error('JPEGヘッダーが不正です。');
    if(marker===224&&length>=16&&bytes[offset+4]===74&&bytes[offset+5]===70&&bytes[offset+6]===73&&bytes[offset+7]===70&&bytes[offset+8]===0){
      bytes[offset+11]=1;const view=new DataView(bytes.buffer);view.setUint16(offset+12,density);view.setUint16(offset+14,density);return bytes;
    }
    offset+=2+length;
  }
  const jfif=new Uint8Array([255,224,0,16,74,70,73,70,0,1,1,1,density>>8,density&255,density>>8,density&255,0,0]);
  const result=new Uint8Array(bytes.length+jfif.length);result.set(bytes.subarray(0,2));result.set(jfif,2);result.set(bytes.subarray(2),20);return result;
}
