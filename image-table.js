import { copy, validateCrop, validateSettings } from './core.js?v=e326b16982bb';
import { prepareCrop } from './crop-workflow.js?v=e326b16982bb';

const fields=new Set(['calibration.pixelSize','calibration.unit','scaleBar.visible','scaleBar.length','scaleBar.unit','panelLabel.visible','panelLabel.text','panelLabel.subtext','mapColorbar.visible','mapColorbar.min','mapColorbar.max','mapColorbar.title','mapColorbar.unit','mapColorbar.labelGapPercent','mapColorbar.titleGapPercent','crop.x','crop.y','crop.width','crop.height']);
export function prepareImageTableEdit(item,path,value){
  if(!fields.has(path))throw new Error('画像表の設定項目が不正です。');
  const settings=copy(item.settings),[section,key]=path.split('.');
  if(section==='crop'){
    const crop={...settings.crop,[key]:value};
    validateCrop(crop,item.width,item.height);
    return prepareCrop([item],item,crop,'individual')[0].settings;
  }
  if(section==='calibration'){
    if(key==='pixelSize')settings.calibration=value===null?null:{pixelSize:value,unit:settings.calibration?.unit??'µm'};
    else{if(!settings.calibration)throw new Error('先に校正値を入力してください。');settings.calibration.unit=value;}
  }else settings[section][key]=value;
  return validateSettings(settings,item.width,item.height);
}

