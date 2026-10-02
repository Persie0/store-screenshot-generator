export type CropRect={x:number;y:number;width:number;height:number};
export type PixelRect={x:number;y:number;width:number;height:number};
export type PixelInsets={left:number;top:number;right:number;bottom:number};
export type CropHandle='n'|'ne'|'e'|'se'|'s'|'sw'|'w'|'nw';
export type CropAnchor='center'|'nw'|'ne'|'sw'|'se';
export type ScreenshotTransform={crop:CropRect;zoom:number;panX:number;panY:number;rotation:number;flipX:boolean;flipY:boolean};
export type SourceSized={sourceWidth?:number;sourceHeight?:number};

export const MIN_CROP_SIZE=.01;
export const MIN_ZOOM=1;
export const MAX_ZOOM=8;
export const CROP_PRESETS={
 free:null,original:null,square:1,'3:2':3/2,'2:3':2/3,'4:3':4/3,'3:4':3/4,'5:4':5/4,'4:5':4/5,'16:9':16/9,'9:16':9/16,
 'iphone-portrait':1179/2556,'android-portrait':1080/2400,
} as const;

const finite=(value:unknown,fallback:number)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));
const clean=(value:number)=>Math.abs(value)<1e-12?0:Number(value.toFixed(12));

export function identityTransform():ScreenshotTransform{return {crop:{x:0,y:0,width:1,height:1},zoom:1,panX:0,panY:0,rotation:0,flipX:false,flipY:false}}

export function clampCrop(rect:CropRect,minSize=MIN_CROP_SIZE):CropRect{
 const min=clamp(finite(minSize,MIN_CROP_SIZE),1e-6,1);
 let x=clamp(finite(rect?.x,0),0,1),y=clamp(finite(rect?.y,0),0,1);
 let width=Math.max(min,finite(rect?.width,1)),height=Math.max(min,finite(rect?.height,1));
 if(1-x<min)x=1-min;if(1-y<min)y=1-min;
 width=clamp(width,min,1-x);height=clamp(height,min,1-y);
 return {x:clean(x),y:clean(y),width:clean(width),height:clean(height)};
}

export function clampZoom(zoom:number):number{return clean(clamp(finite(zoom,1),MIN_ZOOM,MAX_ZOOM))}
export function clampPan(panX:number,panY:number):{panX:number;panY:number}{return {panX:clean(clamp(finite(panX,0),-1,1)),panY:clean(clamp(finite(panY,0),-1,1))}}

export function normalizeRotation(degrees:number):number{
 const value=finite(degrees,0);let result=((value+180)%360+360)%360-180;
 if(result===-180&&value>0)result=180;
 return clean(result);
}

export function sanitizeTransform(value:unknown):ScreenshotTransform{
 if(!value||typeof value!=='object')return identityTransform();
 const raw=value as Partial<ScreenshotTransform>;
 const cropValue=raw.crop&&typeof raw.crop==='object'?raw.crop as Partial<CropRect>:undefined;
 if(!cropValue)return identityTransform();
 const requiredNumbers=[cropValue.x,cropValue.y,cropValue.width,cropValue.height,raw.zoom,raw.panX,raw.panY,raw.rotation];
 if(requiredNumbers.some(v=>v!==undefined&&(typeof v!=='number'||!Number.isFinite(v))))return identityTransform();
 if(typeof cropValue.width==='number'&&cropValue.width<=0||typeof cropValue.height==='number'&&cropValue.height<=0)return identityTransform();
 const crop=clampCrop({x:finite(cropValue.x,0),y:finite(cropValue.y,0),width:finite(cropValue.width,1),height:finite(cropValue.height,1)});
 const pan=clampPan(finite(raw.panX,0),finite(raw.panY,0));
 return {crop,zoom:clampZoom(finite(raw.zoom,1)),...pan,rotation:normalizeRotation(finite(raw.rotation,0)),flipX:raw.flipX===true,flipY:raw.flipY===true};
}

export function applyAspectRatio(rect:CropRect,ratio:number,anchor:CropAnchor='center'):CropRect{
 const r=clampCrop(rect);if(!Number.isFinite(ratio)||ratio<=0)return r;
 let width=r.width,height=r.height;
 if(width/height>ratio)width=height*ratio;else height=width/ratio;
 if(width>1){width=1;height=1/ratio}if(height>1){height=1;width=ratio}
 let x=r.x,y=r.y;const dx=r.width-width,dy=r.height-height;
 if(anchor==='center'){x+=dx/2;y+=dy/2}else{if(anchor==='ne'||anchor==='se')x+=dx;if(anchor==='sw'||anchor==='se')y+=dy}
 return clampCrop({x,y,width,height});
}

export function moveCrop(rect:CropRect,dx:number,dy:number):CropRect{
 const r=clampCrop(rect);return {...r,x:clean(clamp(r.x+finite(dx,0),0,1-r.width)),y:clean(clamp(r.y+finite(dy,0),0,1-r.height))};
}

