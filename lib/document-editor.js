import {detectDocument,scanPixels} from './document-scan.js';
// Originals are never replaced. Corners are TL, TR, BR, BL in image coordinates.
export function validCorners(points){
 if(!Array.isArray(points)||points.length!==4||points.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||v<0||v>1)))return false;
 const crosses=points.map((p,i)=>{const q=points[(i+1)%4],r=points[(i+2)%4];return(q[0]-p[0])*(r[1]-q[1])-(q[1]-p[1])*(r[0]-q[0]);});
 const area=Math.abs(points.reduce((s,p,i)=>{const q=points[(i+1)%4];return s+p[0]*q[1]-q[0]*p[1];},0))/2;
 return crosses.every(v=>v>0)&&area>.01;
}
export function quadPoint(p,u,v){
 const [a,b,c,d]=p,dx1=b[0]-c[0],dx2=d[0]-c[0],dx3=a[0]-b[0]+c[0]-d[0],dy1=b[1]-c[1],dy2=d[1]-c[1],dy3=a[1]-b[1]+c[1]-d[1];
 const det=dx1*dy2-dx2*dy1;
 const g=Math.abs(det)<1e-12?0:(dx3*dy2-dx2*dy3)/det,h=Math.abs(det)<1e-12?0:(dx1*dy3-dx3*dy1)/det,z=g*u+h*v+1;
 return [((b[0]-a[0]+g*b[0])*u+(d[0]-a[0]+h*d[0])*v+a[0])/z,((b[1]-a[1]+g*b[1])*u+(d[1]-a[1]+h*d[1])*v+a[1])/z];
}
export async function rectifyImage(image,points){
 if(!validCorners(points))throw new Error('Углы пересеклись. Укажите верхний левый, верхний правый, нижний правый и нижний левый углы.');
 const w=image.naturalWidth||image.width,h=image.naturalHeight||image.height;
 if(w*h>40_000_000)throw new Error('Фото слишком большое для обработки. Используйте изображение до 40 мегапикселей.');
 const p=points.map(([x,y])=>[x*w,y*h]),length=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
 const width=Math.round(Math.max(length(p[0],p[1]),length(p[3],p[2]))),height=Math.round(Math.max(length(p[0],p[3]),length(p[1],p[2])));
 const pad=Math.max(16,Math.round(Math.min(width,height)*.035));
 const source=document.createElement('canvas');source.width=w;source.height=h;
 const ctx=source.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,w,h).data;
 const output=document.createElement('canvas');output.width=width+pad*2;output.height=height+pad*2;
 const out=output.getContext('2d'),pixels=out.createImageData(output.width,output.height);pixels.data.fill(255);
 // Keep an extra strip of the original outside the selected corners. This
 // protects edge print; the outer frame remains straight and white.
 const margin=Math.max(3,Math.round(Math.min(width,height)*.012));
 for(let y=pad-margin;y<pad+height+margin;y++)for(let x=pad-margin;x<pad+width+margin;x++){
  const [sx,sy]=quadPoint(p,(x-pad)/width,(y-pad)/height);
  if(sx<0||sy<0||sx>=w-1||sy>=h-1)continue;
  const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy,index=(y*output.width+x)*4;
  for(let k=0;k<3;k++)pixels.data[index+k]=data[(iy*w+ix)*4+k]*(1-fx)*(1-fy)+data[(iy*w+ix+1)*4+k]*fx*(1-fy)+data[((iy+1)*w+ix)*4+k]*(1-fx)*fy+data[((iy+1)*w+ix+1)*4+k]*fx*fy;
 }
 out.putImageData(pixels,0,0);
 return new Promise((resolve,reject)=>output.toBlob(blob=>blob?resolve(blob):reject(new Error('Не удалось подготовить фото.')),'image/png'));
}
export function mountDocumentEditor(root,{url,onApply,onCancel}) {
 let disposed=false,active=-1,points=[[.02,.02],[.98,.02],[.98,.98],[.02,.98]],mode='original',previewUrl='',generation=0;
 const dialog=document.createElement('dialog');
 dialog.setAttribute('aria-label','Скан документа');
 dialog.style.cssText='box-sizing:border-box;position:fixed;inset:0;width:100vw;max-width:none;height:100dvh;max-height:none;margin:0;border:0;padding:16px;background:#252225;color:white;overflow:auto;z-index:10000;';
 const title=document.createElement('h2');title.textContent='Границы документа';title.style.cssText='font:600 20px system-ui;margin:0 0 10px;color:white';
 const status=document.createElement('p');status.setAttribute('role','status');status.style.cssText='font:14px system-ui;color:white;min-height:20px';
 const controls=document.createElement('div');controls.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin:12px 0;';
 const button=(text,action)=>{const el=document.createElement('button');el.type='button';el.textContent=text;el.style.cssText='padding:12px 16px;min-height:44px;border:1px solid #92798a;border-radius:12px;background:#fff;color:#450032;font:16px system-ui;';el.onclick=action;controls.append(el);return el;};
 const box=document.createElement('div');box.style.cssText='position:relative;margin:auto;touch-action:none;';
 const canvas=document.createElement('canvas');canvas.style.cssText='width:100%;display:block;';
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.style.cssText='position:absolute;inset:0;width:100%;height:100%;touch-action:none;';
 const polygon=document.createElementNS(svg.namespaceURI,'polygon');polygon.setAttribute('fill','#ffffff08');polygon.setAttribute('stroke','white');polygon.setAttribute('stroke-width','2');polygon.setAttribute('vector-effect','non-scaling-stroke');svg.append(polygon);
 const lens=document.createElement('canvas');lens.width=lens.height=160;lens.style.cssText='display:none;position:fixed;width:160px;height:160px;border:3px solid white;border-radius:50%;pointer-events:none;box-shadow:0 2px 12px black;';
 const labels=['Верхний левый угол','Верхний правый угол','Нижний правый угол','Нижний левый угол'];
 const handles=points.map((_,i)=>{const c=document.createElementNS(svg.namespaceURI,'circle');c.setAttribute('fill','#ffffff22');c.setAttribute('stroke','white');c.setAttribute('stroke-width','2');c.setAttribute('vector-effect','non-scaling-stroke');c.setAttribute('tabindex','0');c.setAttribute('role','slider');c.setAttribute('aria-label',labels[i]);
  c.addEventListener('pointerdown',e=>{active=i;svg.setPointerCapture(e.pointerId);e.preventDefault();move(e);});
  c.addEventListener('keydown',e=>{const delta={ArrowLeft:[-.003,0],ArrowRight:[.003,0],ArrowUp:[0,-.003],ArrowDown:[0,.003]}[e.key];if(delta){e.preventDefault();points[i]=points[i].map((v,k)=>Math.max(0,Math.min(1,v+delta[k])));draw();}});svg.append(c);return c;});
 function draw(){polygon.setAttribute('points',points.map(([x,y])=>`${x*canvas.width},${y*canvas.height}`).join(' '));handles.forEach((c,i)=>{c.setAttribute('cx',points[i][0]*canvas.width);c.setAttribute('cy',points[i][1]*canvas.height);c.setAttribute('r',Math.max(10,20*canvas.width/Math.max(1,box.clientWidth)));c.setAttribute('aria-valuetext',`${Math.round(points[i][0]*100)}%, ${Math.round(points[i][1]*100)}%`);});}
 function fit(){box.style.width=Math.max(120,Math.min(innerWidth-32,(innerHeight-240)*canvas.width/canvas.height,900))+'px';draw();}
 function move(e){if(active<0)return;const r=box.getBoundingClientRect();points[active]=[Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))];draw();
  const ctx=lens.getContext('2d'),[x,y]=points[active],span=80*canvas.width/r.width;
  ctx.fillStyle='#222';ctx.fillRect(0,0,160,160);ctx.drawImage(canvas,x*canvas.width-span/2,y*canvas.height-span/2,span,span,0,0,160,160);ctx.strokeStyle='white';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(65,80);ctx.lineTo(95,80);ctx.moveTo(80,65);ctx.lineTo(80,95);ctx.stroke();
  lens.style.display='block';lens.style.left=Math.max(8,Math.min(innerWidth-176,e.clientX+(e.clientX>innerWidth/2?-180:20)))+'px';lens.style.top=Math.max(8,Math.min(innerHeight-176,e.clientY-190))+'px';
 }
 svg.addEventListener('pointermove',move);const release=()=>{active=-1;lens.style.display='none';};svg.addEventListener('pointerup',release);svg.addEventListener('pointercancel',release);
 const preview=document.createElement('img');preview.alt='Готовый скан';preview.style.cssText='display:none;max-width:100%;max-height:calc(100dvh - 240px);margin:auto;object-fit:contain;';
 const image=new Image();let ready=false;
 const auto=()=>{const found=detectDocument(canvas);if(found&&validCorners(found)){points=found;status.textContent='Проверьте найденные границы. При перемещении угла появится лупа.';}else status.textContent='Границы не найдены уверенно. Поставьте точки на углы документа вручную.';draw();};
 const rotate=button('Повернуть',()=>{if(!ready)return;const copy=document.createElement('canvas');copy.width=canvas.height;copy.height=canvas.width;const ctx=copy.getContext('2d');ctx.translate(copy.width,0);ctx.rotate(Math.PI/2);ctx.drawImage(canvas,0,0);canvas.width=copy.width;canvas.height=copy.height;canvas.getContext('2d').drawImage(copy,0,0);points=points.map(([x,y])=>[1-y,x]);points=[points[3],points[0],points[1],points[2]];svg.setAttribute('viewBox',`0 0 ${canvas.width} ${canvas.height}`);fit();});
 const find=button('Найти границы',()=>ready&&auto());
 const modes=document.createElement('div');modes.style.cssText='display:none;gap:8px;flex-wrap:wrap;justify-content:center;margin:12px 0;';
 let base=null,pending=null;
 async function renderPreview(){if(!base)return;const token=++generation;apply.disabled=true;try{const bitmap=await createImageBitmap(base);if(disposed){bitmap.close();return;}const out=document.createElement('canvas');out.width=bitmap.width;out.height=bitmap.height;const ctx=out.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);bitmap.close();const pixels=ctx.getImageData(0,0,out.width,out.height);scanPixels(pixels.data,mode);ctx.putImageData(pixels,0,0);const blob=await new Promise(resolve=>out.toBlob(resolve,'image/png'));if(disposed||token!==generation)return;if(!blob)throw Error('Не удалось обработать фото');pending=blob;if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(blob);preview.src=previewUrl;apply.disabled=false;status.textContent='Проверьте текст, QR-код и все края. Оригинал сохранится отдельно.';}catch(error){if(!disposed)status.textContent=error.message;}}
 for(const [value,label] of [['original','Оригинал'],['scan','Скан'],['bw','Чёрно-белое']]){const b=document.createElement('button');b.textContent=label;b.type='button';b.style.cssText='padding:12px;background:#fff;color:#450032;border-radius:12px;font:16px system-ui';b.setAttribute('aria-pressed',String(value===mode));b.style.background=value===mode?'#500b3b':'white';b.style.color=value===mode?'white':'#450032';b.onclick=()=>{mode=value;for(const other of modes.children){other.setAttribute('aria-pressed',String(other===b));other.style.background=other===b?'#500b3b':'white';other.style.color=other===b?'white':'#450032';}void renderPreview();};modes.append(b);}
 const next=button('Готово',async()=>{if(!ready)return;next.disabled=true;status.textContent='Выравниваю документ…';try{base=await rectifyImage(canvas,points);if(disposed)return;box.style.display='none';rotate.hidden=find.hidden=next.hidden=true;back.hidden=false;apply.hidden=false;modes.style.display='flex';preview.style.display='block';title.textContent='Проверка скана';await renderPreview();}catch(error){status.textContent=error.message;}finally{next.disabled=false;}});
 const back=button('Поправить границы',()=>{generation++;box.style.display='block';preview.style.display='none';modes.style.display='none';rotate.hidden=find.hidden=next.hidden=false;back.hidden=apply.hidden=true;title.textContent='Границы документа';fit();});back.hidden=true;
 const apply=button('Применить скан',async()=>{if(!pending)return;apply.disabled=true;try{await onApply(pending);dispose();}catch(error){status.textContent=error.message;apply.disabled=false;}});apply.hidden=true;
 button('Отмена',()=>{dispose();onCancel();});
 function dispose(){if(disposed)return;disposed=true;generation++;window.removeEventListener('resize',fit);if(previewUrl)URL.revokeObjectURL(previewUrl);dialog.close();dialog.remove();}
 dialog.addEventListener('cancel',e=>{e.preventDefault();dispose();onCancel();});box.append(canvas,svg);dialog.append(title,status,box,preview,modes,controls,lens);document.body.append(dialog);dialog.showModal();window.addEventListener('resize',fit);
 image.onload=()=>{if(disposed)return;const scale=Math.min(1,Math.sqrt(16000000/(image.naturalWidth*image.naturalHeight)));canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);svg.setAttribute('viewBox',`0 0 ${canvas.width} ${canvas.height}`);ready=true;fit();auto();};
 image.onerror=()=>{status.textContent='Фото не удалось открыть. Закройте редактор и повторите загрузку.';};image.src=url;
 return dispose;
}
