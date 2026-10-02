import { shouldShowDashboard } from './dashboard.ts';
import type { Project, ProjectShot } from './storage.ts';
import type { Translation } from './studio.ts';

export type AppRoute='dashboard'|'onboarding';
export function initialRoute(projects:Project[],forceNewProject=false):AppRoute{return shouldShowDashboard(projects,forceNewProject)?'dashboard':'onboarding'}
export function copyFor(project:Project,screen:ProjectShot,locale:string):Translation{return locale==='en'?{headline:screen.headline,subheadline:screen.subheadline}:project.translations?.[locale]?.[screen.id]||{headline:screen.headline,subheadline:screen.subheadline}}
export function updateScreenCopy(project:Project,shotId:string,locale:string,field:'headline'|'subheadline',value:string,now:number):Project{
 if(locale==='en'){
  let found=false;const screens=project.screens.map(screen=>{if(screen.id!==shotId)return screen;found=true;return {...screen,[field]:value,edited:true}});if(!found)return project;
  return {...project,screens,updatedAt:now,englishApproved:false,translations:undefined,status:'needs-approval'};
 }
 const current=project.translations?.[locale]?.[shotId];if(!current||!project.translations)return project;
 const translations=structuredClone(project.translations);translations[locale][shotId][field]=value;
 return {...project,translations,updatedAt:now};
}
