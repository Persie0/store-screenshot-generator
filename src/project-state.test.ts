import test from 'node:test';
import assert from 'node:assert/strict';
import { identityTransform } from './crop.ts';
import { applyTransformToMatchingShots,dashboardProjects,duplicateProject,renameProject,setShotTransform } from './project-state.ts';
import type { Project } from './storage.ts';

function makeProject():Project{
 const transform={...identityTransform(),crop:{x:.1,y:.1,width:.8,height:.8}};
 return {
  id:'p1',name:'Demo',createdAt:1,updatedAt:2,status:'ready',englishApproved:true,
  analysis:{appSummary:'a',appCategory:'b',designStyle:'c',layoutMood:'minimal',audience:'d',palette:{accent:'#111111',ink:'#222222',paper:'#ffffff',secondary:'#eeeeee'},screens:[]},
  translations:{de:{s1:{headline:'Hallo',subheadline:'Welt'}}},
  screens:[
   {id:'s1',name:'1.png',blob:new Blob(['1']),headline:'One',subheadline:'First',sourceWidth:1179,sourceHeight:2556,transform},
   {id:'s2',name:'2.png',blob:new Blob(['2']),headline:'Two',subheadline:'Second',sourceWidth:1179,sourceHeight:2556,transform:identityTransform()},
   {id:'s3',name:'3.png',blob:new Blob(['3']),headline:'Three',subheadline:'Third',sourceWidth:786,sourceHeight:1704,transform:identityTransform()},
   {id:'s4',name:'4.png',blob:new Blob(['4']),headline:'Four',subheadline:'Fourth',sourceWidth:1080,sourceHeight:2341,transform:identityTransform()},
  ],
 };
}

test('renameProject trims, caps the name, and updates only project metadata',()=>{
 const p=makeProject(),beforeScreens=p.screens;
 const renamed=renameProject(p,`  ${'x'.repeat(100)}  `,100);
 assert.equal(renamed.name.length,70);
 assert.equal(renamed.updatedAt,100);
 assert.equal(renamed.screens,beforeScreens);
 assert.equal(p.name,'Demo');
});

test('duplicateProject assigns new project/screen IDs while preserving content and deep-copying transforms',()=>{
 const p=makeProject();
 const duplicate=duplicateProject(p,'p2',['n1','n2','n3','n4'],200);
 assert.equal(duplicate.id,'p2');
 assert.equal(duplicate.createdAt,200);assert.equal(duplicate.updatedAt,200);
 assert.deepEqual(duplicate.screens.map(s=>s.id),['n1','n2','n3','n4']);
 assert.equal(duplicate.screens[0].blob,p.screens[0].blob);
 assert.deepEqual(duplicate.screens[0].transform,p.screens[0].transform);
 assert.notEqual(duplicate.screens[0].transform,p.screens[0].transform);
 assert.deepEqual(duplicate.analysis,p.analysis);
 assert.deepEqual(duplicate.translations,p.translations);
});

test('setShotTransform changes only the requested screenshot and leaves Gemini state intact',()=>{
 const p=makeProject(),analysis=structuredClone(p.analysis),translations=structuredClone(p.translations);
 const next={...identityTransform(),rotation:90,flipX:true};
 const changed=setShotTransform(p,'s2',next,300);
 assert.deepEqual(changed.screens[1].transform,next);
 assert.deepEqual(changed.screens[0].transform,p.screens[0].transform);
 assert.deepEqual(changed.analysis,analysis);assert.deepEqual(changed.translations,translations);assert.equal(changed.englishApproved,true);
 assert.equal(changed.updatedAt,300);
});

test('same-size bulk crop applies only to exact source dimensions',()=>{
 const p=makeProject(),transform={...identityTransform(),crop:{x:.2,y:.15,width:.6,height:.7},rotation:8};
 const result=applyTransformToMatchingShots(p,'s1',transform,'same-size',400);
 assert.deepEqual(result.appliedIds,['s1','s2']);
 assert.deepEqual(result.skippedIds,['s3','s4']);
 assert.deepEqual(result.project.screens[0].transform,transform);
 assert.deepEqual(result.project.screens[1].transform,transform);
 assert.deepEqual(result.project.screens[2].transform,p.screens[2].transform);
 assert.notEqual(result.project.screens[0].transform,result.project.screens[1].transform);
});

test('same-aspect crop maps normalized coordinates to compatible dimensions only',()=>{
 const p=makeProject(),transform={...identityTransform(),crop:{x:.05,y:.1,width:.9,height:.8}};
 const result=applyTransformToMatchingShots(p,'s1',transform,'same-aspect',500);
 assert.deepEqual(result.appliedIds,['s1','s2','s3']);
 assert.deepEqual(result.skippedIds,['s4']);
 assert.deepEqual(result.project.analysis,p.analysis);
 assert.deepEqual(result.project.translations,p.translations);
 assert.equal(result.project.englishApproved,p.englishApproved);
});

test('dashboardProjects returns newest projects first without mutating input',()=>{
 const a=makeProject(),b={...makeProject(),id:'p2',updatedAt:99},input=[a,b];
 const ordered=dashboardProjects(input);
 assert.deepEqual(ordered.map(p=>p.id),['p2','p1']);
 assert.deepEqual(input.map(p=>p.id),['p1','p2']);
});
