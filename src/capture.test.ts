import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
test('standalone capture has a Vite HTML entrypoint',()=>{const html=readFileSync('capture.html','utf8');assert.match(html,/src\/capture\.ts/);assert.match(html,/capture-root/);});
test('capture controls include discovery, selection, manual routes and localization export',()=>{const code=readFileSync('src/capture.ts','utf8');for(const name of ['capture-connect','capture-discover','capture-select-all','capture-select-none','capture-flutter','capture-manual-save','capture-run','capture-download','capture-stop','connectWebAdb','captureRoutesInPlace','createZip','captureManifest','restore'])assert.ok(code.includes(name),name);});

test('USB connection errors expose non-destructive instructions and a release control',()=>{
 const code=readFileSync('src/capture.ts','utf8');
 assert.match(code,/capture-usb-help/);
 assert.match(code,/capture-disconnect/);
 assert.match(code,/isWebUsbBusyError/);
 assert.match(code,/adb kill-server/);
 assert.match(code,/Python ADB fallback/);
});

test('Discover pages scans in place without any locale change or force-stop',()=>{
 const code=readFileSync('src/capture.ts','utf8');
 const discovery=code.slice(code.indexOf('async function discovery(){'),code.indexOf('async function liveRefresh()'));
 assert.match(discovery,/discoverInPlace\(connected\(\),app,limit/);
 assert.ok(!discovery.includes('replayRoute('));
 assert.ok(!discovery.includes('.restart('));
 assert.ok(!discovery.includes('.setLocale('));
 assert.ok(!discovery.includes('restore('));
 assert.match(discovery,/Source locale mismatch/);
});

test('manual mode, locale capture, and locale restore never launch the app',()=>{
 const source=readFileSync('src/capture.ts','utf8');
 assert.ok(!source.includes('connected().restart('));
 assert.ok(!source.includes('replayRoute('));
 assert.ok(!source.includes('originalManualLocale'));
 assert.match(source,/captureRoutesInPlace/);
 const manual=source.slice(source.indexOf('async function manualStart()'),source.indexOf('function targets()'));
 assert.ok(!manual.includes('.setLocale('));
 const restoration=source.slice(source.indexOf('async function restore('),source.indexOf('async function discovery()'));
 assert.ok(!restoration.includes('.restart('));
});
test('Python fallback cannot call monkey or force-stop',()=>{
 const source=readFileSync('public/capture_locales.py','utf8');
 assert.ok(!source.includes("shell('monkey'"));
 assert.ok(!source.includes("shell('am','force-stop'"));
});
