import test from 'node:test';
import assert from 'node:assert/strict';
import { type Analysis } from './studio.ts';
import { translateApprovedScreensForLocales } from './translation.ts';
const analysis:Analysis={appSummary:'A focus timer',appCategory:'Productivity',designStyle:'Calm editorial',layoutMood:'editorial',audience:'Students',palette:{accent:'#123456',ink:'#111111',paper:'#eeeeee',secondary:'#aabbcc'},screens:[{id:'screen-1',headline:'Focus gently',subheadline:'Make time for deep work',detectedText:['25:00','Start timer'],overlapWarning:''}]};
function responseFor(locales:string[]){return {translations:Object.fromEntries(locales.map(code=>[code,{'screen-1':{headline:`${code} headline`,subheadline:`${code} line`}}]))}}
test('explicit translation targets include only selected non-English locales',async()=>{let calls=0;const fetcher=(async()=>{calls++;return new Response(JSON.stringify({output_text:JSON.stringify(responseFor(['nb','nn']))}),{status:200})}) as typeof fetch;await translateApprovedScreensForLocales('k',analysis,['en','nb','nn','nb'],fetcher);assert.equal(calls,1)});
