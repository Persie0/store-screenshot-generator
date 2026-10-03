import { normalizeHexColor } from './phone-frame.ts';

export const GEMINI_MODEL = 'gemini-3.8-flash';
export const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
export const GEMINI_MODELS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

const KNOWN_IMAGE_FALLBACKS = [
 'gemini-3.7-flash','gemini-3.6-flash','gemini-3.5-flash','gemini-3-flash-preview',
 'gemini-3.5-flash-lite','gemini-3.1-flash-lite',
 'gemma-4-26b-a4b-it','gemma-3-27b-it','gemma-3-12b-it','gemma-3-4b-it',
];

export const LOCALES = [
  { code: 'de', label: 'German' }, { code: 'fr', label: 'French' },
  { code: 'es', label: 'Spanish' }, { code: 'ja', label: 'Japanese' },
  { code: 'pt-BR', label: 'Brazilian Portuguese' }, { code: 'zh-CN', label: 'Simplified Chinese' },
] as const;
export type LocaleCode = typeof LOCALES[number]['code'];
export type Palette = { accent: string; ink: string; paper: string; secondary: string };
export type LayoutMood='editorial'|'minimal'|'bold'|'playful';
export type ScreenCopy = { id:string; headline:string; subheadline:string; detectedText:string[]; overlapWarning:string; phoneColor?:string; layoutMood?:LayoutMood; palette?:Palette };
export type Analysis = { appSummary:string; appCategory:string; designStyle:string; layoutMood:LayoutMood; audience:string; palette:Palette; screens:ScreenCopy[] };
export type Translation = { headline:string; subheadline:string };
export type Translations = Record<string, Record<string, Translation>>;

export function scanCopy(copy:string,screenshotText:string):{overlap:boolean;matches:string[]} {
 const norm=(s:string)=>s.toLocaleLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
 const c=norm(copy), t=norm(screenshotText); if(!c||!t)return {overlap:false,matches:[]};
 const words=c.split(' ').filter(w=>w.length>2);const matches=words.filter(w=>t.includes(w));
 return {overlap:t.includes(c)||matches.length>=Math.min(2,words.length),matches:[...new Set(matches)]};
}
export function extractPalette(imageData:ImageData):string[] {
 const bins=new Map<string,number>(); const {data,width,height}=imageData;
 for(let y=0;y<height;y+=Math.max(1,Math.floor(height/80))) for(let x=0;x<width;x+=Math.max(1,Math.floor(width/80))) {
  const i=(y*width+x)*4; const rgb=[data[i],data[i+1],data[i+2]].map(v=>Math.min(255,Math.round(v/32)*32));
  const key='#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join(''); bins.set(key,(bins.get(key)||0)+1);
 }
 return [...bins].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([c])=>c);
}
export async function imageToJpegPart(blob:Blob,maxSide=1024):Promise<{inlineData:{mimeType:string;data:string}}> {
 const bitmap=await createImageBitmap(blob); const scale=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));
 const canvas=document.createElement('canvas'); canvas.width=Math.max(1,Math.round(bitmap.width*scale)); canvas.height=Math.max(1,Math.round(bitmap.height*scale));
 const ctx=canvas.getContext('2d'); if(!ctx)throw new Error('This browser cannot prepare screenshots for analysis.'); ctx.drawImage(bitmap,0,0,canvas.width,canvas.height); bitmap.close();
 const jpeg:Blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not prepare screenshot.')),'image/jpeg',0.72));
 const bytes=new Uint8Array(await jpeg.arrayBuffer()); let binary=''; for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
 return {inlineData:{mimeType:'image/jpeg',data:btoa(binary)}};
}
type GeminiModelInfo={name?:string;displayName?:string;description?:string;supportedGenerationMethods?:string[]};
export type GeminiProgress=
 |{phase:'preparing-images';completed:number;total:number}
 |{phase:'trying';model:string;attempt:number;total?:number}
 |{phase:'finding-models';failedModel:string;reason:string}
 |{phase:'retrying';failedModel:string;reason:string;nextModel:string;attempt:number;total:number}
 |{phase:'succeeded';model:string;attempt:number;total?:number}
 |{phase:'failed';model:string;reason:string;attempt:number;total?:number};
