import { cropToPixels,sanitizeTransform,type ScreenshotTransform } from './crop.ts';

export type Rect={x:number;y:number;width:number;height:number};
export type RenderMatrix={a:number;b:number;c:number;d:number;e:number;f:number};
export type ScreenshotRenderPlan={sourceRect:Rect;destinationRect:Rect;matrix:RenderMatrix;rotationBounds:Rect};

const clean=(value:number)=>Math.abs(value)<1e-10?0:Number(value.toFixed(10));

export function fitRect(sourceWidth:number,sourceHeight:number,viewport:Rect):Rect{
 const sw=Math.max(1,sourceWidth),sh=Math.max(1,sourceHeight),scale=Math.min(viewport.width/sw,viewport.height/sh);
 const width=sw*scale,height=sh*scale;
 return {x:clean(viewport.x+(viewport.width-width)/2),y:clean(viewport.y+(viewport.height-height)/2),width:clean(width),height:clean(height)};
}

export function rotatedBounds(width:number,height:number,degrees:number):Rect{
 const radians=degrees*Math.PI/180,c=Math.abs(Math.cos(radians)),s=Math.abs(Math.sin(radians));
 return {x:0,y:0,width:clean(width*c+height*s),height:clean(width*s+height*c)};
}

export function buildTransformMatrix(transform:ScreenshotTransform):RenderMatrix{
 const safe=sanitizeTransform(transform),r=safe.rotation*Math.PI/180,c=Math.cos(r),s=Math.sin(r),sx=safe.flipX?-1:1,sy=safe.flipY?-1:1;
 return {a:clean(c*sx),b:clean(s*sx),c:clean(-s*sy),d:clean(c*sy),e:0,f:0};
}

export function buildScreenshotRenderPlan(sourceWidth:number,sourceHeight:number,transform:ScreenshotTransform,viewport:Rect):ScreenshotRenderPlan{
 const safe=sanitizeTransform(transform),base=cropToPixels(safe.crop,sourceWidth,sourceHeight);
 const width=base.width/safe.zoom,height=base.height/safe.zoom;
 const slackX=Math.max(0,base.width-width),slackY=Math.max(0,base.height-height);
 const x=base.x+((safe.panX+1)/2)*slackX,y=base.y+((safe.panY+1)/2)*slackY;
 const sourceRect={x:clean(Math.max(0,Math.min(sourceWidth-width,x))),y:clean(Math.max(0,Math.min(sourceHeight-height,y))),width:clean(Math.min(width,sourceWidth)),height:clean(Math.min(height,sourceHeight))};
 const rotationBounds=rotatedBounds(sourceRect.width,sourceRect.height,safe.rotation);
 return {sourceRect,destinationRect:fitRect(rotationBounds.width,rotationBounds.height,viewport),matrix:buildTransformMatrix(safe),rotationBounds};
}
