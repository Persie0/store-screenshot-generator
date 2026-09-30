export const STORE_SIZES=[
 {key:'apple/iphone-6-9',label:'iPhone 6.9”',width:1320,height:2868,platform:'Apple App Store',kind:'portrait'},
 {key:'apple/iphone-6-7',label:'iPhone 6.7”',width:1290,height:2796,platform:'Apple App Store',kind:'portrait'},
 {key:'apple/iphone-6-5',label:'iPhone 6.5”',width:1242,height:2688,platform:'Apple App Store',kind:'portrait'},
 {key:'apple/ipad-13',label:'iPad 13”',width:2064,height:2752,platform:'Apple App Store',kind:'portrait'},
 {key:'google/phone',label:'Google Play phone',width:1080,height:1920,platform:'Google Play',kind:'portrait'},
 {key:'google/feature-graphic',label:'Google Play feature graphic',width:1024,height:500,platform:'Google Play',kind:'landscape'},
] as const;
export type StoreSize=typeof STORE_SIZES[number];
