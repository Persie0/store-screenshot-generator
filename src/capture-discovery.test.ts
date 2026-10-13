import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverInPlace} from './capture-discovery.ts';
import type {UiNode,TapStep} from './capture-core.ts';
import type {WebAdbConnection} from './capture-adb.ts';

function node(pkg:string,id:string,label:string,clickable=true):UiNode{
 return {packageName:pkg,resourceId:id,text:label,description:'',className:'android.widget.Button',clickable,enabled:true,bounds:{left:10,top:10,right:90,bottom:60}};
}

function simulatedDevice(canBack=true){
 const log:string[]=[];let page:'home'|'settings'='home';
 const device:Pick<WebAdbConnection,'dump'|'png'|'tap'|'back'>={
  async dump(){log.push('dump:'+page);return page==='home'?[node('com.demo.app','nav_settings','Settings')]:[node('com.demo.app','header','Settings screen',false)]},
  async png(){log.push('png:'+page);return new Blob([page])},
  async tap(step:TapStep){log.push('tap:'+step.label);page='settings'},
  async back(){log.push('back');if(canBack)page='home'}
 };
 return {device,log,current:()=>page};
}

test('discovery explores app screens in-place and returns using Back, never launching or switching language',async()=>{
 const mock=simulatedDevice();
 const pages:{route:TapStep[];fingerprint:string;png:Blob}[]=[];
 const result=await discoverInPlace(mock.device,'com.demo.app',20,{onPage:async(route,fp,png)=>{pages.push({route,fingerprint:fp,png})}});
 assert.equal(result.count,2);
 assert.equal(result.reason,undefined);
 assert.deepEqual(pages.map(p=>p.route.length),[0,1]);
 assert.equal(mock.current(),'home');
 assert.equal(mock.log.some(l=>l.includes('restart')||l.includes('locale')),false);
 assert.equal(mock.log.filter(l=>l==='back').length,1);
});

test('discovery never touches navigation when max pages is one',async()=>{
 const mock=simulatedDevice();
 const result=await discoverInPlace(mock.device,'com.demo.app',1,{onPage:()=>{}});
 assert.equal(result.count,1);
 assert.equal(mock.log.some(l=>l.startsWith('tap:')||l==='back'),false);
});

test('when Back cannot restore parent, discovery halts safely without relaunch',async()=>{
 const mock=simulatedDevice(false);
 const result=await discoverInPlace(mock.device,'com.demo.app',20,{onPage:()=>{}});
 assert.equal(result.count,2);
 assert.match(result.reason||'',/could not return/i);
 assert.equal(mock.log.filter(l=>l==='back').length,1);
});

test('discovery refuses scanning screens in another package',async()=>{
 const device:Pick<WebAdbConnection,'dump'|'png'|'tap'|'back'>={
  async dump(){return [node('com.other.app','settings','Settings')]},
  async png(){throw new Error('Must not capture another app')},
  async tap(){throw new Error('Must not tap another app')},
  async back(){throw new Error('Must not navigate another app')}
 };
 await assert.rejects(discoverInPlace(device,'com.demo.app',10,{onPage:()=>{}}),/foreground/i);
});
