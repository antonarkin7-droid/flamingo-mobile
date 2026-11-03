import {detectDocument} from './document-scan.js';
export async function openDocumentCamera({onCapture,onFallback,onError}) {
 if(!navigator.mediaDevices?.getUserMedia){onFallback();return;}
 const dialog=document.createElement('dialog');dialog.setAttribute('aria-label','Камера документов');
 dialog.style.cssText='box-sizing:border-box;position:fixed;inset:0;width:100vw;max-width:none;height:100dvh;max-height:none;margin:0;padding:16px;border:0;background:#252225;color:white;z-index:10000;';
 const status=document.createElement('p');status.style.cssText='font:16px system-ui';status.textContent='Наводите камеру так, чтобы документ целиком помещался в кадр.';
 const box=document.createElement('div');box.style.cssText='position:relative;margin:auto;';
 const video=document.createElement('video');video.autoplay=true;video.muted=true;video.playsInline=true;video.style.cssText='display:block;width:100%;max-height:calc(100dvh - 190px);object-fit:contain;';
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 1 1');svg.setAttribute('preserveAspectRatio','none');svg.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
 const frame=document.createElementNS(svg.namespaceURI,'polygon');frame.setAttribute('fill','#ffffff08');frame.setAttribute('stroke','white');frame.setAttribute('stroke-width','3');frame.setAttribute('vector-effect','non-scaling-stroke');svg.append(frame);box.append(video,svg);
 const actions=document.createElement('div');actions.style.cssText='display:flex;gap:12px;justify-content:center;margin-top:12px;flex-wrap:wrap';
 const button=(label,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=fn;b.style.cssText='padding:14px;border-radius:14px;background:white;color:#450032;font:16px system-ui';actions.append(b);return b;};
 let stream,timer,closed=false;
 function close(){if(closed)return;closed=true;clearInterval(timer);stream?.getTracks().forEach(t=>t.stop());video.srcObject=null;dialog.close();dialog.remove();window.removeEventListener('pagehide',close);document.removeEventListener('visibilitychange',hidden);}
 function hidden(){if(document.hidden)close();}
 const capture=button('Сфотографировать',async()=>{if(!video.videoWidth)return;capture.disabled=true;try{const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext('2d').drawImage(video,0,0);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.95));if(!blob)throw Error('Не удалось сделать снимок');const file=new File([blob],`scan-${Date.now()}.jpg`,{type:'image/jpeg'});close();await onCapture(file);}catch(error){onError(error.message);capture.disabled=false;}});capture.disabled=true;
 button('Обычная камера',()=>{close();onFallback();});button('Отмена',close);dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 dialog.append(status,box,actions);document.body.append(dialog);dialog.showModal();window.addEventListener('pagehide',close);document.addEventListener('visibilitychange',hidden);
 try {
  stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:2560},height:{ideal:1920}}});
  if(closed){stream.getTracks().forEach(t=>t.stop());return;}
  video.srcObject=stream;await video.play();if(closed)return;
  // Match the overlay to the displayed video, including portrait devices.
  box.style.width=Math.min(innerWidth-32,(innerHeight-190)*video.videoWidth/video.videoHeight)+'px';capture.disabled=false;
  timer=setInterval(()=>{if(closed||!video.videoWidth)return;const points=detectDocument(video);frame.setAttribute('points',points?points.map(p=>p.join(',')).join(' '):'');status.textContent=points?'Границы найдены. Сделайте снимок и проверьте обрезку.':'Поместите весь документ в кадр. При необходимости границы можно поправить после снимка.';},600);
 } catch(error){close();onError(error.name==='NotAllowedError'?'Доступ к камере не разрешён. Можно выбрать обычную камеру или готовое фото.': 'Камера недоступна. Используйте обычную камеру или выберите фото.');}
 return close;
}
