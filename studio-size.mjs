/** Physical size of the cropped image body when inserting into Figure Studio. */
export function validateStudioSize(size){
 if(size==null)return {axis:'height',mm:40};
 if(typeof size!=='object'||Array.isArray(size)||!['width','height'].includes(size.axis)||!Number.isFinite(size.mm)||size.mm<.1||size.mm>1000)throw new Error('Studioの画像サイズは幅または高さを0.1〜1000 mmで指定してください。');
 return {axis:size.axis,mm:size.mm};
}

export function studioSvgSize(plan,size){
 const requested=validateStudioSize(size);if(!requested)return null;
 const scale=plan?.coordinateScale??1;
 const bodyWidth=plan?.imageWidth??plan?.crop?.width*scale,bodyHeight=plan?.imageHeight??plan?.crop?.height*scale;
 if(![scale,bodyWidth,bodyHeight,plan?.width,plan?.height].every(value=>Number.isFinite(value)&&value>0)||bodyWidth>plan.width+1e-8||bodyHeight>plan.height+1e-8)throw new Error('Studioへ送る画像本体の寸法を取得できませんでした。');
 const mmPerUnit=requested.mm/(requested.axis==='width'?bodyWidth:bodyHeight);
 const result={widthMm:plan.width*mmPerUnit,heightMm:plan.height*mmPerUnit,bodyWidthMm:bodyWidth*mmPerUnit,bodyHeightMm:bodyHeight*mmPerUnit};
 if(!Object.values(result).every(value=>Number.isFinite(value)&&value>0)||result.widthMm>2000||result.heightMm>2000)throw new Error('Studioへ送る画像全体の幅と高さは2000 mm以下にしてください。');
 return result;
}
