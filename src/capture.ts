import './style.css';
import './capture.css';
import {createZip,type ZipFile} from './archive.ts';
import {extractFlutterLocales,localeLabel} from './localization.ts';
import {captureManifest,filenameSegment,localeList,navigationNodes,stepFor,uiFingerprint,validPackageName,type CapturedPage,type TapStep,type UiNode} from './capture-core.ts';
import {connectWebAdb,isWebUsbBusyError,type WebAdbConnection} from './capture-adb.ts';
import {captureRoutesInPlace} from './capture-locales.ts';
import {discoverInPlace} from './capture-discovery.ts';

const root=document.querySelector<HTMLDivElement>('#capture-root')!;
const $=<T extends HTMLElement>(selector:string)=>document.querySelector<T>(selector);
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
const sleep=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
let adb:WebAdbConnection|undefined,pages:CapturedPage[]=[],localized:{locale:string;id:string;png:Blob}[]=[],errors:string[]=[],busy=false,stop=false,packageAtDiscovery='',manualRoute:TapStep[]=[],live:Blob|undefined,liveUrl='',thumbUrls:string[]=[];
root.innerHTML=`<div class="capture-shell"><header class="capture-nav"><a href="/" class="capture-brand">↖ <span class="brand-mark">f</span> Frame</a><b>ANDROID SCREENSHOT CAPTURE</b><a href="/" class="capture-back">Projects →</a></header><main class="capture-main"><section class="capture-intro"><div class="eyebrow">WEBUSB ADB / LOCALIZATION</div><h1>Capture every <em>reachable screen.</em></h1><p>Connect a device, discover app screens, select which ones you want localized, then replay their navigation paths in all selected languages. Works for Flutter and native Android when navigation is accessible.</p></section>
<section class="capture-panel"><h2>1. Connect device</h2><div class="capture-fields"><label>Android app ID<input id="capture-pkg" class="capture-input" placeholder="at.persie0.example" spellcheck="false"></label><label>Source locale<input id="capture-source" class="capture-input" value="en-US" spellcheck="false"></label><label>Max screens<select id="capture-limit" class="capture-input"><option>10</option><option selected>20</option><option>30</option><option>50</option></select></label></div><div class="capture-actions"><button id="capture-connect" class="capture-primary">Connect Android USB</button><button id="capture-disconnect" class="capture-action" disabled>Disconnect USB</button><button id="capture-discover" disabled class="capture-action">Discover app pages</button><button id="capture-manual-home" disabled class="capture-action">Manual navigation</button></div><p class="capture-hint">Requires USB debugging, HTTPS, and desktop Chrome/Edge. Authorize the computer on the device. Open your app on the device before discovery. Discovery never changes its language, force-stops it, or relaunches it: it uses taps and normal Android Back navigation. Set the Source locale to match the app's current language. Some apps cannot return from a page using Back, so automatic discovery may stop early; use manual navigation for additional pages. Avoid sensitive accounts. All screenshots stay in this browser unless you export them.</p><p id="capture-device" class="capture-status">Not connected.</p><section id="capture-usb-help" class="capture-usb-help" hidden role="alert"><h3>USB debugging interface is busy</h3><p>Another program has claimed the phone's USB ADB interface. Close Android Studio, scrcpy and other WebADB tabs, then run this command in your computer's terminal:</p><div class="capture-command"><code>adb kill-server</code><button id="capture-copy-adb" class="capture-action" type="button">Copy command</button></div><p>Unplug and reconnect your phone, then select <b>Connect Android USB</b> again and allow USB debugging on your phone. The website cannot run this command on your computer.</p><p>Need to keep ADB running locally? Use the <a href="/capture_locales.py" download>Python ADB fallback</a> instead.</p></section></section>
<section class="capture-panel"><div class="capture-title"><h2>2. Choose screens</h2><span id="capture-count" class="capture-chip">0 screens</span></div><p class="capture-hint">Select individual pages to localize. If automatic discovery misses a page, use manual navigation to tap through your app and record the same path for each language.</p><div class="capture-actions"><button id="capture-select-all" class="capture-action">Select all</button><button id="capture-select-none" class="capture-action">Select none</button><button id="capture-save-originals" class="capture-action" disabled>Download selected originals</button></div><div id="capture-pages" class="capture-pages"><p class="capture-empty">Discovered screenshots will appear here.</p></div>
<div id="capture-manual" class="capture-manual" hidden><div><h3>Manual navigation</h3><p class="capture-hint">Open the app and place it at the intended starting screen first. Tap the preview to navigate. Each tap is recorded; Save this page when you reach the desired screen. No app relaunch is performed.</p><div class="capture-actions"><button id="capture-manual-save" class="capture-primary">Save this page</button><button id="capture-manual-reset" class="capture-action">Start new route</button><button id="capture-manual-back" class="capture-action">Back one step</button><button id="capture-manual-exit" class="capture-action">Finish & restore locale</button></div></div><div class="capture-live-wrap"><img id="capture-live" alt="Live device screenshot; tap to navigate"><small>Tap the preview to navigate</small></div></div></section>
<section class="capture-panel"><h2>3. Capture target languages</h2><div class="capture-fields"><label>Target locale codes<textarea id="capture-locales" class="capture-input" rows="2" spellcheck="false">de-DE, fr-FR, es-ES</textarea><small>BCP-47 locales separated by commas, e.g. nb-NO, pt-BR.</small></label><label>Or import Flutter supported locales<input id="capture-flutter" class="capture-input" type="file" accept=".dart,text/plain"><small>Import generated app_localizations.dart to populate target locales.</small></label></div><div class="capture-actions"><button id="capture-run" disabled class="capture-primary">Capture selected screens in all locales</button><button id="capture-download" disabled class="capture-action">Download localized ZIP</button><button id="capture-stop" disabled class="capture-action">Stop after current screen</button></div><p class="capture-hint">Requires Android 13+ per-app language support. Switching languages can recreate the activity through Android itself, but this tool never force-stops or launches your app. Keep the app at the original starting screen before capture. Navigation uses taps and Back, without Monkey. Screens are skipped if a route cannot be recovered.</p><div id="capture-results" class="capture-results"></div></section>
<section class="capture-logs"><h3>Log</h3><pre id="capture-log" aria-live="polite">Ready.</pre></section><footer class="capture-footer">Browser WebUSB (no screenshot upload). <a href="https://developer.chrome.com/docs/capabilities/usb" target="_blank" rel="noopener noreferrer">Supported browsers ↗</a> <a href="/capture_locales.py" download>Python ADB fallback ↓</a></footer></main></div>`;

