import {isPng,parseUiNodes,resolveTap,validPackageName,cleanLocale,type TapStep,type UiNode} from './capture-core.ts';
export type WebAdbConnection={serial:string;run:(command:string)=>Promise<string>;png:()=>Promise<Blob>;dump:()=>Promise<UiNode[]>;restart:(pkg:string)=>Promise<void>;tap:(step:TapStep)=>Promise<void>;getLocale:(pkg:string)=>Promise<string>;setLocale:(pkg:string,locale:string)=>Promise<void>;close:()=>Promise<void>};
type ShellResult={exitCode:number;stdout:string;stderr:string};
type AdbLike={subprocess:{shellProtocol?:{spawnWaitText:(command:string)=>Promise<ShellResult>;spawnWait:(command:string)=>Promise<{exitCode:number;stdout:Uint8Array;stderr:Uint8Array}>}};close?:()=>Promise<void>};
const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
/** ADB/WebUSB must have exclusive access to the device USB interface. */
export function isWebUsbBusyError(error:unknown):boolean{
 const message=error instanceof Error?(error.name+' '+error.message):String(error);
 return /DeviceBusyError|already in us(?:e|ed)|unable to claim interface|cannot claim interface|LIBUSB_ERROR_BUSY|device.*\bbusy\b/i.test(message);
}
export function explainWebUsbError(error:unknown):string{
 const message=error instanceof Error?error.message:String(error);
 if(!isWebUsbBusyError(error))return message;
 return 'USB ADB interface is busy. Close Android Studio, scrcpy, and other WebADB tabs; run "adb kill-server" on your computer, then unplug/reconnect the phone and retry. Or use the Python ADB fallback while keeping local ADB running.';
}
function checkedCommand(command:string,result:ShellResult):string{if(result.exitCode!==0||/(?:\bException\b|Unknown command|Error:)/i.test(result.stderr+result.stdout))throw new Error('ADB command failed: '+command+'\n'+(result.stderr||result.stdout).slice(0,900));return result.stdout}
export function parseAppLocale(output:string):string{const match=/\[([^\]]*)\]/.exec(output);if(!match)throw new Error('Unable to confirm app locale: '+output.slice(0,200));return match[1].trim().split(',')[0]?.trim()||''}
export function makeAdbConnection(adb:AdbLike,serial='Android'):WebAdbConnection{
 const shell=adb.subprocess.shellProtocol;if(!shell)throw new Error('This device does not support ADB shell protocol (Android 7+ required).');
 const run=async(command:string)=>checkedCommand(command,await shell.spawnWaitText(command));
 return {serial,run,
 async png(){const result=await shell.spawnWait('screencap -p');if(result.exitCode!==0||!isPng(result.stdout))throw new Error('Android did not return a PNG screenshot. '+new TextDecoder().decode(result.stderr).slice(0,160));return new Blob([new Uint8Array(result.stdout).buffer],{type:'image/png'})},
 async dump(){const path='/sdcard/Download/frame-adb-window.xml';await run('uiautomator dump '+path);try{const nodes=parseUiNodes(await run('cat '+path));if(!nodes.length)throw new Error('Android accessibility hierarchy is empty. Try manual taps or expose accessibility semantics.');return nodes}finally{await run('rm -f '+path).catch(()=>{})}},
 async restart(pkg){if(!validPackageName(pkg))throw new Error('Invalid Android app ID.');await run('am force-stop '+pkg);const output=await run('monkey -p '+pkg+' -c android.intent.category.LAUNCHER 1');if(/No activities found|monkey aborted/i.test(output))throw new Error('No launchable activity found.');await sleep(1100)},
 async tap(step){if(!Number.isSafeInteger(step.x)||!Number.isSafeInteger(step.y)||step.x<0||step.y<0||step.x>20000||step.y>20000)throw new Error('Invalid tap position.');await run('input tap '+step.x+' '+step.y);await sleep(500)},
 async getLocale(pkg){if(!validPackageName(pkg))throw new Error('Invalid Android app ID.');return parseAppLocale(await run('cmd locale get-app-locales '+pkg+' --user current'))},
 async setLocale(pkg,locale){if(!validPackageName(pkg))throw new Error('Invalid Android app ID.');const canonical=locale?cleanLocale(locale):'';if(locale&&!canonical)throw new Error('Invalid locale code.');await run("cmd locale set-app-locales "+pkg+" --user current --locales '"+(canonical||'')+"'");const actual=await this.getLocale(pkg);if(actual!==(canonical||''))throw new Error('Android did not apply '+(canonical||'system default')+' (reported '+(actual||'system default')+').')},
 async close(){await adb.close?.()}
 };
}
async function importLibrary(url:string):Promise<Record<string,unknown>>{return import(/* @vite-ignore */ url) as Promise<Record<string,unknown>>}
export async function connectWebAdb():Promise<WebAdbConnection>{
 if(!globalThis.isSecureContext||!('usb' in navigator))throw new Error('WebUSB requires desktop Chrome/Edge over HTTPS or localhost. Use the Python ADB fallback on Firefox or Safari.');
 const [core,web,credentials]=await Promise.all([importLibrary('https://esm.sh/@yume-chan/adb@2.1.0?bundle'),importLibrary('https://esm.sh/@yume-chan/adb-daemon-webusb@2.1.0?bundle'),importLibrary('https://esm.sh/@yume-chan/adb-credential-web@2.1.0?bundle')]);
 const manager=(web.AdbDaemonWebUsbDeviceManager as {BROWSER?:{requestDevice:()=>Promise<{serial:string;connect:()=>Promise<unknown>}|undefined>}})?.BROWSER;if(!manager)throw new Error('No WebUSB ADB manager is available in this browser.');
 const device=await manager.requestDevice();if(!device)throw new Error('USB device selection was canceled.');
 let connection:unknown;
 try{connection=await device.connect()}catch(error){throw new Error(explainWebUsbError(error),{cause:error})}
 const CredentialStore=(credentials.default||credentials.AdbWebCredentialStore) as new()=>unknown;
 const Transport=core.AdbDaemonTransport as {authenticate:(input:{serial:string;connection:unknown;credentialStore:unknown})=>Promise<unknown>};
 const Adb=core.Adb as new(transport:unknown)=>AdbLike;
 if(!Transport||!Adb||!CredentialStore)throw new Error('WebADB library could not be loaded.');
 return makeAdbConnection(new Adb(await Transport.authenticate({serial:device.serial,connection,credentialStore:new CredentialStore()})),device.serial);
}
export async function replayRoute(device:WebAdbConnection,pkg:string,steps:TapStep[],options:{restart?:boolean}={}):Promise<void>{
 if(options.restart!==false)await device.restart(pkg);
 for(const step of steps){let tap=step;try{tap=resolveTap(step,await device.dump())}catch{/* Coordinate fallback for Flutter layouts without resource IDs. */}
 await device.tap(tap)}
}
