import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
test('standalone capture has a Vite HTML entrypoint',()=>{const html=readFileSync('capture.html','utf8');assert.match(html,/src\/capture\.ts/);assert.match(html,/capture-root/);});
test('capture controls include discovery, selection, manual routes and localization export',()=>{const code=readFileSync('src/capture.ts','utf8');for(const name of ['capture-connect','capture-discover','capture-select-all','capture-select-none','capture-flutter','capture-manual-save','capture-run','capture-download','capture-stop','connectWebAdb','replayRoute','createZip','captureManifest','restore'])assert.ok(code.includes(name),name);});

test('USB connection errors expose non-destructive instructions and a release control',()=>{
 const code=readFileSync('src/capture.ts','utf8');
 assert.match(code,/capture-usb-help/);
 assert.match(code,/capture-disconnect/);
 assert.match(code,/isWebUsbBusyError/);
 assert.match(code,/adb kill-server/);
 assert.match(code,/Python ADB fallback/);
});
