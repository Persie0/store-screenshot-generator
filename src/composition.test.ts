import test from 'node:test';
import assert from 'node:assert/strict';
import { STORE_SIZES } from './platform.ts';
import { fitContainedRect, getCreativeComposition } from './composition.ts';

test('portrait exports keep the phone below copy and close to the bottom edge',()=>{
 for(const size of STORE_SIZES.filter(s=>s.kind==='portrait'))for(const headlineLines of [1,2])for(const subheadlineLines of [1,2]){
  const screenshotAspect=1290/2796;
  const layout=getCreativeComposition(size,headlineLines,subheadlineLines,screenshotAspect);
  const copyBottom=layout.subheadline.y+(subheadlineLines-1)*layout.subheadline.lineHeight+layout.subheadline.fontSize;
  const gap=layout.device.y-copyBottom;
  const bottomGap=size.height-(layout.device.y+layout.device.height);
  assert.ok(gap>=Math.min(52,size.height*.025)-1,`${size.label} copy-to-device gap was ${gap}px`);
  assert.ok(bottomGap>=size.height*.018&&bottomGap<=size.height*.035,`${size.label} bottom gap was ${bottomGap}px`);
  assert.ok(layout.device.y+layout.device.height<=size.height,`${size.label} device runs outside export`);
  assert.ok(layout.headline.y<size.height*.08,`${size.label} title starts near the top`);
  assert.equal('brand' in layout,false);
 }
});

test('portrait phone frame follows screenshot aspect so the whole screenshot can be shown',()=>{
 const screenshotAspect=1290/2796;
 for(const size of STORE_SIZES.filter(s=>s.kind==='portrait')){
  const layout=getCreativeComposition(size,2,2,screenshotAspect);
  assert.ok(Math.abs(layout.device.width/layout.device.height-screenshotAspect)<0.025,`${size.label} aspect mismatch`);
 }
});

test('contained screenshot fitting preserves the source aspect without cropping',()=>{
 const rect=fitContainedRect(1290,2796,100,200,700,1500);
 assert.ok(rect.x>=100&&rect.y>=200);
 assert.ok(rect.x+rect.width<=800+1e-6);
 assert.ok(rect.y+rect.height<=1700+1e-6);
 assert.ok(Math.abs(rect.width/rect.height-1290/2796)<1e-9);
});

test('landscape feature exports keep type and device balanced without a footer brand',()=>{
 const size=STORE_SIZES.find(s=>s.kind==='landscape')!;const layout=getCreativeComposition(size,2,2,1290/2796);
 assert.ok(layout.device.height>=size.height*.8&&layout.device.height<=size.height*.84);
 assert.ok(layout.device.width<=size.width*.26);
 assert.ok(layout.headline.y<size.height*.22);
 assert.ok(layout.device.x>layout.headline.x+layout.headline.width);
 assert.equal('brand' in layout,false);
 assert.equal('footer' in layout,false);
});
