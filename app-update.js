import { showDialog } from './movable-dialog.js?v=ef4fdc07b37c';

export const APP_BUILD = '420fdae1db08';
const $=id=>document.getElementById(id);
export function updateAvailability(latest,version,build){
  if(!latest||!/^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(latest.version)||!/^[a-f\d]{12}$/.test(latest.build))throw new Error('配信情報を確認できませんでした。');
  const a=latest.version.split('.').map(Number),b=version.split('.').map(Number),index=a.findIndex((v,i)=>v!==b[i]);
  return index>=0&&a[index]<b[index]?'older':latest.version===version&&latest.build===build?'current':'available';
}
export function updateSessionStore(operation,key,value){
  return new Promise((resolve,reject)=>{
    if(!globalThis.indexedDB){reject(new Error('このブラウザでは作業の一時保存を利用できません。'));return;}
    const opening=indexedDB.open('mifito-updates',1);
    opening.onupgradeneeded=()=>opening.result.createObjectStore('sessions');
    opening.onerror=()=>reject(opening.error||new Error('一時保存を開けませんでした。'));
    opening.onblocked=()=>reject(new Error('一時保存がほかのタブで使用されています。'));
    opening.onsuccess=()=>{
      const db=opening.result;
      try{
        const tx=db.transaction('sessions',operation==='get'?'readonly':'readwrite'),store=tx.objectStore('sessions');
        const request=operation==='put'?store.put(value,key):operation==='delete'?store.delete(key):store.get(key);
        tx.oncomplete=()=>{db.close();resolve(request.result);};
        tx.onabort=tx.onerror=()=>{db.close();reject(tx.error||request.error||new Error('作業内容を一時保存できませんでした。'));};
      }catch(error){db.close();reject(error);}
    };
  });
}
export class AppUpdater {
  constructor(api){
    this.api=api;this.checking=false;this.reloading=false;this.available=null;this.recovery=null;
    $('checkUpdateButton').onclick=$('recheckUpdateButton').onclick=()=>this.check();
    $('applyUpdateButton').onclick=()=>this.apply();
    $('retryUpdateRestore').onclick=()=>this.restore();
    $('downloadUpdateBackup').onclick=async()=>{try{await api.backup(this.recovery.record.session);}catch(error){this.message(`プロジェクトを取り出せませんでした。${error.message}`,true);}};
    $('closeUpdateDialog').onclick=()=>$('updateDialog').close();
    $('updateDialog').addEventListener('cancel',event=>{if(this.api.busy())event.preventDefault();});
  }
  message(text,error=false){$('updateMessage').textContent=text;$('updateMessage').classList.toggle('error',error);}
  sync(){
    const disabled=this.api.busy();
    $('checkUpdateButton').disabled=$('recheckUpdateButton').disabled=disabled||this.checking;
    $('applyUpdateButton').disabled=$('retryUpdateRestore').disabled=$('downloadUpdateBackup').disabled=disabled||this.checking;
    $('closeUpdateDialog').disabled=disabled;
  }
  async check(){
    if(this.checking||this.api.busy())return;
    this.checking=true;this.available=null;
    $('applyUpdateButton').hidden=true;$('retryUpdateRestore').hidden=!this.recovery;
    $('downloadUpdateBackup').hidden=!this.recovery?.record.session.items.length;
    this.message('更新を確認しています…');showDialog($('updateDialog'));this.sync();
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
    try{
      const url=new URL('./version.json',location.href);url.searchParams.set('check',String(Date.now()));
      const response=await fetch(url,{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error('配信情報を取得できませんでした。');
      const latest=await response.json(),state=updateAvailability(latest,this.api.version,APP_BUILD);
      if(state==='older')this.message(`現在は v${this.api.version} です。配信情報が古いため、少し後に再確認してください。`);
      else if(state==='current')this.message(`最新の v${this.api.version} を使用しています。`);
      else{this.available=latest;$('applyUpdateButton').hidden=false;this.message(`v${latest.version} に更新できます。開いている画像・設定と未保存の変更を維持して更新します。`);}
    }catch(error){this.message(`更新を確認できませんでした。接続を確認して再確認してください。${error.name==='AbortError'?'通信がタイムアウトしました。':error.message}`,true);}
    finally{clearTimeout(timeout);this.checking=false;this.sync();}
  }
  async apply(){
    if(!this.available||this.api.busy())return;
    this.api.lock(true);this.message('作業内容を一時保存しています…');
    const token=crypto.randomUUID();
    try{
      const session=this.recovery&&!this.api.hasWork()?this.recovery.record.session:await this.api.capture();
      const record={format:'mifito-update',version:1,fromVersion:this.api.version,fromBuild:APP_BUILD,target:this.available,url:location.href,createdAt:Date.now(),session};
      await updateSessionStore('put',token,record);
      const url=new URL(location.href);url.searchParams.set('_update',token);
      this.reloading=true;location.replace(url.href);
      setTimeout(()=>{this.reloading=false;this.api.lock(false);},5000);
    }catch(error){this.reloading=false;this.api.lock(false);this.message(`更新を中止しました。現在の作業はそのままです。${error.message}`,true);}
  }
  async restore(){
    const token=new URL(location.href).searchParams.get('_update');
    if(!token||!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/.test(token))return false;
    this.api.lock(true);let finish=null;
    try{
      const record=await updateSessionStore('get',token);
      if(!record||record.format!=='mifito-update'||record.version!==1||!Array.isArray(record.session?.items))throw new Error('一時保存した作業が見つかりません。');
      this.recovery={token,record};
      finish=await this.api.restore(record.session);
      const original=new URL(record.url);original.searchParams.delete('_update');
      if(original.origin===location.origin&&original.pathname===location.pathname)history.replaceState(null,'',original.href);
      try{await updateSessionStore('delete',token);}catch{}
      this.recovery=null;$('updateDialog').close();
      if(APP_BUILD===record.fromBuild&&this.api.version===record.fromVersion){this.message('作業は復元しましたが、更新ファイルをまだ取得できませんでした。少し後に再確認してください。');showDialog($('updateDialog'));}
      this.api.notify('更新前の作業内容を復元しました。');
    }catch(error){
      this.available=null;$('applyUpdateButton').hidden=true;$('retryUpdateRestore').hidden=false;$('downloadUpdateBackup').hidden=!this.recovery?.record.session.items.length;
      this.message(`作業の復元を完了できませんでした。一時保存した内容は保持しています。${error.message}`,true);showDialog($('updateDialog'));
    }finally{this.api.lock(false);finish?.();}
    return true;
  }
}
