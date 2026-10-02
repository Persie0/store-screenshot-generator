type Listener<T>=(this:T,event?:Event)=>unknown;

class FakeRequest<T> {
 result!:T;error:DOMException|null=null;onsuccess:Listener<IDBRequest<T>>|null=null;onerror:Listener<IDBRequest<T>>|null=null;
 succeed(value:T){this.result=value;queueMicrotask(()=>this.onsuccess?.call(this as unknown as IDBRequest<T>));}
}

class FakeIndex {constructor(private records:Map<IDBValidKey,unknown>){} }
class FakeObjectStore {
 indexNames={contains:(_name:string)=>true} as DOMStringList;
 constructor(private records:Map<IDBValidKey,any>){}
 createIndex(){return new FakeIndex(this.records) as unknown as IDBIndex}
 put(value:any){const req=new FakeRequest<IDBValidKey>();this.records.set(value.id,structuredClone(value));req.succeed(value.id);return req as unknown as IDBRequest<IDBValidKey>}
 get(key:IDBValidKey){const req=new FakeRequest<any>();req.succeed(structuredClone(this.records.get(key)));return req as unknown as IDBRequest<any>}
 getAll(){const req=new FakeRequest<any[]>();req.succeed([...this.records.values()].map(v=>structuredClone(v)));return req as unknown as IDBRequest<any[]>}
 delete(key:IDBValidKey){const req=new FakeRequest<undefined>();this.records.delete(key);req.succeed(undefined);return req as unknown as IDBRequest<undefined>}
}

class FakeTransaction {
 onabort:Listener<IDBTransaction>|null=null;error:DOMException|null=null;
 constructor(private store:FakeObjectStore){}
 objectStore(){return this.store as unknown as IDBObjectStore}
}

class FakeDatabase {
 readonly objectStoreNames={contains:(_name:string)=>this.created} as DOMStringList;private created=false;private store:FakeObjectStore;
 constructor(records:Map<IDBValidKey,any>){this.store=new FakeObjectStore(records)}
 createObjectStore(){this.created=true;return this.store as unknown as IDBObjectStore}
 transaction(){return new FakeTransaction(this.store) as unknown as IDBTransaction}
}

export function installFakeIndexedDb(){
 const records=new Map<IDBValidKey,any>();const db=new FakeDatabase(records);
 const factory={open:()=>{const request=new FakeRequest<IDBDatabase>();request.result=db as unknown as IDBDatabase;const req=request as unknown as IDBOpenDBRequest;queueMicrotask(()=>{(req.onupgradeneeded as ((event?:Event)=>unknown)|null)?.call(req);(req.onsuccess as ((event?:Event)=>unknown)|null)?.call(req)});return req}} as unknown as IDBFactory;
 (globalThis as unknown as {window:{indexedDB:IDBFactory}}).window={indexedDB:factory};
 (globalThis as unknown as {indexedDB:IDBFactory}).indexedDB=factory;
 return {records,factory};
}
