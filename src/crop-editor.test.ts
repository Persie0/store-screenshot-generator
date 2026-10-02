import test from 'node:test';
import assert from 'node:assert/strict';
import { identityTransform } from './crop.ts';
import { applyCropPreset,cropBulkModeForAction,cropEditorMarkup,cropPresetAspect,createCropSession,normalizedRatioForSource,nudgeCropSession,redoCropSession,setCropSessionTransform,undoCropSession } from './crop-editor.ts';

test('crop editor markup exposes the full editing toolset',()=>{
 const html=cropEditorMarkup({sameSizeCount:4,sameAspectCount:5,pixelCount:5,sourceWidth:1179,sourceHeight:2556});
 for(const label of ['Free','Original','1:1','3:2','2:3','4:3','3:4','5:4','4:5','16:9','9:16','iPhone','Android','Custom','Zoom','Pan X','Pan Y','Rotate left','Rotate right','Straighten','Flip H','Flip V','Fit','Fill','Center','Undo','Redo','Copy crop','Paste crop','Before / after','Rule of thirds','Center guides','Safe area','Apply to all same-size','Apply to same-aspect','Apply same pixel crop to all'])assert.ok(html.includes(label),label);
 assert.ok(html.includes('aspect-ratio:1179 / 2556'));
});

test('same-pixel action is disabled until another screenshot has dimensions',()=>{
 const html=cropEditorMarkup({sameSizeCount:1,sameAspectCount:1,pixelCount:1,sourceWidth:1179,sourceHeight:2556});
 assert.match(html,/data-crop-action="apply-same-pixels" disabled/);
 assert.equal(cropBulkModeForAction('apply-same-size'),'same-size');
 assert.equal(cropBulkModeForAction('apply-same-aspect'),'same-aspect');
 assert.equal(cropBulkModeForAction('apply-same-pixels'),'same-pixels');
 assert.equal(cropBulkModeForAction('apply'),undefined);
});

test('crop session supports undo and redo without mutating original transform',()=>{
 const original=identityTransform(),session=createCropSession(original);
 const changed={...identityTransform(),rotation:12,crop:{x:.1,y:.1,width:.8,height:.8}};
 const next=setCropSessionTransform(session,changed);
 assert.deepEqual(session.present,original);
 assert.deepEqual(next.present,changed);
 const undone=undoCropSession(next);assert.deepEqual(undone.present,original);
 const redone=redoCropSession(undone);assert.deepEqual(redone.present,changed);
});

test('nudging crop moves it in normalized coordinates and remains bounded',()=>{
 const start=createCropSession({...identityTransform(),crop:{x:.2,y:.2,width:.5,height:.5}});
 const moved=nudgeCropSession(start,.01,-.02);
 assert.deepEqual(moved.present.crop,{x:.21,y:.18,width:.5,height:.5});
 const bounded=nudgeCropSession(moved,10,10);
 assert.deepEqual(bounded.present.crop,{x:.5,y:.5,width:.5,height:.5});
});

test('ratio preset is interpreted in source-pixel aspect rather than normalized coordinates',()=>{
 const transformed=applyCropPreset(identityTransform(),'9:16',1179,2556);
 const actualAspect=(transformed.crop.width*1179)/(transformed.crop.height*2556);
 assert.ok(Math.abs(actualAspect-9/16)<1e-9);
 const square=applyCropPreset(identityTransform(),'1:1',1179,2556);
 assert.ok(Math.abs((square.crop.width*1179)/(square.crop.height*2556)-1)<1e-9);
});

test('locked pixel aspect converts to normalized crop-space ratio for resize handles',()=>{
 assert.equal(cropPresetAspect('Free',1179,2556),undefined);
 assert.equal(cropPresetAspect('Original',1179,2556),1179/2556);
 assert.equal(cropPresetAspect('9:16',1179,2556),9/16);
 assert.equal(cropPresetAspect('Custom',1179,2556,2),2);
 assert.ok(Math.abs(normalizedRatioForSource(9/16,1179,2556)-(9/16)*(2556/1179))<1e-12);
});

test('Original and Free reset crop while preserving rotation and flips',()=>{
 const initial={...identityTransform(),rotation:25,flipX:true,crop:{x:.2,y:.2,width:.4,height:.4}};
 for(const preset of ['Original','Free'] as const){
  const result=applyCropPreset(initial,preset,1000,2000);
  assert.deepEqual(result.crop,{x:0,y:0,width:1,height:1});
  assert.equal(result.rotation,25);assert.equal(result.flipX,true);
 }
});