export function resizeCrop(rect:CropRect,handle:CropHandle,dx:number,dy:number,ratio?:number):CropRect{
 const r=clampCrop(rect),east=handle.includes('e'),west=handle.includes('w'),north=handle.includes('n'),south=handle.includes('s');
 let left=r.x,top=r.y,right=r.x+r.width,bottom=r.y+r.height;const xDelta=finite(dx,0),yDelta=finite(dy,0);
 if(west)left+=xDelta;if(east)right+=xDelta;if(north)top+=yDelta;if(south)bottom+=yDelta;
 let out=clampCrop({x:Math.min(left,right-MIN_CROP_SIZE),y:Math.min(top,bottom-MIN_CROP_SIZE),width:Math.abs(right-left),height:Math.abs(bottom-top)});
 if(ratio&&Number.isFinite(ratio)&&ratio>0){const anchor:CropAnchor=west&&north?'se':east&&north?'sw':west&&south?'ne':east&&south?'nw':'center';out=applyAspectRatio(out,ratio,anchor)}
 return out;
}

export function cropToPixels(crop:CropRect,sourceWidth:number,sourceHeight:number):PixelRect{
 const c=clampCrop(crop),w=Math.max(1,finite(sourceWidth,1)),h=Math.max(1,finite(sourceHeight,1));return {x:clean(c.x*w),y:clean(c.y*h),width:clean(c.width*w),height:clean(c.height*h)};
}
export function pixelsToCrop(rect:PixelRect,sourceWidth:number,sourceHeight:number):CropRect{
 const w=Math.max(1,finite(sourceWidth,1)),h=Math.max(1,finite(sourceHeight,1));return clampCrop({x:finite(rect.x,0)/w,y:finite(rect.y,0)/h,width:finite(rect.width,w)/w,height:finite(rect.height,h)/h});
}
export function cropToPixelInsets(crop:CropRect,sourceWidth:number,sourceHeight:number):PixelInsets|undefined{
 if(!Number.isFinite(sourceWidth)||!Number.isFinite(sourceHeight)||sourceWidth<=0||sourceHeight<=0)return undefined;
 const c=clampCrop(crop),width=Math.round(sourceWidth),height=Math.round(sourceHeight);
 const left=Math.max(0,Math.round(c.x*width)),top=Math.max(0,Math.round(c.y*height));
 const right=Math.max(0,Math.round((1-c.x-c.width)*width)),bottom=Math.max(0,Math.round((1-c.y-c.height)*height));
 if(left+right>=width||top+bottom>=height)return undefined;
 return {left,top,right,bottom};
}
export function pixelInsetsToCrop(insets:PixelInsets,width:number,height:number):CropRect|undefined{
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return undefined;
 const w=Math.round(width),h=Math.round(height),left=Math.max(0,Math.round(finite(insets?.left,0))),top=Math.max(0,Math.round(finite(insets?.top,0))),right=Math.max(0,Math.round(finite(insets?.right,0))),bottom=Math.max(0,Math.round(finite(insets?.bottom,0)));
 if(left+right>=w||top+bottom>=h)return undefined;
 return {x:left/w,y:top/h,width:(w-left-right)/w,height:(h-top-bottom)/h};
}
export function fitCrop():CropRect{return {x:0,y:0,width:1,height:1}}
export function fillCrop(sourceWidth:number,sourceHeight:number,targetAspect:number):CropRect{
 const sw=Math.max(1,finite(sourceWidth,1)),sh=Math.max(1,finite(sourceHeight,1));if(!Number.isFinite(targetAspect)||targetAspect<=0)return fitCrop();
 const sourceAspect=sw/sh;let width=1,height=1;if(sourceAspect>targetAspect)width=targetAspect/sourceAspect;else height=sourceAspect/targetAspect;
 return {x:clean((1-width)/2),y:clean((1-height)/2),width:clean(width),height:clean(height)};
}
export function sameSourceSize(a:SourceSized,b:SourceSized):boolean{return !!a.sourceWidth&&!!a.sourceHeight&&a.sourceWidth===b.sourceWidth&&a.sourceHeight===b.sourceHeight}
export function sameSourceAspect(a:SourceSized,b:SourceSized,epsilon=1e-6):boolean{if(!a.sourceWidth||!a.sourceHeight||!b.sourceWidth||!b.sourceHeight)return false;return Math.abs(a.sourceWidth/a.sourceHeight-b.sourceWidth/b.sourceHeight)<=epsilon}
export function canApplyTransform(source:SourceSized,target:SourceSized,mode:'same-size'|'same-aspect'):boolean{return mode==='same-size'?sameSourceSize(source,target):sameSourceAspect(source,target)}
export function transformEquals(a:ScreenshotTransform|undefined,b:ScreenshotTransform|undefined):boolean{return JSON.stringify(sanitizeTransform(a))===JSON.stringify(sanitizeTransform(b))}
export function copyTransform(transform:ScreenshotTransform|undefined):ScreenshotTransform{return structuredClone(sanitizeTransform(transform))}
export function resetCrop(transform:ScreenshotTransform|undefined):ScreenshotTransform{return {...sanitizeTransform(transform),crop:fitCrop(),zoom:1,panX:0,panY:0}}
export function resetAllTransforms():ScreenshotTransform{return identityTransform()}
