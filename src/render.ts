import { fitContainedRect, getCreativeComposition } from './composition';
import type { StoreSize } from './platform';
import type { ProjectShot } from './storage';
import type { Palette, Translation } from './studio';

const drawRounded=(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r)};

function textLines(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,maxWidth:number,lineHeight:number,maxLines:number):number{
 const words=text.trim()?text.trim().split(/\s+/):[];const lines:string[]=[];let line='';
 for(const word of words){const candidate=line?`${line} ${word}`:word;if(ctx.measureText(candidate).width>maxWidth&&line){lines.push(line);line=word}else line=candidate}
 if(line)lines.push(line);const shown=lines.slice(0,maxLines);shown.forEach((value,index)=>ctx.fillText(value,x,y+index*lineHeight));return Math.max(1,shown.length);
}

export async function renderStoreAsset(shot:ProjectShot,copy:Translation,p:Palette,size:StoreSize,deviceType:'iphone'|'android',mood:string):Promise<Blob>{
 await document.fonts.ready;
 const canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;
 const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Your browser could not render an export image.');
 const img=await createImageBitmap(shot.blob),w=size.width,h=size.height,contentAspect=img.width/img.height;
 try{
  ctx.fillStyle=p.paper;ctx.fillRect(0,0,w,h);
  if(mood!=='minimal'){const grad=ctx.createLinearGradient(0,0,w,h);grad.addColorStop(0,p.paper);grad.addColorStop(1,p.secondary+'55');ctx.fillStyle=grad;ctx.fillRect(0,0,w,h)}
  if(mood==='playful'){ctx.globalAlpha=.14;ctx.fillStyle=p.accent;ctx.beginPath();ctx.arc(w*.91,h*.13,Math.min(w,h)*.16,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1}

  let layout=getCreativeComposition(size,2,2,contentAspect);
  ctx.fillStyle=p.ink;ctx.font=`${mood==='editorial'?'500':'800'} ${Math.round(layout.headline.fontSize)}px ${mood==='editorial'?'Georgia, serif':'Manrope, sans-serif'}`;
  const headlineLines=textLines(ctx,copy.headline,layout.headline.x,layout.headline.y,layout.headline.width,layout.headline.lineHeight,layout.headline.maxLines);
  layout=getCreativeComposition(size,headlineLines,2,contentAspect);
  ctx.fillStyle=p.ink+'cc';ctx.font=`500 ${Math.round(layout.subheadline.fontSize)}px "DM Sans", sans-serif`;
  const subheadlineLines=textLines(ctx,copy.subheadline,layout.subheadline.x,layout.subheadline.y,layout.subheadline.width,layout.subheadline.lineHeight,layout.subheadline.maxLines);
  layout=getCreativeComposition(size,headlineLines,subheadlineLines,contentAspect);

  const {x:dx,y:dy,width:dw,height:dh}=layout.device;
  const radius=deviceType==='android'?Math.min(42,w*.05):(size.label.includes('iPad')?48:w*.065);
  ctx.fillStyle='#111521';drawRounded(ctx,dx,dy,dw,dh,radius);ctx.fill();
  const pad=Math.max(6,dw*.026),innerX=dx+pad,innerY=dy+pad,innerW=dw-pad*2,innerH=dh-pad*2;
  ctx.fillStyle='#111521';drawRounded(ctx,innerX,innerY,innerW,innerH,radius*.82);ctx.fill();
  const fitted=fitContainedRect(img.width,img.height,innerX,innerY,innerW,innerH);
  ctx.save();drawRounded(ctx,innerX,innerY,innerW,innerH,radius*.82);ctx.clip();ctx.drawImage(img,fitted.x,fitted.y,fitted.width,fitted.height);ctx.restore();

  return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error(`Could not render ${size.label}.`)),'image/png'));
 } finally {img.close()}
}
