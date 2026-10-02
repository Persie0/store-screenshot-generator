import type { Project } from './storage.ts';

export const DEFAULT_TRANSLATION_LOCALES=['de','fr','es','ja','pt-BR','zh-CN'] as const;

const LABELS:Record<string,string>={
 en:'English',de:'German',fr:'French',es:'Spanish',ja:'Japanese','pt-BR':'Brazilian Portuguese','zh-CN':'Simplified Chinese',nb:'Norwegian Bokmål',nn:'Norwegian Nynorsk',
};

export function normalizeLocaleCode(code:string):string|undefined{
 const raw=code.trim().replace(/_/g,'-');
 if(!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})*$/.test(raw))return undefined;
 const parts=raw.split('-');
 const language=parts.shift()!.toLowerCase();
 const normalized=parts.map(part=>{
  if(/^[A-Za-z]{4}$/.test(part))return part[0].toUpperCase()+part.slice(1).toLowerCase();
  if(/^[A-Za-z]{2}$/.test(part)||/^\d{3}$/.test(part))return part.toUpperCase();
  return part.toLowerCase();
 });
 return [language,...normalized].join('-');
}

function uniqueLocales(values:string[]):string[]{const seen=new Set<string>();const result:string[]=[];for(const value of values){const normalized=normalizeLocaleCode(value);if(normalized&&!seen.has(normalized)){seen.add(normalized);result.push(normalized)}}return result}

export function extractFlutterLocales(source:string):string[]{
 const values:string[]=[];
 const block=source.match(/supportedLocales\s*=\s*(?:<Locale>\s*)?\[([\s\S]*?)\]\s*;/m)?.[1];
 if(block){
  const locale=/\bLocale\s*\(\s*['"]([A-Za-z]{2,8})['"]\s*(?:,\s*['"]([A-Za-z0-9_-]{2,8})['"]\s*)?\)/g;
  for(const match of block.matchAll(locale))values.push(match[2]?`${match[1]}-${match[2]}`:match[1]);
  const supported=uniqueLocales(values);if(supported.length)return supported;
 }
 const imports=[...source.matchAll(/app_localizations_([A-Za-z0-9_-]+)\.dart/g)].map(match=>match[1]);
 const fallback=uniqueLocales(imports);if(fallback.length)return fallback;
 throw new Error('No supported Flutter locales were found in this app_localizations.dart file.');
}

export function localeLabel(code:string):string{const normalized=normalizeLocaleCode(code)||code;return LABELS[normalized]||normalized}

export function normalizeDetectedLocales(values:readonly string[]):string[]{
 const detected=uniqueLocales([...values]);return ['en',...detected.filter(code=>code!=='en')];
}

export function selectedTranslationLocales(project:Project):string[]{
 if(project.translationLocales!==undefined)return uniqueLocales(project.translationLocales).filter(code=>code!=='en');
 return [...DEFAULT_TRANSLATION_LOCALES];
}

export function applyImportedLocales(project:Project,detected:readonly string[],now:number):Project{
 const localizedLocales=normalizeDetectedLocales(detected),previousDetected=project.localizedLocales?new Set(normalizeDetectedLocales(project.localizedLocales)):undefined,previousSelected=new Set(selectedTranslationLocales(project));
 const translationLocales=localizedLocales.filter(code=>code!=='en'&&(!previousDetected||!previousDetected.has(code)||previousSelected.has(code)));
 return {...project,sourceLocale:'en',localizedLocales,translationLocales,updatedAt:now};
}
