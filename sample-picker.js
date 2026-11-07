import { SAMPLES, SAMPLE_GROUPS, sampleRaster } from './samples.js?v=6fd1472c81d2';
import { showDialog } from './movable-dialog.js?v=ef4fdc07b37c';

const $=id=>document.getElementById(id);
export class SamplePicker{
  constructor(api){
    this.api=api;this.group='all';this.pending=null;this.loading=false;this.drawn=false;
    $('closeSampleDialog').onclick=()=>{this.clear();$('sampleDialog').close();};
    $('sampleDialog').addEventListener('cancel',event=>{if(this.loading)event.preventDefault();else this.clear();});
    $('cancelSampleSwitch').onclick=()=>this.clear();
    $('confirmSampleSwitch').onclick=()=>{if(this.pending)this.load(this.pending,true);};
    $('sampleList').onclick=event=>{const button=event.target.closest('[data-sample-id]');if(button)this.load({id:button.dataset.sampleId,count:Number($('sampleCount').value)});};
  }
  clear(){this.pending=null;$('sampleConfirm').hidden=true;this.sync();}
  sync(){for(const button of document.querySelectorAll('#sampleList button,#sampleGroups button'))button.disabled=this.loading||!!this.pending;$('sampleCount').disabled=this.loading||!!this.pending;$('closeSampleDialog').disabled=this.loading;$('confirmSampleSwitch').disabled=this.loading;$('cancelSampleSwitch').disabled=this.loading;}
  open(count=1){
    if(this.api.busy())return;
    $('sampleCount').value=String(count);this.clear();$('sampleStatus').textContent='';
    if(!this.drawn){
      for(const group of SAMPLE_GROUPS){const button=document.createElement('button');button.className='button quiet';button.textContent=group.title;button.dataset.sampleGroup=group.id;button.onclick=()=>{this.group=group.id;this.filter();};$('sampleGroups').append(button);}
      for(const spec of SAMPLES){
        const button=document.createElement('button');button.className='sample-card';button.dataset.sampleId=spec.id;button.dataset.group=spec.group;button.setAttribute('aria-label',`${spec.title}のサンプルを使う`);
        const canvas=document.createElement('canvas'),image=sampleRaster(spec.id,0,270,195);canvas.width=image.width;canvas.height=image.height;canvas.setAttribute('aria-hidden','true');canvas.getContext('2d').putImageData(new ImageData(image.data,image.width,image.height),0,0);
        const title=document.createElement('strong'),description=document.createElement('span');title.textContent=spec.title;description.textContent=spec.description;button.append(canvas,title,description);$('sampleList').append(button);
      }this.drawn=true;
    }
    this.filter();showDialog($('sampleDialog'));
  }
  filter(){for(const button of document.querySelectorAll('[data-sample-group]'))button.setAttribute('aria-pressed',String(button.dataset.sampleGroup===this.group));for(const button of document.querySelectorAll('#sampleList button'))button.hidden=this.group!=='all'&&button.dataset.group!==this.group;}
  async load(selection,confirmed=false){
    if(this.loading||this.api.busy())return;
    if(!confirmed&&this.api.dirty()){
      this.pending=selection;$('sampleConfirmMessage').textContent=`未保存の変更があります。「${SAMPLES.find(s=>s.id===selection.id).title}」（${selection.count}枚）に切り替えると、現在の作業内容は失われます。`;$('sampleConfirm').hidden=false;this.sync();$('cancelSampleSwitch').focus();return;
    }
    this.loading=true;this.sync();$('sampleStatus').textContent='サンプルを準備しています…';
    try{await this.api.load(selection.id,selection.count);this.loading=false;this.clear();$('sampleDialog').close();}
    catch(error){this.pending=null;$('sampleConfirm').hidden=true;$('sampleStatus').textContent=error.message;}
    finally{this.loading=false;this.sync();}
  }
}