type GeminiProgressCallback=(progress:GeminiProgress)=>void;
class GeminiApiError extends Error {
 readonly status:number;
 constructor(message:string,status:number){super(message);this.status=status;this.name='GeminiApiError'}
}
export async function requestGeminiJson<T>(apiKey:string,prompt:string,imageParts:Array<{inlineData:{mimeType:string;data:string}}>=[],fetcher:typeof fetch=fetch,onProgress?:GeminiProgressCallback):Promise<T> {
 const report=(event:GeminiProgress)=>{try{onProgress?.(event)}catch{/* UI progress must not interrupt a Gemini request. */}};
 let attempt=1;report({phase:'trying',model:GEMINI_MODEL,attempt});
 try{const result=await requestGeminiWithModel<T>(apiKey,prompt,imageParts,GEMINI_MODEL,fetcher);report({phase:'succeeded',model:GEMINI_MODEL,attempt});return result}catch(firstError){
  if(!shouldTryAnotherModel(firstError)){report({phase:'failed',model:GEMINI_MODEL,reason:shortFailureReason(firstError),attempt});throw firstError}
  report({phase:'finding-models',failedModel:GEMINI_MODEL,reason:shortFailureReason(firstError)});
  let fallbackModels:string[]=[];
  try{fallbackModels=await listImageCapableFallbackModels(apiKey,fetcher)}catch{/* The known current image-capable models still provide a fallback if model discovery is unavailable. */}
  if(!fallbackModels.length)fallbackModels=KNOWN_IMAGE_FALLBACKS;
  const tried=new Set([GEMINI_MODEL]);let lastError:unknown=firstError;const candidates=fallbackModels.filter(model=>{if(tried.has(model))return false;tried.add(model);return true});
  if(candidates.length)report({phase:'retrying',failedModel:GEMINI_MODEL,reason:shortFailureReason(firstError),nextModel:candidates[0],attempt:2,total:candidates.length+1});
  for(let index=0;index<candidates.length;index++){
   const model=candidates[index];attempt++;report({phase:'trying',model,attempt,total:candidates.length+1});
   try{const result=await requestGeminiWithModel<T>(apiKey,prompt,imageParts,model,fetcher);report({phase:'succeeded',model,attempt,total:candidates.length+1});return result}catch(error){lastError=error;const nextModel=candidates[index+1];
    if(!shouldTryAnotherModel(error)){report({phase:'failed',model,reason:shortFailureReason(error),attempt,total:candidates.length+1});throw error}
    if(nextModel)report({phase:'retrying',failedModel:model,reason:shortFailureReason(error),nextModel,attempt:attempt+1,total:candidates.length+1});
    else report({phase:'failed',model,reason:shortFailureReason(error),attempt,total:candidates.length+1});
   }
  }
  const reason=lastError instanceof Error?lastError.message:'Unknown Gemini error.';
  throw new Error(`Gemini could not finish after automatically trying ${attempt} image-capable models. Last error: ${reason}`);
 }
}
function shortFailureReason(error:unknown):string {
 const message=error instanceof Error?error.message:'';
 if(/api key|invalid credential/i.test(message))return 'invalid API key';
 if(/overload|resource exhausted/i.test(message))return 'overloaded';
 if(error instanceof GeminiApiError){if(error.status===429)return 'rate limited';if(error.status===404)return 'model unavailable';if(error.status===403)return 'access denied';if(error.status>=500)return 'temporarily unavailable';if(error.status===400)return 'model request rejected'}
 if(/empty result|not valid JSON/i.test(message))return 'invalid response';
 if(error instanceof TypeError)return 'network error';
 return 'request failed';
}
async function requestGeminiWithModel<T>(apiKey:string,prompt:string,imageParts:Array<{inlineData:{mimeType:string;data:string}}>,model:string,fetcher:typeof fetch):Promise<T> {
 const input=[{type:'text',text:prompt},...imageParts.map(p=>({type:'image',data:p.inlineData.data,mime_type:p.inlineData.mimeType}))];
 const response=await fetcher(GEMINI_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify({model,input,response_format:{type:'text',mime_type:'application/json'},store:false})});
 if(!response.ok){let message=`Gemini API returned ${response.status}.`;try{const body=await response.json();message=body.error?.message||message}catch{}throw new GeminiApiError(message,response.status)}
 const body=await response.json();const steps=body.steps?.filter((step:{type?:string})=>step.type==='model_output').flatMap((step:{content?:Array<{type?:string;text?:string}>})=>step.content||[])||[];const blocks=body.outputs||body.output||steps;const text=(body.output_text||blocks.filter((p:{type?:string})=>p.type==='text').map((p:{text?:string})=>p.text||'').join('')||'').trim();
 if(!text)throw new Error('Gemini returned an empty result. Check that your API key can access the selected model.');
 try{return JSON.parse(text) as T}catch{throw new Error('Gemini returned a response that was not valid JSON. Please retry.')}
}
async function listImageCapableFallbackModels(apiKey:string,fetcher:typeof fetch):Promise<string[]> {
 const models:GeminiModelInfo[]=[];let nextPageToken:string|undefined;
 for(let page=0;page<20;page++){
  const url=new URL(GEMINI_MODELS_ENDPOINT);url.searchParams.set('pageSize','100');if(nextPageToken)url.searchParams.set('pageToken',nextPageToken);
  const response=await fetcher(url,{headers:{'x-goog-api-key':apiKey}});
  if(!response.ok)throw new GeminiApiError(`Could not list Gemini models (${response.status}).`,response.status);
  const body=await response.json();if(Array.isArray(body.models))models.push(...body.models);
  nextPageToken=body.nextPageToken;if(!nextPageToken)break;
 }
 return models.filter(isImageCapableTextModel).map(model=>model.name!.replace(/^models\//,'')).filter(model=>model!==GEMINI_MODEL).sort(compareFallbackModels);
}
function isImageCapableTextModel(model:GeminiModelInfo):boolean {
 if(!model.name||!model.supportedGenerationMethods?.includes('generateContent'))return false;
 const name=model.name.replace(/^models\//,'').toLowerCase();
 const geminiFlash=/^gemini-[a-z0-9.-]*flash(?:-[a-z0-9-]+)?$/.test(name)&&!/(?:^|-)omni(?:-|$)/.test(name)&&!/(?:-image|-tts|-live|-transcribe|-audio|-video)(?:-|$)/.test(name);
 const liteFlash=geminiFlash&&name.includes('flash-lite');
 const ordinaryFlash=geminiFlash&&!liteFlash;
 const gemma4=/^gemma-4-(?:e2b|e4b|\d+b)(?:-[a-z0-9]+)*-it$/.test(name);
 const gemma3=/^gemma-3-(?:4b|12b|27b)(?:-[a-z0-9]+)*-it$/.test(name);
 const gemma3n=/^gemma-3n-e(?:2b|4b)(?:-[a-z0-9]+)*-it$/.test(name);
 const describedAsVisual=/gemma/i.test(name)&&/(?:image|vision|multimodal)/i.test(`${model.displayName||''} ${model.description||''}`);
 return ordinaryFlash||liteFlash||gemma4||gemma3||gemma3n||describedAsVisual;
}
function compareFallbackModels(a:string,b:string):number {
 const category=(name:string)=>name.includes('flash-lite')?1:name.startsWith('gemma-')?2:0;
 const difference=category(a)-category(b);if(difference)return difference;
 const version=(name:string)=>name.match(/^(?:gemini|gemma)-(\d+(?:\.\d+)?)/)?.[1].split('.').map(Number)||[];
 const av=version(a),bv=version(b);for(let i=0;i<Math.max(av.length,bv.length);i++){const d=(bv[i]||0)-(av[i]||0);if(d)return d}
 return a.localeCompare(b);
}
function shouldTryAnotherModel(error:unknown):boolean {
 if(error instanceof GeminiApiError){
  if(error.status===401)return false;
  if(error.status===403)return !/(?:api key|invalid credential|unauthorized|service has not been enabled|api.*not enabled|billing.*disabled)/i.test(error.message);
  if([404,429,500,502,503,504].includes(error.status))return true;
  return error.status===400&&/(?:model|image|vision|modality|interactions|support|supported|not found|not available)/i.test(error.message)&&!/(?:api key|permission|unauthorized)/i.test(error.message);
 }
 return error instanceof TypeError||error instanceof Error&&/(?:empty result|not valid JSON)/i.test(error.message);
}
export type ScreenshotInput={id:string;name:string;blob:Blob};
export async function analyzeScreenshots(apiKey:string,appName:string,screenshots:ScreenshotInput[],fetcher:typeof fetch=fetch,onProgress?:GeminiProgressCallback):Promise<Analysis> {
 const parts=[] as Array<{inlineData:{mimeType:string;data:string}}>; const promptLines=screenshots.map((s,i)=>`Screenshot ${i+1} (id: ${s.id}, file: ${s.name})`);
 for(let i=0;i<screenshots.length;i++){parts.push(await imageToJpegPart(screenshots[i].blob));try{onProgress?.({phase:'preparing-images',completed:i+1,total:screenshots.length})}catch{/* Progress display is optional. */}}
 const prompt=`You are an expert mobile app store creative director and screenshot auditor. Analyze every attached app screenshot. Return only JSON with this exact shape: {"appSummary":"...","appCategory":"...","designStyle":"...","layoutMood":"editorial|minimal|bold|playful","audience":"...","palette":{"accent":"#RRGGBB","ink":"#RRGGBB","paper":"#RRGGBB","secondary":"#RRGGBB"},"screens":[{"id":"...","headline":"...","subheadline":"...","detectedText":["..."],"overlapWarning":"...","phoneColor":"#RRGGBB"}]}.\nProject/app name: ${appName||'Untitled app'}. Screens are attached in this order: ${promptLines.join('; ')}.\nFor each image, read visible UI text carefully and list it in detectedText. Describe the app using visible evidence, infer its category and likely audience, and extract a cohesive palette from the actual screenshots. Propose a concise English store headline (maximum 30 characters when practical) and supporting line (maximum 55 characters) for each screen. The overlay copy must explain a distinct benefit and must not repeat visible UI text. Choose phoneColor as a six-digit hex device-frame color that complements the screenshot and generated palette while remaining visually distinct from both. Put a specific warning in overlapWarning if proposed headline or subheadline repeats a meaningful phrase from detectedText; otherwise use an empty string. Keep screen ids exactly as provided. Use accessible contrast: ink readable on paper, accent may be a highlight. Do not invent app features that the screenshots do not support.`;
 const result=await requestGeminiJson<Analysis>(apiKey,prompt,parts,fetcher,onProgress);
 if(!result.appSummary||!result.designStyle||!result.palette||!Array.isArray(result.screens))throw new Error('Gemini did not return a complete design analysis. Please retry.');
 const byId=new Map(result.screens.map(s=>[s.id,s]));
 const analyzed=screenshots.map((s,i)=>{const found=byId.get(s.id)||result.screens[i];if(!found?.headline||!found?.subheadline||!Array.isArray(found.detectedText))throw new Error(`Gemini did not finish copy and screenshot text detection for screen ${i+1}. Please retry.`);const check=scanCopy(`${found.headline} ${found.subheadline}`,found.detectedText.join(' '));const phoneColor=normalizeHexColor(found.phoneColor);return {id:s.id,headline:found.headline,subheadline:found.subheadline,detectedText:found.detectedText,overlapWarning:found.overlapWarning|| (check.overlap?'Possible overlap with screenshot text.':'' ),...(phoneColor?{phoneColor}:{})}});
 return {...result,layoutMood:validateMood(result.layoutMood),palette:validatePalette(result.palette),screens:analyzed};
}

function validMood(v:unknown):LayoutMood|undefined{return v==='editorial'||v==='minimal'||v==='bold'||v==='playful'?v:undefined}
function optionalPalette(value:unknown):Palette|undefined{
 if(!value||typeof value!=='object')return undefined;const p=value as Partial<Palette>;
 const values=[p.accent,p.ink,p.paper,p.secondary];if(values.some(color=>!normalizeHexColor(color)))return undefined;
 return {accent:normalizeHexColor(p.accent)!,ink:normalizeHexColor(p.ink)!,paper:normalizeHexColor(p.paper)!,secondary:normalizeHexColor(p.secondary)!};
}
function samePalette(a:Palette|undefined,b:Palette|undefined):boolean{return JSON.stringify(a||null)===JSON.stringify(b||null)}
function normalizedCopy(text:string):string{return text.toLocaleLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim()}

export async function regenerateScreenCreative(apiKey:string,appName:string,analysis:Analysis,screenshot:ScreenshotInput,suggestion:string,fetcher:typeof fetch=fetch,onProgress?:GeminiProgressCallback):Promise<ScreenCopy> {
 const previous=analysis.screens.find(screen=>screen.id===screenshot.id);
 if(!previous)throw new Error('This screenshot is not part of the current analysis.');
 const imagePart=await imageToJpegPart(screenshot.blob);
 try{onProgress?.({phase:'preparing-images',completed:1,total:1})}catch{/* Progress display is optional. */}
 const direction=suggestion.trim()||'No additional suggestion; create a clearly different alternative.';
 const prompt=`You are an expert mobile app store creative director and screenshot auditor. Regenerate the creative direction for exactly one app screenshot. Return only JSON with this exact shape: {"id":"${screenshot.id}","headline":"...","subheadline":"...","detectedText":["..."],"overlapWarning":"...","phoneColor":"#RRGGBB","layoutMood":"editorial|minimal|bold|playful","palette":{"accent":"#RRGGBB","ink":"#RRGGBB","paper":"#RRGGBB","secondary":"#RRGGBB"}}.\nProject/app name: ${appName||'Untitled app'}. Context: app summary=${analysis.appSummary}; category=${analysis.appCategory}; visual style=${analysis.designStyle}; audience=${analysis.audience}; project layout mood=${analysis.layoutMood}; project palette=${JSON.stringify(analysis.palette)}.\nPreviously detected screenshot UI text (verify it against the attached image): ${previous.detectedText.join(' | ')}.\nCurrent English copy to replace: headline=${previous.headline}; supporting line=${previous.subheadline}. Current screen presentation: phoneColor=${previous.phoneColor||'none'}; layoutMood=${previous.layoutMood||'project default'}; palette=${JSON.stringify(previous.palette||analysis.palette)}.\nUser suggestion: ${direction}\nCreate a meaningfully different supported creative direction following that suggestion. You may change the English copy, phone frame color, layout mood, and palette only. Do not modify or invent screenshot pixels or app features. Keep the headline concise (30 characters when practical) and supporting line concise (55 characters when practical). Inspect the attached screenshot carefully, list its visible UI text in detectedText, and ensure the new copy does not repeat that text. Put a specific warning in overlapWarning if either line repeats meaningful screenshot text; otherwise use an empty string. Keep the screen id exactly ${screenshot.id}.`;
 const result=await requestGeminiJson<Partial<ScreenCopy>>(apiKey,prompt,[imagePart],fetcher,onProgress);
 if(!result.headline?.trim()||!result.subheadline?.trim()||!Array.isArray(result.detectedText))throw new Error('Gemini did not return complete regenerated copy and screenshot text detection. Please retry.');
 const detectedText=result.detectedText.filter((text):text is string=>typeof text==='string'&&!!text.trim());
 const phoneColor=normalizeHexColor(result.phoneColor)||normalizeHexColor(previous.phoneColor);
 const layoutMood=validMood(result.layoutMood)||validMood(previous.layoutMood);
 const palette=optionalPalette(result.palette)||optionalPalette(previous.palette);
 const headline=result.headline.trim(),subheadline=result.subheadline.trim();
 const copyChanged=normalizedCopy(headline)!==normalizedCopy(previous.headline)||normalizedCopy(subheadline)!==normalizedCopy(previous.subheadline);
 const visualChanged=phoneColor!==normalizeHexColor(previous.phoneColor)||layoutMood!==validMood(previous.layoutMood)||!samePalette(palette,optionalPalette(previous.palette));
 if(!copyChanged&&!visualChanged)throw new Error('Gemini returned the same creative. Please regenerate again for a different alternative.');
 const overlap=scanCopy(`${headline} ${subheadline}`,detectedText.join(' '));
 const modelWarning=typeof result.overlapWarning==='string'?result.overlapWarning.trim():'';
 return {id:screenshot.id,headline,subheadline,detectedText,overlapWarning:modelWarning||(overlap.overlap?'Possible overlap with screenshot text.':''),...(phoneColor?{phoneColor}:{}),...(layoutMood?{layoutMood}:{}),...(palette?{palette}:{})};
}

export async function regenerateScreenCopy(apiKey:string,appName:string,analysis:Analysis,screenshot:ScreenshotInput,fetcher:typeof fetch=fetch,onProgress?:GeminiProgressCallback):Promise<ScreenCopy> {
 return regenerateScreenCreative(apiKey,appName,analysis,screenshot,'',fetcher,onProgress);
}
function validateMood(v:unknown):LayoutMood{return validMood(v)||'editorial'}
function validatePalette(p?:Partial<Palette>):Palette {const valid=(x:unknown,d:string)=>normalizeHexColor(x)||d;return {accent:valid(p?.accent,'#4A57DC'),ink:valid(p?.ink,'#20243A'),paper:valid(p?.paper,'#F3F2EC'),secondary:valid(p?.secondary,'#B4D5C8')}}
export async function translateApprovedScreens(apiKey:string,analysis:Analysis,fetcher:typeof fetch=fetch,onProgress?:GeminiProgressCallback):Promise<Translations> {
 const example=Object.fromEntries(LOCALES.map(l=>[l.code,Object.fromEntries(analysis.screens.map(s=>[s.id,{headline:'localized headline',subheadline:'localized supporting line'}]))]));
 const prompt=`Localize the approved App Store screenshot copy. Write natural, persuasive marketing language for native speakers, preserving meaning and brand voice rather than translating word-for-word. Do not add features or repeat screenshot UI text. Respect target-market conventions and fit similar visual space. Return only JSON with this shape: ${JSON.stringify({translations:example})}. Replace every placeholder with a translation. Include every screen id in every locale.
Context: app=${analysis.appSummary}; category=${analysis.appCategory}; audience=${analysis.audience}; visual style=${analysis.designStyle}.
Screenshot UI text by screen: ${analysis.screens.map(s=>`${s.id}: ${s.detectedText.join(' | ')}`).join(' ; ')}.
Approved English source:
${analysis.screens.map(s=>`${s.id}: headline=${s.headline}; supporting line=${s.subheadline}`).join('\n')}`;
 const result=await requestGeminiJson<{translations:Translations}>(apiKey,prompt,[],fetcher,onProgress);
 for(const locale of LOCALES)for(const screen of analysis.screens){const c=result.translations?.[locale.code]?.[screen.id];if(!c?.headline||!c?.subheadline)throw new Error(`Gemini did not return a complete ${locale.label} translation. Please retry.`)}
 return result.translations;
}
export function validateUploads(files:FileList|File[]):string|null {const list=Array.from(files);if(!list.length)return 'Choose at least one screenshot.';if(list.length>10)return 'Upload up to 10 screenshots per project.';if(list.some(f=>!f.type.startsWith('image/')))return 'Every file must be an image.';if(list.some(f=>f.size>20*1024*1024))return 'Each screenshot must be smaller than 20 MB.';if(list.reduce((n,f)=>n+f.size,0)>80*1024*1024)return 'Keep a project under 80 MB of original screenshots.';return null}
