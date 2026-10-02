import { canApplyTransform, copyTransform, sanitizeTransform, type ScreenshotTransform } from './crop.ts';
import type { Project } from './storage.ts';

const normalizedName=(name:string,fallback:string)=>name.trim().slice(0,70)||fallback;

export function renameProject(project:Project,name:string,now:number):Project{
 return {...project,name:normalizedName(name,project.name),updatedAt:now};
}

export function duplicateProject(project:Project,projectId:string,screenIds:string[],now:number):Project{
 return {
  ...project,
  id:projectId,
  name:normalizedName(`${project.name} copy`,project.name),
  createdAt:now,
  updatedAt:now,
  analysis:project.analysis?structuredClone(project.analysis):undefined,
  translations:project.translations?structuredClone(project.translations):undefined,
  screens:project.screens.map((screen,index)=>({...screen,id:screenIds[index]||`${screen.id}-copy-${index+1}`,transform:copyTransform(screen.transform)})),
 };
}

export function setShotTransform(project:Project,shotId:string,transform:ScreenshotTransform,now:number):Project{
 const safe=sanitizeTransform(transform);
 let changed=false;
 const screens=project.screens.map(screen=>{if(screen.id!==shotId)return screen;changed=true;return {...screen,transform:copyTransform(safe)}});
 return changed?{...project,screens,updatedAt:now}:project;
}

export function applyTransformToMatchingShots(project:Project,sourceShotId:string,transform:ScreenshotTransform,mode:'same-size'|'same-aspect',now:number):{project:Project;appliedIds:string[];skippedIds:string[]}{
 const source=project.screens.find(screen=>screen.id===sourceShotId);
 if(!source)return {project,appliedIds:[],skippedIds:project.screens.map(screen=>screen.id)};
 const safe=sanitizeTransform(transform),appliedIds:string[]=[],skippedIds:string[]=[];
 const screens=project.screens.map(screen=>{
  if(canApplyTransform(source,screen,mode)){appliedIds.push(screen.id);return {...screen,transform:copyTransform(safe)}}
  skippedIds.push(screen.id);return screen;
 });
 return {project:{...project,screens,updatedAt:appliedIds.length?now:project.updatedAt},appliedIds,skippedIds};
}

export function dashboardProjects(projects:Project[]):Project[]{return [...projects].sort((a,b)=>b.updatedAt-a.updatedAt)}
