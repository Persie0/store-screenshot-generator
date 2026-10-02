import test from 'node:test';
import assert from 'node:assert/strict';
import { identityTransform } from './crop.ts';
import { getTransformedContentAspect,planShotInViewport } from './render.ts';

test('identity render plan keeps the full screenshot visible',()=>{
 const plan=planShotInViewport(1179,2556,identityTransform(),{x:0,y:0,width:500,height:1200});
 assert.deepEqual(plan.sourceRect,{x:0,y:0,width:1179,height:2556});
 assert.ok(plan.destinationRect.width<=500&&plan.destinationRect.height<=1200);
 assert.ok(Math.abs(plan.destinationRect.width/plan.destinationRect.height-1179/2556)<1e-9);
});

test('configured crop is the only intentional source crop',()=>{
 const transform={...identityTransform(),crop:{x:.1,y:.2,width:.6,height:.5}};
 const plan=planShotInViewport(1000,2000,transform,{x:0,y:0,width:600,height:1000});
 assert.deepEqual(plan.sourceRect,{x:100,y:400,width:600,height:1000});
});

test('content aspect follows crop and rotation for composition sizing',()=>{
 const transform={...identityTransform(),crop:{x:.1,y:.1,width:.8,height:.4}};
 assert.equal(getTransformedContentAspect(1000,2000,transform),1);
 assert.equal(getTransformedContentAspect(1000,2000,{...transform,rotation:90}),1);
 const tall={...identityTransform(),crop:{x:0,y:0,width:.5,height:1}};
 assert.equal(getTransformedContentAspect(1000,2000,tall),.25);
 assert.equal(getTransformedContentAspect(1000,2000,{...tall,rotation:90}),4);
});
