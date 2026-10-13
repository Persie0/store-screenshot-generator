import test from 'node:test';
import assert from 'node:assert/strict';
import {captureRoutesInPlace} from './capture-locales.ts';
import type {WebAdbConnection} from './capture-adb.ts';
import type {TapStep,UiNode} from './capture-core.ts';

function makeFake(){
 const ops:string[]=[];
 let current='home';
 const node=(p:string):UiNode=>({resourceId:'com.demo:id/'+p,packageName:'com.demo',className:'android.widget.Button',text:p,description:'',clickable:true,enabled:true,bounds:{left:10,top:10,right:120,bottom:80}});
 const device:Pick<WebAdbConnection,'dump'|'png'|'tap'|'back'>={
  async dump(){ops.push('dump');return [node(current)]},
  async png(){ops.push('png:'+current);return new Blob([current])},
  async tap(step:TapStep){ops.push('tap:'+step.label);current=step.label},
  async back(){ops.push('back');current='home'}
 };
 return {device,ops,at:()=>current};
}
const one=(id:string,label:string):TapStep=>({resourceId:'com.demo:id/'+id,x:50,y:40,label});

test('localized page capture taps in place without force-stop, Monkey, or relaunch',async()=>{
 const mock=makeFake(),saved:string[]=[];
 const pages=[{id:'home',route:[]},{id:'settings',route:[one('settings','settings')]},{id:'profile',route:[one('profile','profile')]}];
 const result=await captureRoutesInPlace(mock.device,'com.demo',pages,(id)=>{saved.push(id)});
 assert.deepEqual(saved,['home','settings','profile']);
 assert.deepEqual(result.errors,[]);
 assert.equal(mock.at(),'home');
 assert.equal(mock.ops.filter(op=>op==='back').length,2);
 assert.equal(mock.ops.some(op=>op.includes('restart')||op.includes('monkey')),false);
});

test('if Android Back cannot recover, stop instead of capturing mislabeled screens',async()=>{
 const mock=makeFake();let backCalls=0;
 mock.device.back=async()=>{backCalls++};
 const saved:string[]=[];
 const result=await captureRoutesInPlace(mock.device,'com.demo',[{id:'settings',route:[one('settings','settings')]},{id:'profile',route:[one('profile','profile')]}],id=>{saved.push(id)});
 assert.deepEqual(saved,['settings']);
 assert.equal(backCalls,1);
 assert.ok(result.errors.length>0);
 assert.match(result.errors[0],/return|navigation|previous/i);
});
