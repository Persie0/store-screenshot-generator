import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PHONE_COLOR,normalizeHexColor,normalizePhoneColorMode,resolvePhoneColor } from './phone-frame.ts';

test('phone color accepts only six-digit hex and normalizes case',()=>{
 assert.equal(normalizeHexColor('#a1B2c3'),'#A1B2C3');
 assert.equal(normalizeHexColor(' #112233 '),'#112233');
 for(const value of ['#123','#12345678','112233','#GG1122','',null,42])assert.equal(normalizeHexColor(value),undefined);
});

test('phone frame mode defaults invalid or missing values to auto',()=>{
 assert.equal(normalizePhoneColorMode('manual'),'manual');
 assert.equal(normalizePhoneColorMode('auto'),'auto');
 assert.equal(normalizePhoneColorMode('other'),'auto');
 assert.equal(normalizePhoneColorMode(undefined),'auto');
});

test('manual phone color overrides AI and auto uses AI with safe fallback',()=>{
 assert.equal(resolvePhoneColor('manual','#ABCDEF','#123456'),'#ABCDEF');
 assert.equal(resolvePhoneColor('auto','#ABCDEF','#123456'),'#123456');
 assert.equal(resolvePhoneColor('manual','bad','#123456'),DEFAULT_PHONE_COLOR);
 assert.equal(resolvePhoneColor('auto',undefined,'bad'),DEFAULT_PHONE_COLOR);
 assert.equal(DEFAULT_PHONE_COLOR,'#111521');
});
