// A bounded first-look experience. Never resample into a supported level rate.
import { decodeWav } from '../drop-preview/measure.mjs';
export const PUBLIC_LIMITS = Object.freeze({seconds: 300, rates: Object.freeze([44100, 48000, 96000])});
export const PUBLIC_DECODE = Object.freeze({bytes: Infinity, seconds: Infinity});
export function validatePublicInput(buffer) {
  const audio = decodeWav(buffer, PUBLIC_DECODE);
  if (!PUBLIC_LIMITS.rates.includes(audio.sampleRate)) throw new Error('public-rate');
  if (audio.duration > PUBLIC_LIMITS.seconds) throw new Error('public-duration');
  return audio;
}
// Read only RIFF/fmt/data headers before allocating a whole file. No arbitrary
// byte cap: five minutes at an accepted rate/encoding is accepted in full.
export async function validatePublicFile(file) {
  if (!(file instanceof Blob) || file.size < 44) throw new Error('invalid-wav');
  const read = async (start, length) => new DataView(await file.slice(start, start + length).arrayBuffer());
  const tag = (view, at) => String.fromCharCode(...Array.from({length:4}, (_,i)=>view.getUint8(at+i)));
  const head = await read(0,12);
  if (tag(head,0)!=='RIFF' || tag(head,8)!=='WAVE' || head.getUint32(4,true)+8!==file.size) throw new Error('invalid-wav');
  let format, data;
  for (let offset=12; offset<file.size;) {
    if (offset+8>file.size) throw new Error('invalid-wav');
    const chunk=await read(offset,8), id=tag(chunk,0), size=chunk.getUint32(4,true), start=offset+8;
    if (start+size>file.size) throw new Error('invalid-wav');
    if (id==='fmt ') {
      if (format || size<16) throw new Error('invalid-wav');
      const v=await read(start,16);
      format={code:v.getUint16(0,true), channels:v.getUint16(2,true), rate:v.getUint32(4,true), byteRate:v.getUint32(8,true), align:v.getUint16(12,true), bits:v.getUint16(14,true)};
    }
    if (id==='data') {if(data!==undefined) throw new Error('invalid-wav'); data=size;}
    offset=start+size+(size&1);
    if(offset>file.size) throw new Error('invalid-wav');
  }
  if(!format || data===undefined || !data) throw new Error('invalid-wav');
  const {code,channels,rate,byteRate,align,bits}=format;
  if (![1,2].includes(channels) || !((code===1 && [8,16,24,32].includes(bits)) || (code===3 && [32,64].includes(bits))) || align!==channels*bits/8 || byteRate!==rate*align || data%align) throw new Error('invalid-wav');
  if(!PUBLIC_LIMITS.rates.includes(rate)) throw new Error('public-rate');
  if(data/align/rate>PUBLIC_LIMITS.seconds) throw new Error('public-duration');
}
