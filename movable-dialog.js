// Match PlotLauncher's dialog movement without changing saved figure settings.
export function dialogPosition(left,top,width,height,viewportWidth,viewportHeight,gap=8){
  return {left:Math.round(Math.max(gap,Math.min(left,Math.max(gap,viewportWidth-width-gap)))),top:Math.round(Math.max(gap,Math.min(top,Math.max(gap,viewportHeight-height-gap))))};
}
function positionDialog(dialog,left,top){
  const box=dialog.getBoundingClientRect(),viewport=document.documentElement;
  const p=dialogPosition(left,top,box.width,box.height,viewport.clientWidth||window.innerWidth,viewport.clientHeight||window.innerHeight);
  Object.assign(dialog.style,{position:'fixed',inset:'auto',margin:'0',left:`${p.left}px`,top:`${p.top}px`});
}
function keepDialogInView(dialog){
  if(!dialog.open||!dialog.style.left)return;
  const box=dialog.getBoundingClientRect();positionDialog(dialog,box.left,box.top);
}
export function showDialog(dialog){dialog.showModal();keepDialogInView(dialog);}
export function setupMovableDialogs(root=document){
  const dialogs=[...root.querySelectorAll('dialog')];
  for(const dialog of dialogs){
    const heading=dialog.querySelector('.dialog-heading');
    if(!heading||dialog.dataset.movable)continue;
    dialog.dataset.movable='true';dialog.classList.add('movable-dialog');
    heading.title='ドラッグで移動。矢印キーで微調整。ダブルクリックで中央に戻す。';
    heading.tabIndex=0;heading.setAttribute('role','group');heading.setAttribute('aria-label','ウィンドウの位置（ドラッグまたは矢印キーで移動）');
    const interactive=target=>target.closest('button,input,select,textarea,a,label,summary,[contenteditable]');
    let drag=null;
    const stop=()=>{
      if(!drag)return;
      const id=drag.id;drag=null;dialog.classList.remove('dialog-dragging');
      if(heading.hasPointerCapture(id))heading.releasePointerCapture(id);
    };
    const move=event=>{
      if(drag&&event.pointerId===drag.id)positionDialog(dialog,drag.left+event.clientX-drag.x,drag.top+event.clientY-drag.y);
    };
    heading.addEventListener('pointerdown',event=>{
      if(event.button!==0||event.isPrimary===false||interactive(event.target))return;
      const box=dialog.getBoundingClientRect();drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:box.left,top:box.top};
      event.preventDefault();heading.focus({preventScroll:true});heading.setPointerCapture(event.pointerId);dialog.classList.add('dialog-dragging');
    });
    heading.addEventListener('pointermove',move);
    heading.addEventListener('pointerup',event=>{if(event.pointerId===drag?.id){move(event);stop();}});
    for(const name of ['pointercancel','lostpointercapture'])heading.addEventListener(name,event=>{if(event.pointerId===drag?.id)stop();});
    dialog.addEventListener('close',stop);
    heading.addEventListener('dblclick',event=>{
      if(interactive(event.target))return;
      event.preventDefault();stop();for(const key of ['position','inset','margin','left','top','right','bottom'])dialog.style.removeProperty(key);
    });
    heading.addEventListener('keydown',event=>{
      if(event.target!==heading||event.ctrlKey||event.metaKey||event.altKey)return;
      const direction={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];if(!direction)return;
      event.preventDefault();event.stopPropagation();const box=dialog.getBoundingClientRect(),step=event.shiftKey?20:5;
      positionDialog(dialog,box.left+direction[0]*step,box.top+direction[1]*step);
    });
    new ResizeObserver(()=>keepDialogInView(dialog)).observe(dialog);
  }
  window.addEventListener('resize',()=>dialogs.forEach(keepDialogInView));
}
