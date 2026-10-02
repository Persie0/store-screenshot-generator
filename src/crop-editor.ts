import {
 CROP_PRESETS,clampCrop,clampPan,clampZoom,copyTransform,fillCrop,fitCrop,moveCrop,normalizeRotation,resetAllTransforms,resetCrop,resizeCrop,sanitizeTransform,transformEquals,
 type CropHandle,type ScreenshotTransform,
} from './crop.ts';
import type { ProjectShot } from './storage.ts';

export type CropSession={present:ScreenshotTransform;past:ScreenshotTransform[];future:ScreenshotTransform[]};
export type CropBulkMode='same-size'|'same-aspect'|'same-pixels';
export type CropEditorOptions={shot:ProjectShot;shots:ProjectShot[];initial:ScreenshotTransform;onApply:(transform:ScreenshotTransform,bulkMode?:CropBulkMode)=>void;onCancel:()=>void};

type MarkupOptions={sameSizeCount:number;sameAspectCount:number;pixelCount:number;imageUrl?:string;imageName?:string;sourceWidth?:number;sourceHeight?:number};
let cropClipboard:ScreenshotTransform|undefined;
const esc=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[char]!));

export function createCropSession(initial:ScreenshotTransform):CropSession{return {present:copyTransform(initial),past:[],future:[]}}
export function setCropSessionTransform(session:CropSession,next:ScreenshotTransform):CropSession{
 const safe=sanitizeTransform(next);if(transformEquals(session.present,safe))return session;
 return {present:copyTransform(safe),past:[...session.past,copyTransform(session.present)].slice(-80),future:[]};
}
export function undoCropSession(session:CropSession):CropSession{if(!session.past.length)return session;const previous=session.past[session.past.length-1];return {present:copyTransform(previous),past:session.past.slice(0,-1),future:[copyTransform(session.present),...session.future]}}
export function redoCropSession(session:CropSession):CropSession{if(!session.future.length)return session;const next=session.future[0];return {present:copyTransform(next),past:[...session.past,copyTransform(session.present)],future:session.future.slice(1)}}
export function nudgeCropSession(session:CropSession,dx:number,dy:number):CropSession{return setCropSessionTransform(session,{...session.present,crop:moveCrop(session.present.crop,dx,dy)})}
export function cropBulkModeForAction(action:string|undefined):CropBulkMode|undefined{return action==='apply-same-size'?'same-size':action==='apply-same-aspect'?'same-aspect':action==='apply-same-pixels'?'same-pixels':undefined}

export function cropPresetAspect(preset:string,sourceWidth:number,sourceHeight:number,customRatio?:number):number|undefined{
 if(preset==='Free')return undefined;
 if(preset==='Original')return sourceWidth>0&&sourceHeight>0?sourceWidth/sourceHeight:undefined;
 if(preset==='Custom')return customRatio&&Number.isFinite(customRatio)&&customRatio>0?customRatio:undefined;
 if(preset==='1:1')return 1;
 if(preset==='iPhone')return CROP_PRESETS['iphone-portrait']!;
 if(preset==='Android')return CROP_PRESETS['android-portrait']!;
 const ratio=(CROP_PRESETS as Record<string,number|null>)[preset];return typeof ratio==='number'&&ratio>0?ratio:undefined;
}
export function normalizedRatioForSource(pixelAspect:number,sourceWidth:number,sourceHeight:number):number{return pixelAspect*Math.max(1,sourceHeight)/Math.max(1,sourceWidth)}

export function applyCropPreset(transform:ScreenshotTransform,preset:string,sourceWidth:number,sourceHeight:number,customRatio?:number):ScreenshotTransform{
 const safe=sanitizeTransform(transform);
 if(preset==='Free'||preset==='Original')return resetCrop(safe);
 const targetAspect=cropPresetAspect(preset,sourceWidth,sourceHeight,customRatio);
 if(!targetAspect)return safe;
 return {...safe,crop:fillCrop(sourceWidth,sourceHeight,targetAspect),zoom:1,panX:0,panY:0};
}

