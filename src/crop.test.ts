import test from 'node:test';
import assert from 'node:assert/strict';
import {
 applyAspectRatio,canApplyTransform,clampCrop,clampPan,clampZoom,cropToPixelInsets,cropToPixels,fitCrop,fillCrop,
 identityTransform,moveCrop,normalizeRotation,pixelInsetsToCrop,pixelsToCrop,resizeCrop,sameSourceAspect,sameSourceSize,
 sanitizeTransform,transformEquals,type CropRect,type ScreenshotTransform,
} from './crop.ts';

test('identity transform represents the complete unmodified screenshot',()=>{
 assert.deepEqual(identityTransform(),{
  crop:{x:0,y:0,width:1,height:1},zoom:1,panX:0,panY:0,rotation:0,flipX:false,flipY:false,
 });
});

test('sanitizeTransform recovers malformed persisted data to safe values',()=>{
 assert.deepEqual(sanitizeTransform(null),identityTransform());
 const t=sanitizeTransform({crop:{x:-2,y:.9,width:5,height:.5},zoom:999,panX:9,panY:-9,rotation:450,flipX:true,flipY:'bad'});
 assert.deepEqual(t.crop,{x:0,y:.9,width:1,height:.1});
 assert.equal(t.zoom,8);
 assert.equal(t.panX,1);
 assert.equal(t.panY,-1);
 assert.equal(t.rotation,90);
 assert.equal(t.flipX,true);
 assert.equal(t.flipY,false);
});

test('clampCrop clamps every edge and enforces minimum dimensions',()=>{
 assert.deepEqual(clampCrop({x:-.2,y:.9,width:.8,height:.5}),{x:0,y:.9,width:.8,height:.1});
 assert.deepEqual(clampCrop({x:.99,y:.99,width:0,height:0},.05),{x:.95,y:.95,width:.05,height:.05});
 assert.deepEqual(clampCrop({x:.8,y:.2,width:.5,height:.4}),{x:.8,y:.2,width:.2,height:.4});
});

test('aspect-ratio locking keeps crop in bounds for common ratios',()=>{
 const ratios=[1,3/2,2/3,4/3,3/4,5/4,4/5,16/9,9/16,1179/2556,1080/2400];
 for(const ratio of ratios){
  const crop=applyAspectRatio({x:.1,y:.1,width:.75,height:.75},ratio);
  assert.ok(Math.abs(crop.width/crop.height-ratio)<1e-9,`ratio ${ratio}`);
  assert.ok(crop.x>=0&&crop.y>=0&&crop.x+crop.width<=1&&crop.y+crop.height<=1);
 }
});

test('moveCrop and resizeCrop preserve valid normalized geometry',()=>{
 assert.deepEqual(moveCrop({x:.1,y:.2,width:.5,height:.4},.8,-.5),{x:.5,y:0,width:.5,height:.4});
 const handles=['n','ne','e','se','s','sw','w','nw'] as const;
 for(const handle of handles){
  const crop=resizeCrop({x:.2,y:.2,width:.5,height:.5},handle,.08,.06);
  assert.ok(crop.width>0&&crop.height>0,handle);
  assert.ok(crop.x>=0&&crop.y>=0&&crop.x+crop.width<=1&&crop.y+crop.height<=1,handle);
 }
 const locked=resizeCrop({x:.2,y:.2,width:.5,height:.5},'se',.1,.2,9/16);
 assert.ok(Math.abs(locked.width/locked.height-9/16)<1e-9);
});

test('zoom pan and rotation bounds are deterministic',()=>{
 assert.equal(clampZoom(.2),1);
 assert.equal(clampZoom(20),8);
 assert.equal(clampZoom(2.5),2.5);
 assert.deepEqual(clampPan(2,-3),{panX:1,panY:-1});
 assert.equal(normalizeRotation(450),90);
 assert.equal(normalizeRotation(-450),-90);
 assert.equal(normalizeRotation(181),-179);
});

test('normalized crop converts to and from source pixels',()=>{
 const crop:CropRect={x:.1,y:.2,width:.5,height:.4};
 const px=cropToPixels(crop,1200,2400);
 assert.deepEqual(px,{x:120,y:480,width:600,height:960});
 const back=pixelsToCrop(px,1200,2400);
 assert.deepEqual(back,crop);
});

test('normalized crop converts to exact integer pixel insets and maps them to another size',()=>{
 const insets=cropToPixelInsets({x:.1,y:.2,width:.7,height:.6},1000,2000);
 assert.deepEqual(insets,{left:100,top:400,right:200,bottom:400});
 assert.deepEqual(pixelInsetsToCrop(insets!,2000,3000),{x:.05,y:400/3000,width:1700/2000,height:2200/3000});
});

test('pixel inset helpers reject invalid dimensions and crops that consume the target',()=>{
 assert.equal(cropToPixelInsets({x:0,y:0,width:1,height:1},0,100),undefined);
 assert.equal(pixelInsetsToCrop({left:60,top:0,right:40,bottom:0},100,100),undefined);
 assert.equal(pixelInsetsToCrop({left:0,top:60,right:0,bottom:40},100,100),undefined);
 const edge=cropToPixelInsets({x:.1,y:.1,width:.7,height:.7},3,3);
 assert.ok(edge&&edge.left>=0&&edge.top>=0&&edge.right>=0&&edge.bottom>=0);
});

test('fit and fill helpers provide centered valid crops',()=>{
 assert.deepEqual(fitCrop(),{x:0,y:0,width:1,height:1});
 const portrait=fillCrop(1200,2400,9/16);
 assert.ok(Math.abs(portrait.width/portrait.height*(1200/2400)-9/16)<1e-9);
 assert.ok(Math.abs((portrait.x+portrait.width/2)-.5)<1e-9);
 assert.ok(Math.abs((portrait.y+portrait.height/2)-.5)<1e-9);
});

test('same-size and same-aspect matching reject incompatible screenshots',()=>{
 const a={sourceWidth:1179,sourceHeight:2556};
 const b={sourceWidth:1179,sourceHeight:2556};
 const c={sourceWidth:1080,sourceHeight:2341};
 const d={sourceWidth:786,sourceHeight:1704};
 assert.equal(sameSourceSize(a,b),true);
 assert.equal(sameSourceSize(a,c),false);
 assert.equal(sameSourceAspect(a,d),true);
 assert.equal(sameSourceAspect(a,c),false);
 assert.equal(canApplyTransform(a,b,'same-size'),true);
 assert.equal(canApplyTransform(a,c,'same-size'),false);
 assert.equal(canApplyTransform(a,d,'same-aspect'),true);
});

test('transform equality compares sanitized values rather than object identity',()=>{
 const a:ScreenshotTransform=identityTransform();
 const b:ScreenshotTransform=structuredClone(a);
 assert.equal(transformEquals(a,b),true);
 b.crop.x=.1;b.crop.width=.9;
 assert.equal(transformEquals(a,b),false);
});
