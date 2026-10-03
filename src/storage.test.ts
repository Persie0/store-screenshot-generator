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

test('project manifest includes source dimensions transform and locale configuration while excluding blobs',()=>{
 const p=project('manifest',50);p.sourceLocale='en';p.localizedLocales=['en','nb','nn'];p.translationLocales=['nb'];
 const manifest=projectManifest(p);
 const shot=manifest.screens[0];
 assert.equal(shot.sourceWidth,1179);
 assert.equal(shot.sourceHeight,2556);
 assert.deepEqual(shot.transform,p.screens[0].transform);
 assert.equal('blob' in shot,false);
 assert.match(shot.originalPath,/originals\/shot-manifest-screen\.png/);
 assert.equal(manifest.sourceLocale,'en');
 assert.deepEqual(manifest.localizedLocales,['en','nb','nn']);
 assert.deepEqual(manifest.translationLocales,['nb']);
});

test('save and load preserves imported locale settings',async()=>{
 const p=project('locales',60);p.sourceLocale='en';p.localizedLocales=['en','nb','nn'];p.translationLocales=['nb','nn'];
 await saveProject(p);const loaded=await getProject('locales');
 assert.equal(loaded?.sourceLocale,'en');assert.deepEqual(loaded?.localizedLocales,['en','nb','nn']);assert.deepEqual(loaded?.translationLocales,['nb','nn']);
});

test('phone frame settings normalize legacy and malformed values and round-trip through manifest',()=>{
 const legacy=normalizeProject(project('frame-legacy',70));
 assert.equal(legacy.phoneColorMode,'auto');
 assert.equal(legacy.phoneColor,undefined);
 const configured={...project('frame-manual',80),phoneColorMode:'manual' as const,phoneColor:'#a1b2c3'};
 const normalized=normalizeProject(configured);
 assert.equal(normalized.phoneColorMode,'manual');
 assert.equal(normalized.phoneColor,'#A1B2C3');
 const manifest=projectManifest(normalized) as any;
 assert.equal(manifest.phoneColorMode,'manual');
 assert.equal(manifest.phoneColor,'#A1B2C3');
 assert.equal('apiKey' in manifest,false);
 const malformed=normalizeProject({...project('frame-bad',90),phoneColorMode:'unexpected' as any,phoneColor:'#123'} as any);
 assert.equal(malformed.phoneColorMode,'auto');
 assert.equal(malformed.phoneColor,undefined);
});
