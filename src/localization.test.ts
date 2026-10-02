import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TRANSLATION_LOCALES,applyImportedLocales,extractFlutterLocales,localeLabel,normalizeLocaleCode,selectedTranslationLocales } from './localization.ts';
import type { Project } from './storage.ts';

function project():Project{return {id:'p',name:'Demo',createdAt:1,updatedAt:1,status:'ready',englishApproved:true,screens:[]}}

test('extracts supported locales from generated Flutter app_localizations.dart',()=>{
 const source=`static const List<Locale> supportedLocales = <Locale>[\n  Locale('en'),\n  Locale('nb'),\n  Locale('nn')\n];\nimport 'app_localizations_de.dart';`;
 assert.deepEqual(extractFlutterLocales(source),['en','nb','nn']);
});

test('normalizes language region and script locale forms',()=>{
 const source=`static const List<Locale> supportedLocales = <Locale>[Locale('pt','BR'),Locale('zh','Hans'),Locale('pt','BR')];`;
 assert.deepEqual(extractFlutterLocales(source),['pt-BR','zh-Hans']);
 assert.equal(normalizeLocaleCode('EN_us'),'en-US');
 assert.equal(normalizeLocaleCode('zh_hans_cn'),'zh-Hans-CN');
});

test('falls back to generated localization imports when supportedLocales is unavailable',()=>{
 const source=`import 'app_localizations_en.dart';\nimport 'app_localizations_nb.dart';\nimport 'app_localizations_nn.dart';`;
 assert.deepEqual(extractFlutterLocales(source),['en','nb','nn']);
});

test('rejects files without usable locale declarations',()=>{
 assert.throws(()=>extractFlutterLocales('abstract class AppLocalizations {}'),/No supported Flutter locales/i);
});

test('names all common imported language codes instead of showing raw codes',()=>{
 const expected:Record<string,string>={
  ar:'Arabic',bn:'Bangla',cs:'Czech',da:'Danish',de:'German',es:'Spanish',fi:'Finnish',fil:'Filipino',fr:'French',he:'Hebrew',hi:'Hindi',hu:'Hungarian',id:'Indonesian',it:'Italian',ja:'Japanese',ko:'Korean',ms:'Malay',nl:'Dutch',no:'Norwegian',pl:'Polish',pt:'Portuguese',ro:'Romanian',ru:'Russian',sk:'Slovak',sv:'Swedish',th:'Thai',tr:'Turkish',uk:'Ukrainian',ur:'Urdu',vi:'Vietnamese',zh:'Chinese',nb:'Norwegian Bokmål',nn:'Norwegian Nynorsk',
 };
 for(const [code,label] of Object.entries(expected))assert.equal(localeLabel(code),label,code);
});

test('names valid languages and region or script variants beyond the current UI sample',()=>{
 const expected:Record<string,string>={
  gsw:'Swiss German',yue:'Cantonese',sw:'Swahili',fa:'Persian',el:'Greek',ca:'Catalan',eu:'Basque',gl:'Galician',is:'Icelandic',et:'Estonian',lv:'Latvian',lt:'Lithuanian',sl:'Slovenian',hr:'Croatian',bg:'Bulgarian',mk:'Macedonian',sq:'Albanian',hy:'Armenian',ka:'Georgian',az:'Azerbaijani',kk:'Kazakh',uz:'Uzbek',mn:'Mongolian',ne:'Nepali',si:'Sinhala',ta:'Tamil',te:'Telugu',ml:'Malayalam',mr:'Marathi',gu:'Gujarati',kn:'Kannada',pa:'Punjabi',af:'Afrikaans',am:'Amharic',zu:'Zulu',xh:'Xhosa','pt-BR':'Brazilian Portuguese','zh-Hans':'Simplified Chinese','zh-TW':'Chinese (Taiwan)','en-GB':'British English','es-MX':'Mexican Spanish','sr-Latn':'Serbian (Latin)','sr-Cyrl':'Serbian (Cyrillic)',
 };
 for(const [code,label] of Object.entries(expected))assert.equal(localeLabel(code),label,code);
 assert.deepEqual(DEFAULT_TRANSLATION_LOCALES,['de','fr','es','ja','pt-BR','zh-CN']);
});

test('first import always adds English source and selects every detected non-English locale',()=>{
 const result=applyImportedLocales(project(),['nb','nn'],50);
 assert.equal(result.sourceLocale,'en');
 assert.deepEqual(result.localizedLocales,['en','nb','nn']);
 assert.deepEqual(result.translationLocales,['nb','nn']);
 assert.equal(result.updatedAt,50);
});

test('re-import preserves still-valid unchecked targets and selects newly discovered locales',()=>{
 const existing={...project(),sourceLocale:'en',localizedLocales:['en','nb','nn'],translationLocales:['nb']};
 const result=applyImportedLocales(existing,['en','nb','nn','fr'],60);
 assert.deepEqual(result.localizedLocales,['en','nb','nn','fr']);
 assert.deepEqual(result.translationLocales,['nb','fr']);
});

test('legacy projects keep the original default target set until they import locale metadata',()=>{
 assert.deepEqual(selectedTranslationLocales(project()),[...DEFAULT_TRANSLATION_LOCALES]);
 const configured={...project(),sourceLocale:'en',localizedLocales:['en','nb','nn'],translationLocales:['nn']};
 assert.deepEqual(selectedTranslationLocales(configured),['nn']);
});
