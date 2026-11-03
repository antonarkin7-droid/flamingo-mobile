// Local, bounded image analysis. No images leave the device.
export function findDocumentCorners({data,width,height}) {
  const size=width*height;
  if(width<16||height<16||size>400000||data.length<size*4)return null;
  const gray=new Uint8Array(size);
  for(let i=0;i<size;i++)gray[i]=Math.round(data[i*4]*.299+data[i*4+1]*.587+data[i*4+2]*.114);
  let best=null;
  for(const threshold of [90,120,150,180,205,225]) {
    const seen=new Uint8Array(size),queue=new Int32Array(size);
    for(let seed=0;seed<size;seed++) {
      if(seen[seed]||gray[seed]<threshold)continue;
      let start=0,end=1;queue[0]=seed;seen[seed]=1;
      const left=new Int32Array(height).fill(width),right=new Int32Array(height).fill(-1);
      while(start<end) {
        const i=queue[start++],x=i%width,y=Math.floor(i/width);
        left[y]=Math.min(left[y],x);right[y]=Math.max(right[y],x);
        for(const j of [x>0?i-1:-1,x<width-1?i+1:-1,y>0?i-width:-1,y<height-1?i+width:-1])
          if(j>=0&&!seen[j]&&gray[j]>=threshold){seen[j]=1;queue[end++]=j;}
      }
      if(end<size*.06)continue;
      const points=[];
      for(let y=0;y<height;y++)if(right[y]>=0){points.push([left[y],y],[right[y],y]);}
      let hull=convexHull(points);
      if(hull.length<4)continue;
      while(hull.length>4) {
        let at=0,min=Infinity;
        for(let i=0;i<hull.length;i++) {const area=Math.abs(cross(hull[(i+hull.length-1)%hull.length],hull[i],hull[(i+1)%hull.length]));if(area<min){min=area;at=i;}}
        hull.splice(at,1);
      }
      const area=Math.abs(hull.reduce((n,p,i)=>{const q=hull[(i+1)%4];return n+p[0]*q[1]-p[1]*q[0];},0))/2;
      if(area<size*.07||area>size*.94||end/area<.65||end/area>1.15)continue;
      // The bright background surrounding a darker document is not the document.
      const border=hull.filter(([x,y])=>x<2||y<2||x>width-3||y>height-3).length;
      if(border>2)continue;
      const score=area*(end/area)*(1-border*.12);
      if(!best||score>best.score) {
        const first=hull.reduce((n,p,i)=>p[0]+p[1]<hull[n][0]+hull[n][1]?i:n,0);
        best={score,points:[...hull.slice(first),...hull.slice(0,first)].map(([x,y])=>[x/(width-1),y/(height-1)])};
      }
    }
  }
  return best?.points||null;
}
function cross(a,b,c){return(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);}
function convexHull(points) {
  const sorted=points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]),lower=[],upper=[];
  for(const p of sorted){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}
  for(const p of [...sorted].reverse()){while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
  return lower.slice(0,-1).concat(upper.slice(0,-1));
}
export function detectDocument(source) {
  const w=source.videoWidth||source.naturalWidth||source.width,h=source.videoHeight||source.naturalHeight||source.height;
  if(!w||!h)return null;
  const scale=Math.min(1,320/Math.max(w,h)),canvas=document.createElement('canvas');
  canvas.width=Math.max(16,Math.round(w*scale));canvas.height=Math.max(16,Math.round(h*scale));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0,canvas.width,canvas.height);
  return findDocumentCorners(ctx.getImageData(0,0,canvas.width,canvas.height));
}
export function scanPixels(data,mode) {
  if(mode==='original')return data;
  // Remove gradual paper shading while preserving thin text and QR modules.
  for(let i=0;i<data.length;i+=4) {
    const lum=data[i]*.299+data[i+1]*.587+data[i+2]*.114;
    if(mode==='bw') {const value=lum<145?0:255;data[i]=data[i+1]=data[i+2]=value;}
    else for(let k=0;k<3;k++)data[i+k]=Math.max(0,Math.min(255,(data[i+k]-25)*1.22));
  }
  return data;
}
