import test from 'node:test';
import assert from 'node:assert/strict';
import { onboardingMarkup,studioMarkup } from './app-view.ts';
import { STORE_SIZES } from './platform.ts';
import type { Project } from './storage.ts';

const p=():Project=>({
 id:'p',name:'Demo <App>',createdAt:1,updatedAt:2,status:'ready',englishApproved:true,
 analysis:{appSummary:'x',appCategory:'y',designStyle:'z',layoutMood:'minimal',audience:'a',palette:{accent:'#3344aa',ink:'#111111',paper:'#ffffff',secondary:'#eeeeee'},screens:[{id:'s1',headline:'Headline',subheadline:'Sub',detectedText:['Visible UI'],overlapWarning:''}]},
 translations:{de:{s1:{headline:'Überschrift',subheadline:'Unterzeile'}}},
 screens:[{id:'s1',name:'first.png',blob:new Blob(['x']),headline:'Headline',subheadline:'Sub',sourceWidth:1179,sourceHeight:2556},{id:'s2',name:'second.png',blob:new Blob(['y']),headline:'Second',subheadline:'Two'}],
});

test('onboarding exposes explicit create flow and back-to-projects for returning users',()=>{
 const first=onboardingMarkup(0,'');
 assert.ok(first.includes('id="project-name"'));assert.ok(first.includes('id="gemini-key"'));assert.ok(first.includes('id="screens-input"'));assert.ok(first.includes('id="start-analysis"'));
 assert.ok(!first.includes('data-back-dashboard'));
 const returning=onboardingMarkup(3,'');
 assert.ok(returning.includes('data-back-dashboard'));assert.ok(returning.includes('3 saved projects'));
});

test('studio exposes exact export preview, crop controls, screen navigation and export',()=>{
 const html=studioMarkup(p(),0,'en',STORE_SIZES[0].key,['blob:one','blob:two']);
 assert.ok(html.includes('id="exact-preview"'));
 assert.ok(html.includes('id="preview-size-select"'));
 assert.ok(html.includes('data-crop-screen="s1"'));
 assert.ok(html.includes('data-screen="1"'));
 assert.ok(html.includes('id="export-project"'));
 assert.ok(html.includes('id="add-screens"'));
 assert.ok(html.includes('id="headline-input"'));
 assert.ok(html.includes('id="subheadline-input"'));
 assert.ok(html.includes('Approve English'));
 assert.ok(html.includes('original screenshot'));
});

test('studio renders translated copy without changing the underlying English source',()=>{
 const html=studioMarkup(p(),0,'de',STORE_SIZES[0].key,['blob:one','blob:two']);
 assert.ok(html.includes('Überschrift'));
 assert.ok(html.includes('Unterzeile'));
 assert.ok(html.includes('German'));
});

test('views escape project and screenshot names',()=>{
 const project=p();project.screens[0].name='<img onerror=alert(1)>';
 const html=studioMarkup(project,0,'en',STORE_SIZES[0].key,['blob:one','blob:two']);
 assert.ok(!html.includes('<img onerror=alert(1)>'));
 assert.ok(html.includes('&lt;img onerror=alert(1)&gt;'));
 assert.ok(html.includes('Demo &lt;App&gt;'));
});
