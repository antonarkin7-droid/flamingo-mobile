const values=new URLSearchParams(location.hash.slice(1));history.replaceState(null,'',location.pathname);
try{
 const expected=sessionStorage.getItem('flamingo-yandex-state');sessionStorage.removeItem('flamingo-yandex-state');
 if(!expected||values.get('state')!==expected||!values.get('access_token'))throw new Error('Подключение не подтверждено. Повторите вход из настроек Flamingo.');
 const response=await fetch('/api/advance/disk-connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:values.get('access_token')})});
 if(!response.ok)throw new Error('Не удалось подключить Диск. Проверьте разрешения или войдите в Flamingo заново.');
 location.replace('/#advance');
}catch(error){document.getElementById('message').textContent=error.message;}
