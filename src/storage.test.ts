import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeIndexedDb } from './test-idb.ts';
import { identityTransform } from './crop.ts';

const env=installFakeIndexedDb();
const storage=await import('./storage.ts');
const {saveProject,getProject,listProjects,deleteProject,projectManifest,normalizeProject}=storage;

type Project=import('./storage.ts').Project;

function project(id:string,updatedAt:number):Project{
 return {id,name:`Project ${id}`,createdAt:1,updatedAt,status:'needs-approval',screens:[{id:`shot-${id}`,name:'screen.png',blob:new Blob(['x']),headline:'Hello',subheadline:'World',sourceWidth:1179,sourceHeight:2556,transform:{...identityTransform(),crop:{x:.1,y:.2,width:.8,height:.7}}}],englishApproved:false};
}

test('save get list and delete projects preserve crop metadata and sort newest first',async()=>{
 const older=project('old',10),newer=project('new',20);
 await saveProject(older);await saveProject(newer);
 const loaded=await getProject('old');
 assert.equal(loaded?.screens[0].sourceWidth,1179);
 assert.deepEqual(loaded?.screens[0].transform?.crop,{x:.1,y:.2,width:.8,height:.7});
 assert.deepEqual((await listProjects()).map(p=>p.id),['new','old']);
 await deleteProject('old');
 assert.equal(await getProject('old'),undefined);
});

test('legacy project without crop fields loads as identity crop',()=>{
 const legacy=project('legacy',30);
 delete legacy.screens[0].transform;delete legacy.screens[0].sourceWidth;delete legacy.screens[0].sourceHeight;
 const normalized=normalizeProject(legacy);
 assert.deepEqual(normalized.screens[0].transform,identityTransform());
 assert.equal(normalized.screens[0].sourceWidth,undefined);
});

test('malformed persisted transform recovers instead of breaking project load',async()=>{
 const bad=project('bad',40) as Project & {screens:Array<any>};
 bad.screens[0].transform={crop:{x:NaN,y:-10,width:-1,height:99},zoom:Infinity,panX:99,panY:-99,rotation:Infinity,flipX:'yes'};
 env.records.set('bad',bad);
 const loaded=await getProject('bad');
 assert.deepEqual(loaded?.screens[0].transform,identityTransform());
});

test('project manifest includes source dimensions and transform while excluding blobs',()=>{
 const p=project('manifest',50);
 const manifest=projectManifest(p);
 const shot=manifest.screens[0];
 assert.equal(shot.sourceWidth,1179);
 assert.equal(shot.sourceHeight,2556);
 assert.deepEqual(shot.transform,p.screens[0].transform);
 assert.equal('blob' in shot,false);
 assert.match(shot.originalPath,/originals\/shot-manifest-screen\.png/);
});
