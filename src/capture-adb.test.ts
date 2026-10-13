import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeAdbConnection,parseAppLocale,explainWebUsbError,isWebUsbBusyError} from './capture-adb.ts';
test('parses app locale and empty system default',()=>{assert.equal(parseAppLocale('Locales for app are [fr-FR]'),'fr-FR');assert.equal(parseAppLocale('Locales for app are []'),'');assert.throws(()=>parseAppLocale('Unknown command'));});
test('locale changes are verified and injection rejected',async()=>{const commands:string[]=[];let locale='';const shell={spawnWaitText:async(command:string)=>{commands.push(command);if(command.includes('set-app-locales'))locale='fr-FR';return {exitCode:0,stdout:command.includes('get-app-locales')?'Locales for app are ['+locale+']':'',stderr:''}},spawnWait:async()=>({exitCode:0,stdout:new Uint8Array(25),stderr:new Uint8Array()})};const adb=makeAdbConnection({subprocess:{shellProtocol:shell}});await adb.setLocale('com.demo.app','fr-FR');assert.ok(commands.some(c=>c.includes('--locales')));await assert.rejects(()=>adb.setLocale('com.demo.app; echo unsafe','fr-FR'));});
test('ADB adapter does not provide a force-stop or Monkey-based restart',async()=>{
 const commands:string[]=[];
 const shell={spawnWaitText:async(command:string)=>{commands.push(command);return {exitCode:0,stdout:'',stderr:''}},spawnWait:async()=>({exitCode:0,stdout:new Uint8Array(25),stderr:new Uint8Array()})};
 const adb=makeAdbConnection({subprocess:{shellProtocol:shell}});
 assert.equal('restart' in adb,false);
 await adb.back();
 assert.ok(commands.some(c=>c.includes('input keyevent KEYCODE_BACK')));
 assert.equal(commands.some(c=>/monkey|force-stop/.test(c)),false);
});

test('WebUSB device busy error provides actionable non-destructive recovery',()=>{
 for(const problem of ['The device is already in used by another program','Unable to claim interface','DeviceBusyError','LIBUSB_ERROR_BUSY']){
  assert.equal(isWebUsbBusyError(new Error(problem)),true);
  assert.match(explainWebUsbError(new Error(problem)),/adb kill-server/);
  assert.match(explainWebUsbError(new Error(problem)),/other WebADB tabs/);
 }
 assert.equal(isWebUsbBusyError(new Error('Device selection canceled')),false);
 assert.equal(explainWebUsbError(new Error('Device selection canceled')),'Device selection canceled');
});

test('ADB implementation contains no app relaunch commands',()=>{
 const source=readFileSync('src/capture-adb.ts','utf8');
 assert.ok(!source.includes('monkey -p'));
 assert.ok(!source.includes('am force-stop'));
});
