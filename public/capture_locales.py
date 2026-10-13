#!/usr/bin/env python3
"""Offline Android screenshot discovery + per-app locale capture.
Usage: python capture_locales.py com.example.app --locales de-DE,fr-FR --max-pages 20
Requires Android platform-tools (adb), Android 13+ for per-app locales.
No pip dependencies or remote uploads.
"""
import argparse
import json
import pathlib
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
import zipfile

PKG = re.compile(r'^(?:[A-Za-z_][A-Za-z\d_]*\.)+[A-Za-z_][A-Za-z\d_]*$')
LOCALE = re.compile(r'^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})*$')
BOUNDS = re.compile(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]')
DANGER = re.compile(r'\b(?:buy|purchase|subscribe|checkout|pay|delete|remove|logout|send|submit|order|reset|wipe|uninstall|erase|transfer)\b',re.I)
NAV = re.compile(r'home|settings|profile|about|dashboard|history|statistics|analytics|tools|library|gallery|explore|discover|account|tab|navigation|menu|details|more|search|categories|favorites|help|info|preferences|features|activity|reports|overview|notifications|language|privacy|layout|themes|back|next',re.I)
INPUT = re.compile(r'EditText|TextField|Switch|CheckBox|RadioButton|SeekBar',re.I)

def adb(*parts,binary=False):
 result=subprocess.run(['adb',*parts],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=35)
 if result.returncode: raise RuntimeError('adb failed: '+result.stderr.decode(errors='replace')[:300])
 return result.stdout if binary else result.stdout.decode(errors='replace').strip()

def shell(*args): return adb('shell',*args)
def get_locale(pkg):
 output=shell('cmd','locale','get-app-locales',pkg,'--user','current')
 match=re.search(r'\[([^]]*)\]',output)
 if not match: raise RuntimeError('Per-app locale unavailable (Android 13+ required): '+output)
 return match.group(1).strip().split(',')[0].strip()
def set_locale(pkg,locale):
 output=shell('cmd','locale','set-app-locales',pkg,'--user','current','--locales',locale)
 if 'Exception' in output or 'Error:' in output: raise RuntimeError(output)
 actual=get_locale(pkg)
 if actual!=locale: raise RuntimeError('Locale verification failed: '+repr(actual)+' != '+repr(locale))
def launch(pkg):
 shell('am','force-stop',pkg)
 output=shell('monkey','-p',pkg,'-c','android.intent.category.LAUNCHER','1')
 if 'No activities found' in output or 'aborted' in output: raise RuntimeError('No launchable activity')
 time.sleep(1.0)
def screenshot():
 data=adb('exec-out','screencap','-p',binary=True)
 if not data.startswith(b'\x89PNG\r\n\x1a\n'): raise RuntimeError('Not a PNG screenshot')
 return data
def hierarchy():
 path='/sdcard/Download/frame-capture-window.xml'
 shell('uiautomator','dump',path)
 try: return list(ET.fromstring(shell('cat',path)).iter('node'))
 finally:
  try: shell('rm','-f',path)
  except Exception: pass
