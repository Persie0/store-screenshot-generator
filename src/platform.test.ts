import test from 'node:test';
import assert from 'node:assert/strict';
import { STORE_SIZES } from './platform.ts';

test('store size keys are unique and dimensions are positive integers',()=>{
 assert.equal(new Set(STORE_SIZES.map(size=>size.key)).size,STORE_SIZES.length);
 for(const size of STORE_SIZES){
  assert.ok(Number.isInteger(size.width)&&size.width>0,`${size.key} width`);
  assert.ok(Number.isInteger(size.height)&&size.height>0,`${size.key} height`);
 }
});

test('phone and tablet assets are portrait while feature graphic is landscape',()=>{
 for(const size of STORE_SIZES){
  if(size.key==='google/feature-graphic'){
   assert.equal(size.kind,'landscape');
   assert.ok(size.width>size.height);
  }else{
   assert.equal(size.kind,'portrait');
   assert.ok(size.height>size.width);
  }
 }
});

test('store size catalog contains Apple phone/tablet and Google phone/feature assets',()=>{
 assert.ok(STORE_SIZES.some(size=>size.key.startsWith('apple/iphone-')));
 assert.ok(STORE_SIZES.some(size=>size.key.startsWith('apple/ipad-')));
 assert.ok(STORE_SIZES.some(size=>size.key==='google/phone'));
 assert.ok(STORE_SIZES.some(size=>size.key==='google/feature-graphic'));
});
