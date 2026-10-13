#!/usr/bin/env python3
"""Offline Android screenshot discovery + per-app locale capture.
Usage: python capture_locales.py com.example.app --locales de-DE,fr-FR --max-pages 20
Requires Android platform-tools (adb), Android 13+ for per-app locales.
No pip dependencies or remote uploads.
"""
import argparse
import json
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
def go_back():
 shell('input','keyevent','KEYCODE_BACK')
 time.sleep(.4)
def tap_step(step):
 x,y=step['x'],step['y']
 if step['id']:
  try:
   match=next((n for n in hierarchy() if n.get('resource-id')==step['id'] and n.get('clickable')=='true'),None)
   if match:
    b=BOUNDS.fullmatch(match.get('bounds',''))
    if b:
     left,top,right,bottom=map(int,b.groups());x=(left+right)//2;y=(top+bottom)//2
  except Exception: pass
 shell('input','tap',str(x),str(y));time.sleep(.5)
def fingerprint(nodes):
 return '|'.join((n.get('resource-id') or '')+':'+(n.get('text') or '')+':'+(n.get('content-desc') or '') for n in nodes)
def shape(nodes,pkg):
 return '|'.join((n.get('resource-id') or '')+':'+(n.get('class') or '')+':'+(n.get('bounds') or '') for n in nodes if n.get('package')==pkg)
def require_app(nodes,pkg):
 if nodes and not any(n.get('package')==pkg for n in nodes):
  raise RuntimeError('Navigation left the target app. Open it manually; no relaunch will be attempted.')
def safe_hierarchy():
 try:return hierarchy()
 except Exception:return []

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
def discover(pkg,limit,depth):
 """Explore using taps and Android Back. Never launch or force-stop an app."""
 seen=set();pages=[];attempts=0;limit_attempts=limit*14
 def visit(route):
  nonlocal attempts
  if len(pages)>=limit or attempts>=limit_attempts:return True
  attempts+=1
  nodes=safe_hierarchy();require_app(nodes,pkg)
  signature=fingerprint(nodes) if nodes else 'unknown-hierarchy'
  if signature in seen:return True
  seen.add(signature)
  name=route[-1]['label'] if route else 'Current screen'
  pages.append({'id':'s'+str(len(pages)+1).zfill(3),'name':name,'route':route,'png':screenshot()})
  print('['+str(len(pages))+'] '+name)
  if not nodes or len(route)>=depth:return True
  for action in actions(nodes,pkg):
   if len(pages)>=limit or attempts>=limit_attempts:break
   current=safe_hierarchy()
   if fingerprint(current)!=signature:
    print('Discovery stopped: current screen changed. No relaunch attempted.',file=sys.stderr)
    return False
   try:
    tap_step(action)
    child=safe_hierarchy()
    if child:require_app(child,pkg)
    if child and fingerprint(child)!=signature:
     if not visit(route+[action]):return False
     go_back()
     restored=safe_hierarchy()
     if fingerprint(restored)!=signature:
      print('Discovery stopped: Back did not restore the previous page.',file=sys.stderr)
      return False
    elif not child:
     print('Discovery stopped: accessibility nodes not available after tap.',file=sys.stderr)
     return False
   except Exception as exc:
    print('Discovery stopped:',exc,file=sys.stderr)
    return False
  return True
 visit([])
 return pages

def capture_in_place(pkg,pages):
 """Navigate from the starting screen with tabs/taps/Back; fail closed if route recovery fails."""
 captured=[];position=[];ancestors=[]
 root=safe_hierarchy();require_app(root,pkg);ancestors=[shape(root,pkg)]
 for page in pages:
  route=page['route']
  common=0
  while common<min(len(position),len(route)) and position[common]==route[common]:common+=1
  while len(position)>common:
   go_back();position.pop();ancestors.pop()
   nodes=safe_hierarchy();require_app(nodes,pkg)
   expected=ancestors[-1]
   if expected and shape(nodes,pkg) and shape(nodes,pkg)!=expected:
    raise RuntimeError('Android Back did not return to the previous screen; capture stopped.')
  for step in route[common:]:
   before=safe_hierarchy();require_app(before,pkg)
   tap_step(step)
   after=safe_hierarchy();require_app(after,pkg)
   position.append(step);ancestors.append(shape(after,pkg))
  captured.append((page['id'],screenshot()))
  print('Captured',page['name'])
 while position:
  go_back();position.pop();ancestors.pop()
  nodes=safe_hierarchy();require_app(nodes,pkg)
  expected=ancestors[-1]
  if expected and shape(nodes,pkg) and shape(nodes,pkg)!=expected:
   raise RuntimeError('Android Back did not restore the starting screen.')
 return captured

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
  if original and original!=args.source:raise RuntimeError('Source locale mismatch: app reports '+original+'. Change --source or manually select the right language on the phone. No automatic change during discovery.')
  pages=discover(args.package,args.max_pages,args.depth)
  if not pages:raise RuntimeError('No screens discovered. Unlock app and check package ID.')
  if not args.all:
   answer=input('Select screen numbers (comma separated, Enter = all): ').strip()
   if answer:
    chosen={int(part.strip()) for part in answer.split(',')}
    pages=[page for idx,page in enumerate(pages,1) if idx in chosen]
  if not pages:raise RuntimeError('No pages selected')
  captures=[]
  for locale in locales:
   print('Switching to',locale,'(Android may recreate the activity; no app relaunch will be requested)')
   try:
    if get_locale(args.package)!=locale:set_locale(args.package,locale)
    for page_id,data in capture_in_place(args.package,pages):
     captures.append((locale,page_id,data))
   except Exception as exc:
    failures.append(locale+': '+str(exc))
    print('Stopping captures after navigation failure; no relaunch attempted.',file=sys.stderr)
    break
  with zipfile.ZipFile(args.output,'w',compression=zipfile.ZIP_DEFLATED) as output:
   for page in pages:output.writestr(args.source+'/'+page['id']+'.png',page['png'])
   for locale,page_id,data in captures:output.writestr(locale+'/'+page_id+'.png',data)
   manifest={'format':'frame-adb-captures-v1','packageName':args.package,'sourceLocale':args.source,'locales':locales,'screens':[{'id':p['id'],'name':p['name'],'route':p['route']} for p in pages],'errors':failures}
   output.writestr('manifest.json',json.dumps(manifest,indent=2))
  print('Saved',args.output,len(captures),'localized captures and',len(failures),'failures')
  for err in failures:print('WARNING',err,file=sys.stderr)
 finally:
  try:
   if get_locale(args.package)!=original:set_locale(args.package,original)
   print('Restored original app language without launching the app.')
  except Exception as exc:print('WARNING: Could not restore original locale:',exc,file=sys.stderr)
if __name__=='__main__':main()
