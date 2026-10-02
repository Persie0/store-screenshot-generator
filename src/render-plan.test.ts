import test from 'node:test';
import assert from 'node:assert/strict';
import { identityTransform } from './crop.ts';
import { buildScreenshotRenderPlan,rotatedBounds,type Rect } from './render-plan.ts';

const viewport:Rect={x:10,y:20,width:300,height:600};
const finiteRect=(rect:Rect)=>Object.values(rect).every(Number.isFinite)&&rect.width>0&&rect.height>0;

test('identity plan uses the complete source and contains it in viewport',()=>{
 const plan=buildScreenshotRenderPlan(1000,2000,identityTransform(),viewport);
 assert.deepEqual(plan.sourceRect,{x:0,y:0,width:1000,height:2000});
 assert.deepEqual(plan.rotationBounds,{x:0,y:0,width:1000,height:2000});
 assert.deepEqual(plan.destinationRect,{x:10,y:20,width:300,height:600});
});

test('normalized crop becomes the exact source pixel rectangle',()=>{
 const transform={...identityTransform(),crop:{x:.1,y:.2,width:.5,height:.4}};
 const plan=buildScreenshotRenderPlan(1000,2000,transform,viewport);
 assert.deepEqual(plan.sourceRect,{x:100,y:400,width:500,height:800});
});

test('zoom and pan select a bounded region inside the crop',()=>{
 const transform={...identityTransform(),crop:{x:.1,y:.2,width:.8,height:.6},zoom:2,panX:1,panY:-1};
 const plan=buildScreenshotRenderPlan(1000,2000,transform,viewport);
 assert.deepEqual(plan.sourceRect,{x:500,y:400,width:400,height:600});
 assert.ok(plan.sourceRect.x+plan.sourceRect.width<=900);
 assert.ok(plan.sourceRect.y+plan.sourceRect.height<=1600);
});

test('90 degree rotation swaps visual bounds while arbitrary rotation remains finite',()=>{
 assert.deepEqual(rotatedBounds(300,600,90),{x:0,y:0,width:600,height:300});
 const bounds=rotatedBounds(300,600,37);
 assert.ok(finiteRect(bounds));
 assert.ok(bounds.width>300&&bounds.height>600*.7);
});

test('flip and rotation matrix is finite and reflects requested flips',()=>{
 const transform={...identityTransform(),rotation:30,flipX:true,flipY:false};
 const plan=buildScreenshotRenderPlan(1000,2000,transform,viewport);
 assert.ok(Object.values(plan.matrix).every(Number.isFinite));
 assert.ok(plan.matrix.a<0);
 assert.ok(plan.matrix.d>0);
});

test('extreme valid transform never samples outside source or returns invalid rectangles',()=>{
 const transform={...identityTransform(),crop:{x:.83,y:.79,width:.17,height:.21},zoom:8,panX:1,panY:-1,rotation:179,flipX:true,flipY:true};
 const plan=buildScreenshotRenderPlan(1179,2556,transform,{x:0,y:0,width:700,height:1800});
 assert.ok(finiteRect(plan.sourceRect));assert.ok(finiteRect(plan.rotationBounds));assert.ok(finiteRect(plan.destinationRect));
 assert.ok(plan.sourceRect.x>=0&&plan.sourceRect.y>=0);
 assert.ok(plan.sourceRect.x+plan.sourceRect.width<=1179+1e-9);
 assert.ok(plan.sourceRect.y+plan.sourceRect.height<=2556+1e-9);
});
