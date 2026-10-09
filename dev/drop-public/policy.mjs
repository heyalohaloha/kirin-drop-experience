// A bounded first-look experience. Never resample into a supported level rate.
import { decodeWav } from '../drop-preview/measure.mjs';
export const PUBLIC_LIMITS = Object.freeze({bytes: 32 * 1024 * 1024, seconds: 90, rates: Object.freeze([44100, 48000, 96000])});
export function validatePublicInput(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength > PUBLIC_LIMITS.bytes) throw new Error('public-size');
  const audio = decodeWav(buffer);
  if (!PUBLIC_LIMITS.rates.includes(audio.sampleRate)) throw new Error('public-rate');
  if (audio.duration > PUBLIC_LIMITS.seconds) throw new Error('public-duration');
  return audio;
}