export function cropEditorMarkup(options:MarkupOptions):string{
 const url=esc(options.imageUrl||''),name=esc(options.imageName||'Screenshot'),sourceWidth=options.sourceWidth||9,sourceHeight=options.sourceHeight||16;
 const presets=['Free','Original','1:1','3:2','2:3','4:3','3:4','5:4','4:5','16:9','9:16','iPhone','Android','Custom'];
 return `<div class="crop-editor" role="dialog" aria-modal="true" aria-label="Crop screenshot">
  <header class="crop-editor-head"><div><span class="eyebrow">SCREENSHOT CROP</span><h2>${name}</h2></div><div class="crop-head-actions"><button data-crop-action="undo">Undo</button><button data-crop-action="redo">Redo</button><button data-crop-action="cancel">Cancel</button><button class="primary-btn" data-crop-action="apply">Apply</button></div></header>
  <div class="crop-editor-body">
   <section class="crop-workspace" tabindex="0"><div class="crop-stage" style="aspect-ratio:${sourceWidth} / ${sourceHeight}"><img class="crop-image" src="${url}" alt="${name}"><div class="crop-before-badge">Before</div><div class="crop-box" tabindex="0">${['n','ne','e','se','s','sw','w','nw'].map(h=>`<i class="crop-handle crop-${h}" data-crop-handle="${h}"></i>`).join('')}<div class="crop-guide thirds visible"></div><div class="crop-guide center"></div><div class="crop-guide safe"></div></div></div></section>
   <aside class="crop-controls">
    <section><b>Aspect ratio</b><div class="crop-preset-grid">${presets.map(p=>`<button data-crop-preset="${p}">${p}</button>`).join('')}</div><div class="crop-custom"><label>Custom <input data-crop-custom-w type="number" min="0.01" step="0.01" value="9"></label><span>:</span><input data-crop-custom-h type="number" min="0.01" step="0.01" value="16"></div></section>
    <section class="crop-slider-stack"><label>Zoom <input data-crop-field="zoom" type="range" min="1" max="8" step="0.01"></label><label>Pan X <input data-crop-field="panX" type="range" min="-1" max="1" step="0.01"></label><label>Pan Y <input data-crop-field="panY" type="range" min="-1" max="1" step="0.01"></label><label>Straighten <input data-crop-field="rotation" type="range" min="-180" max="180" step="0.1"></label></section>
    <section><b>Transform</b><div class="crop-button-grid"><button data-crop-action="rotate-left">Rotate left</button><button data-crop-action="rotate-right">Rotate right</button><button data-crop-action="flip-h">Flip H</button><button data-crop-action="flip-v">Flip V</button><button data-crop-action="fit">Fit</button><button data-crop-action="fill">Fill</button><button data-crop-action="center">Center</button><button data-crop-action="reset-crop">Reset crop</button><button data-crop-action="reset-all">Reset all</button></div></section>
    <section><b>Crop coordinates</b><div class="crop-coordinate-grid">${['x','y','width','height'].map(field=>`<label>${field.toUpperCase()} <input data-crop-coordinate="${field}" type="number" min="0" max="1" step="0.001"></label>`).join('')}</div></section>
    <section><b>Guides</b><label><input data-crop-guide="thirds" type="checkbox" checked> Rule of thirds</label><label><input data-crop-guide="center" type="checkbox"> Center guides</label><label><input data-crop-guide="safe" type="checkbox"> Safe area</label><label><input data-crop-before type="checkbox"> Before / after</label></section>
    <section><b>Reuse crop</b><div class="crop-button-grid"><button data-crop-action="copy">Copy crop</button><button data-crop-action="paste">Paste crop</button></div><button class="crop-bulk" data-crop-action="apply-same-size" ${options.sameSizeCount<2?'disabled':''}>Apply to all same-size (${options.sameSizeCount})</button><button class="crop-bulk" data-crop-action="apply-same-aspect" ${options.sameAspectCount<2?'disabled':''}>Apply to same-aspect (${options.sameAspectCount})</button><button class="crop-bulk" data-crop-action="apply-same-pixels" ${options.pixelCount<2?'disabled':''}>Apply same pixel crop to all (${options.pixelCount})</button></section>
   </aside>
  </div>
 </div>`;
}

