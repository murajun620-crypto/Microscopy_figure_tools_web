import { decodeImage, releaseImage } from './io.js?v=5a795d503d07';
import { buildPlan, paint, prepareFigureText } from './render.js?v=c86a00c5f06a';

// Decode one image at a time and draw only cards near the visible viewport.
export class ImageOverview {
  constructor(root,api){
    this.root=root;this.api=api;this.cards=new Map();this.active=false;this.running=false;this.revision=0;
    this.observer=new IntersectionObserver(entries=>{
      for(const entry of entries){const card=this.cards.get(entry.target.dataset.imageId);if(card)card.visible=entry.isIntersecting;}
      this.revision++;this.queue();
    },{root:root.parentElement,rootMargin:'300px'});
  }
  update(active){
    this.active=active;this.root.hidden=!active;this.revision++;
    const items=this.api.items(),ids=new Set(items.map(item=>item.id));
    for(const [id,card] of this.cards)if(!ids.has(id)){
      this.observer.unobserve(card.button);card.canvas.width=card.canvas.height=0;card.button.remove();this.cards.delete(id);
    }
    if(!active)return;
    for(const [index,item] of items.entries()){
      let card=this.cards.get(item.id);
      if(!card){
        const button=document.createElement('button');button.type='button';button.className='overview-card';button.dataset.imageId=item.id;
        const image=document.createElement('span');image.className='overview-image';
        const canvas=document.createElement('canvas');canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${item.name}の処理後画像`);image.append(canvas);
        const name=document.createElement('span');name.className='overview-name';
        const status=document.createElement('span');status.className='overview-status';status.textContent='読み込み中…';
        button.append(image,name,status);button.addEventListener('click',()=>{if(!this.api.busy())this.api.select(item);});
        card={button,canvas,name,status,visible:false,signature:null};this.cards.set(item.id,card);this.root.append(button);this.observer.observe(button);
      }
      card.button.disabled=this.api.busy();card.button.classList.toggle('selected',item===this.api.current());
      card.button.setAttribute('aria-label',`${item.name}を個別表示`);card.button.setAttribute('aria-current',String(item===this.api.current()));
      card.name.textContent=`${index+1}. ${item.name}`;card.button.title=`${item.name}：クリックして個別表示・編集`;
      if(card.signature&&!card.button.classList.contains('failed'))card.status.textContent=`${item.width} × ${item.height} px${item.enabled?'':' · 一括保存の対象外'}`;
      if(this.root.children[index]!==card.button)this.root.insertBefore(card.button,this.root.children[index]||null);
    }
    this.queue();
  }
  queue(){if(this.scheduled)return;this.scheduled=requestAnimationFrame(()=>{this.scheduled=0;void this.draw();});}
  async draw(){
    if(this.running||!this.active)return;this.running=true;const revision=this.revision;
    try{
      for(const item of this.api.items()){
        if(!this.active||revision!==this.revision)break;
        const card=this.cards.get(item.id);if(!card?.visible)continue;
        const signature=JSON.stringify(item.settings),width=Math.max(180,card.button.clientWidth-20),ratio=Math.min(2,devicePixelRatio||1);
        const key=`${signature}:${Math.round(width)}:${ratio}`;if(card.signature===key)continue;
        let decoded=null;card.status.textContent='読み込み中…';card.button.classList.remove('failed');
        try{
          const settings=structuredClone(item.settings);await prepareFigureText(settings);const context=card.canvas.getContext('2d'),plan=buildPlan(settings,context,false,1,true,this.api.planOptions?.());
          decoded=await decodeImage(item.file,item);
          if(!this.active||revision!==this.revision||!this.cards.has(item.id))break;
          const scale=Math.min(1,width*ratio/plan.width,240*ratio/plan.height,Math.sqrt(320000/(plan.width*plan.height)));
          card.canvas.width=Math.max(1,Math.round(plan.width*scale));card.canvas.height=Math.max(1,Math.round(plan.height*scale));
          context.setTransform(card.canvas.width/plan.width,0,0,card.canvas.height/plan.height,0,0);paint(context,decoded.source,plan,settings);
          context.setTransform(1,0,0,1,0,0);card.signature=key;
          card.status.textContent=`${item.width} × ${item.height} px${item.enabled?'':' · 一括保存の対象外'}`;
        }catch(error){card.signature=key;card.canvas.width=card.canvas.height=1;card.button.classList.add('failed');card.status.textContent=error.message;}
        finally{if(decoded)releaseImage(decoded.source);}
      }
    }finally{this.running=false;if(this.active&&revision!==this.revision)this.queue();}
  }
}
