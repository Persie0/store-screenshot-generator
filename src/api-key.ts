export const API_KEY_STORAGE_KEY='frame.gemini-api-key';

type ReadableStorage={getItem(key:string):string|null};
type WritableStorage={setItem(key:string,value:string):void;removeItem(key:string):void};

export function loadApiKey(storage:ReadableStorage):string{
 try{return (storage.getItem(API_KEY_STORAGE_KEY)||'').trim()}catch{return ''}
}

export function saveApiKey(key:string,storage:WritableStorage):string{
 const normalized=key.trim();
 try{if(normalized)storage.setItem(API_KEY_STORAGE_KEY,normalized);else storage.removeItem(API_KEY_STORAGE_KEY)}catch{/* Browser storage can be unavailable or blocked. */}
 return normalized;
}
