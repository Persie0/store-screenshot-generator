import { getCreativeComposition } from './composition.ts';
import { identityTransform, sanitizeTransform, type ScreenshotTransform } from './crop.ts';
import { buildScreenshotRenderPlan,type Rect,type ScreenshotRenderPlan } from './render-plan.ts';
import { DEFAULT_PHONE_COLOR,normalizeHexColor } from './phone-frame.ts';
import type { StoreSize } from './platform.ts';
import type { ProjectShot } from './storage.ts';
import type { Palette, Translation } from './studio.ts';

const drawRounded=(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r)};

function textLines(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,maxWidth:number,lineHeight:number,maxLines:number):number{
 const words=text.trim()?text.trim().split(/\s+/):[];const lines:string[]=[];let line='';
 for(const word of words){const candidate=line?`${line} ${word}`:word;if(ctx.measureText(candidate).width>maxWidth&&line){lines.push(line);line=word}else line=candidate}
 if(line)lines.push(line);const shown=lines.slice(0,maxLines);shown.forEach((value,index)=>ctx.fillText(value,x,y+index*lineHeight));return Math.max(1,shown.length);
}

export type RenderStoreAssetOptions={phoneColor?:string};
export function resolveRenderPhoneColor(options?:RenderStoreAssetOptions):string{return normalizeHexColor(options?.phoneColor)||DEFAULT_PHONE_COLOR}

export function planShotInViewport(sourceWidth:number,sourceHeight:number,transform:ScreenshotTransform,viewport:Rect):ScreenshotRenderPlan{return buildScreenshotRenderPlan(sourceWidth,sourceHeight,sanitizeTransform(transform),viewport)}
export function getTransformedContentAspect(sourceWidth:number,sourceHeight:number,transform:ScreenshotTransform):number{
 const plan=buildScreenshotRenderPlan(sourceWidth,sourceHeight,sanitizeTransform(transform),{x:0,y:0,width:1,height:1});
 return plan.rotationBounds.width/plan.rotationBounds.height;
}

function drawTransformedScreenshot(ctx:CanvasRenderingContext2D,img:ImageBitmap,transform:ScreenshotTransform,viewport:Rect,radius:number){
 const safe=sanitizeTransform(transform),plan=planShotInViewport(img.width,img.height,safe,viewport);
 const temp=document.createElement('canvas');temp.width=Math.max(1,Math.ceil(plan.rotationBounds.width));temp.height=Math.max(1,Math.ceil(plan.rotationBounds.height));
 const tctx=temp.getContext('2d');if(!tctx)throw new Error('Your browser could not prepare the cropped screenshot.');
 const source=plan.sourceRect;tctx.translate(temp.width/2,temp.height/2);tctx.rotate(safe.rotation*Math.PI/180);tctx.scale(safe.flipX?-1:1,safe.flipY?-1:1);
 tctx.drawImage(img,source.x,source.y,source.width,source.height,-source.width/2,-source.height/2,source.width,source.height);
 ctx.save();drawRounded(ctx,viewport.x,viewport.y,viewport.width,viewport.height,radius);ctx.clip();
 ctx.drawImage(temp,0,0,temp.width,temp.height,plan.destinationRect.x,plan.destinationRect.y,plan.destinationRect.width,plan.destinationRect.height);ctx.restore();
}

export async function renderStoreAsset(shot:ProjectShot,copy:Translation,p:Palette,size:StoreSize,deviceType:'iphone'|'android',mood:string,options?:RenderStoreAssetOptions):Promise<Blob>{
 await document.fonts.ready;const canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;
 const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Your browser could not render an export image.');
 const img=await createImageBitmap(shot.blob),w=size.width,h=size.height,transform=sanitizeTransform(shot.transform??identityTransform()),contentAspect=getTransformedContentAspect(img.width,img.height,transform),phoneColor=resolveRenderPhoneColor(options);
 try{
  ctx.fillStyle=p.paper;ctx.fillRect(0,0,w,h);
  if(mood!=='minimal'){const grad=ctx.createLinearGradient(0,0,w,h);grad.addColorStop(0,p.paper);grad.addColorStop(1,p.secondary+'55');ctx.fillStyle=grad;ctx.fillRect(0,0,w,h)}
  if(mood==='playful'){ctx.globalAlpha=.14;ctx.fillStyle=p.accent;ctx.beginPath();ctx.arc(w*.91,h*.13,Math.min(w,h)*.16,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1}
  let layout=getCreativeComposition(size,2,2,contentAspect);ctx.fillStyle=p.ink;ctx.font=`${mood==='editorial'?'500':'800'} ${Math.round(layout.headline.fontSize)}px ${mood==='editorial'?'Georgia, serif':'Manrope, sans-serif'}`;
  const headlineLines=textLines(ctx,copy.headline,layout.headline.x,layout.headline.y,layout.headline.width,layout.headline.lineHeight,layout.headline.maxLines);
  layout=getCreativeComposition(size,headlineLines,2,contentAspect);ctx.fillStyle=p.ink+'cc';ctx.font=`500 ${Math.round(layout.subheadline.fontSize)}px "DM Sans", sans-serif`;
  const subheadlineLines=textLines(ctx,copy.subheadline,layout.subheadline.x,layout.subheadline.y,layout.subheadline.width,layout.subheadline.lineHeight,layout.subheadline.maxLines);
  layout=getCreativeComposition(size,headlineLines,subheadlineLines,contentAspect);
  const {x:dx,y:dy,width:dw,height:dh}=layout.device,radius=deviceType==='android'?Math.min(42,w*.05):(size.label.includes('iPad')?48:w*.065);
  ctx.fillStyle=phoneColor;drawRounded(ctx,dx,dy,dw,dh,radius);ctx.fill();const pad=Math.max(6,dw*.026),inner={x:dx+pad,y:dy+pad,width:dw-pad*2,height:dh-pad*2};
  ctx.fillStyle=phoneColor;drawRounded(ctx,inner.x,inner.y,inner.width,inner.height,radius*.82);ctx.fill();drawTransformedScreenshot(ctx,img,transform,inner,radius*.82);
  return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error(`Could not render ${size.label}.`)),'image/png'));
 } finally {img.close()}
}
