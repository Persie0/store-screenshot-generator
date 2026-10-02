import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TRANSLATION_LOCALES,extractFlutterLocales,localeLabel,normalizeLocaleCode } from './localization.ts';

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

test('keeps unknown valid locale codes and provides known friendly labels',()=>{
 assert.equal(normalizeLocaleCode('gsw'),'gsw');
 assert.equal(localeLabel('gsw'),'gsw');
 assert.equal(localeLabel('en'),'English');
 assert.equal(localeLabel('nb'),'Norwegian Bokmål');
 assert.equal(localeLabel('nn'),'Norwegian Nynorsk');
 assert.deepEqual(DEFAULT_TRANSLATION_LOCALES,['de','fr','es','ja','pt-BR','zh-CN']);
});
