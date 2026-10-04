import {packetFolder} from './lib/mobile-packets.js';
const API='https://cloud-api.yandex.net/v1/disk/resources';
export async function diskRequest(token,suffix='',method='GET',params={}){
 const response=await fetch(API+suffix+'?'+new URLSearchParams(params),{method,headers:{Authorization:'OAuth '+token},signal:AbortSignal.timeout(30000)});
 if(method==='PUT'&&response.status===409)return {};
 if(!response.ok)throw new Error(response.status===401?'Войдите в Яндекс заново':response.status===507?'На Яндекс Диске закончилось место':'Яндекс Диск: ошибка '+response.status);
 return response.status===201||response.status===204?{}:response.json();
}
async function directory(token,path){let current='disk:';for(const part of path.replace(/^disk:\//,'').split('/')){current+='/'+part;await diskRequest(token,'','PUT',{path:current});}}
async function upload(token,path,blob){const link=await diskRequest(token,'/upload','GET',{path,overwrite:'true'}),url=new URL(link.href);if(url.protocol!=='https:')throw new Error('Недопустимая ссылка Диска');const response=await fetch(url,{method:'PUT',body:blob,signal:AbortSignal.timeout(90000)});if(!response.ok)throw new Error('Загрузка не завершена. Повторите попытку.');}
export async function uploadEntry(token,profile,entry){
 const folder=packetFolder(entry.period,entry.category,entry.kind),path=profile.root+'/'+folder;
 await directory(token,path);
 const files=[],processed=[];
 for(const [index,file]of entry.files.entries()){const extension=file.type==='image/png'?'png':file.type==='application/pdf'?'pdf':'jpg',name=entry.id+'-'+(index+1)+'.'+extension;await upload(token,path+'/'+name,file);files.push(name);const copy=entry.processed?.[index];if(copy){const copyName=entry.id+'-'+(index+1)+'-processed.png';await upload(token,path+'/'+copyName,copy);processed.push(copyName);}else processed.push(null);}
 // Publish metadata last. The desktop never imports an incomplete upload.
 await upload(token,path+'/flamingo-'+entry.id+'.json',new Blob([JSON.stringify({version:1,id:entry.id,period:entry.period,category:entry.category,kind:entry.kind,files,processed,createdAt:entry.createdAt})],{type:'application/json'}));
 return folder;
}
