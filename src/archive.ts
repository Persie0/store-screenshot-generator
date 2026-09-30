export type ZipFile={path:string;data:Uint8Array|ArrayBuffer|string|Blob};
const CRC_TABLE=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
export function crc32(bytes:Uint8Array):number{let c=0xffffffff;for(const b of bytes)c=CRC_TABLE[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0}
function u16(v:number){return new Uint8Array([v&255,(v>>>8)&255])}function u32(v:number){return new Uint8Array([v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255])}
function join(parts:Uint8Array[]){const n=parts.reduce((a,b)=>a+b.length,0);const out=new Uint8Array(n);let offset=0;for(const p of parts){out.set(p,offset);offset+=p.length}return out}
async function bytesOf(data:ZipFile['data']):Promise<Uint8Array>{if(typeof data==='string')return new TextEncoder().encode(data);if(data instanceof Blob)return new Uint8Array(await data.arrayBuffer());return data instanceof Uint8Array?data:new Uint8Array(data)}
export async function createZip(files:ZipFile[]):Promise<Blob>{
 const local:Uint8Array[]=[],central:Uint8Array[]=[];let offset=0;const encoder=new TextEncoder();
 for(const file of files){const name=encoder.encode(file.path.replace(/^\/+/,''));const data=await bytesOf(file.data);const crc=crc32(data);const header=join([u32(0x04034b50),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name]);local.push(header,data);const dir=join([u32(0x02014b50),u16(20),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]);central.push(dir);offset+=header.length+data.length}
 const cd=join(central);const end=join([u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(cd.length),u32(offset),u16(0)]);const output=join([...local,cd,end]);return new Blob([output.buffer as ArrayBuffer],{type:'application/zip'});
}
