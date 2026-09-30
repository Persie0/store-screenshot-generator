import test from 'node:test';
import assert from 'node:assert/strict';
import { STORE_SIZES } from './platform.ts';
import { getCreativeComposition } from './composition.ts';

test('portrait exports use a restrained phone size with a compact title-to-device gap',()=>{
 for(const size of STORE_SIZES.filter(s=>s.kind==='portrait'))for(const headlineLines of [1,2])for(const subheadlineLines of [1,2]){
  const layout=getCreativeComposition(size,headlineLines,subheadlineLines);
  assert.ok(layout.device.width>=size.width*.49&&layout.device.width<=size.width*.78,`${size.label} device width`);
  assert.ok(layout.device.height>=size.height*.70&&layout.device.height<=size.height*.74,`${size.label} device height`);
  const copyBottom=layout.subheadline.y+(subheadlineLines-1)*layout.subheadline.lineHeight+layout.subheadline.fontSize;
  const gap=layout.device.y-copyBottom;
  assert.ok(gap>=50&&gap<=80,`${size.label} copy-to-device gap was ${gap}px`);
  assert.ok(layout.headline.y<size.height*.08,`${size.label} title starts near the top`);
  assert.equal('brand' in layout,false);
 }
});

test('landscape feature exports keep type and device balanced without a footer brand',()=>{
 const size=STORE_SIZES.find(s=>s.kind==='landscape')!;const layout=getCreativeComposition(size,2,2);
 assert.ok(layout.device.height>=size.height*.8&&layout.device.height<=size.height*.84);
 assert.ok(layout.device.width>=size.width*.22&&layout.device.width<=size.width*.26);
 assert.ok(layout.headline.y<size.height*.22);
 assert.ok(layout.device.x>layout.headline.x+layout.headline.width);
 assert.equal('brand' in layout,false);
 assert.equal('footer' in layout,false);
});
