import { scanCopy,type Translation } from './studio.ts';
import type { StoreSize } from './platform.ts';
import { STORE_SIZES } from './platform.ts';
import type { Project,ProjectShot } from './storage.ts';

export type StoreAssetJob={shot:ProjectShot;screenIndex:number;size:StoreSize;locale:string;copy:Translation;path:string};

export function safeStem(value:string):string{return value.normalize('NFKD').replace(/[^\p{L}\p{N}._-]+/gu,'-').replace(/^-+|-+$/g,'').slice(0,70)||'app'}
export function shouldRenderStoreSize(size:StoreSize,screenIndex:number):boolean{return size.key!=='google/feature-graphic'||screenIndex===0}
export function exportAssetPath(locale:string,size:StoreSize,screenIndex:number,projectName:string):string{return `${locale}/${size.key}/${String(screenIndex+1).padStart(2,'0')}-${safeStem(projectName)}.png`}

export function copyForExport(project:Project,shot:ProjectShot,locale:string):Translation|undefined{
 if(locale==='en')return {headline:shot.headline,subheadline:shot.subheadline};
 return project.translations?.[locale]?.[shot.id];
}

export function storeAssetJobs(project:Project,locale:string):StoreAssetJob[]{
 const jobs:StoreAssetJob[]=[];
 for(let i=0;i<project.screens.length;i++){
  const shot=project.screens[i],copy=copyForExport(project,shot,locale);if(!copy)continue;
  for(const size of STORE_SIZES){if(!shouldRenderStoreSize(size,i))continue;jobs.push({shot,screenIndex:i,size,locale,copy,path:exportAssetPath(locale,size,i,project.name)})}
 }
 return jobs;
}

export function makeTextCheckEntry(project:Project,shot:ProjectShot,copy:Translation,locale:string){
 const analyzed=project.analysis?.screens.find(screen=>screen.id===shot.id),detectedText=analyzed?.detectedText||[];
 const scan=scanCopy(`${copy.headline} ${copy.subheadline}`,detectedText.join(' '));
 return {locale,screen:shot.name,headline:copy.headline,subheadline:copy.subheadline,detectedText,possibleOverlap:scan.overlap,matchingWords:scan.matches,geminiWarning:locale==='en'&&!shot.edited?analyzed?.overlapWarning||'':'',analysisBasis:'original-upload' as const,cropReanalyzed:false as const,transform:shot.transform};
}
