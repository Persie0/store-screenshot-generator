import test from 'node:test';
import assert from 'node:assert/strict';
import { GEMINI_ENDPOINT, GEMINI_MODEL, GEMINI_MODELS_ENDPOINT, LOCALES, regenerateScreenCopy, requestGeminiJson, scanCopy, validateUploads, translateApprovedScreens, type Analysis, type GeminiProgress } from './studio.ts';
import { crc32, createZip } from './archive.ts';
import { projectManifest, type Project } from './storage.ts';
import { STORE_SIZES } from './platform.ts';

test('screenshot text scan flags repeated copy but ignores short common words',()=>{
 assert.equal(scanCopy('Make space for yourself','Make space for yourself today').overlap,true);
 assert.equal(scanCopy('Mindful planning','Your mindful day and planning tools').overlap,true);
 assert.equal(scanCopy('A softer way to stay on track','Good morning Alex').overlap,false);
});
test('uploads are capped by count, MIME type, and storage size',()=>{
 const f=(name:string,type='image/png',size=1)=>new File([new Uint8Array(size)],name,{type});
 assert.equal(validateUploads([f('a.png')]),null);
 assert.match(validateUploads([])||'',/at least one/);
 assert.match(validateUploads([f('a.txt','text/plain')])||'',/image/);
 assert.match(validateUploads(Array.from({length:11},(_,i)=>f(`${i}.png`)))||'',/up to 10/);
 assert.match(validateUploads([f('large.png','image/png',21*1024*1024)])||'',/20 MB/);
});
test('Gemini request sends API key in header, inline image, JSON response mode, and no stored interaction',async()=>{
 let captured:RequestInit|undefined,url='';
 const fetcher=(async(input:RequestInfo|URL,init?:RequestInit)=>{url=String(input);captured=init;return new Response(JSON.stringify({steps:[{type:'model_output',content:[{type:'text',text:'{\"ok\":true}'}]}]}),{status:200,headers:{'Content-Type':'application/json'}})}) as typeof fetch;
 const got=await requestGeminiJson<{ok:boolean}>('secret-key','analyze',[{inlineData:{mimeType:'image/jpeg',data:'abcd'}}],fetcher);
 assert.deepEqual(got,{ok:true});assert.equal(url,GEMINI_ENDPOINT);assert.equal(GEMINI_MODEL,'gemini-3.8-flash');
 assert.equal((captured?.headers as Record<string,string>)['x-goog-api-key'],'secret-key');
 const body=JSON.parse(String(captured?.body));assert.equal(body.store,false);assert.equal(body.response_format.mime_type,'application/json');assert.deepEqual(body.input[1],{type:'image',data:'abcd',mime_type:'image/jpeg'});
});
test('Gemini API errors and malformed JSON are reported clearly',async()=>{
 const failed=(async()=>new Response(JSON.stringify({error:{message:'Bad API key'}}),{status:400})) as typeof fetch;
 await assert.rejects(requestGeminiJson('k','prompt',[],failed),/Bad API key/);
 const malformed=(async()=>new Response(JSON.stringify({output_text:'not json'}),{status:200})) as typeof fetch;
 await assert.rejects(requestGeminiJson('k','prompt',[],malformed),/not valid JSON/);
});
test('overload automatically retries listed Flash, Lite, and image-capable Gemma models',async()=>{
 const attempts:string[]=[];const modelPages:string[]=[];
 const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 const fetcher=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(String(input));
  if(url.origin+url.pathname===GEMINI_MODELS_ENDPOINT){
   assert.equal((init?.headers as Record<string,string>)['x-goog-api-key'],'secret-key');
   const page=url.searchParams.get('pageToken')||'';modelPages.push(page);
   if(!page)return response({models:[
    {name:'models/gemini-3.5-flash',supportedGenerationMethods:['generateContent']},
    {name:'models/gemini-3.7-flash',supportedGenerationMethods:['generateContent']},
    {name:'models/gemini-3.8-flash-tts',supportedGenerationMethods:['generateContent']},
    {name:'models/gemini-3.1-flash-image',supportedGenerationMethods:['generateContent']},
    {name:'models/gemma-3-1b-it',supportedGenerationMethods:['generateContent']},
    {name:'models/gemma-3-12b-it',supportedGenerationMethods:['generateContent']},
    {name:'models/gemini-3.4-flash',supportedGenerationMethods:['countTokens']},
   ],nextPageToken:'page-two'});
   return response({models:[{name:'models/gemma-4-26b-a4b-it',supportedGenerationMethods:['generateContent']}]});
  }
  const body=JSON.parse(String(init?.body));attempts.push(body.model);
  if(body.model==='gemini-3.8-flash')return response({error:{message:'Model is overloaded.'}},503);
  if(body.model==='gemini-3.7-flash')return response({output_text:'{"ok":true}'});
  throw new Error(`Unexpected model attempted: ${body.model}`);
 }) as typeof fetch;
 const got=await requestGeminiJson<{ok:boolean}>('secret-key','inspect',[{inlineData:{mimeType:'image/jpeg',data:'abcd'}}],fetcher);
 assert.deepEqual(got,{ok:true});
 assert.deepEqual(attempts,['gemini-3.8-flash','gemini-3.7-flash']);
 assert.deepEqual(modelPages,['','page-two']);
});
test('model fallback reports concise progress and the model being retried',async()=>{
 const events:GeminiProgress[]=[];
 const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status});
 const fetcher=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(String(input));
  if(url.origin+url.pathname===GEMINI_MODELS_ENDPOINT)return response({models:[{name:'models/gemini-3.7-flash',supportedGenerationMethods:['generateContent']}]});
  const model=JSON.parse(String(init?.body)).model;
  if(model===GEMINI_MODEL)return response({error:{message:'Model is overloaded. Please retry later.'}},503);
  return response({output_text:'{"ok":true}'});
 }) as typeof fetch;
 const got=await requestGeminiJson<{ok:boolean}>('k','prompt',[],fetcher,event=>events.push(event));
 assert.deepEqual(got,{ok:true});
 assert.deepEqual(events.map(event=>event.phase),['trying','finding-models','retrying','trying','succeeded']);
 const retry=events[2];
 assert.equal(retry.phase,'retrying');
 if(retry.phase==='retrying'){
  assert.equal(retry.failedModel,GEMINI_MODEL);
  assert.equal(retry.nextModel,'gemini-3.7-flash');
  assert.equal(retry.reason,'overloaded');
 }
});
test('non-retryable Gemini errors report a concise terminal progress event',async()=>{
 const events:GeminiProgress[]=[];
 const failed=(async()=>new Response(JSON.stringify({error:{message:'API key not valid. Please pass a valid API key.'}}),{status:400})) as typeof fetch;
 await assert.rejects(requestGeminiJson('bad-key','prompt',[],failed,event=>events.push(event)),/API key not valid/);
 assert.deepEqual(events.map(event=>event.phase),['trying','failed']);
 const failure=events[1];
 assert.equal(failure.phase,'failed');
 if(failure.phase==='failed')assert.equal(failure.reason,'invalid API key');
});
test('falls through Flash and Flash-Lite to image-capable Gemma when they are overloaded',async()=>{
 const attempts:string[]=[];
 const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status});
 const fetcher=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  if(String(input).startsWith(GEMINI_MODELS_ENDPOINT))return response({models:[
   {name:'models/gemini-3.7-flash',supportedGenerationMethods:['generateContent']},
   {name:'models/gemini-3.1-flash-lite',supportedGenerationMethods:['generateContent']},
   {name:'models/gemma-4-26b-a4b-it',supportedGenerationMethods:['generateContent']},
  ]});
  const body=JSON.parse(String(init?.body));attempts.push(body.model);
  if(body.model==='gemma-4-26b-a4b-it')return response({output_text:'{"ok":true}'});
  if(body.model==='gemini-3.7-flash')return response({error:{message:'Permission denied for this model.'}},403);
  return response({error:{message:'Model is overloaded.'}},429);
 }) as typeof fetch;
 const got=await requestGeminiJson<{ok:boolean}>('k','prompt',[{inlineData:{mimeType:'image/jpeg',data:'x'}}],fetcher);
 assert.deepEqual(got,{ok:true});
 assert.deepEqual(attempts,['gemini-3.8-flash','gemini-3.7-flash','gemini-3.1-flash-lite','gemma-4-26b-a4b-it']);
});
test('Gemini does not retry another model for an invalid API key',async()=>{
 let calls=0;
 const fetcher=(async()=>{calls++;return new Response(JSON.stringify({error:{message:'API key not valid'}}),{status:400})}) as typeof fetch;
 await assert.rejects(requestGeminiJson('bad-key','prompt',[],fetcher),/API key not valid/);
 assert.equal(calls,1);
});
test('one translation request carries context and fills all six locales from the approved source',async()=>{
 const analysis:Analysis={appSummary:'A focus timer',appCategory:'Productivity',designStyle:'Calm editorial',layoutMood:'editorial',audience:'Students',palette:{accent:'#123456',ink:'#111111',paper:'#eeeeee',secondary:'#aabbcc'},screens:[{id:'screen-1',headline:'Focus gently',subheadline:'Make time for deep work',detectedText:['25:00','Start timer'],overlapWarning:''}]};
 const data={translations:Object.fromEntries(LOCALES.map(l=>[l.code,{'screen-1':{headline:`${l.code} headline`,subheadline:`${l.code} line`}}]))};let body='';let calls=0;
 const fetcher=(async(_input:RequestInfo|URL,init?:RequestInit)=>{calls++;body=String(init?.body);return new Response(JSON.stringify({output_text:JSON.stringify(data)}),{status:200})}) as typeof fetch;
 const result=await translateApprovedScreens('k',analysis,fetcher);assert.equal(calls,1);assert.equal(Object.keys(result).length,6);assert.equal(result.de['screen-1'].headline,'de headline');assert.match(body,/Focus gently/);assert.match(body,/Start timer/);assert.match(body,/Students/);
});
test('regenerating one screen uses its app context and returns a fresh checked copy',async()=>{
 const analysis:Analysis={appSummary:'Travel journaling and country rankings',appCategory:'Travel',designStyle:'Modern dark map interface',layoutMood:'minimal',audience:'Digital nomads',palette:{accent:'#123456',ink:'#111111',paper:'#eeeeee',secondary:'#aabbcc'},screens:[{id:'screen-1',headline:'Visualize Your Path',subheadline:'Track every country you have visited',detectedText:['Countries visited','Map'],overlapWarning:''}]};
 const originalCreateImageBitmap=globalThis.createImageBitmap,originalDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
 const canvas={width:0,height:0,getContext:()=>({drawImage:()=>{}}),toBlob:(callback:(blob:Blob|null)=>void)=>callback(new Blob(['jpeg-bytes'],{type:'image/jpeg'}))};
 Object.defineProperty(globalThis,'createImageBitmap',{configurable:true,value:async()=>({width:20,height:40,close:()=>{}})});
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>canvas}});
 try{
  let requestBody='';const events:GeminiProgress[]=[];
  const fetcher=(async(_input:RequestInfo|URL,init?:RequestInit)=>{requestBody=String(init?.body);return new Response(JSON.stringify({output_text:JSON.stringify({id:'screen-1',headline:'Make every trip count',subheadline:'See your journey take shape',detectedText:['Countries visited','Map'],overlapWarning:''})}),{status:200})}) as typeof fetch;
  const copy=await regenerateScreenCopy('k','NomadRank',analysis,{id:'screen-1',name:'map.png',blob:new Blob(['screen'],{type:'image/png'})},fetcher,event=>events.push(event));
  assert.equal(copy.headline,'Make every trip count');assert.equal(copy.subheadline,'See your journey take shape');assert.equal(copy.overlapWarning,'');
  assert.match(requestBody,/Digital nomads/);assert.match(requestBody,/Modern dark map interface/);assert.match(requestBody,/Visualize Your Path/);assert.match(requestBody,/Countries visited/);
  assert.deepEqual(events.map(event=>event.phase),['preparing-images','trying','succeeded']);
 }finally{
  if(originalCreateImageBitmap)Object.defineProperty(globalThis,'createImageBitmap',{configurable:true,value:originalCreateImageBitmap});else Reflect.deleteProperty(globalThis,'createImageBitmap');
  if(originalDocument)Object.defineProperty(globalThis,'document',originalDocument);else Reflect.deleteProperty(globalThis,'document');
 }
});
test('platform export presets use current store dimensions',()=>{
 assert.deepEqual(STORE_SIZES.map(s=>[s.width,s.height]),[[1320,2868],[1290,2796],[1242,2688],[2064,2752],[1080,1920],[1024,500]]);
});
test('ZIP builder writes a valid local archive with CRC32',async()=>{
 assert.equal(crc32(new TextEncoder().encode('123456789')),0xcbf43926);
 const zip=await createZip([{path:'hello.txt',data:'hello'}]);const bytes=new Uint8Array(await zip.arrayBuffer());assert.deepEqual(Array.from(bytes.slice(0,4)),[0x50,0x4b,0x03,0x04]);assert.ok(Array.from(bytes).some((_,i)=>bytes[i]===0x50&&bytes[i+1]===0x4b&&bytes[i+2]===0x01&&bytes[i+3]===0x02));assert.equal(zip.type,'application/zip');
});
test('editable project manifest points to local originals without including an API key',()=>{
 const p:Project={id:'p1',name:'Demo',createdAt:1,updatedAt:2,status:'ready',englishApproved:true,screens:[{id:'screen-1',name:'home.png',blob:new Blob(['img']),headline:'Hello',subheadline:'There',edited:true}],translations:{de:{'screen-1':{headline:'Hallo',subheadline:'Dort'}}}};
 const m=projectManifest(p) as any;assert.equal(m.format,'frame-project');assert.equal(m.screens[0].originalPath,'originals/screen-1-home.png');assert.equal('apiKey' in m,false);assert.equal(m.translations.de['screen-1'].headline,'Hallo');
});
