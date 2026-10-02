import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFor,initialRoute,updateScreenCopy } from './app-state.ts';
import type { Project } from './storage.ts';

const base=():Project=>({id:'p',name:'Demo',createdAt:1,updatedAt:2,status:'ready',englishApproved:true,translations:{de:{s:{headline:'Hallo',subheadline:'Welt'}}},screens:[{id:'s',name:'screen.png',blob:new Blob(['x']),headline:'Hello',subheadline:'World'}]});

test('initialRoute sends returning users to dashboard unless new-project flow is explicit',()=>{
 assert.equal(initialRoute([],false),'onboarding');
 assert.equal(initialRoute([base()],false),'dashboard');
 assert.equal(initialRoute([base()],true),'onboarding');
});

test('copyFor uses English source or selected translation',()=>{
 const p=base(),shot=p.screens[0];
 assert.deepEqual(copyFor(p,shot,'en'),{headline:'Hello',subheadline:'World'});
 assert.deepEqual(copyFor(p,shot,'de'),{headline:'Hallo',subheadline:'Welt'});
 assert.deepEqual(copyFor(p,shot,'fr'),{headline:'Hello',subheadline:'World'});
});

test('editing English invalidates translations but crop-only project state never does',()=>{
 const p=base();
 const changed=updateScreenCopy(p,'s','en','headline','Changed',10);
 assert.equal(changed.screens[0].headline,'Changed');
 assert.equal(changed.englishApproved,false);assert.equal(changed.translations,undefined);assert.equal(changed.status,'needs-approval');
 assert.equal(changed.updatedAt,10);
});

test('editing translation changes only selected locale',()=>{
 const p=base();
 const changed=updateScreenCopy(p,'s','de','subheadline','Neue Welt',11);
 assert.equal(changed.translations?.de.s.subheadline,'Neue Welt');
 assert.equal(changed.screens[0].subheadline,'World');
 assert.equal(changed.englishApproved,true);
});
