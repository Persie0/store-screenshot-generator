import './style.css';
import './app-features.css';
import './localization.css';
import { analyzeScreenshots,scanCopy,validateUploads,type GeminiProgress,type Palette } from './studio.ts';
import { deleteProject,getProject,listProjects,projectManifest,saveProject,type Project,type ProjectShot } from './storage.ts';
import { createZip,type ZipFile } from './archive.ts';
import { STORE_SIZES } from './platform.ts';
import { renderStoreAsset } from './render.ts';
import { dashboardMarkup } from './dashboard.ts';
import { onboardingMarkup,studioMarkup } from './app-view.ts';
import { copyFor,initialRoute,setTranslationLocaleSelected,updateScreenCopy } from './app-state.ts';
import { applyTransformToMatchingShots,duplicateProject,renameProject as renameProjectState,setShotTransform } from './project-state.ts';
import { identityTransform } from './crop.ts';
import { mountCropEditor } from './crop-editor.ts';
import { exportLocales,makeTextCheckEntry,safeStem,storeAssetJobs } from './export-plan.ts';
import { applyImportedLocales,extractFlutterLocales,localeLabel,selectedTranslationLocales } from './localization.ts';
import { translateApprovedScreensForLocales } from './translation.ts';
import { loadApiKey,saveApiKey } from './api-key.ts';

const root=document.querySelector<HTMLDivElement>('#root')!;
const $=<T extends HTMLElement>(selector:string)=>document.querySelector<T>(selector);
const $$=<T extends HTMLElement>(selector:string)=>Array.from(document.querySelectorAll<T>(selector));

let apiKey=loadApiKey(localStorage),projects:Project[]=[],project:Project|undefined,activeScreen=0,locale='en',previewSizeKey:string=STORE_SIZES[0].key;
let projectUrls:string[]=[],dashboardUrls:string[]=[],previewUrl='',previewVersion=0,saveTimer=0,editorNotice='';
const defaultPalette:Palette={accent:'#4857d9',ink:'#20243a',paper:'#f3f2ec',secondary:'#a8d6c4'};

function errorText(error:unknown){return error instanceof Error?error.message:'An unexpected error occurred.'}
function palette(){return project?.analysis?.palette||defaultPalette}
function releaseProjectUrls(){projectUrls.forEach(URL.revokeObjectURL);projectUrls=[];if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=''}previewVersion++}
function releaseDashboardUrls(){dashboardUrls.forEach(URL.revokeObjectURL);dashboardUrls=[]}
async function reloadProjects(){projects=await listProjects()}
async function persist(){if(!project)return;project.updatedAt=Date.now();await saveProject(project)}

function showWorking(name:string,step:string,percent=15){
 root.innerHTML=`<div class="loading-screen"><div class="loading-brand"><span class="brand-mark">f</span> frame</div><div class="loading-orbit"><span></span><i>✳</i></div><div class="eyebrow">${escapeHtml(name)}</div><h1>${escapeHtml(step)}</h1><p>Working with the original screenshots while keeping crop edits local and non-destructive.</p><div class="loading-progress"><span style="width:${percent}%"></span></div><div id="loading-current" class="loading-current">Starting…</div><small>Your originals remain on this device.</small></div>`;
 return (event:GeminiProgress)=>{const current=$<HTMLDivElement>('#loading-current'),bar=$<HTMLSpanElement>('.loading-progress span');if(!current||!bar)return;let text='Working…',value=percent;if(event.phase==='preparing-images'){text=`Preparing screenshot ${event.completed} of ${event.total}`;value=15+Math.round(event.completed/event.total*20)}else if(event.phase==='trying'){text=`Trying ${event.model} · attempt ${event.attempt}${event.total?`/${event.total}`:''}`;value=45}else if(event.phase==='retrying'){text=`Retrying with ${event.nextModel}`;value=60}else if(event.phase==='succeeded'){text=`${event.model} completed`;value=96}else if(event.phase==='failed'){text=`${event.model} failed · ${event.reason}`;value=100}else if(event.phase==='finding-models'){text='Finding another image-capable model…';value=52}current.textContent=text;bar.style.width=`${value}%`};
}

function escapeHtml(value:string){return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!))}

