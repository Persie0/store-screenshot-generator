import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync,readFileSync,readdirSync } from 'node:fs';
import { join } from 'node:path';

const root=process.cwd();

test('browser entrypoint uses the tested dashboard/crop app and no legacy main remains',()=>{
 const index=readFileSync(join(root,'index.html'),'utf8');
 assert.match(index,/src\/app\.ts/);
 assert.ok(!index.includes('src/main.ts'));
 assert.equal(existsSync(join(root,'src/main.ts')),false);
 const app=readFileSync(join(root,'src/app.ts'),'utf8');
 for(const dependency of ['./dashboard.ts','./crop-editor.ts','./project-state.ts','./render.ts','./export-plan.ts','./localization.ts','./translation.ts'])assert.ok(app.includes(dependency),dependency);
 assert.match(app,/initialRoute\(projects\)/);
 assert.match(app,/mountCropEditor/);
 assert.match(app,/applyTransformToMatchingShots/);
});

test('browser entrypoint wires local Flutter locale import, selected translations, selected exports and dimension-aware pixel crop',()=>{
 const app=readFileSync(join(root,'src/app.ts'),'utf8');
 assert.match(app,/extractFlutterLocales/);
 assert.match(app,/applyImportedLocales/);
 assert.match(app,/setTranslationLocaleSelected/);
 assert.match(app,/translateApprovedScreensForLocales/);
 assert.match(app,/selectedTranslationLocales/);
 assert.match(app,/exportLocales/);
 assert.match(app,/Promise\.all\(project\.screens\.map\(ensureDimensions\)\)/);
 assert.match(app,/same-pixels/);
});

test('crop header keeps Apply readable as a primary action',()=>{
 const css=readFileSync(join(root,'src/app-features.css'),'utf8');
 assert.match(css,/\.crop-head-actions \.primary-btn\{[^}]*background:var\(--blue\)[^}]*color:#fff[^}]*border-color:var\(--blue\)[^}]*\}/);
 assert.match(css,/\.crop-head-actions \.primary-btn:hover/);
});

test('every production TypeScript module has a dedicated test or explicit entrypoint smoke coverage',()=>{
 const src=join(root,'src');
 const modules=readdirSync(src).filter(name=>name.endsWith('.ts')&&!name.endsWith('.test.ts')&&!name.endsWith('.d.ts')&&name!=='test-idb.ts');
 const tests=new Set(readdirSync(src).filter(name=>name.endsWith('.test.ts')).map(name=>name.replace(/\.test\.ts$/,'.ts')));
 for(const module of modules){
  if(module==='app.ts')continue;
  assert.ok(tests.has(module),`missing dedicated test for ${module}`);
 }
 assert.ok(tests.has('app-entry.ts')||existsSync(join(src,'app-entry.test.ts')),'app entry smoke test');
});

test('package build gate runs tests, TypeScript and Vite in that order',()=>{
 const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8')) as {scripts:{build:string;test:string}};
 assert.equal(pkg.scripts.test,'node --test src/*.test.ts');
 assert.equal(pkg.scripts.build,'npm test && tsc --noEmit && vite build');
});
