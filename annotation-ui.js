import { ANNOTATION_NAMES, ANNOTATION_FONTS, newAnnotation, defaultAnnotationFontPt, annotationValue, translateAnnotations, measurementLayout, hitAnnotation } from './annotations.js?v=f0f0548434a2';
import { paintMeasurements } from './annotation-render.js?v=32064deaf5ae';
import { showDialog } from './movable-dialog.js?v=ef4fdc07b37c';
const clone=value=>structuredClone(value),$=id=>document.getElementById(id);
export class AnnotationUI {
  constructor(api){
    this.api=api;this.selected=new Set();this.itemId=null;this.mode=null;this.gesture=null;this.draft=null;this.clipboard=[];this.formState='';
    this.dialog=$('annotationEditor');
    for(const family of ANNOTATION_FONTS)$('annotationFont').add(new Option(family,family));
    for(const button of document.querySelectorAll('[data-add-annotation]'))button.addEventListener('click',()=>this.begin(button.dataset.addAnnotation));
    $('closeAnnotationEditor').onclick=()=>this.dialog.close();
    $('editAnnotationButton').onclick=()=>this.edit();$('copyAnnotationButton').onclick=()=>{this.copy();this.paste();};$('deleteAnnotationButton').onclick=()=>this.remove();
    for(const input of this.dialog.querySelectorAll('[data-ann-field],[data-ann-coordinate],[data-ann-offset]')){
      input.addEventListener('change',()=>this.change(input));
      input.addEventListener('keydown',event=>{if(event.key==='Enter'&&input.tagName==='INPUT'){event.preventDefault();input.blur();}});
    }
    for(const slider of this.dialog.querySelectorAll('[data-ann-slider]')){
      const field=this.dialog.querySelector(`[data-ann-field="${slider.dataset.annSlider}"]`);
      slider.addEventListener('input',()=>{field.value=slider.value;});slider.addEventListener('change',()=>this.change(field));
    }
    for(const button of document.querySelectorAll('[data-ann-layer]'))button.onclick=()=>this.layer(button.dataset.annLayer);
    for(const button of document.querySelectorAll('[data-ann-align]'))button.onclick=()=>this.align(button.dataset.annAlign);
    const area=$('previewArea');
    for(const [name,handler] of [['pointerdown','down'],['pointermove','move'],['pointerup','up'],['pointercancel','cancel'],['dblclick','doubleClick']])area.addEventListener(name,event=>this[handler](event),true);
    document.addEventListener('keydown',event=>this.key(event),true);
  }
  get current(){return this.api.current();}
  get annotations(){return this.current?.settings.annotations??[];}
  get focused(){return this.annotations.find(a=>this.selected.has(a.id));}
  reset(){this.cancelDrawing();this.selected.clear();this.clipboard=[];this.itemId=null;this.formState='';if(this.dialog.open)this.dialog.close();}
  formValues(){return JSON.stringify([...this.dialog.querySelectorAll('[data-ann-field],[data-ann-coordinate],[data-ann-offset]')].map(input=>input.type==='checkbox'?input.checked:input.value));}
  get pending(){return this.dialog.open&&this.formState!==this.formValues();}
  commit(annotations){try{const settings=clone(this.current.settings);settings.annotations=annotations;this.api.commit(settings);return true;}catch(error){this.api.notify(error.message,true);this.sync();return false;}}
  sync(){
    const item=this.current;
    if(this.itemId!==item?.id){this.itemId=item?.id;this.selected.clear();this.cancelDrawing();if(this.dialog.open)this.dialog.close();}
    const ids=new Set(this.annotations.map(a=>a.id));for(const id of this.selected)if(!ids.has(id))this.selected.delete(id);
    const list=$('annotationList');list.replaceChildren();
    for(const [index,a] of this.annotations.entries()){
      const row=document.createElement('div');row.className='annotation-row'+(this.selected.has(a.id)?' selected':'');
      const select=document.createElement('input');select.type='checkbox';select.checked=this.selected.has(a.id);select.setAttribute('aria-label',`${ANNOTATION_NAMES[a.type]} ${index+1}を選択`);
      select.onchange=()=>{select.checked?this.selected.add(a.id):this.selected.delete(a.id);this.sync();this.api.render();};
      const button=document.createElement('button');button.textContent=`${index+1}. ${ANNOTATION_NAMES[a.type]}${a.visible?'':'（非表示）'}${a.locked?' 🔒':''} ${annotationValue(a,item.settings.calibration)}`;button.title='クリックで選択、ダブルクリックで設定';
      button.onclick=event=>{this.select(a.id,event.shiftKey);};button.ondblclick=()=>this.edit(a.id);row.append(select,button);list.append(row);
    }
    const unavailable=this.api.busy()||!item;
    for(const button of document.querySelectorAll('[data-add-annotation]')){
      button.disabled=unavailable||(['distance','diameter'].includes(button.dataset.addAnnotation)&&!item?.settings.calibration);
      button.classList.toggle('primary',!unavailable&&this.mode===button.dataset.addAnnotation);button.setAttribute('aria-pressed',String(this.mode===button.dataset.addAnnotation));
    }
    for(const id of ['editAnnotationButton','copyAnnotationButton','deleteAnnotationButton'])$(id).disabled=unavailable||!this.selected.size;
    for(const button of document.querySelectorAll('[data-ann-align],[data-ann-layer]'))button.disabled=unavailable||this.selected.size<(button.dataset.annAlign?2:1);
    for(const input of list.querySelectorAll('input,button'))input.disabled=unavailable;
    $('annotationStatus').textContent=this.mode?`${ANNOTATION_NAMES[this.mode]}：${this.mode==='text'?'画像上をクリック':this.mode==='diameter'?'直径の両端をクリック、またはドラッグ':'始点と終点をクリック、またはドラッグ'}。Escで中止。`:!item?.settings.calibration?'距離と直径の注釈には校正が必要です。':`${this.annotations.length}個の注釈。距離・直径はこの画像の校正値で計算します。`;
    if(this.dialog.open)this.fillForm();
  }
  select(id,add=false){if(!add)this.selected.clear();this.selected.has(id)&&add?this.selected.delete(id):this.selected.add(id);this.sync();this.api.render();}
  begin(type){
    if(!this.current||this.api.busy())return;
    if(['distance','diameter'].includes(type)&&!this.current.settings.calibration){this.api.notify('先にこの画像を校正してください。',true);return;}
    if(this.annotations.length>=200){this.api.notify('注釈は200個以内にしてください。',true);return;}
    this.api.placeMode();this.mode=type;this.selected.clear();this.sync();$('preview').style.cursor='crosshair';$('preview').focus({preventScroll:true});
  }
  cancelDrawing(){this.mode=null;this.draft=null;this.gesture=null;$('preview').style.cursor='default';}
  stop(event){event.preventDefault();event.stopImmediatePropagation();}
  point(event){const p=this.api.sourcePoint(event),c=this.current.settings.crop;return {x:Math.max(c.x,Math.min(c.x+c.width,Math.round(p.x*1000)/1000)),y:Math.max(c.y,Math.min(c.y+c.height,Math.round(p.y*1000)/1000))};}
  planPoint(p){const plan=this.api.plan(),s=plan.coordinateScale??1;return {x:(p.x-plan.crop.x)*s+(plan.left??0),y:(p.y-plan.crop.y)*s+plan.top};}
  down(event){
    if(!this.api.active()||event.button!==0||event.pointerType==='touch'||event.target!==$('preview')||event.altKey||this.api.panning())return;
    const raw=this.api.sourcePoint(event),crop=this.current.settings.crop;
    if(raw.x<crop.x||raw.x>crop.x+crop.width||raw.y<crop.y||raw.y>crop.y+crop.height)return;
    const p=this.point(event),q=this.planPoint(p),plan=this.api.plan(),tolerance=8/this.api.scale();
    if(this.mode){
      this.stop(event);$('preview').focus({preventScroll:true});$('preview').setPointerCapture(event.pointerId);
      if(!this.draft)this.draft=newAnnotation(this.mode,p,p,undefined,defaultAnnotationFontPt(this.current.settings,plan));
      this.gesture={kind:'create',start:p,client:{x:event.clientX,y:event.clientY},second:this.draft.points[0].x!==p.x||this.draft.points[0].y!==p.y};
      if(this.mode==='text'){this.finishCreate();this.edit();}this.api.render();return;
    }
    let hit=null;
    for(const box of [...(plan.measurements??[])].reverse())if(this.selected.has(box.id)&&!box.annotation.locked&&box.annotation.type!=='text'){
      const handle=box.points.findIndex(point=>Math.hypot(point.x-q.x,point.y-q.y)<=tolerance);
      if(handle>=0){hit={box,part:handle};break;}
    }
    hit??=hitAnnotation(plan.measurements??[],q,tolerance);if(!hit){if(this.selected.size&&!event.shiftKey){this.selected.clear();this.sync();this.api.render();}return;}
    this.stop(event);$('preview').focus({preventScroll:true});
    if(!this.selected.has(hit.box.id)||event.shiftKey)this.select(hit.box.id,event.shiftKey);
    if(hit.box.annotation.locked)return;
    this.gesture={kind:'edit',id:hit.box.id,part:hit.part,start:p,before:clone(this.current.settings)};$('preview').setPointerCapture(event.pointerId);
  }
  move(event){
    if(!this.current||!this.api.active())return;
    if(this.mode&&!this.gesture&&this.draft){this.draft.points[1]=this.point(event);this.api.render();return;}
    if(!this.gesture)return;this.stop(event);const p=this.point(event),g=this.gesture;
    if(g.kind==='create'){
      this.draft.points[1]=p;g.moved||=Math.hypot(event.clientX-g.client.x,event.clientY-g.client.y)>3;
    }else{
      const base=clone(g.before.annotations),a=base.find(a=>a.id===g.id);if(!a)return;
      const dx=p.x-g.start.x,dy=p.y-g.start.y;
      if(typeof g.part==='number')a.points[g.part]=p;
      else if(g.part==='label'){a.labelOffset.x+=dx;a.labelOffset.y+=dy;}
      else {this.current.settings.annotations=translateAnnotations(base,this.selected,dx,dy,this.current.width,this.current.height);this.api.render();return;}
      this.current.settings.annotations=base;
    }this.api.render();
  }
  up(event){
    const g=this.gesture;if(!g)return;this.move(event);this.stop(event);this.gesture=null;
    if($('preview').hasPointerCapture(event.pointerId))$('preview').releasePointerCapture(event.pointerId);
    if(g.kind==='create'){if(g.moved||g.second)this.finishCreate();}
    else{const next=clone(this.current.settings.annotations);this.current.settings=g.before;try{this.commit(next);}catch(error){this.api.notify(error.message,true);}}
    this.api.render();
  }
  finishCreate(){
    if(!this.draft)return;
    if(this.draft.type!=='text'&&Math.hypot(this.draft.points[1].x-this.draft.points[0].x,this.draft.points[1].y-this.draft.points[0].y)<.01)return;
    const a=this.draft;this.mode=null;this.draft=null;this.gesture=null;this.selected=new Set([a.id]);$('preview').style.cursor='default';
    try{this.commit([...this.annotations,a]);}catch(error){this.api.notify(error.message,true);}
  }
  cancel(event){if(!this.gesture)return;this.stop(event);if(this.gesture.before)this.current.settings=this.gesture.before;this.cancelDrawing();this.sync();this.api.render();}
  doubleClick(event){if(!this.api.active()||this.mode)return;const hit=hitAnnotation(this.api.plan().measurements??[],this.planPoint(this.point(event)),8/this.api.scale());if(hit){this.stop(event);this.edit(hit.box.id);}}
  guides(context){
    if(!this.api.active())return;const plan=this.api.plan(),scale=this.api.scale();
    if(this.draft)paintMeasurements(context,{...plan,measurements:measurementLayout({...this.current.settings,annotations:[this.draft]},plan,context)});
    context.save();context.lineWidth=1.5/scale;context.strokeStyle='#68edda';context.fillStyle='#ffffff';
    for(const box of plan.measurements??[])if(this.selected.has(box.id)){
      if(box.textBox){const b=box.textBox;context.setLineDash([4/scale,3/scale]);context.strokeRect(b.x-3/scale,b.y-3/scale,b.width+6/scale,b.height+6/scale);context.setLineDash([]);}
      if(!box.annotation.locked)for(const p of box.annotation.type==='text'?[box.points[0]]:box.points){context.beginPath();context.arc(p.x,p.y,4/scale,0,Math.PI*2);context.fill();context.stroke();}
    }context.restore();
  }
  edit(id=this.focused?.id){if(!id||this.api.busy())return;this.selected=new Set([id]);this.mode=null;this.sync();if(!this.dialog.open)showDialog(this.dialog);this.fillForm();}
  fillForm(){
    const a=this.focused;if(!a){this.dialog.close();return;}
    $('annotationEditorTitle').textContent=`${ANNOTATION_NAMES[a.type]}の設定`;$('annotationResult').textContent=annotationValue(a,this.current.settings.calibration);
    for(const input of this.dialog.querySelectorAll('[data-ann-field]')){const value=a[input.dataset.annField];if(input.type==='checkbox')input.checked=value;else input.value=input.hasAttribute('data-ann-percent')?Math.round(value*100):value;}
    for(const input of this.dialog.querySelectorAll('[data-ann-slider]'))input.value=Math.round(a[input.dataset.annSlider]*100);
    for(const input of this.dialog.querySelectorAll('[data-ann-coordinate]')){const [index,axis]=input.dataset.annCoordinate.split('.');input.value=a.points[index][axis];input.max=axis==='x'?this.current.width:this.current.height;}
    for(const input of this.dialog.querySelectorAll('[data-ann-offset]'))input.value=a.labelOffset[input.dataset.annOffset];
    this.dialog.querySelector('[data-ann-measured]').hidden=!['distance','diameter'].includes(a.type);this.dialog.querySelector('[data-ann-end]').hidden=a.type==='text';
    const measured=['distance','diameter'].includes(a.type),hasText=measured||a.type==='text';
    for(const field of ['text','fontPt','fontFamily','rotation','align','bold','italic','background','backgroundColor'])this.dialog.querySelector(`[data-ann-field="${field}"]`).closest('label').hidden=!hasText;
    for(const field of ['linePt','lineStyle'])this.dialog.querySelector(`[data-ann-field="${field}"]`).closest('label').hidden=a.type==='text';
    for(const field of ['arrowStyle','arrowSizePt'])this.dialog.querySelector(`[data-ann-field="${field}"]`).closest('label').hidden=!measured&&a.type!=='arrow';
    for(const input of this.dialog.querySelectorAll('[data-ann-offset]'))input.closest('label').hidden=!measured;
    this.dialog.querySelector('[data-ann-field="backgroundOpacity"]').closest('.opacity-field').hidden=!hasText;
    for(const row of this.dialog.querySelectorAll('.field-row:not([data-ann-measured]):not([data-ann-end])'))row.hidden=[...row.children].every(child=>child.hidden);
    for(const input of this.dialog.querySelectorAll('[data-ann-coordinate],[data-ann-offset]'))input.disabled=a.locked;
    for(const input of this.dialog.querySelectorAll('[data-ann-field="backgroundColor"],[data-ann-field="backgroundOpacity"],[data-ann-slider="backgroundOpacity"]'))input.disabled=!a.background;
    this.formState=this.formValues();this.api.colors();
  }
  change(input){
    if(!this.focused||this.api.busy())return;
    try{
      if(!input.checkValidity())throw new Error('注釈の値が範囲外です。');
      const all=clone(this.annotations),a=all.find(a=>a.id===this.focused.id);
      const value=input.type==='checkbox'?input.checked:input.type==='number'?input.valueAsNumber:input.value;
      if(input.dataset.annField)a[input.dataset.annField]=input.hasAttribute('data-ann-percent')?value/100:value;
      else if(input.dataset.annCoordinate){const [index,axis]=input.dataset.annCoordinate.split('.');a.points[index][axis]=value;if(a.type==='text')a.points[1]=clone(a.points[0]);}
      else a.labelOffset[input.dataset.annOffset]=value;
      this.commit(all);this.fillForm();
    }catch(error){this.api.notify(error.message,true);this.fillForm();}
  }
  remove(){if(!this.current||this.api.busy())return;this.commit(this.annotations.filter(a=>!this.selected.has(a.id)));this.selected.clear();this.sync();}
  copy(){this.clipboard=clone(this.annotations.filter(a=>this.selected.has(a.id)));}
  paste(){
    if(!this.current||!this.clipboard.length||this.api.busy())return;
    const copies=this.clipboard.slice(0,200-this.annotations.length).map(a=>({...clone(a),id:crypto.randomUUID(),locked:false})),ids=new Set(copies.map(a=>a.id));
    this.selected=ids;this.commit([...this.annotations,...translateAnnotations(copies,ids,10,10,this.current.width,this.current.height)]);
  }
  layer(side){const selected=this.annotations.filter(a=>this.selected.has(a.id)),rest=this.annotations.filter(a=>!this.selected.has(a.id));this.commit(side==='front'?[...rest,...selected]:[...selected,...rest]);}
  align(kind){
    const chosen=this.annotations.filter(a=>this.selected.has(a.id)&&!a.locked);if(chosen.length<2)return;
    const axis=kind.endsWith('_v')||['top','bottom'].includes(kind)?'y':'x';
    const positions=chosen.map(a=>({id:a.id,min:Math.min(...a.points.map(p=>p[axis])),max:Math.max(...a.points.map(p=>p[axis]))}));
    const low=Math.min(...positions.map(p=>p.min)),high=Math.max(...positions.map(p=>p.max));
    let all=clone(this.annotations);for(const p of positions){const delta=['left','top'].includes(kind)?low-p.min:['right','bottom'].includes(kind)?high-p.max:(low+high-p.min-p.max)/2;all=translateAnnotations(all,new Set([p.id]),axis==='x'?delta:0,axis==='y'?delta:0,this.current.width,this.current.height);}this.commit(all);
  }
  key(event){
    if(!this.current||this.api.busy()||document.querySelector('dialog[open]')||event.target.matches('input,textarea,select')||!this.api.active())return;
    if(event.key==='Escape'&&(this.mode||this.gesture)){this.stop(event);if(this.gesture?.before)this.current.settings=this.gesture.before;this.cancelDrawing();this.sync();this.api.render();return;}
    if((event.ctrlKey||event.metaKey)&&!event.shiftKey&&event.key.toLowerCase()==='v'&&this.clipboard.length){this.stop(event);this.paste();return;}
    if(!this.selected.size)return;
    if(event.key==='Delete'||event.key==='Backspace'){this.stop(event);this.remove();}
    else if((event.ctrlKey||event.metaKey)&&!event.shiftKey&&['c','v'].includes(event.key.toLowerCase())){this.stop(event);event.key.toLowerCase()==='c'?this.copy():this.paste();}
    else if(!event.ctrlKey&&!event.metaKey&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){this.stop(event);const n=event.shiftKey?10:1;this.commit(translateAnnotations(this.annotations,this.selected,event.key==='ArrowLeft'?-n:event.key==='ArrowRight'?n:0,event.key==='ArrowUp'?-n:event.key==='ArrowDown'?n:0,this.current.width,this.current.height));}
  }
}
