import {resolveTap,type TapStep,type UiNode} from './capture-core.ts';
import type {WebAdbConnection} from './capture-adb.ts';

type Device=Pick<WebAdbConnection,'dump'|'png'|'tap'|'back'>;
type Route={id:string;route:TapStep[]};
export type RouteCaptureResult={completed:number;errors:string[]};
function identical(a:TapStep,b:TapStep):boolean{return !!a.resourceId&&!!b.resourceId?a.resourceId===b.resourceId:a.x===b.x&&a.y===b.y}
function signature(nodes:UiNode[],pkg:string):string{return nodes.filter(n=>n.packageName===pkg).map(n=>n.resourceId+'|'+n.className+'|'+n.bounds.left+','+n.bounds.top+','+n.bounds.right+','+n.bounds.bottom).join(';')}
function inTarget(nodes:UiNode[],pkg:string){return !nodes.length||nodes.some(n=>n.packageName===pkg)}
async function readNodes(device:Device):Promise<UiNode[]>{try{return await device.dump()}catch{return []}}

/**
 * Capture a set of routes from the app's current starting screen.
 * Navigates with taps and ordinary Android Back only. Never launches or kills the app.
 * On a failed return, stop instead of exporting screenshots with misleading screen IDs.
 */
export async function captureRoutesInPlace(
 device:Device,pkg:string,pages:Route[],onCapture:(id:string,png:Blob)=>void|Promise<void>,
 options:{shouldStop?:()=>boolean;onLog?:(message:string)=>void}={}
):Promise<RouteCaptureResult>{
 const errors:string[]=[];let completed=0,position:TapStep[]=[],ancestry: string[]=[];
 const rootNodes=await readNodes(device);
 if(!inTarget(rootNodes,pkg))return {completed,errors:['Target app is not in foreground. Open the app and navigate to the starting screen.']};
 const rootSignature=signature(rootNodes,pkg);
 ancestry=[rootSignature];
 for(const page of pages){
  if(options.shouldStop?.())break;
  const route=page.route;
  const common=position.findIndex((step,index)=>index>=route.length||!identical(step,route[index]));
  const keep=common<0?Math.min(position.length,route.length):common;
  let unsafe=false;
  while(position.length>keep){
   try{
    await device.back();
    position.pop();ancestry.pop();
    const nodes=await readNodes(device);
    if(!inTarget(nodes,pkg))throw new Error('Android Back left the target app');
    const expected=ancestry[ancestry.length-1]||rootSignature;
    const actual=signature(nodes,pkg);
    if(expected&&actual&&expected!==actual)throw new Error('Android Back did not restore the previous app screen');
   }catch(error){errors.push('Navigation could not return to a previous screen; stopped to avoid mislabeled screenshots: '+String(error));unsafe=true;break}
  }
  if(unsafe)break;
  try{
   for(let i=keep;i<route.length;i++){
    const nodes=await readNodes(device);
    if(!inTarget(nodes,pkg))throw new Error('Navigation left target app');
    await device.tap(resolveTap(route[i],nodes));
    const next=await readNodes(device);
    if(!inTarget(next,pkg))throw new Error('Tap left target app');
    position.push(route[i]);ancestry.push(signature(next,pkg));
   }
   await onCapture(page.id,await device.png());completed++;options.onLog?.('Captured '+page.id);
  }catch(error){errors.push('Could not capture '+page.id+': '+String(error));break}
 }
 if(!errors.length){
  while(position.length){
   try{
    await device.back();position.pop();ancestry.pop();
    const nodes=await readNodes(device);
    if(!inTarget(nodes,pkg))throw new Error('Android Back exited the app');
    const expected=ancestry[ancestry.length-1]||rootSignature,actual=signature(nodes,pkg);
    if(expected&&actual&&expected!==actual)throw new Error('Android Back did not restore the starting screen');
   }catch(error){errors.push('Could not restore starting screen using Back: '+String(error));break}
  }
 }
 return {completed,errors};
}
