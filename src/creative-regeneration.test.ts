import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeScreenshots,regenerateScreenCreative,type Analysis } from './studio.ts';

async function withImageEnv<T>(run:()=>Promise<T>):Promise<T>{
 const originalCreateImageBitmap=globalThis.createImageBitmap,originalDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
 const canvas={width:0,height:0,getContext:()=>({drawImage:()=>{}}),toBlob:(callback:(blob:Blob|null)=>void)=>callback(new Blob(['jpeg-bytes'],{type:'image/jpeg'}))};
 Object.defineProperty(globalThis,'createImageBitmap',{configurable:true,value:async()=>({width:20,height:40,close:()=>{}})});
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>canvas}});
 try{return await run()}finally{
  if(originalCreateImageBitmap)Object.defineProperty(globalThis,'createImageBitmap',{configurable:true,value:originalCreateImageBitmap});else Reflect.deleteProperty(globalThis,'createImageBitmap');
  if(originalDocument)Object.defineProperty(globalThis,'document',originalDocument);else Reflect.deleteProperty(globalThis,'document');
 }
}

const baseAnalysis=():Analysis=>({appSummary:'Travel rankings',appCategory:'Travel',designStyle:'Modern maps',layoutMood:'minimal',audience:'Travelers',palette:{accent:'#123456',ink:'#111111',paper:'#EEEEEE',secondary:'#AABBCC'},screens:[{id:'s1',headline:'See your world',subheadline:'Track every country',detectedText:['Countries','Map'],overlapWarning:'',phoneColor:'#112233'}]});

test('analysis asks for per-screen phone color and retains only valid six-digit AI colors',async()=>withImageEnv(async()=>{
 let prompt='';
 const fetcher=(async(_input:RequestInfo|URL,init?:RequestInit)=>{const body=JSON.parse(String(init?.body));prompt=body.input[0].text;return new Response(JSON.stringify({output_text:JSON.stringify({appSummary:'Demo',appCategory:'Tools',designStyle:'Clean',layoutMood:'minimal',audience:'Everyone',palette:{accent:'#123456',ink:'#111111',paper:'#EEEEEE',secondary:'#AABBCC'},screens:[{id:'s1',headline:'Fresh',subheadline:'Useful',detectedText:['Home'],overlapWarning:'',phoneColor:'#a1b2c3'}]})}),{status:200})}) as typeof fetch;
 const result=await analyzeScreenshots('key','Demo',[{id:'s1',name:'one.png',blob:new Blob(['x'],{type:'image/png'})}],fetcher);
 assert.match(prompt,/phoneColor/);assert.match(prompt,/#RRGGBB/);assert.equal(result.screens[0].phoneColor,'#A1B2C3');
 const invalidFetcher=(async()=>new Response(JSON.stringify({output_text:JSON.stringify({appSummary:'Demo',appCategory:'Tools',designStyle:'Clean',layoutMood:'minimal',audience:'Everyone',palette:{accent:'#123456',ink:'#111111',paper:'#EEEEEE',secondary:'#AABBCC'},screens:[{id:'s1',headline:'Fresh',subheadline:'Useful',detectedText:['Home'],overlapWarning:'',phoneColor:'#123'}]})}),{status:200})) as typeof fetch;
 const invalid=await analyzeScreenshots('key','Demo',[{id:'s1',name:'one.png',blob:new Blob(['x'],{type:'image/png'})}],invalidFetcher);
 assert.equal(invalid.screens[0].phoneColor,undefined);
}));

test('creative regeneration sends exact suggestion and returns validated visual direction',async()=>withImageEnv(async()=>{
 const analysis=baseAnalysis();let prompt='';
 const fetcher=(async(_input:RequestInfo|URL,init?:RequestInit)=>{const body=JSON.parse(String(init?.body));prompt=body.input[0].text;return new Response(JSON.stringify({output_text:JSON.stringify({id:'s1',headline:'Make trips count',subheadline:'See your journey grow',detectedText:['Countries','Map'],overlapWarning:'',phoneColor:'#aabbcc',layoutMood:'playful',palette:{accent:'#ABCDEF',ink:'#101010',paper:'#F0F0F0',secondary:'#CCCCCC'}})}),{status:200})}) as typeof fetch;
 const creative=await regenerateScreenCreative('key','NomadRank',analysis,{id:'s1',name:'map.png',blob:new Blob(['x'],{type:'image/png'})},'Use shorter copy and a lighter phone frame.',fetcher);
 assert.match(prompt,/Use shorter copy and a lighter phone frame\./);assert.match(prompt,/See your world/);assert.match(prompt,/Countries/);assert.match(prompt,/phoneColor/);assert.match(prompt,/layoutMood/);assert.match(prompt,/palette/);
 assert.equal(creative.phoneColor,'#AABBCC');assert.equal(creative.layoutMood,'playful');assert.deepEqual(creative.palette,{accent:'#ABCDEF',ink:'#101010',paper:'#F0F0F0',secondary:'#CCCCCC'});
}));

test('regeneration accepts a visual-only change but rejects an unchanged result',async()=>withImageEnv(async()=>{
 const analysis=baseAnalysis();let emptyPrompt='';
 const visualOnly=(async(_input:RequestInfo|URL,init?:RequestInit)=>{const body=JSON.parse(String(init?.body));emptyPrompt=body.input[0].text;return new Response(JSON.stringify({output_text:JSON.stringify({id:'s1',headline:'See your world',subheadline:'Track every country',detectedText:['Countries','Map'],overlapWarning:'',phoneColor:'#445566',layoutMood:'minimal',palette:analysis.palette})}),{status:200})}) as typeof fetch;
 const changed=await regenerateScreenCreative('key','NomadRank',analysis,{id:'s1',name:'map.png',blob:new Blob(['x'],{type:'image/png'})},'',visualOnly);
 assert.equal(changed.phoneColor,'#445566');assert.match(emptyPrompt,/clearly different alternative/i);
 const unchanged=(async()=>new Response(JSON.stringify({output_text:JSON.stringify({id:'s1',headline:'See your world',subheadline:'Track every country',detectedText:['Countries','Map'],overlapWarning:'',phoneColor:'#112233',layoutMood:'minimal',palette:analysis.palette})}),{status:200})) as typeof fetch;
 await assert.rejects(regenerateScreenCreative('key','NomadRank',analysis,{id:'s1',name:'map.png',blob:new Blob(['x'],{type:'image/png'})},'',unchanged),/same creative|different/i);
}));

test('regeneration does not count explicit project defaults as a visual change',async()=>withImageEnv(async()=>{
 const analysis=baseAnalysis();analysis.screens[0].phoneColor=undefined;analysis.screens[0].layoutMood=undefined;analysis.screens[0].palette=undefined;
 const sameEffective=(async()=>new Response(JSON.stringify({output_text:JSON.stringify({id:'s1',headline:'See your world',subheadline:'Track every country',detectedText:['Countries','Map'],overlapWarning:'',phoneColor:'#111521',layoutMood:analysis.layoutMood,palette:analysis.palette})}),{status:200})) as typeof fetch;
 await assert.rejects(regenerateScreenCreative('key','NomadRank',analysis,{id:'s1',name:'map.png',blob:new Blob(['x'],{type:'image/png'})},'',sameEffective),/same creative|different/i);
}));
