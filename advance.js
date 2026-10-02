import {setting,setSetting,entries,saveEntry,deleteEntry,getToken} from './storage.js';
import {packetFolder} from './lib/mobile-packets.js';
import {uploadEntry} from './disk.js';
let uploading=false;
export async function sendQueue(context){
 if(uploading)return;
 uploading=true;
 try{
  const profile=await setting('profile'),token=await getToken();
  if(!profile||!token)throw new Error('Сначала подключите Яндекс Диск в настройках');
  let failed=false;
  for(const entry of (await entries()).filter(e=>e.status!=='done'&&e.root===profile.root)){
   if(!navigator.onLine)break;
   try{context.status('Загружаю документ…');entry.folder=await uploadEntry(token,profile,entry);entry.status='done';entry.error='';await saveEntry(entry);}
   catch(error){entry.status='error';entry.error=error.message;await saveEntry(entry);context.status(error.message,true);failed=true;break;}
  }
  if(!failed)context.status('Очередь обработана. Документы с отметкой «На Диске» доступны на компьютере.');
 }catch(error){context.status(error.message,true);}finally{uploading=false;}
}
export async function renderAdvance(context){
 const {root,node,status}=context,profile=await setting('profile');
 root.append(node('h1',{},'Авансовый отчёт'));
 if(!profile){root.append(node('p',{},'Сначала импортируйте настройки с компьютера и подключите Яндекс Диск.'),node('button',{onclick:()=>context.navigate('settings')},'Открыть настройки'));return;}
 const remembered=await setting('last-selection')||{},form=node('section');
 const period=node('input',{type:'month',value:remembered.period||new Date().toLocaleDateString('sv-SE').slice(0,7)});
 const category=node('select');profile.categories.forEach(c=>category.append(node('option',{value:c},c)));if(profile.categories.includes(remembered.category))category.value=remembered.category;
 const kind=node('select');kind.append(node('option',{value:'receipt'},'Кассовый чек'),node('option',{value:'other'},'Другой документ оплаты'));kind.value=remembered.kind||'receipt';
 form.append(node('label',{},'Отчётный месяц',period),node('label',{},'Статья расходов',category),node('label',{},'Тип документа',kind));
 let files=[];
 const preview=node('div'),camera=node('input',{type:'file',accept:'image/jpeg,image/png',capture:'environment'}),library=node('input',{type:'file',accept:'image/jpeg,image/png,application/pdf',multiple:true});
 const show=()=>{preview.replaceChildren(node('p',{className:'muted'},`Выбрано документов: ${files.length}`));if(files[0]?.type.startsWith('image/')){const url=URL.createObjectURL(files[0]),image=node('img',{src:url,className:'preview',alt:'Фото документа'});image.onload=()=>URL.revokeObjectURL(url);preview.append(image);}};
 const add=input=>{const incoming=[...input.files];if(incoming.some(f=>f.size>15*1024*1024||!['image/jpeg','image/png','application/pdf'].includes(f.type))){status('Выберите JPG, PNG или PDF до 15 МБ.',true);return;}files.push(...incoming);show();input.value='';};
 camera.onchange=()=>add(camera);library.onchange=()=>add(library);
 form.append(node('label',{},'Сделать фото',camera),node('label',{},'Добавить фото или PDF',library),preview);
 const together=node('input',{type:'checkbox'});form.append(node('label',{},together,'Все выбранные файлы подтверждают одну оплату'));
 const button=node('button',{className:'primary'},'Сохранить и загрузить');
 button.onclick=async()=>{
  if(!files.length){status('Сначала сфотографируйте или выберите документ.',true);return;}
  button.disabled=true;
  try{
   const folder=packetFolder(period.value,category.value,kind.value);
   await setSetting('last-selection',{period:period.value,category:category.value,kind:kind.value});
   if(files.length>100||(together.checked&&files.length>30))throw new Error('Выбрано слишком много документов');
   const groups=together.checked?[files]:files.map(f=>[f]);
   for(const group of groups)await saveEntry({id:crypto.randomUUID(),root:profile.root,period:period.value,category:category.value,kind:kind.value,files:group,folder,createdAt:new Date().toISOString(),status:'pending',error:''});
   files=[];show();status(navigator.onLine?'Фото сохранены на телефоне. Начинаю загрузку…':'Фото сохранены на телефоне. При появлении интернета откройте Flamingo для загрузки.');
   if(navigator.onLine)await sendQueue(context);
   await context.navigate('advance');
  }catch(error){status(error.message,true);}finally{button.disabled=false;}
 };
 form.append(button,node('p',{className:'muted'},'Папка выбирается автоматически по месяцу, статье и типу. Компьютер может быть выключен.'));root.append(form);
 const queue=node('section');queue.append(node('h2',{},'Документы с телефона'));
 const rows=(await entries()).filter(e=>e.root===profile.root).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 if(!rows.length)queue.append(node('p',{className:'muted'},'Документов пока нет.'));
 for(const entry of rows){const row=node('div',{className:'queue-row'});row.append(node('strong',{},entry.folder),node('span',{className:entry.status==='done'?'success':'error'},entry.status==='done'?'На Диске':entry.status==='error'?'Не загружен: '+entry.error:'Ожидает загрузки'),node('span',{className:'muted'},`${new Date(entry.createdAt).toLocaleString('ru-RU')} · файлов: ${entry.files.length}`));
  const remove=node('button',{},entry.status==='done'?'Убрать из списка':'Удалить с телефона');remove.onclick=async()=>{if(confirm(entry.status==='done'?'Убрать из списка телефона? На Диске документ сохранится.':'Удалить незагруженный документ с телефона?')){await deleteEntry(entry.id);await context.navigate('advance');}};row.append(remove);queue.append(row);
 }
 const retry=node('button',{disabled:uploading},'Загрузить ожидающие');retry.onclick=async()=>{retry.disabled=true;await sendQueue(context);await context.navigate('advance');};queue.append(retry);root.append(queue);
}
