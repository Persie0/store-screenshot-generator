import { requestGeminiJson,type Analysis,type GeminiProgress,type Translations } from './studio.ts';
import { localeLabel,normalizeLocaleCode } from './localization.ts';

export async function translateApprovedScreensForLocales(apiKey:string,analysis:Analysis,targetLocales:readonly string[],fetcher:typeof fetch=fetch,onProgress?:(progress:GeminiProgress)=>void):Promise<Translations>{
 const seen=new Set<string>(),locales:string[]=[];
 for(const value of targetLocales){const code=normalizeLocaleCode(value);if(code&&code!=='en'&&!seen.has(code)){seen.add(code);locales.push(code)}}
 if(!locales.length)return {};
 const example=Object.fromEntries(locales.map(code=>[code,Object.fromEntries(analysis.screens.map(screen=>[screen.id,{headline:'localized headline',subheadline:'localized supporting line'}]))]));
 const prompt=`Localize the approved App Store screenshot copy. Write natural, persuasive marketing language for native speakers, preserving meaning and brand voice rather than translating word-for-word. Do not add features or repeat screenshot UI text. Respect target-market conventions and fit similar visual space. Return only JSON with this shape: ${JSON.stringify({translations:example})}. Replace every placeholder with a translation. Include every screen id in every locale.\nTarget locales: ${locales.join(', ')}.\nContext: app=${analysis.appSummary}; category=${analysis.appCategory}; audience=${analysis.audience}; visual style=${analysis.designStyle}.\nScreenshot UI text by screen: ${analysis.screens.map(screen=>`${screen.id}: ${screen.detectedText.join(' | ')}`).join(' ; ')}.\nApproved English source:\n${analysis.screens.map(screen=>`${screen.id}: headline=${screen.headline}; supporting line=${screen.subheadline}`).join('\n')}`;
 const result=await requestGeminiJson<{translations:Translations}>(apiKey,prompt,[],fetcher,onProgress);
 const translations:Translations={};
 for(const code of locales){
  const entries=result.translations?.[code];
  for(const screen of analysis.screens){const copy=entries?.[screen.id];if(!copy?.headline||!copy?.subheadline)throw new Error(`Gemini did not return a complete ${localeLabel(code)} translation. Please retry.`)}
  translations[code]=entries;
 }
 return translations;
}