const $=id=>document.getElementById(id),units=['nm','µm','mm'];
const valueOf=(item,path)=>path==='enabled'?item.enabled:item.settings[path.split('.')[0]]?.[path.split('.')[1]];
const fieldPending=(item,path,input)=>{
  const value=valueOf(item,path);
  if(input.type==='checkbox')return input.checked!==value;
  if(input.type==='number')return input.value===''?value!==null&&value!==undefined:Number(input.value)!==value;
  return input.value!==String(value??(path==='calibration.unit'?'µm':''));
};
export class ImageSettingsTable {
  constructor(api){
    this.api=api;this.rows=new Map();this.editing=false;
    this.columns=[
      ['No.',row=>row.number],['対象',row=>this.field(row,'enabled','一括保存の対象','checkbox')],
      ['画像',row=>{const button=document.createElement('button');button.className='image-table-name';row.name=button;button.onclick=()=>this.api.select(row.item);return button;}],
      ['校正値（1 px）',row=>this.group(this.field(row,'calibration.pixelSize','校正値','number',{min:0,step:'any',nullable:true}),this.field(row,'calibration.unit','校正の単位','select',{choices:units}))],
      ['スケールバー',row=>this.group(this.field(row,'scaleBar.visible','バー表示','checkbox'),this.field(row,'scaleBar.length','バーの長さ','number',{min:0,step:'any',nullable:true}),this.field(row,'scaleBar.unit','バーの単位','select',{choices:units}))],
      ['パネルラベル',row=>this.group(this.field(row,'panelLabel.visible','ラベル表示','checkbox'),this.field(row,'panelLabel.text','ラベル文字列','text',{maxLength:24}))],
      ['補足文字',row=>this.field(row,'panelLabel.subtext','補足文字','text',{maxLength:120})],
      ['カラーバー',row=>this.field(row,'mapColorbar.visible','カラーバー表示','checkbox')],
      ['最小値',row=>this.field(row,'mapColorbar.min','カラーバー最小値','number',{step:'any'})],
      ['最大値',row=>this.field(row,'mapColorbar.max','カラーバー最大値','number',{step:'any'})],
      ['元画像サイズ',row=>{row.size=document.createElement('span');return row.size;},true],
      ...[['x','トリミングX'],['y','トリミングY'],['width','トリミング幅'],['height','トリミング高さ']].map(([key,label])=>[`${label}（px）`,row=>this.field(row,`crop.${key}`,label,'number',{min:key==='x'||key==='y'?0:1,step:1}),true]),
      ['マップ名',row=>this.field(row,'mapColorbar.title','マップ名','text',{maxLength:100}),true],
      ['マップの単位',row=>this.field(row,'mapColorbar.unit','マップの単位','text',{maxLength:30}),true],
      ['目盛数字の余白（%）',row=>this.field(row,'mapColorbar.labelGapPercent','目盛数字の余白','number',{min:0,max:20,step:.1}),true],
      ['名称・単位の余白（%）',row=>this.field(row,'mapColorbar.titleGapPercent','名称・単位の余白（未入力はAuto）','number',{min:0,max:20,step:.1,nullable:true}),true],
      ['設定',row=>{const button=document.createElement('button');button.className='button quiet small';button.textContent='編集';button.onclick=()=>this.api.select(row.item);return button;}]
    ];
    const head=document.createElement('tr');
    for(const [label,,detail] of this.columns){const th=document.createElement('th');th.scope='col';th.textContent=label;if(detail)th.dataset.imageDetail='';head.append(th);}
    $('imageTableHead').append(head);
    $('toggleImageTable').onclick=()=>this.setCollapsed(!$('imageTableContent').hidden);
    $('imageTableDetails').onchange=()=>this.syncView();this.syncView();
  }
  group(...inputs){const box=document.createElement('span');box.className='image-table-fields';box.append(...inputs);return box;}
  field(row,path,label,type,options={}){
    const input=document.createElement(type==='select'?'select':'input');
    if(type!=='select')input.type=type;else for(const choice of options.choices)input.add(new Option(choice,choice));
    for(const key of ['min','max','step','maxLength'])if(options[key]!==undefined)input[key]=options[key];
    input.dataset.imageField=path;input.id=`imageTable_${row.item.id}_${path.replace('.','_')}`;
    input.setAttribute('aria-label',`表の${row.item.name}の${label}`);input.title=label;
    row.fields.set(path,{input,options});
    input.addEventListener('keydown',event=>{if(event.key==='Enter'&&input.tagName==='INPUT'){
      event.preventDefault();input.blur();
      // Restored raw text has no browser dirty flag, so blur may not emit change.
      if(!this.editing&&!this.api.busy()&&fieldPending(row.item,path,input))input.dispatchEvent(new Event('change',{bubbles:true}));
    }});
    input.addEventListener('change',async()=>{
      if(this.api.busy()||this.editing)return;
      this.editing=true;
      try{
        if(!input.checkValidity())throw new Error(`${label}の入力値が範囲外です。`);
        const value=type==='checkbox'?input.checked:type==='number'?(input.value===''&&options.nullable?null:input.value===''?NaN:input.valueAsNumber):input.value;
        if(type==='number'&&value!==null&&!Number.isFinite(value))throw new Error(`${label}を数値で入力してください。`);
        await this.api.edit(row.item,path,value);
      }catch(error){this.api.notify(`${row.item.name}：${error.message}`,true);}
      finally{this.editing=false;this.sync(true);}
    });return input;
  }
  get pending(){
    for(const row of this.rows.values())for(const [path,{input}] of row.fields){
      if(fieldPending(row.item,path,input))return true;
    }
    return false;
  }
  sync(force=false){
    const items=this.api.items(),ids=new Set(items.map(item=>item.id));$('imageTablePanel').hidden=!items.length;
    $('imageTableSummary').textContent=`${items.length}枚 · 保存対象 ${items.filter(item=>item.enabled).length}枚`;
    for(const [id,row] of this.rows)if(!ids.has(id)){row.tr.remove();this.rows.delete(id);}
    for(const [index,item] of items.entries()){
      let row=this.rows.get(item.id);
      if(!row){
        const tr=document.createElement('tr');tr.dataset.imageId=item.id;const number=document.createElement('span');
        row={item,tr,number,fields:new Map()};
        for(const [,create,detail] of this.columns){const td=document.createElement('td');if(detail)td.dataset.imageDetail='';td.append(create(row));tr.append(td);}
        this.rows.set(item.id,row);
      }
      row.item=item;if(row.number.textContent!==String(index+1))row.number.textContent=index+1;
      if(row.name.textContent!==item.name){row.name.textContent=item.name;row.name.title='クリックして個別表示・編集';row.name.setAttribute('aria-label',`表の${item.name}を個別編集`);}
      const size=`${item.width} × ${item.height}`;if(row.size.textContent!==size)row.size.textContent=size;row.tr.classList.toggle('selected',item===this.api.current());
      for(const [path,{input}] of row.fields){
        const value=valueOf(item,path);
        if(force||document.activeElement!==input){
          if(input.type==='checkbox'){if(input.checked!==value)input.checked=value;}
          else{const text=String(value??(path==='calibration.unit'?'µm':''));if(input.value!==text)input.value=text;}
        }
        const disabled=this.api.busy()||(!item.settings.calibration&&['calibration.unit','scaleBar.length','scaleBar.unit'].includes(path));if(input.disabled!==disabled)input.disabled=disabled;
      }
      for(const button of row.tr.querySelectorAll('button'))button.disabled=this.api.busy();
      if($('imageTableBody').children[index]!==row.tr)$('imageTableBody').insertBefore(row.tr,$('imageTableBody').children[index]||null);
    }
    $('toggleImageTable').disabled=$('imageTableDetails').disabled=this.api.busy();this.syncView();
  }
  setCollapsed(collapsed){$('imageTableContent').hidden=collapsed;this.syncView();}
  syncView(){
    const collapsed=$('imageTableContent').hidden,button=$('toggleImageTable');button.textContent=collapsed?'＋':'−';button.setAttribute('aria-expanded',String(!collapsed));button.setAttribute('aria-label',collapsed?'画像設定表を開く':'画像設定表を閉じる');
    $('imageSettingsTable').dataset.details=String($('imageTableDetails').checked);
    $('editorPanel').classList.toggle('image-table-open',!$('imageTablePanel').hidden&&!collapsed);
  }
}
