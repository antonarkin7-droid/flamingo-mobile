const opened=new Promise((resolve,reject)=>{const r=indexedDB.open('flamingo-mobile',1);r.onupgradeneeded=()=>{r.result.createObjectStore('settings');r.result.createObjectStore('queue',{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
async function transaction(store,method,...args){const db=await opened;return new Promise((resolve,reject)=>{const tx=db.transaction(store,method==='get'||method==='getAll'?'readonly':'readwrite'),r=tx.objectStore(store)[method](...args);let value;r.onsuccess=()=>{value=r.result;};tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
export const setting=key=>transaction('settings','get',key);
export const setSetting=(key,value)=>transaction('settings','put',value,key);
export const entries=()=>transaction('queue','getAll');
export const saveEntry=value=>transaction('queue','put',value);
export const deleteEntry=id=>transaction('queue','delete',id);
async function tokenKey(){let value=await setting('token-key');if(!value){value=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);await setSetting('token-key',value);}return value;}
export async function storeToken(value){const iv=crypto.getRandomValues(new Uint8Array(12));const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},await tokenKey(),new TextEncoder().encode(value));await setSetting('token',{iv,data});}
export async function getToken(){const value=await setting('token');if(!value)return '';return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:value.iv},await tokenKey(),value.data));}
export async function clearToken(){await setSetting('token',null);}
