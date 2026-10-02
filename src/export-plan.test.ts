import test from 'node:test';
import assert from 'node:assert/strict';
import { identityTransform } from './crop.ts';
import { exportAssetPath,exportLocales,makeTextCheckEntry,shouldRenderStoreSize,storeAssetJobs } from './export-plan.ts';
import { STORE_SIZES } from './platform.ts';
import type { Project } from './storage.ts';

const project=():Project=>({
 id:'p',name:'Demo App',createdAt:1,updatedAt:2,status:'ready',englishApproved:true,
 analysis:{appSummary:'a',appCategory:'b',designStyle:'c',layoutMood:'minimal',audience:'d',palette:{accent:'#111111',ink:'#222222',paper:'#fffefe',secondary:'#eeeeee'},screens:[{id:'s1',headline:'Travel smarter',subheadline:'Compare cities',detectedText:['City Rankings','Costs'],overlapWarning:''}]},
 screens:[
  {id:'s1',name:'one.png',blob:new Blob(['1']),headline:'Travel smarter',subheadline:'Compare cities',sourceWidth:1179,sourceHeight:2556,transform:{...identityTransform(),crop:{x:.1,y:.2,width:.8,height:.7}}},
  {id:'s2',name:'two.png',blob:new Blob(['2']),headline:'Second',subheadline:'Screen',sourceWidth:1179,sourceHeight:2556,transform:identityTransform()},
 ],
});

test('feature graphic renders only the first screenshot while other sizes render all',()=>{
 const feature=STORE_SIZES.find(size=>size.key==='google/feature-graphic')!;
 const phone=STORE_SIZES.find(size=>size.key==='google/phone')!;
 assert.equal(shouldRenderStoreSize(feature,0),true);
 assert.equal(shouldRenderStoreSize(feature,1),false);
 assert.equal(shouldRenderStoreSize(phone,0),true);
 assert.equal(shouldRenderStoreSize(phone,1),true);
});

test('export paths are stable, locale-scoped, and filename-safe',()=>{
 const size=STORE_SIZES[0];
 assert.equal(exportAssetPath('de',size,0,'Demo App / 2026'),'de/apple/iphone-6-9/01-Demo-App-2026.png');
});

test('storeAssetJobs creates all permitted size/screen combinations',()=>{
 const p=project();
 const jobs=storeAssetJobs(p,'en');
 const expected=STORE_SIZES.filter(s=>s.key!=='google/feature-graphic').length*p.screens.length+1;
 assert.equal(jobs.length,expected);
 assert.equal(jobs.filter(job=>job.size.key==='google/feature-graphic').length,1);
 assert.equal(jobs[0].shot,p.screens[0]);
});

test('configured export locales include English and only selected targets with complete translations',()=>{
 const p=project();p.sourceLocale='en';p.localizedLocales=['en','nb','nn','fr'];p.translationLocales=['nb','nn'];p.translations={nb:{s1:{headline:'A',subheadline:'B'},s2:{headline:'C',subheadline:'D'}},nn:{s1:{headline:'A',subheadline:'B'}},fr:{s1:{headline:'A',subheadline:'B'},s2:{headline:'C',subheadline:'D'}}};
 assert.deepEqual(exportLocales(p),['en','nb']);
});

test('legacy export locales include existing translations from the default set',()=>{
 const p=project();p.translations={de:{s1:{headline:'A',subheadline:'B'},s2:{headline:'C',subheadline:'D'}},nb:{s1:{headline:'A',subheadline:'B'},s2:{headline:'C',subheadline:'D'}}};
 assert.deepEqual(exportLocales(p),['en','de']);
});

test('text check explicitly remains based on original Gemini analysis after crop',()=>{
 const p=project(),entry=makeTextCheckEntry(p,p.screens[0],{headline:'Travel smarter',subheadline:'Compare cities'},'en');
 assert.deepEqual(entry.detectedText,['City Rankings','Costs']);
 assert.equal(entry.analysisBasis,'original-upload');
 assert.equal(entry.cropReanalyzed,false);
 assert.deepEqual(entry.transform,p.screens[0].transform);
});