export function mountCropEditor(container:HTMLElement,options:CropEditorOptions):{destroy():void}{
 let session=createCropSession(options.initial),destroyed=false,lockedAspect:number|undefined,pointer:{x:number;y:number;crop:ScreenshotTransform['crop'];handle?:CropHandle}|undefined;
 const url=URL.createObjectURL(options.shot.blob),sourceWidth=()=>options.shot.sourceWidth||1,sourceHeight=()=>options.shot.sourceHeight||1;
 const sameSizeCount=options.shots.filter(s=>s.sourceWidth===options.shot.sourceWidth&&s.sourceHeight===options.shot.sourceHeight&&!!s.sourceWidth).length;
 const sourceAspect=options.shot.sourceWidth&&options.shot.sourceHeight?options.shot.sourceWidth/options.shot.sourceHeight:0;
 const sameAspectCount=options.shots.filter(s=>sourceAspect&&s.sourceWidth&&s.sourceHeight&&Math.abs(s.sourceWidth/s.sourceHeight-sourceAspect)<1e-6).length;
 const pixelCount=options.shots.filter(s=>!!s.sourceWidth&&!!s.sourceHeight).length;
 container.innerHTML=cropEditorMarkup({sameSizeCount,sameAspectCount,pixelCount,imageUrl:url,imageName:options.shot.name,sourceWidth:options.shot.sourceWidth,sourceHeight:options.shot.sourceHeight});
 const root=container.querySelector<HTMLElement>('.crop-editor')!,stage=container.querySelector<HTMLElement>('.crop-stage')!,box=container.querySelector<HTMLElement>('.crop-box')!,img=container.querySelector<HTMLImageElement>('.crop-image')!;
 const listeners:Array<()=>void>=[];const on=<K extends keyof HTMLElementEventMap>(el:HTMLElement|Window,type:K,fn:(event:HTMLElementEventMap[K])=>void)=>{el.addEventListener(type,fn as EventListener);listeners.push(()=>el.removeEventListener(type,fn as EventListener))};
 const set=(next:ScreenshotTransform)=>{session=setCropSessionTransform(session,next);sync()};
 const customRatio=()=>{const w=Number(container.querySelector<HTMLInputElement>('[data-crop-custom-w]')?.value||0),h=Number(container.querySelector<HTMLInputElement>('[data-crop-custom-h]')?.value||0);return w>0&&h>0?w/h:undefined};
 const resizeRatio=()=>lockedAspect?normalizedRatioForSource(lockedAspect,sourceWidth(),sourceHeight()):undefined;
 const sync=()=>{
  const t=session.present,c=t.crop;box.style.left=`${c.x*100}%`;box.style.top=`${c.y*100}%`;box.style.width=`${c.width*100}%`;box.style.height=`${c.height*100}%`;
  img.style.transform=`translate(${t.panX*20}%,${t.panY*20}%) scale(${t.zoom}) rotate(${t.rotation}deg) scaleX(${t.flipX?-1:1}) scaleY(${t.flipY?-1:1})`;
  container.querySelectorAll<HTMLInputElement>('[data-crop-field]').forEach(input=>input.value=String(t[input.dataset.cropField as 'zoom'|'panX'|'panY'|'rotation']));
  container.querySelectorAll<HTMLInputElement>('[data-crop-coordinate]').forEach(input=>input.value=String(c[input.dataset.cropCoordinate as keyof typeof c]));
  const undo=container.querySelector<HTMLButtonElement>('[data-crop-action="undo"]'),redo=container.querySelector<HTMLButtonElement>('[data-crop-action="redo"]');if(undo)undo.disabled=!session.past.length;if(redo)redo.disabled=!session.future.length;
 };
 img.addEventListener('load',()=>{if(!options.shot.sourceWidth||!options.shot.sourceHeight){options.shot.sourceWidth=img.naturalWidth;options.shot.sourceHeight=img.naturalHeight;stage.style.aspectRatio=`${img.naturalWidth} / ${img.naturalHeight}`}sync()},{once:true});
 container.querySelectorAll<HTMLElement>('[data-crop-preset]').forEach(button=>on(button,'click',()=>{const preset=button.dataset.cropPreset||'Free';lockedAspect=cropPresetAspect(preset,sourceWidth(),sourceHeight(),customRatio());set(applyCropPreset(session.present,preset,sourceWidth(),sourceHeight(),customRatio()))}));
 container.querySelectorAll<HTMLInputElement>('[data-crop-field]').forEach(input=>on(input,'input',()=>{const field=input.dataset.cropField as 'zoom'|'panX'|'panY'|'rotation',value=Number(input.value);if(field==='zoom')set({...session.present,zoom:clampZoom(value)});else if(field==='rotation')set({...session.present,rotation:normalizeRotation(value)});else{const pan=clampPan(field==='panX'?value:session.present.panX,field==='panY'?value:session.present.panY);set({...session.present,...pan})}}));
 container.querySelectorAll<HTMLInputElement>('[data-crop-coordinate]').forEach(input=>on(input,'change',()=>{const field=input.dataset.cropCoordinate as keyof ScreenshotTransform['crop'];set({...session.present,crop:clampCrop({...session.present.crop,[field]:Number(input.value)})})}));
 container.querySelectorAll<HTMLInputElement>('[data-crop-guide]').forEach(input=>on(input,'change',()=>container.querySelector<HTMLElement>(`.crop-guide.${input.dataset.cropGuide}`)?.classList.toggle('visible',input.checked)));
 const before=container.querySelector<HTMLInputElement>('[data-crop-before]');if(before)on(before,'change',()=>root.classList.toggle('show-before',before.checked));
 container.querySelectorAll<HTMLElement>('[data-crop-action]').forEach(button=>on(button,'click',()=>{
  const action=button.dataset.cropAction,bulkMode=cropBulkModeForAction(action);
  if(action==='undo'){session=undoCropSession(session);sync()}else if(action==='redo'){session=redoCropSession(session);sync()}
  else if(action==='rotate-left')set({...session.present,rotation:normalizeRotation(session.present.rotation-90)})
  else if(action==='rotate-right')set({...session.present,rotation:normalizeRotation(session.present.rotation+90)})
  else if(action==='flip-h')set({...session.present,flipX:!session.present.flipX})
  else if(action==='flip-v')set({...session.present,flipY:!session.present.flipY})
  else if(action==='fit'){lockedAspect=cropPresetAspect('Original',sourceWidth(),sourceHeight());set({...session.present,crop:fitCrop(),zoom:1,panX:0,panY:0})}
  else if(action==='fill'){lockedAspect=undefined;const ratio=sourceWidth()/sourceHeight();set({...session.present,crop:fillCrop(sourceWidth(),sourceHeight(),ratio),zoom:1,panX:0,panY:0})}
  else if(action==='center')set({...session.present,crop:{...session.present.crop,x:(1-session.present.crop.width)/2,y:(1-session.present.crop.height)/2},panX:0,panY:0})
  else if(action==='reset-crop'){lockedAspect=undefined;set(resetCrop(session.present))}
  else if(action==='reset-all'){lockedAspect=undefined;set(resetAllTransforms())}
  else if(action==='copy')cropClipboard=copyTransform(session.present)
  else if(action==='paste'&&cropClipboard){lockedAspect=undefined;set(copyTransform(cropClipboard))}
  else if(action==='apply'){options.onApply(copyTransform(session.present));destroy()}
  else if(bulkMode){options.onApply(copyTransform(session.present),bulkMode);destroy()}
  else if(action==='cancel'){options.onCancel();destroy()}
 }));
 on(stage,'wheel',event=>{event.preventDefault();set({...session.present,zoom:clampZoom(session.present.zoom*(event.deltaY<0?1.08:.92))})});
 on(box,'pointerdown',event=>{const target=event.target as HTMLElement;pointer={x:event.clientX,y:event.clientY,crop:{...session.present.crop},handle:target.dataset.cropHandle as CropHandle|undefined};box.setPointerCapture?.(event.pointerId)});
 on(window,'pointermove',event=>{if(!pointer)return;const rect=stage.getBoundingClientRect(),dx=(event.clientX-pointer.x)/Math.max(1,rect.width),dy=(event.clientY-pointer.y)/Math.max(1,rect.height);const crop=pointer.handle?resizeCrop(pointer.crop,pointer.handle,dx,dy,resizeRatio()):moveCrop(pointer.crop,dx,dy);const safe=sanitizeTransform({...session.present,crop});box.style.left=`${safe.crop.x*100}%`;box.style.top=`${safe.crop.y*100}%`;box.style.width=`${safe.crop.width*100}%`;box.style.height=`${safe.crop.height*100}%`});
 on(window,'pointerup',event=>{if(!pointer)return;const rect=stage.getBoundingClientRect(),dx=(event.clientX-pointer.x)/Math.max(1,rect.width),dy=(event.clientY-pointer.y)/Math.max(1,rect.height),crop=pointer.handle?resizeCrop(pointer.crop,pointer.handle,dx,dy,resizeRatio()):moveCrop(pointer.crop,dx,dy);pointer=undefined;set({...session.present,crop})});
 on(box,'keydown',event=>{const step=event.shiftKey?.01:.0025;let dx=0,dy=0;if(event.key==='ArrowLeft')dx=-step;if(event.key==='ArrowRight')dx=step;if(event.key==='ArrowUp')dy=-step;if(event.key==='ArrowDown')dy=step;if(dx||dy){event.preventDefault();session=nudgeCropSession(session,dx,dy);sync()}});
 const destroy=()=>{if(destroyed)return;destroyed=true;listeners.splice(0).forEach(off=>off());URL.revokeObjectURL(url);container.innerHTML=''};
 sync();return {destroy};
}
