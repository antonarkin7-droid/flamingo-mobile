import {modules} from './modules.js';
import {setting,setSetting,entries,getToken,storeToken,clearToken} from './storage.js';
import {sendQueue} from './advance.js';
export function node(tag,props={},...children){const el=document.createElement(tag);for(const [key,value]of Object.entries(props)){if(key.startsWith('on'))el[key]=value;else if(key==='className')el.className=value;else if(value===true)el.setAttribute(key,'');else if(value!==false&&value!=null)el.setAttribute(key,String(value));}for(const child of children)el.append(child instanceof Node?child:document.createTextNode(String(child)));return el;}
const root=document.getElementById('app'),nav=document.getElementById('nav'),statusEl=document.getElementById('status');
const status=(text,error=false)=>{statusEl.textContent=text;statusEl.className=error?'error':'success';};
const context={root,node,status,navigate};let current='home',installPrompt;
async function navigate(id){current=id;root.replaceChildren();nav.replaceChildren();for(const item of [{id:'home',title:'Главная'},...modules,{id:'settings',title:'Настройки'}])nav.append(node('button',{className:item.id===id?'active':'',onclick:()=>navigate(item.id)},item.title));try{if(id==='home')await home();else if(id==='settings')await settings();else await modules.find(m=>m.id===id)?.render(context);}catch(error){status(error.message,true);}}
async function home(){root.append(node('h1',{},'Рабочая система'),node('p',{className:'muted'},'Выберите раздел. Новые разделы будут добавляться по мере развития Flamingo.'));for(const section of modules)root.append(node('button',{className:'card',onclick:()=>navigate(section.id)},section.title));const pending=(await entries()).filter(e=>e.status!=='done').length;if(pending)root.append(node('p',{},`Ожидают загрузки: ${pending}`));}
async function settings(){
 root.append(node('h1',{},'Настройки'));const profile=await setting('profile'),token=await getToken();
 const block=node('section');block.append(node('h2',{},'Подключение компьютера'));
 const input=node('input',{type:'file',accept:'.json,application/json'});input.onchange=async()=>{try{const file=input.files[0];if(file.size>32000)throw new Error('Некорректный файл настроек');const value=JSON.parse(await file.text());if(value.version!==1||!/^disk:\/Flamingo\/advance\/[a-zA-Z0-9-]{1,80}\/Входящие$/.test(value.root)||!Array.isArray(value.categories)||value.categories.length>200||value.categories.some(c=>typeof c!=='string'||!c.trim()||c.length>100)||!/^[-a-zA-Z0-9]{0,100}$/.test(value.clientId))throw new Error('Выберите файл настроек, скачанный из Flamingo на компьютере');if(profile&&profile.root!==value.root)await clearToken();await setSetting('profile',value);status('Настройки импортированы. Подключите свой Яндекс Диск.');await navigate('settings');}catch(error){status(error.message,true);}};
 block.append(node('p',{className:'muted'},'На компьютере: «Реквизиты и статьи» → «Скачать настройки для телефона». Перенесите JSON на телефон и выберите здесь.'),input);if(profile)block.append(node('p',{className:'muted'},'Статьи: '+profile.categories.join(', ')));root.append(block);
 const disk=node('section');disk.append(node('h2',{},'Яндекс Диск'),node('p',{},token?'Диск подключён на этом телефоне':'Диск ещё не подключён'));
 const connect=node('button',{className:'primary',disabled:!profile?.clientId},'Войти в Яндекс');connect.onclick=()=>{const nonce=crypto.randomUUID();sessionStorage.setItem('flamingo-mobile-oauth',nonce);const redirect=location.origin+location.pathname;sessionStorage.setItem('flamingo-mobile-return',redirect);location.assign('https://oauth.yandex.ru/authorize?'+new URLSearchParams({response_type:'token',client_id:profile.clientId,redirect_uri:redirect,state:nonce}));};disk.append(connect);
 if(token){const disconnect=node('button',{},'Отключить на телефоне');disconnect.onclick=async()=>{await clearToken();await navigate('settings');};disk.append(disconnect);}
 disk.append(node('p',{className:'muted'},'При регистрации Яндекс OAuth добавьте этот Redirect URI:'),node('code',{},location.origin+location.pathname));root.append(disk);
 root.append(node('section',{},node('h2',{},'Установка'),node('p',{},'Откройте постоянный HTTPS-адрес Flamingo в Chrome на Android. В меню браузера выберите «Установить приложение» или «Добавить на главный экран».'),node('p',{className:'muted'},'Без интернета фото остаются в очереди на этом телефоне. Загрузка возобновляется при открытом приложении и доступном интернете. Не очищайте данные браузера до отправки документов.')));
}
async function start(){
 const auth=new URLSearchParams(location.hash.slice(1));
 if(auth.has('access_token')||auth.has('error')){history.replaceState(null,'',location.pathname);const expected=sessionStorage.getItem('flamingo-mobile-oauth');sessionStorage.removeItem('flamingo-mobile-oauth');if(!expected||auth.get('state')!==expected||!auth.get('access_token'))status('Вход не подтверждён. Повторите подключение.',true);else{await storeToken(auth.get('access_token'));status('Яндекс Диск подключён. Можно фотографировать документы.');current='advance';}}
 await navigate(current);
 if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>status('Для работы без интернета требуется HTTPS-адрес приложения.',true));
 if(navigator.storage?.persist)await navigator.storage.persist();
}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;document.getElementById('install').hidden=false;});
document.getElementById('install').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;document.getElementById('install').hidden=true;}};
window.addEventListener('online',async()=>{await sendQueue(context);if(current==='advance')await navigate(current);});
start().catch(error=>status(error.message,true));
