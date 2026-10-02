import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardMarkup,shouldShowDashboard } from './dashboard.ts';
import type { Project } from './storage.ts';

const project=(id:string,name:string,updatedAt:number,status:Project['status']='ready'):Project=>({id,name,createdAt:1,updatedAt,status,englishApproved:false,screens:[{id:`s-${id}`,name:'screen.png',blob:new Blob(['x']),headline:'',subheadline:''}]});

test('returning users with projects land on dashboard while first run stays onboarding',()=>{
 assert.equal(shouldShowDashboard([],false),false);
 assert.equal(shouldShowDashboard([project('1','One',1)],false),true);
 assert.equal(shouldShowDashboard([project('1','One',1)],true),false);
});

test('dashboard renders all projects newest-first with project actions and FAB',()=>{
 const html=dashboardMarkup([project('old','Old',10,'needs-approval'),project('new','New',20)]);
 assert.ok(html.indexOf('New')<html.indexOf('Old'));
 for(const id of ['new','old']){
  assert.ok(html.includes(`data-open="${id}"`));
  assert.ok(html.includes(`data-rename="${id}"`));
  assert.ok(html.includes(`data-duplicate="${id}"`));
  assert.ok(html.includes(`data-delete="${id}"`));
 }
 assert.ok(html.includes('data-new-project'));
 assert.ok(html.includes('New project'));
 assert.ok(html.includes('Saved on this device'));
});

test('dashboard escapes project names',()=>{
 const html=dashboardMarkup([project('x','<script>alert(1)</script>',1)]);
 assert.ok(!html.includes('<script>'));
 assert.ok(html.includes('&lt;script&gt;'));
});
