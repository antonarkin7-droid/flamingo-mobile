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
 const w=image.naturalWidth,h=image.naturalHeight;
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
export function mountDocumentEditor(root,{url,onApply,onCancel}){
 let points=[[.02,.02],[.98,.02],[.98,.98],[.02,.98]],active=-1,disposed=false,previewUrl;
 const box=document.createElement('div');box.style.cssText='position:relative;width:100%;max-width:700px;';
 const image=document.createElement('img');image.alt='Оригинал: укажите четыре внешних угла документа';image.src=url;image.style.cssText='width:100%;display:block;';
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 1000 1000');svg.setAttribute('preserveAspectRatio','none');svg.style.cssText='position:absolute;inset:0;width:100%;height:100%;touch-action:none;';
 const polygon=document.createElementNS(svg.namespaceURI,'polygon');polygon.setAttribute('fill','#ec008c22');polygon.setAttribute('stroke','#ec008c');polygon.setAttribute('stroke-width','3');svg.append(polygon);
 const labels=['Верхний левый угол','Верхний правый угол','Нижний правый угол','Нижний левый угол'];
 const handles=points.map((p,i)=>{const c=document.createElementNS(svg.namespaceURI,'circle');c.setAttribute('r','18');c.setAttribute('fill','#ec008c');c.setAttribute('stroke','white');c.setAttribute('stroke-width','4');c.setAttribute('tabindex','0');c.setAttribute('role','slider');c.setAttribute('aria-label',labels[i]);c.addEventListener('pointerdown',e=>{active=i;svg.setPointerCapture(e.pointerId);e.preventDefault();});c.addEventListener('keydown',e=>{const delta={ArrowLeft:[-.005,0],ArrowRight:[.005,0],ArrowUp:[0,-.005],ArrowDown:[0,.005]}[e.key];if(delta){e.preventDefault();points[i]=points[i].map((v,k)=>Math.max(0,Math.min(1,v+delta[k])));draw();}});svg.append(c);return c;});
 function draw(){polygon.setAttribute('points',points.map(p=>p.map(v=>v*1000).join(',')).join(' '));handles.forEach((c,i)=>{c.setAttribute('cx',points[i][0]*1000);c.setAttribute('cy',points[i][1]*1000);c.setAttribute('aria-valuetext',`${Math.round(points[i][0]*100)}%, ${Math.round(points[i][1]*100)}%`);});}
 svg.addEventListener('pointermove',e=>{if(active<0)return;const rect=svg.getBoundingClientRect();points[active]=[Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)),Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height))];draw();});
 svg.addEventListener('pointerup',()=>{active=-1;});svg.addEventListener('pointercancel',()=>{active=-1;});
 box.append(image,svg);const help=document.createElement('p');help.textContent='Перетащите четыре точки на внешние углы бумаги. Включите весь документ, включая QR и подпись. Будет добавлен защитный запас; оригинал сохранится.';
 const feedback=document.createElement('p');feedback.setAttribute('role','status');const preview=document.createElement('img');preview.alt='Предварительный просмотр выровненной копии';preview.style.cssText='max-width:100%;max-height:500px;display:none;background:white;';
 const buttons=document.createElement('div');buttons.style.cssText='display:flex;gap:12px;flex-wrap:wrap;margin:12px 0;';
 const makeButton=text=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.style.cssText='border:1px solid #b995aa;border-radius:10px;padding:10px;background:white;color:#450032;';buttons.append(b);return b;};
 let pending;
 const check=makeButton('Предпросмотр'),apply=makeButton('Сохранить обработанную копию'),cancel=makeButton('Отмена');apply.disabled=true;
 const invalidate=()=>{pending=null;apply.disabled=true;};svg.addEventListener('pointerdown',invalidate);svg.addEventListener('keydown',invalidate);
 check.onclick=async()=>{check.disabled=true;feedback.textContent='Выравниваю фото…';try{await image.decode();pending=await rectifyImage(image,points);if(disposed)return;if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(pending);preview.src=previewUrl;preview.style.display='block';apply.disabled=false;feedback.textContent='Проверьте верх, низ и края документа. Если что-то не попало — поправьте углы.';}catch(e){feedback.textContent=e.message;feedback.style.color='#b91c1c';}finally{check.disabled=false;}};
 apply.onclick=async()=>{apply.disabled=true;try{await onApply(pending);feedback.textContent='Копия сохранена. Оригинал сохранён отдельно.';}catch(e){feedback.textContent=e.message;apply.disabled=false;}};
 cancel.onclick=()=>onCancel();draw();root.replaceChildren(help,box,buttons,feedback,preview);
 return()=>{disposed=true;if(previewUrl)URL.revokeObjectURL(previewUrl);root.replaceChildren();};
}
