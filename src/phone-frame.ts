export const DEFAULT_PHONE_COLOR='#111521';

export type PhoneColorMode='auto'|'manual';

export function normalizeHexColor(value:unknown):string|undefined{
 if(typeof value!=='string')return undefined;
 const trimmed=value.trim();
 return /^#[\da-fA-F]{6}$/.test(trimmed)?trimmed.toUpperCase():undefined;
}

export function normalizePhoneColorMode(value:unknown):PhoneColorMode{
 return value==='manual'?'manual':'auto';
}

export function resolvePhoneColor(mode:PhoneColorMode|undefined,manualColor:string|undefined,aiColor:string|undefined):string{
 if(normalizePhoneColorMode(mode)==='manual')return normalizeHexColor(manualColor)||DEFAULT_PHONE_COLOR;
 return normalizeHexColor(aiColor)||DEFAULT_PHONE_COLOR;
}
