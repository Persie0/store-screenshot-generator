import test from 'node:test';
import assert from 'node:assert/strict';
import { createZip, crc32 } from './archive.ts';

const bytes=async(blob:Blob)=>new Uint8Array(await blob.arrayBuffer());
const text=(data:Uint8Array)=>new TextDecoder().decode(data);

test('crc32 matches the standard 123456789 vector',()=>{
 assert.equal(crc32(new TextEncoder().encode('123456789')),0xcbf43926);
});

test('createZip writes a valid ZIP local-file signature and multiple entries',async()=>{
 const zip=await createZip([
  {path:'hello.txt',data:'hello'},
  {path:'bin/value.bin',data:new Uint8Array([0,1,2,255])},
 ]);
 const data=await bytes(zip);
 assert.deepEqual(Array.from(data.slice(0,4)),[0x50,0x4b,0x03,0x04]);
 const decoded=text(data);
 assert.match(decoded,/hello\.txt/);
 assert.match(decoded,/bin\/value\.bin/);
 assert.equal(zip.type,'application/zip');
});

test('createZip preserves UTF-8 names and accepts Blob data',async()=>{
 const zip=await createZip([{path:'/de/überblick.txt',data:new Blob(['Grüße'])}]);
 const decoded=text(await bytes(zip));
 assert.match(decoded,/de\/überblick\.txt/);
 assert.ok(!decoded.includes('/de/überblick.txt'));
});

test('createZip accepts empty files',async()=>{
 const zip=await createZip([{path:'empty.txt',data:''}]);
 const data=await bytes(zip);
 assert.ok(data.length>30);
 assert.match(text(data),/empty\.txt/);
});