def actions(nodes,pkg):
 output=[]
 for node in nodes:
  a=node.attrib
  if a.get('package')!=pkg or a.get('clickable')!='true' or a.get('enabled')=='false':continue
  if INPUT.search(a.get('class','')):continue
  label=a.get('content-desc') or a.get('text') or a.get('resource-id') or ''
  if not label or DANGER.search(label) or not NAV.search(label):continue
  b=BOUNDS.fullmatch(a.get('bounds',''))
  if not b:continue
  left,top,right,bottom=map(int,b.groups())
  if right-left<12 or bottom-top<12:continue
  output.append({'x':(left+right)//2,'y':(top+bottom)//2,'id':a.get('resource-id',''),'label':label})
  if len(output)>=8:break
 return output
def replay(pkg,route):
 launch(pkg)
 for step in route:
  x,y=step['x'],step['y']
  if step['id']:
   try:
    nodes=hierarchy()
    match=next((n for n in nodes if n.get('resource-id')==step['id'] and n.get('clickable')=='true'),None)
    if match:
     b=BOUNDS.fullmatch(match.get('bounds',''))
     if b:
      a,c,d,e=map(int,b.groups());x=(a+d)//2;y=(c+e)//2
   except Exception: pass
  shell('input','tap',str(x),str(y));time.sleep(.5)
def discover(pkg,limit,depth):
 queue=[[]];seen=set();fingerprints=set();pages=[]
 while queue and len(pages)<limit and len(seen)<limit*14:
  route=queue.pop(0);key=tuple((p['id'],p['x'],p['y']) for p in route)
  if key in seen:continue
  seen.add(key)
  try:
   replay(pkg,route);nodes=hierarchy()
   if nodes and not any(n.get('package')==pkg for n in nodes):continue
   signature='|'.join((n.get('resource-id') or '')+':'+(n.get('text') or '')+':'+(n.get('content-desc') or '') for n in nodes)
   if signature in fingerprints:continue
   fingerprints.add(signature)
   name=route[-1]['label'] if route else 'Home'
   pages.append({'id':'s'+str(len(pages)+1).zfill(3),'name':name,'route':route,'png':screenshot()})
   print('['+str(len(pages))+'] '+name)
   if len(route)<depth:queue.extend(route+[item] for item in actions(nodes,pkg))
  except Exception as exc:print('Skipping route:',exc,file=sys.stderr)
 return pages

def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('package');parser.add_argument('--source',default='en-US');parser.add_argument('--locales',default='de-DE,fr-FR,es-ES')
 parser.add_argument('--max-pages',type=int,default=20);parser.add_argument('--depth',type=int,default=3)
 parser.add_argument('--all',action='store_true',help='Select all discovered pages without prompting')
 parser.add_argument('--output',default='android-localized-screens.zip')
 args=parser.parse_args()
 if not PKG.fullmatch(args.package):parser.error('Invalid Android app ID')
 if not (1<=args.max_pages<=50 and 0<=args.depth<=5):parser.error('Limits out of range')
 locales=list(dict.fromkeys(value.strip().replace('_','-') for value in args.locales.split(',') if value.strip()))
 if not LOCALE.fullmatch(args.source) or any(not LOCALE.fullmatch(value) for value in locales):parser.error('Invalid BCP-47 language code')
 locales=[locale for locale in locales if locale!=args.source]
 if not locales:parser.error('No target languages different from the source')
 adb('get-state')
 if not adb('shell','pm','path',args.package).startswith('package:'):parser.error('App is not installed')
 original=get_locale(args.package);failures=[]
 try:
  set_locale(args.package,args.source);pages=discover(args.package,args.max_pages,args.depth)
  if not pages:raise RuntimeError('No screens discovered. Unlock app and check package ID.')
  if not args.all:
   answer=input('Select screen numbers (comma separated, Enter = all): ').strip()
   if answer:
    chosen={int(part.strip()) for part in answer.split(',')}
    pages=[page for idx,page in enumerate(pages,1) if idx in chosen]
  if not pages:raise RuntimeError('No pages selected')
  captures=[]
  for locale in locales:
   try:set_locale(args.package,locale)
   except Exception as exc:failures.append(locale+': '+str(exc));continue
   for page in pages:
    try:replay(args.package,page['route']);captures.append((locale,page['id'],screenshot()));print('Captured',locale,page['name'])
    except Exception as exc:failures.append(locale+' / '+page['name']+': '+str(exc))
  with zipfile.ZipFile(args.output,'w',compression=zipfile.ZIP_DEFLATED) as output:
   for page in pages:output.writestr(args.source+'/'+page['id']+'.png',page['png'])
   for locale,page_id,data in captures:output.writestr(locale+'/'+page_id+'.png',data)
   manifest={'format':'frame-adb-captures-v1','packageName':args.package,'sourceLocale':args.source,'locales':locales,'screens':[{'id':p['id'],'name':p['name'],'route':p['route']} for p in pages],'errors':failures}
   output.writestr('manifest.json',json.dumps(manifest,indent=2))
  print('Saved',args.output,len(captures),'localized captures and',len(failures),'failures')
  for err in failures:print('WARNING',err,file=sys.stderr)
 finally:
  try:set_locale(args.package,original);launch(args.package);print('Restored original app language.')
  except Exception as exc:print('WARNING: Could not restore original locale:',exc,file=sys.stderr)
if __name__=='__main__':main()
