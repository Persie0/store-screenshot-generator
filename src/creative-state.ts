import { normalizeHexColor,resolvePhoneColor,type PhoneColorMode } from './phone-frame.ts';
import type { Project } from './storage.ts';
import type { LayoutMood,Palette,ScreenCopy } from './studio.ts';

export type ScreenPresentation={phoneColor:string;palette:Palette;mood:LayoutMood};
type CreativeScreen=ScreenCopy&{phoneColor?:string;layoutMood?:LayoutMood;palette?:Palette};

function validPalette(value:unknown):value is Palette{
 if(!value||typeof value!=='object')return false;
 const p=value as Partial<Palette>;
 return !!normalizeHexColor(p.accent)&&!!normalizeHexColor(p.ink)&&!!normalizeHexColor(p.paper)&&!!normalizeHexColor(p.secondary);
}

export function resolveScreenPresentation(project:Project,shotId:string,fallbackPalette:Palette):ScreenPresentation{
 const screen=project.analysis?.screens.find(item=>item.id===shotId) as CreativeScreen|undefined;
 const screenPalette=screen?.palette,projectPalette=project.analysis?.palette;
 const palette=validPalette(screenPalette)?screenPalette:validPalette(projectPalette)?projectPalette:fallbackPalette;
 const mood:LayoutMood=screen?.layoutMood==='minimal'||screen?.layoutMood==='bold'||screen?.layoutMood==='playful'||screen?.layoutMood==='editorial'?screen.layoutMood:project.analysis?.layoutMood||'editorial';
 return {phoneColor:resolvePhoneColor(project.phoneColorMode,project.phoneColor,screen?.phoneColor),palette,mood};
}

export function setPhoneColorMode(project:Project,mode:PhoneColorMode,now:number):Project{
 if(project.phoneColorMode===mode)return project;
 return {...project,phoneColorMode:mode,updatedAt:now};
}

export function setManualPhoneColor(project:Project,color:string,now:number):Project{
 const normalized=normalizeHexColor(color);if(!normalized||project.phoneColor===normalized)return project;
 return {...project,phoneColor:normalized,updatedAt:now};
}

export function applyRegeneratedCreative(project:Project,shotId:string,creative:ScreenCopy,now:number):Project{
 if(!project.analysis||!project.screens.some(screen=>screen.id===shotId)||!project.analysis.screens.some(screen=>screen.id===shotId))return project;
 const normalizedCreative={...creative,id:shotId};
 const screens=project.screens.map(screen=>screen.id===shotId?{...screen,headline:normalizedCreative.headline,subheadline:normalizedCreative.subheadline,edited:false}:screen);
 const analysis={...project.analysis,screens:project.analysis.screens.map(screen=>screen.id===shotId?normalizedCreative:screen)};
 let translations=project.translations;
 if(translations){
  translations=Object.fromEntries(Object.entries(translations).map(([locale,byScreen])=>{
   const next={...byScreen};delete next[shotId];return [locale,next];
  }));
 }
 return {...project,screens,analysis,translations,englishApproved:false,status:'needs-approval',error:undefined,updatedAt:now};
}
