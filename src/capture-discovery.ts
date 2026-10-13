import {navigationNodes,resolveTap,stepFor,uiFingerprint,type TapStep,type UiNode} from './capture-core.ts';
import type {WebAdbConnection} from './capture-adb.ts';

type DiscoveryDevice=Pick<WebAdbConnection,'dump'|'png'|'tap'|'back'>;
type DiscoveryCallbacks={
 onPage:(route:TapStep[],fingerprint:string,png:Blob)=>void|Promise<void>;
 onLog?:(message:string)=>void;
 shouldStop?:()=>boolean;
};
export type DiscoveryResult={count:number;reason?:string};

/**
 * Traverse accessible navigation without modifying locales, relaunching, or force-stopping.
 * Uses normal in-app taps and Android Back; stops if the previous page cannot be restored.
 */
export async function discoverInPlace(device:DiscoveryDevice,pkg:string,limit:number,callbacks:DiscoveryCallbacks):Promise<DiscoveryResult>{
 const seen=new Set<string>();const maxAttempts=limit*14;let count=0,attempts=0,reason:string|undefined;
 const log=(message:string)=>callbacks.onLog?.(message);
 const signature=(nodes:UiNode[])=>uiFingerprint(nodes);
 const inTarget=(nodes:UiNode[])=>nodes.some(node=>node.packageName===pkg);
 const visit=async(route:TapStep[],depth:number):Promise<boolean>=>{
  if(callbacks.shouldStop?.()||count>=limit||attempts>=maxAttempts)return true;
  attempts++;
  let nodes:UiNode[];
  try{nodes=await device.dump()}catch(error){
   if(route.length) {reason='Accessibility hierarchy unavailable after navigation. Stopped safely.';log(reason);return false}
   nodes=[];log('Accessibility hierarchy unavailable. Capturing the current screen only.')
  }
  if(nodes.length&&!inTarget(nodes))throw new Error('The target app is not in the foreground. Open it manually before discovery.');
  const fingerprint=nodes.length?signature(nodes):'current-screen-without-accessibility';
  if(seen.has(fingerprint))return true;
  seen.add(fingerprint);
  await callbacks.onPage(route,fingerprint,await device.png());count++;
  if(!nodes.length||count>=limit||depth>=3||callbacks.shouldStop?.())return true;
  for(const option of navigationNodes(nodes,pkg,8)){
   if(callbacks.shouldStop?.()||count>=limit||attempts>=maxAttempts)break;
   let current:UiNode[];
   try{current=await device.dump()}catch{reason='Could not confirm the current screen. Stopped without relaunching.';log(reason);return false}
   if(signature(current)!==fingerprint){reason='The screen changed during discovery. Stopped without restarting the app.';log(reason);return false}
   const step=resolveTap(stepFor(option),current);
   try{await device.tap(step)}catch(error){log('Could not open '+step.label+': '+String(error));continue}
   let next:UiNode[];
   try{next=await device.dump()}catch{next=[]}
   if(next.length&&inTarget(next)&&signature(next)!==fingerprint){
    if(!seen.has(signature(next))){
     try{await visit([...route,step],depth+1)}catch(error){log('Could not inspect '+step.label+': '+String(error))}
    }
   }else if(next.length&&!inTarget(next)){log('Navigation left the target app. Returning with Android Back.')}
   else if(!next.length){log('Unable to inspect the opened screen. Trying Android Back.')}
   else continue; // No navigation occurred; do not press Back.
   try{await device.back()}catch(error){reason='Android Back failed. Stopped without relaunching: '+String(error);log(reason);return false}
   try{
    const restored=await device.dump();
    if(!restored.length||!inTarget(restored)||signature(restored)!==fingerprint){
     reason='Android Back could not return to the previous screen. Stopped without restarting the app.';
     log(reason);return false
    }
   }catch{reason='Could not confirm the previous screen after Android Back. Stopped without relaunching.';log(reason);return false}
   if(reason)return false;
  }
  return true;
 };
 await visit([],0);
 return {count,reason};
}