async function readDimensions(blob:Blob):Promise<{width?:number;height?:number}>{try{const bitmap=await createImageBitmap(blob);const result={width:bitmap.width,height:bitmap.height};bitmap.close();return result}catch{return {}}}
async function makeShot(file:File,_index:number):Promise<ProjectShot>{const size=await readDimensions(file);return {id:`screen-${crypto.randomUUID()}`,name:file.name,blob:file,headline:'',subheadline:'',sourceWidth:size.width,sourceHeight:size.height,transform:identityTransform()}}

function renderDashboard(){
 project=undefined;releaseProjectUrls();releaseDashboardUrls();const thumbnails:Record<string,string>={};
 for(const item of projects){const first=item.screens[0];if(first){const url=URL.createObjectURL(first.blob);dashboardUrls.push(url);thumbnails[item.id]=url}}
 root.innerHTML=dashboardMarkup(projects,thumbnails);document.title='Frame — Projects';
 $$<HTMLElement>('[data-new-project]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();renderOnboarding()}));
 $$<HTMLElement>('[data-open]').forEach(element=>element.addEventListener('click',event=>{if((event.target as HTMLElement).closest('[data-rename],[data-duplicate],[data-delete],[data-export]'))return;event.stopPropagation();void openProject(element.dataset.open!)}));
 $$<HTMLElement>('[data-rename]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();void renameSavedProject(button.dataset.rename!)}));
 $$<HTMLElement>('[data-duplicate]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();void duplicateSavedProject(button.dataset.duplicate!)}));
 $$<HTMLElement>('[data-delete]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();void deleteSavedProject(button.dataset.delete!)}));
 $$<HTMLElement>('[data-export]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();void openProject(button.dataset.export!,true)}));
}

function renderOnboarding(message=''){
 project=undefined;releaseProjectUrls();root.innerHTML=onboardingMarkup(projects.length,message);document.title='Frame — New Project';
 $('[data-back-dashboard]')?.addEventListener('click',()=>renderDashboard());
 const name=$<HTMLInputElement>('#project-name')!,key=$<HTMLInputElement>('#gemini-key')!,files=$<HTMLInputElement>('#screens-input')!,button=$<HTMLButtonElement>('#start-analysis')!,count=$<HTMLElement>('#file-count')!,error=$<HTMLElement>('#form-error')!;
 key.value=apiKey;const update=()=>{apiKey=key.value.trim();const problem=files.files?.length?validateUploads(files.files):'';count.textContent=files.files?.length?`${files.files.length} screenshot${files.files.length===1?'':'s'} selected`:'Choose at least one screenshot';error.textContent=problem||'';button.disabled=apiKey.length<10||!files.files?.length||!!problem};
 key.addEventListener('input',update);files.addEventListener('change',update);$('#toggle-key')?.addEventListener('click',()=>{key.type=key.type==='password'?'text':'password';$('#toggle-key')!.textContent=key.type==='password'?'Show':'Hide'});
 const zone=$<HTMLElement>('#dropzone')!;zone.addEventListener('dragover',event=>{event.preventDefault();zone.classList.add('dragging')});zone.addEventListener('dragleave',()=>zone.classList.remove('dragging'));zone.addEventListener('drop',event=>{event.preventDefault();zone.classList.remove('dragging');const dropped=(event as DragEvent).dataTransfer?.files;if(dropped){files.files=dropped;update()}});
 button.addEventListener('click',()=>{if(files.files)void createProject(name.value.trim(),Array.from(files.files))});update();
}

async function createProject(name:string,files:File[]){
 const problem=validateUploads(files);if(problem||!apiKey){renderOnboarding(problem||'Enter a Gemini API key.');return}
 apiKey=saveApiKey(apiKey,localStorage);
 const progress=showWorking(name||'New project','Preparing your screenshots',10);const shots:ProjectShot[]=[];for(let i=0;i<files.length;i++)shots.push(await makeShot(files[i],i));const now=Date.now();
 project={id:crypto.randomUUID(),name:name||files[0].name.replace(/\.[^.]+$/,'')||'Untitled app',createdAt:now,updatedAt:now,status:'analyzing',screens:shots,englishApproved:false};await saveProject(project);
 try{const analysis=await analyzeScreenshots(apiKey,project.name,shots,fetch,progress);project.analysis=analysis;for(const shot of shots){const result=analysis.screens.find(item=>item.id===shot.id);shot.headline=result?.headline||'';shot.subheadline=result?.subheadline||''}project.status='needs-approval';await persist();await reloadProjects();activeScreen=0;locale='en';openCurrentProject()}catch(error){project.status='error';project.error=errorText(error);await persist();await reloadProjects();renderProjectFailure(errorText(error))}
}

function renderProjectFailure(message:string){root.innerHTML=`<div class="failure-screen"><span class="brand-mark">f</span><div class="eyebrow">ANALYSIS DIDN’T FINISH</div><h1>Project saved locally.</h1><p>${escapeHtml(message)}</p><button id="retry-analysis" class="primary-btn">Retry analysis</button><button id="change-api-key" class="plain-btn">Change API key</button><button id="back-projects" class="plain-btn">Back to projects</button><div id="modal-root"></div></div>`;$('#retry-analysis')?.addEventListener('click',()=>void rerunAnalysis());$('#change-api-key')?.addEventListener('click',()=>openKeyDialog(()=>void rerunAnalysis()));$('#back-projects')?.addEventListener('click',()=>renderDashboard())}

async function openProject(id:string,openExportAfter=false){const loaded=projects.find(item=>item.id===id)||await getProject(id);if(!loaded)return;project=loaded;activeScreen=0;locale='en';openCurrentProject();if(openExportAfter)setTimeout(()=>openExportModal(),0)}
function openCurrentProject(){if(!project)return;releaseDashboardUrls();releaseProjectUrls();projectUrls=project.screens.map(screen=>URL.createObjectURL(screen.blob));renderStudio()}

function renderStudio(){if(!project)return;activeScreen=Math.min(activeScreen,Math.max(0,project.screens.length-1));const notice=editorNotice;editorNotice='';root.innerHTML=studioMarkup(project,activeScreen,locale,previewSizeKey,projectUrls,notice);document.title=`${project.name} — Frame`;wireStudio();schedulePreview()}

function wireStudio(){if(!project)return;
 $('#back-projects')?.addEventListener('click',()=>{void persist().then(reloadProjects).then(renderDashboard)});$('#rename-project')?.addEventListener('click',()=>void renameCurrentProject());$('#rename-inline')?.addEventListener('click',()=>void renameCurrentProject());$('#export-project')?.addEventListener('click',openExportModal);
 $$<HTMLElement>('[data-screen]').forEach(button=>button.addEventListener('click',()=>{activeScreen=Number(button.dataset.screen)||0;renderStudio()}));
 $$<HTMLElement>('[data-crop-screen]').forEach(button=>button.addEventListener('click',()=>void openCropEditor(button.dataset.cropScreen!)));
 $('#preview-size-select')?.addEventListener('change',event=>{previewSizeKey=(event.target as HTMLSelectElement).value;schedulePreview()});
 $('#add-screens')?.addEventListener('change',event=>{const files=Array.from((event.target as HTMLInputElement).files||[]);if(files.length)void addScreens(files)});
 $$<HTMLElement>('[data-locale]').forEach(button=>button.addEventListener('click',()=>{locale=button.dataset.locale||'en';renderStudio()}));
 const localizationFile=$<HTMLInputElement>('#localization-file');localizationFile?.addEventListener('change',()=>{const file=localizationFile.files?.[0];if(file)void importLocalizationFile(file)});
 $$<HTMLInputElement>('[data-translation-locale]').forEach(input=>input.addEventListener('change',()=>void toggleTranslationLocale(input.dataset.translationLocale||'',input.checked)));
 const h=$<HTMLTextAreaElement>('#headline-input'),s=$<HTMLTextAreaElement>('#subheadline-input');h?.addEventListener('input',()=>updateCopy('headline',h.value));s?.addEventListener('input',()=>updateCopy('subheadline',s.value));
 $('#approve-translate')?.addEventListener('click',()=>void approveAndTranslate());
 if(project.error&&!project.analysis)$('#approve-translate')?.addEventListener('dblclick',()=>void rerunAnalysis());
}

async function importLocalizationFile(file:File){
 if(!project)return;const status=$<HTMLElement>('#localization-status');if(status)status.textContent='Reading locales…';
 try{const detected=extractFlutterLocales(await file.text());project=applyImportedLocales(project,detected,Date.now());const allowed=new Set(['en',...selectedTranslationLocales(project)]);if(!allowed.has(locale))locale='en';await saveProject(project);await reloadProjects();editorNotice=`Detected ${detected.length} locale${detected.length===1?'':'s'} · English is the source; ${selectedTranslationLocales(project).length} translation target${selectedTranslationLocales(project).length===1?'':'s'} selected.`;renderStudio()}catch(error){if(status)status.textContent=errorText(error)}
}

async function toggleTranslationLocale(code:string,selected:boolean){if(!project)return;project=setTranslationLocaleSelected(project,code,selected,Date.now());if(locale===code&&!selected)locale='en';await saveProject(project);await reloadProjects();renderStudio()}

function updateCopy(field:'headline'|'subheadline',value:string){if(!project)return;const shot=project.screens[activeScreen],analysis=project.analysis?.screens.find(item=>item.id===shot.id);project=updateScreenCopy(project,shot.id,locale,field,value,Date.now());window.clearTimeout(saveTimer);saveTimer=window.setTimeout(()=>void persist(),350);const copy=copyFor(project,project.screens[activeScreen],locale),scan=scanCopy(`${copy.headline} ${copy.subheadline}`,(analysis?.detectedText||[]).join(' ')),warning=analysis?.overlapWarning||(scan.overlap?`Possible repeated on-screen text: ${scan.matches.join(', ')}`:'');const box=$<HTMLElement>('#overlap-result');if(box){box.className=`overlap-result ${warning?'has-warning':'clean'}`;box.innerHTML=`<span>${warning?'!':'✓'}</span><b>${warning?'Review repeated text':'No repeated screenshot text found'}</b><small>${escapeHtml(warning||'Check is based on the original screenshot.')}</small>`}schedulePreview()}

function schedulePreview(){if(!project)return;const version=++previewVersion,shot=project.screens[activeScreen],copy=copyFor(project,shot,locale),size=STORE_SIZES.find(item=>item.key===previewSizeKey)||STORE_SIZES[0],mood=project.analysis?.layoutMood||'editorial',loading=$<HTMLElement>('#preview-loading');if(loading)loading.textContent='Rendering exact export…';void renderStoreAsset(shot,copy,palette(),size,size.key.startsWith('google')?'android':'iphone',mood).then(blob=>{if(version!==previewVersion)return;const image=$<HTMLImageElement>('#exact-preview');if(!image)return;if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(blob);image.src=previewUrl;image.onload=()=>{if(loading)loading.textContent=''}}).catch(error=>{if(loading)loading.textContent=errorText(error)})}

async function ensureDimensions(shot:ProjectShot){if(shot.sourceWidth&&shot.sourceHeight)return;const size=await readDimensions(shot.blob);shot.sourceWidth=size.width;shot.sourceHeight=size.height}
async function openCropEditor(shotId:string){if(!project)return;const shot=project.screens.find(item=>item.id===shotId);if(!shot)return;await Promise.all(project.screens.map(ensureDimensions));await persist();if(!project)return;const container=$<HTMLElement>('#crop-root');if(!container)return;container.classList.add('crop-overlay');mountCropEditor(container,{shot,shots:project.screens,initial:shot.transform||identityTransform(),onCancel:()=>{container.classList.remove('crop-overlay');container.innerHTML=''},onApply:(transform,bulkMode)=>{if(!project)return;if(bulkMode){const result=applyTransformToMatchingShots(project,shot.id,transform,bulkMode,Date.now());project=result.project;if(bulkMode==='same-pixels')editorNotice=`Updated ${result.appliedIds.length} screenshot${result.appliedIds.length===1?'':'s'}; skipped ${result.skippedIds.length}.`}else project=setShotTransform(project,shot.id,transform,Date.now());void persist().then(()=>renderStudio())}})}

async function renameCurrentProject(){if(!project)return;const value=prompt('Project name',project.name);if(value?.trim()){project=renameProjectState(project,value,Date.now());await saveProject(project);await reloadProjects();renderStudio()}}
async function renameSavedProject(id:string){const item=projects.find(p=>p.id===id);if(!item)return;const value=prompt('Project name',item.name);if(!value?.trim())return;await saveProject(renameProjectState(item,value,Date.now()));await reloadProjects();renderDashboard()}
async function duplicateSavedProject(id:string){const item=projects.find(p=>p.id===id);if(!item)return;const duplicate=duplicateProject(item,crypto.randomUUID(),item.screens.map(()=>`screen-${crypto.randomUUID()}`),Date.now());await saveProject(duplicate);await reloadProjects();renderDashboard()}
async function deleteSavedProject(id:string){if(!confirm('Delete this project and its local screenshots?'))return;await deleteProject(id);await reloadProjects();projects.length?renderDashboard():renderOnboarding()}

async function addScreens(files:File[]){if(!project)return;const combined=[...project.screens.map(screen=>new File([screen.blob],screen.name,{type:screen.blob.type})),...files],problem=validateUploads(combined);if(problem){alert(problem);return}if(!apiKey){openKeyDialog(()=>void addScreens(files));return}for(let i=0;i<files.length;i++)project.screens.push(await makeShot(files[i],project.screens.length+i));project.analysis=undefined;project.translations=undefined;project.englishApproved=false;project.status='analyzing';await persist();releaseProjectUrls();projectUrls=project.screens.map(screen=>URL.createObjectURL(screen.blob));const progress=showWorking(project.name,'Analyzing the expanded screen set',25);try{project.analysis=await analyzeScreenshots(apiKey,project.name,project.screens,fetch,progress);for(const shot of project.screens){const found=project.analysis.screens.find(item=>item.id===shot.id);if(found){shot.headline=found.headline;shot.subheadline=found.subheadline}}project.status='needs-approval';project.error=undefined;await persist();await reloadProjects();openCurrentProject()}catch(error){project.status='error';project.error=errorText(error);await persist();renderProjectFailure(errorText(error))}}

async function rerunAnalysis(){if(!project)return;if(!apiKey){openKeyDialog(()=>void rerunAnalysis());return}const progress=showWorking(project.name,'Reading your original app screens',20);try{const result=await analyzeScreenshots(apiKey,project.name,project.screens,fetch,progress);project.analysis=result;project.screens.forEach(shot=>{const copy=result.screens.find(item=>item.id===shot.id);if(copy){shot.headline=copy.headline;shot.subheadline=copy.subheadline}});project.status='needs-approval';project.error=undefined;await persist();await reloadProjects();openCurrentProject()}catch(error){project.status='error';project.error=errorText(error);await persist();renderProjectFailure(errorText(error))}}

async function approveAndTranslate(){if(!project)return;if(!project.analysis){void rerunAnalysis();return}for(const shot of project.screens){const source=project.analysis.screens.find(item=>item.id===shot.id);if(source){source.headline=shot.headline;source.subheadline=shot.subheadline}}project.englishApproved=true;project.status='translating';await persist();await runTranslation()}
async function runTranslation(){if(!project?.analysis)return;const targets=selectedTranslationLocales(project);if(!targets.length){project.status='ready';project.error=undefined;locale='en';await persist();await reloadProjects();openCurrentProject();return}if(!apiKey){openKeyDialog(()=>void runTranslation());return}const progress=showWorking(project.name,'Translating approved English',60);try{const generated=await translateApprovedScreensForLocales(apiKey,project.analysis,targets,fetch,progress);project.translations={...(project.translations||{}),...generated};project.status='ready';project.error=undefined;locale=targets[0]||'en';await persist();await reloadProjects();openCurrentProject()}catch(error){project.status='error';project.error=errorText(error);await persist();openCurrentProject()}}

function openKeyDialog(after:()=>void){const modal=$<HTMLElement>('#modal-root')||root;modal.innerHTML=`<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><span class="eyebrow">GEMINI API KEY</span><h2>Continue with Gemini.</h2></div><button class="modal-x">×</button></div><p class="modal-copy">Saved in this browser so new projects can reuse it. It is never stored inside a project.</p><input id="modal-api-key" class="text-input" type="password" autocomplete="off" placeholder="Paste API key" value="${escapeHtml(apiKey)}"><button id="save-api-key" class="primary-btn modal-action">Continue</button></div></div>`;modal.querySelector('.modal-x')?.addEventListener('click',()=>modal.innerHTML='');modal.querySelector('#save-api-key')?.addEventListener('click',()=>{apiKey=saveApiKey((modal.querySelector('#modal-api-key') as HTMLInputElement).value,localStorage);if(!apiKey)return;modal.innerHTML='';after()})}

function openExportModal(){if(!project)return;const modal=$<HTMLElement>('#modal-root');if(!modal)return;const available=exportLocales(project);modal.innerHTML=`<div class="modal-backdrop"><div class="modal export-modal"><div class="modal-head"><div><span class="eyebrow">EXPORT</span><h2>Choose languages.</h2></div><button class="modal-x">×</button></div><p class="modal-copy">Preview and export share the exact same crop-aware renderer. Text checks remain based on the original screenshots.</p><div class="export-option-grid">${available.map(code=>`<label class="export-option"><input name="export-locale" value="${escapeHtml(code)}" type="checkbox" ${code==='en'?'checked':''}><b>${escapeHtml(code.toUpperCase())} ${escapeHtml(localeLabel(code))}</b></label>`).join('')}</div><label class="project-zip-option"><input id="include-project" type="checkbox"><span><b>Include editable project backup</b><small>Original screenshots plus crop metadata, analysis and translations.</small></span></label><button id="make-zip" class="primary-btn modal-action">Create ZIP ↓</button><div id="zip-progress" class="zip-progress"></div></div></div>`;modal.querySelector('.modal-x')?.addEventListener('click',()=>modal.innerHTML='');modal.querySelector('#make-zip')?.addEventListener('click',()=>void exportZip())}

async function exportZip(){if(!project)return;const selected=$$<HTMLInputElement>('input[name="export-locale"]:checked').map(input=>input.value);if(!selected.length){const status=$<HTMLElement>('#zip-progress');if(status)status.textContent='Select at least one language.';return}const button=$<HTMLButtonElement>('#make-zip'),status=$<HTMLElement>('#zip-progress');if(button)button.disabled=true;const files:ZipFile[]=[],checks:unknown[]=[];let rendered=0;
 try{for(const loc of selected){for(const job of storeAssetJobs(project,loc)){if(status)status.textContent=`Rendering ${loc.toUpperCase()} · ${job.size.label} · ${job.screenIndex+1}/${project.screens.length}`;files.push({path:job.path,data:await renderStoreAsset(job.shot,job.copy,palette(),job.size,job.size.key.startsWith('google')?'android':'iphone',project.analysis?.layoutMood||'editorial')});checks.push(makeTextCheckEntry(project,job.shot,job.copy,loc));rendered++;if(rendered%3===0)await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()))}}
  files.push({path:'TEXT-CHECK-REPORT.json',data:JSON.stringify({generatedAt:new Date().toISOString(),note:'Text detection and overlap warnings refer to original uploaded screenshots. Cropping does not trigger Gemini reanalysis.',screens:checks},null,2)});files.push({path:'EXPORT-SIZES.txt',data:STORE_SIZES.map(size=>`${size.platform} — ${size.label}: ${size.width} × ${size.height}px`).join('\n')});
  if($<HTMLInputElement>('#include-project')?.checked){files.push({path:'project/project.json',data:JSON.stringify(projectManifest(project),null,2)});for(const shot of project.screens)files.push({path:`project/originals/${shot.id}-${safeStem(shot.name)}`,data:shot.blob})}
  if(status)status.textContent='Packing ZIP…';const zip=await createZip(files),anchor=document.createElement('a');anchor.href=URL.createObjectURL(zip);anchor.download=`${safeStem(project.name)}-store-assets.zip`;anchor.click();setTimeout(()=>URL.revokeObjectURL(anchor.href),15000);if(status)status.textContent=`Done · ${files.length} files · ${(zip.size/1024/1024).toFixed(1)} MB`;if(button){button.disabled=false;button.textContent='Download another ZIP ↓'}
 }catch(error){if(status)status.textContent=errorText(error);if(button)button.disabled=false}
}

async function boot(){try{await reloadProjects();initialRoute(projects)==='dashboard'?renderDashboard():renderOnboarding()}catch(error){renderOnboarding(errorText(error))}}
void boot();