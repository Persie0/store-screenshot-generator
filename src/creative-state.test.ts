import test from 'node:test';
import assert from 'node:assert/strict';
import { identityTransform } from './crop.ts';
import { applyRegeneratedCreative,resolveScreenPresentation,setManualPhoneColor,setPhoneColorMode } from './creative-state.ts';
import type { Project } from './storage.ts';
import type { ScreenCopy } from './studio.ts';

function makeProject():Project{
 const blob1=new Blob(['one']),blob2=new Blob(['two']);
 return {
  id:'p1',name:'Demo',createdAt:1,updatedAt:2,status:'ready',englishApproved:true,
  phoneColorMode:'auto',phoneColor:'#445566',sourceLocale:'en',localizedLocales:['en','de','fr'],translationLocales:['de','fr'],
  screens:[
   {id:'s1',name:'one.png',blob:blob1,headline:'Old one',subheadline:'Old sub one',sourceWidth:1000,sourceHeight:2000,transform:{...identityTransform(),crop:{x:.1,y:.1,width:.8,height:.8}}},
   {id:'s2',name:'two.png',blob:blob2,headline:'Old two',subheadline:'Old sub two',sourceWidth:1000,sourceHeight:2000,transform:identityTransform()},
  ],
  analysis:{appSummary:'Demo',appCategory:'Tools',designStyle:'Clean',layoutMood:'minimal',audience:'Everyone',palette:{accent:'#111111',ink:'#222222',paper:'#EEEEEE',secondary:'#CCCCCC'},screens:[
   {id:'s1',headline:'Old one',subheadline:'Old sub one',detectedText:['One'],overlapWarning:'',phoneColor:'#123456',layoutMood:'bold',palette:{accent:'#ABCDEF',ink:'#101010',paper:'#F0F0F0',secondary:'#CCCCCC'}},
   {id:'s2',headline:'Old two',subheadline:'Old sub two',detectedText:['Two'],overlapWarning:'',phoneColor:'#654321'},
  ]},
  translations:{de:{s1:{headline:'Alt eins',subheadline:'Unter eins'},s2:{headline:'Alt zwei',subheadline:'Unter zwei'}},fr:{s1:{headline:'FR un',subheadline:'FR sub'},s2:{headline:'FR deux',subheadline:'FR sub2'}}},
 };
}

test('creative presentation resolves per-screen visual overrides and phone frame precedence',()=>{
 const project=makeProject();
 const fallback={accent:'#000001',ink:'#000002',paper:'#FFFFFE',secondary:'#000003'};
 const auto=resolveScreenPresentation(project,'s1',fallback);
 assert.equal(auto.phoneColor,'#123456');
 assert.equal(auto.mood,'bold');
 assert.deepEqual(auto.palette,{accent:'#ABCDEF',ink:'#101010',paper:'#F0F0F0',secondary:'#CCCCCC'});
 const manual=setManualPhoneColor(setPhoneColorMode(project,'manual',10),'#AABBCC',11);
 assert.equal(resolveScreenPresentation(manual,'s1',fallback).phoneColor,'#AABBCC');
 const legacy={...project,phoneColorMode:undefined,phoneColor:undefined,analysis:undefined};
 const legacyResolved=resolveScreenPresentation(legacy,'s1',fallback);
 assert.equal(legacyResolved.phoneColor,'#111521');
 assert.equal(legacyResolved.mood,'editorial');
 assert.deepEqual(legacyResolved.palette,fallback);
});

test('regenerated creative updates only selected screen and invalidates only its translations',()=>{
 const project=makeProject();
 const originalShot=project.screens[0];
 const creative:ScreenCopy={id:'s1',headline:'Fresh headline',subheadline:'Fresh support',detectedText:['One'],overlapWarning:'',phoneColor:'#FEDCBA',layoutMood:'playful',palette:{accent:'#123123',ink:'#222222',paper:'#FDFDFD',secondary:'#ABCABC'}};
 const updated=applyRegeneratedCreative(project,'s1',creative,99);
 assert.equal(updated.screens[0].headline,'Fresh headline');
 assert.equal(updated.screens[0].subheadline,'Fresh support');
 assert.equal(updated.screens[0].blob,originalShot.blob);
 assert.deepEqual(updated.screens[0].transform,originalShot.transform);
 assert.equal(updated.screens[0].sourceWidth,originalShot.sourceWidth);
 assert.equal(updated.analysis?.screens.find(s=>s.id==='s1')?.phoneColor,'#FEDCBA');
 assert.equal(updated.analysis?.screens.find(s=>s.id==='s2')?.headline,'Old two');
 assert.equal(updated.englishApproved,false);
 assert.equal(updated.status,'needs-approval');
 assert.equal(updated.translations?.de?.s1,undefined);
 assert.equal(updated.translations?.fr?.s1,undefined);
 assert.equal(updated.translations?.de?.s2?.headline,'Alt zwei');
 assert.equal(updated.translations?.fr?.s2?.headline,'FR deux');
 assert.deepEqual(updated.localizedLocales,project.localizedLocales);
 assert.deepEqual(updated.translationLocales,project.translationLocales);
 assert.equal(updated.phoneColorMode,'auto');
 assert.equal(updated.phoneColor,'#445566');
 assert.equal(updated.updatedAt,99);
 assert.equal(applyRegeneratedCreative(project,'missing',creative,100),project);
});
