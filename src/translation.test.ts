import test from 'node:test';
import assert from 'node:assert/strict';
import { LOCALES,translateApprovedScreens,type Analysis } from './studio.ts';
import { translateApprovedScreensForLocales } from './translation.ts';

const analysis:Analysis={appSummary:'A focus timer',appCategory:'Productivity',designStyle:'Calm editorial',layoutMood:'editorial',audience:'Students',palette:{accent:'#123456',ink:'#111111',paper:'#eeeeee',secondary:'#aabbcc'},screens:[{id:'screen-1',headline:'Focus gently',subheadline:'Make time for deep work',detectedText:['25:00','Start timer'],overlapWarning:''}]};

function responseFor(locales:string[]){return {translations:Object.fromEntries(locales.map(code=>[code,{'screen-1':{headline:`${code} headline`,subheadline:`${code} line`}}]))}}

test('explicit translation targets include only selected non-English locales',async()=>{
 let requestBody='';let calls=0;const fetcher=(async(_input:RequestInfo|URL,init?:RequestInit)=>{calls++;requestBody=String(init?.body);return new Response(JSON.stringify({output_text:JSON.stringify(responseFor(['nb','nn']))}),{status:200})}) as typeof fetch;
 const result=await translateApprovedScreensForLocales('k',analysis,['en','nb','nn','nb'],fetcher);
 const decoded=JSON.parse(requestBody) as {input:Array<{type:string;text?:string}>};const prompt=decoded.input[0]?.text||'';
 assert.equal(calls,1);assert.deepEqual(Object.keys(result),['nb','nn']);assert.match(prompt,/"nb"/);assert.match(prompt,/"nn"/);assert.ok(!prompt.includes('"de"'));
});

test('empty translation target set skips Gemini entirely',async()=>{
 let calls=0;const fetcher=(async()=>{calls++;throw new Error('should not run')}) as typeof fetch;
 assert.deepEqual(await translateApprovedScreensForLocales('k',analysis,['en'],fetcher),{});assert.equal(calls,0);
});

test('legacy translation wrapper keeps the existing default target set',async()=>{
 let calls=0;const data=responseFor(LOCALES.map(locale=>locale.code));const fetcher=(async()=>{calls++;return new Response(JSON.stringify({output_text:JSON.stringify(data)}),{status:200})}) as typeof fetch;
 const result=await translateApprovedScreens('k',analysis,fetcher);assert.equal(calls,1);assert.deepEqual(Object.keys(result),LOCALES.map(locale=>locale.code));
});
