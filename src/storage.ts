import type { Analysis, Translations } from './studio.ts';
import { identityTransform, sanitizeTransform, type ScreenshotTransform } from './crop.ts';
import { normalizeDetectedLocales,normalizeLocaleCode } from './localization.ts';

export type ProjectShot={id:string;name:string;blob:Blob;headline:string;subheadline:string;edited?:boolean;sourceWidth?:number;sourceHeight?:number;transform?:ScreenshotTransform};
export type Project={id:string;name:string;createdAt:number;updatedAt:number;status:'analyzing'|'needs-approval'|'translating'|'ready'|'error';error?:string;screens:ProjectShot[];analysis?:Analysis;englishApproved:boolean;translations?:Translations;sourceLocale?:string;localizedLocales?:string[];translationLocales?:string[]};
const DB_NAME='frame-app-store-studio';const DB_VERSION=1;const STORE='projects';
let dbPromise:Promise<IDBDatabase>|undefined;

function validDimension(value:unknown):number|undefined{return typeof value==='number'&&Number.isFinite(value)&&value>0?Math.round(value):undefined}
function normalizedLocaleArray(values:unknown):string[]{if(!Array.isArray(values))return [];const seen=new Set<string>();const result:string[]=[];for(const value of values){if(typeof value!=='string')continue;const normalized=normalizeLocaleCode(value);if(normalized&&!seen.has(normalized)){seen.add(normalized);result.push(normalized)}}return result}
export function normalizeProject(project:Project):Project{
 const configured=project.sourceLocale!==undefined||project.localizedLocales!==undefined||project.translationLocales!==undefined;
 let sourceLocale=project.sourceLocale,localizedLocales=project.localizedLocales,translationLocales=project.translationLocales;
 if(configured){
  const translated=normalizedLocaleArray(project.translationLocales).filter(code=>code!=='en');
  localizedLocales=normalizeDetectedLocales([...normalizedLocaleArray(project.localizedLocales),...translated]);
  const allowed=new Set(localizedLocales);translationLocales=translated.filter(code=>allowed.has(code));sourceLocale='en';
 }
 return {...project,sourceLocale,localizedLocales,translationLocales,screens:(project.screens||[]).map(screen=>({...screen,sourceWidth:validDimension(screen.sourceWidth),sourceHeight:validDimension(screen.sourceHeight),transform:screen.transform===undefined?identityTransform():sanitizeTransform(screen.transform)}))};
}
function openDb(){if(dbPromise)return dbPromise;dbPromise=new Promise((resolve,reject)=>{if(typeof indexedDB==='undefined'){reject(new Error('This browser does not support local project storage.'));return}const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE)){const store=db.createObjectStore(STORE,{keyPath:'id'});store.createIndex('updatedAt','updatedAt')}};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('Could not open local project storage.'))});return dbPromise}
async function request<T>(mode:IDBTransactionMode,run:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,mode);const req=run(tx.objectStore(STORE));req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('Project storage failed.'));tx.onabort=()=>reject(tx.error||new Error('Project storage transaction was cancelled.'))})}
export async function saveProject(project:Project):Promise<void>{await request('readwrite',s=>s.put(normalizeProject(project)))}
export async function getProject(id:string):Promise<Project|undefined>{const result=await request<Project|undefined>('readonly',s=>s.get(id));return result?normalizeProject(result):undefined}
export async function listProjects():Promise<Project[]>{const all=await request<Project[]>('readonly',s=>s.getAll());return all.map(normalizeProject).sort((a,b)=>b.updatedAt-a.updatedAt)}
export async function deleteProject(id:string):Promise<void>{await request('readwrite',s=>s.delete(id))}
export function projectManifest(project:Project){const normalized=normalizeProject(project);return {format:'frame-project',version:2,id:normalized.id,name:normalized.name,createdAt:normalized.createdAt,updatedAt:normalized.updatedAt,status:normalized.status,englishApproved:normalized.englishApproved,analysis:normalized.analysis,translations:normalized.translations,sourceLocale:normalized.sourceLocale,localizedLocales:normalized.localizedLocales,translationLocales:normalized.translationLocales,screens:normalized.screens.map(({id,name,headline,subheadline,edited,sourceWidth,sourceHeight,transform})=>({id,name,headline,subheadline,edited,sourceWidth,sourceHeight,transform,originalPath:`originals/${id}-${safeName(name)}`}))}}
export function safeName(n:string){return n.replace(/[^\p{L}\p{N}._-]+/gu,'_').slice(-100)||'screenshot.png'}
