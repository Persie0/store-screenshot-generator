import test from 'node:test';
import assert from 'node:assert/strict';
import { API_KEY_STORAGE_KEY,loadApiKey,saveApiKey } from './api-key.ts';

class MemoryStorage{
 private data=new Map<string,string>();
 getItem(key:string){return this.data.get(key)??null}
 setItem(key:string,value:string){this.data.set(key,value)}
 removeItem(key:string){this.data.delete(key)}
}

test('loads a previously saved Gemini API key for reuse across projects',()=>{
 const storage=new MemoryStorage();storage.setItem(API_KEY_STORAGE_KEY,'  saved-key-12345  ');
 assert.equal(loadApiKey(storage),'saved-key-12345');
});

test('saves a trimmed Gemini API key in browser storage',()=>{
 const storage=new MemoryStorage();
 assert.equal(saveApiKey('  new-key-67890  ',storage),'new-key-67890');
 assert.equal(storage.getItem(API_KEY_STORAGE_KEY),'new-key-67890');
});

test('clears browser storage when an empty key is saved',()=>{
 const storage=new MemoryStorage();storage.setItem(API_KEY_STORAGE_KEY,'old-key-12345');
 assert.equal(saveApiKey('   ',storage),'');
 assert.equal(storage.getItem(API_KEY_STORAGE_KEY),null);
});

test('storage failures do not break the app',()=>{
 const broken={getItem(){throw new Error('blocked')},setItem(){throw new Error('blocked')},removeItem(){throw new Error('blocked')}};
 assert.equal(loadApiKey(broken),'');
 assert.equal(saveApiKey('key-123456789',broken),'key-123456789');
});