function log(message:string){const e=$<HTMLElement>('#capture-log')!;e.textContent=new Date().toLocaleTimeString()+'  '+message+'\n'+e.textContent!.slice(0,10000)}
function status(message:string){$<HTMLElement>('#capture-device')!.textContent=message;log(message)}
function pkg():string{const v=$<HTMLInputElement>('#capture-pkg')!.value.trim();if(!validPackageName(v))throw new Error('Invalid Android app ID. Example: com.example.myapp');return v}
function source():string{const v=localeList($<HTMLInputElement>('#capture-source')!.value);if(v.length!==1)throw new Error('Enter one source locale such as en-US.');return v[0]}
function connected():WebAdbConnection{if(!adb)throw new Error('Connect a device first.');return adb}
function controls(){const active=!!adb&&!busy,selected=pages.some(p=>p.selected);for(const id of ['capture-discover','capture-manual-home'])$<HTMLButtonElement>('#'+id)!.disabled=!active;$<HTMLButtonElement>('#capture-connect')!.disabled=busy||!!adb;$<HTMLButtonElement>('#capture-disconnect')!.disabled=busy||!adb;$<HTMLButtonElement>('#capture-run')!.disabled=!active||!selected;$<HTMLButtonElement>('#capture-download')!.disabled=busy||!localized.length;$<HTMLButtonElement>('#capture-save-originals')!.disabled=busy||!selected;$<HTMLButtonElement>('#capture-stop')!.disabled=!busy;$<HTMLElement>('#capture-count')!.textContent=pages.length+' screens · '+pages.filter(p=>p.selected).length+' selected'}
async function guard(task:()=>Promise<void>){if(busy)return;busy=true;controls();try{await task()}catch(e){if(isWebUsbBusyError(e))$<HTMLElement>('#capture-usb-help')!.hidden=false;status('Error: '+(e instanceof Error?e.message:String(e)))}finally{busy=false;controls()}}
function releaseThumbnails(){thumbUrls.forEach(URL.revokeObjectURL);thumbUrls=[]}
function renderPages(){releaseThumbnails();const grid=$<HTMLElement>('#capture-pages')!;if(!pages.length){grid.innerHTML='<p class="capture-empty">No app screens found yet.</p>';controls();return}
 grid.innerHTML=pages.map((page,i)=>{const url=URL.createObjectURL(page.png);thumbUrls.push(url);return `<label class="capture-page"><img src="${url}" alt="${esc(page.name)} screenshot"><span class="capture-page-info"><input type="checkbox" data-capture-id="${esc(page.id)}" ${page.selected?'checked':''}><span><b>${i+1}. ${esc(page.name)}</b><small>${page.route.length} navigation step(s)</small></span></span></label>`}).join('');
 grid.querySelectorAll<HTMLInputElement>('[data-capture-id]').forEach(input=>input.addEventListener('change',()=>{const page=pages.find(p=>p.id===input.dataset.captureId);if(page)page.selected=input.checked;controls()}));controls()
}
function appendPage(name:string,route:TapStep[],png:Blob,fingerprint:string,locale:string){pages.push({id:'s'+String(pages.length+1).padStart(3,'0'),name,route:[...route],png,selected:true,sourceLocale:locale,fingerprint});renderPages()}
function clearLocalized(){localized=[];errors=[];$<HTMLElement>('#capture-results')!.textContent='';controls()}
async function nodesSafe():Promise<UiNode[]>{try{return await connected().dump()}catch(e){log('UI hierarchy unavailable: '+String(e));return []}}
async function restore(original:string|undefined,app:string){if(original===undefined)return;try{if(await connected().getLocale(app)===original)return;await connected().setLocale(app,original);log('Restored original locale without launching the app: '+(original||'system default'))}catch(e){log('WARNING: Could not restore locale: '+String(e))}}
async function discovery(){
 const app=pkg(),lang=source(),limit=Number($<HTMLSelectElement>('#capture-limit')!.value)||20;
 pages=[];packageAtDiscovery='';clearLocalized();renderPages();stop=false;
 try{
  const actual=await connected().getLocale(app);
  if(actual&&actual!==lang)log('Source locale mismatch: the app reports '+actual+' but the form says '+lang+'. Discovery will NOT change it. Set the correct source locale to avoid mislabeled screenshots.');
  else if(!actual)log('The app follows the system language. Verify that Source locale matches the currently visible language; discovery will NOT change it.');
 }catch{log('Could not read the per-app locale. Discovery will leave the language unchanged.')}
 const result=await discoverInPlace(connected(),app,limit,{
  onPage:(route,fingerprint,png)=>{
   appendPage(route.length?route[route.length-1].label:'Current screen',route,png,fingerprint,lang);
   log('Discovered '+pages.length+' / '+limit);
  },
  onLog:message=>log(message),
  shouldStop:()=>stop
 });
 packageAtDiscovery=app;
 status(result.reason?'Found '+result.count+' screens. '+result.reason+' Manual navigation can capture more.':'Found '+result.count+' reachable screens without restarting or changing the app language.');
}
async function liveRefresh(){live=await connected().png();if(liveUrl)URL.revokeObjectURL(liveUrl);liveUrl=URL.createObjectURL(live);$<HTMLImageElement>('#capture-live')!.src=liveUrl}
async function manualStart(){const app=pkg();packageAtDiscovery=app;manualRoute=[];$<HTMLElement>('#capture-manual')!.hidden=false;await liveRefresh();status('Manual navigation ready on the current app screen. No language change or app relaunch. Start from the same screen you used for discovery.')}
async function finishManual(){$<HTMLElement>('#capture-manual')!.hidden=true;status('Finished manual navigation. The app remains open without a restart.')}
function targets(){const raw=$<HTMLTextAreaElement>('#capture-locales')!.value.split(/[\s,;]+/).filter(Boolean),clean=localeList(raw.join(','));if(raw.some(code=>localeList(code).length!==1))throw new Error('Invalid target locale code.');return clean.filter(locale=>locale!==source())}
async function captureAll(){
 const app=pkg(),lang=source(),wanted=targets();
 if(app!==packageAtDiscovery||pages.some(p=>p.sourceLocale!==lang))throw new Error('App ID or source language changed. Rediscover screens.');
 if(!wanted.length)throw new Error('Choose one or more target locales different from source.');
 const selected=pages.filter(p=>p.selected);
 if(!selected.length)throw new Error('Select a page first.');
 const original=await connected().getLocale(app);stop=false;localized=[];errors=[];
 log('Before localization, ensure the app is on the same starting screen used for discovery. No Monkey launches or force-stop commands will be executed.');
 try{
  for(const target of wanted){
   if(stop)break;
   status('Changing app language to '+target+' (Android may recreate the activity)');
   try{if(await connected().getLocale(app)!==target)await connected().setLocale(app,target)}
   catch(error){errors.push(target+': locale switch failed: '+String(error));log(errors[errors.length-1]);continue}
   const result=await captureRoutesInPlace(connected(),app,selected,async(id,png)=>{
    localized.push({locale:target,id,png});log('Captured '+target+' / '+(pages.find(p=>p.id===id)?.name||id));
   },{shouldStop:()=>stop,onLog:message=>log(message)});
   for(const issue of result.errors){errors.push(target+': '+issue);log(errors[errors.length-1])}
   if(result.errors.length){log('Stopping automatic localization after navigation failure. No app relaunch will be attempted.');break}
  }
 }finally{
  await restore(original,app);
  $<HTMLElement>('#capture-results')!.innerHTML=`<p><b>${localized.length}</b> localized screenshot(s) captured from ${wanted.length} selected locales. ${errors.length} failed operations.</p>${errors.length?'<details><summary>Show failures</summary><pre>'+esc(errors.join('\\n'))+'</pre></details>':''}`;
  controls();
 }
}
async function exportZip(originalsOnly:boolean){const selected=pages.filter(p=>p.selected),app=pkg(),lang=source();if(!selected.length)throw new Error('Select at least one page.');if(app!==packageAtDiscovery||selected.some(p=>p.sourceLocale!==lang))throw new Error('Rediscover after changing source language / package.');const files:ZipFile[]=[];
 for(const p of selected)files.push({path:filenameSegment(lang)+'/'+filenameSegment(p.id+'-'+p.name)+'.png',data:p.png});
 if(!originalsOnly)for(const c of localized){const p=pages.find(p=>p.id===c.id);if(p?.selected)files.push({path:filenameSegment(c.locale)+'/'+filenameSegment(p.id+'-'+p.name)+'.png',data:c.png})}
 files.push({path:'manifest.json',data:JSON.stringify(captureManifest(app,lang,pages,originalsOnly?[]:[...new Set(localized.map(c=>c.locale))],errors),null,2)});
 const zip=await createZip(files),url=URL.createObjectURL(zip),link=document.createElement('a');link.href=url;link.download=filenameSegment(app)+'-'+(originalsOnly?'screens':'localized')+'.zip';link.click();setTimeout(()=>URL.revokeObjectURL(url),15000);log('Exported '+files.length+' files to ZIP.')
}
$('#capture-connect')!.addEventListener('click',()=>void guard(async()=>{$<HTMLElement>('#capture-usb-help')!.hidden=true;adb=await connectWebAdb();status('Connected to '+adb.serial)}));
$('#capture-disconnect')!.addEventListener('click',()=>void guard(async()=>{const old=adb;adb=undefined;try{await old?.close()}finally{status('USB device disconnected from this tab. You can reconnect.') ;$<HTMLElement>('#capture-usb-help')!.hidden=true}}));
$('#capture-copy-adb')!.addEventListener('click',()=>{void navigator.clipboard.writeText('adb kill-server').then(()=>{const button=$<HTMLButtonElement>('#capture-copy-adb');if(button)button.textContent='Copied'}).catch(()=>status('Clipboard permission denied. Copy this command manually: adb kill-server'))});
$('#capture-discover')!.addEventListener('click',()=>void guard(discovery));
$('#capture-manual-home')!.addEventListener('click',()=>void guard(manualStart));
$('#capture-stop')!.addEventListener('click',()=>{stop=true;log('Stop requested. Discovery leaves the app language unchanged; localization capture restores its previous language.')});
$('#capture-select-all')!.addEventListener('click',()=>{pages.forEach(p=>p.selected=true);renderPages()});
$('#capture-select-none')!.addEventListener('click',()=>{pages.forEach(p=>p.selected=false);renderPages()});
$('#capture-save-originals')!.addEventListener('click',()=>void guard(()=>exportZip(true)));
$('#capture-run')!.addEventListener('click',()=>void guard(captureAll));
$('#capture-download')!.addEventListener('click',()=>void guard(()=>exportZip(false)));
$('#capture-manual-reset')!.addEventListener('click',()=>void guard(async()=>{manualRoute=[];await liveRefresh();status('Started a new route at the current screen. No app restart.') }));
$('#capture-manual-exit')!.addEventListener('click',()=>void guard(finishManual));
$('#capture-manual-back')!.addEventListener('click',()=>void guard(async()=>{if(!manualRoute.length){status('No recorded step to go back.');return}await connected().back();manualRoute.pop();await liveRefresh();status('Navigated Back without restarting the app.')}));
$('#capture-manual-save')!.addEventListener('click',()=>void guard(async()=>{if(!live)throw new Error('No screen preview.');const name=manualRoute.length?manualRoute[manualRoute.length-1].label:'Home';appendPage(name,manualRoute,live,uiFingerprint(await nodesSafe()),source());clearLocalized();log('Saved page '+name)}));
$('#capture-live')!.addEventListener('click',e=>void guard(async()=>{const image=e.currentTarget as HTMLImageElement;if(!image.naturalWidth)return;const b=image.getBoundingClientRect(),x=Math.round((e.clientX-b.left)/b.width*image.naturalWidth),y=Math.round((e.clientY-b.top)/b.height*image.naturalHeight),nodes=await nodesSafe(),hit=nodes.find(n=>n.clickable&&x>=n.bounds.left&&x<=n.bounds.right&&y>=n.bounds.top&&y<=n.bounds.bottom);
 const step:TapStep={x,y,resourceId:hit?.resourceId||'',label:hit?.description||hit?.text||'Tap '+(manualRoute.length+1)};await connected().tap(step);manualRoute.push(step);await sleep(450);await liveRefresh()}));
$('#capture-flutter')!.addEventListener('change',()=>void guard(async()=>{const f=$<HTMLInputElement>('#capture-flutter')!.files?.[0];if(!f)return;const codes=extractFlutterLocales(await f.text()).filter(code=>code!=='en');$<HTMLTextAreaElement>('#capture-locales')!.value=codes.join(', ');status('Imported '+codes.length+' languages: '+codes.map(localeLabel).join(', '))}));
window.addEventListener('beforeunload',()=>{releaseThumbnails();if(liveUrl)URL.revokeObjectURL(liveUrl)});
controls();
