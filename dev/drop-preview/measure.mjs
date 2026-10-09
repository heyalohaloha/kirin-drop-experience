// Independent browser-preview implementation. No Kirin OS private code.
export const LIMITS = Object.freeze({ bytes: 64 * 1024 * 1024, seconds: 600, channels: 2 });
const fail = (message) => { throw new Error(message); };
const db = (value) => value === 0 ? null : 20 * Math.log10(value);
const tag = (view, offset) => String.fromCharCode(...Array.from({ length: 4 }, (_, i) => view.getUint8(offset + i)));

export function decodeWav(buffer, {bytes = LIMITS.bytes, seconds = LIMITS.seconds} = {}) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 44) fail("WAVの内容を確認できません。別のファイルを選んでください。");
  if (buffer.byteLength > bytes) fail("このプレビューでは64 MiB以下の音源を選んでください。");
  const view = new DataView(buffer);
  if (tag(view, 0) !== "RIFF" || tag(view, 8) !== "WAVE") fail("現在はRIFF形式のWAVに対応しています。MP3・AIFF・RF64などは未対応です。");
  const end = view.getUint32(4, true) + 8;
  if (end < 12 || end !== buffer.byteLength) fail("WAVのサイズ情報とファイルが一致しません。");
  let format, data;
  for (let offset = 12; offset < end;) {
    if (offset + 8 > end) fail("WAVのヘッダーが途中で切れています。");
    const id = tag(view, offset), size = view.getUint32(offset + 4, true), start = offset + 8;
    if (start + size > end) fail("WAVの内容が途中で切れています。");
    if (id === "fmt ") {
      if (format || size < 16) fail("WAVの形式情報を確認できません。");
      format = { code: view.getUint16(start, true), channels: view.getUint16(start + 2, true), sampleRate: view.getUint32(start + 4, true), byteRate: view.getUint32(start + 8, true), align: view.getUint16(start + 12, true), bits: view.getUint16(start + 14, true) };
    }
    if (id === "data") { if (data) fail("複数のdata領域を持つWAVは未対応です。"); data = { start, size }; }
    offset = start + size + (size & 1);
    if (offset > end) fail("WAVのパディングが不足しています。");
  }
  if (!format || !data) fail("WAVの形式情報または音声データがありません。");
  const { code, channels, sampleRate, align, bits, byteRate } = format;
  if (![1, 2].includes(channels)) fail("現在はモノラルとステレオのWAVに対応しています。");
  if (sampleRate < 8000 || sampleRate > 192000) fail("現在は8〜192 kHzのWAVに対応しています。");
  if (!(code === 1 && [8, 16, 24, 32].includes(bits)) && !(code === 3 && [32, 64].includes(bits))) fail("現在はPCMまたはIEEE floatのWAVに対応しています。WAV extensibleは未対応です。");
  const bytesPerSample = bits / 8;
  if (align !== channels * bytesPerSample || byteRate !== sampleRate * align || data.size % align !== 0) fail("WAVのチャンネル・サイズ情報が一致しません。");
  const frames = data.size / align, duration = frames / sampleRate;
  if (frames === 0) fail("音声データが空です。");
  if (duration > seconds) fail("このプレビューでは10分以内の音源を選んでください。");
  const read = (offset) => {
    if (code === 3) return bits === 32 ? view.getFloat32(offset, true) : view.getFloat64(offset, true);
    if (bits === 8) return (view.getUint8(offset) - 128) / 128;
    if (bits === 16) return view.getInt16(offset, true) / 32768;
    if (bits === 32) return view.getInt32(offset, true) / 2147483648;
    let value = view.getUint8(offset) | view.getUint8(offset + 1) << 8 | view.getUint8(offset + 2) << 16;
    if (value & 0x800000) value -= 0x1000000;
    return value / 8388608;
  };
  return { sampleRate, channels, bits, code, frames, duration, readSample: (channel, frame) => read(data.start + frame * align + channel * bytesPerSample) };
}

export function measureWav(buffer, options) {
  const { sampleRate, channels, bits, code, frames, duration, readSample } = decodeWav(buffer, options);
  const sums = Array(channels).fill(0), peaks = Array(channels).fill(0);
  const wave = Array.from({ length: channels }, () => Array.from({ length: Math.min(420, frames) }, () => [Infinity, -Infinity]));
  const windowFrames = Math.max(1, Math.round(sampleRate * .1));
  const timeline = [], windowSums = Array(channels).fill(0), windowPeaks = Array(channels).fill(0), windowRectified = Array(channels).fill(0);
  let count = 0;
  for (let frame = 0; frame < frames; frame++) {
    const bin = Math.min(wave[0].length - 1, Math.floor(frame * wave[0].length / frames));
    for (let channel = 0; channel < channels; channel++) {
      const value = readSample(channel, frame);
      if (!Number.isFinite(value) || !Number.isFinite(value * value)) fail("音声データに計算できない値があります。");
      const power = value * value, magnitude = Math.abs(value);
      sums[channel] += power; peaks[channel] = Math.max(peaks[channel], magnitude);
      windowSums[channel] += power; windowPeaks[channel] = Math.max(windowPeaks[channel], magnitude);
      windowRectified[channel] += magnitude;
      wave[channel][bin][0] = Math.min(wave[channel][bin][0], value);
      wave[channel][bin][1] = Math.max(wave[channel][bin][1], value);
    }
    count++;
    if (count === windowFrames || frame === frames - 1) {
      timeline.push({ start: (frame + 1 - count) / sampleRate, end: (frame + 1) / sampleRate, rmsDb: windowSums.map((sum) => db(Math.sqrt(sum / count))), peakDb: windowPeaks.map(db), rectifiedDb: windowRectified.map(sum => db(sum / count)) });
      count = 0; windowSums.fill(0); windowPeaks.fill(0); windowRectified.fill(0);
    }
  }
  if (sums.some((sum) => !Number.isFinite(sum))) fail("音声データの値が大きすぎます。");
  return {
    sampleRate, channels, bits, encoding: code === 1 ? "PCM" : "IEEE float", frames, duration,
    peakDb: db(Math.max(...peaks)), rmsDb: db(Math.sqrt(sums.reduce((total, sum) => total + sum / (frames * channels), 0))),
    channelPeakDb: peaks.map(db), channelRmsDb: sums.map((sum) => db(Math.sqrt(sum / frames))),
    wave, timeline, windowSeconds: windowFrames / sampleRate,
  };
}

export function createDemoWav() {
  // Synthetic input, generated here, not a Kirin OS result or a customer track.
  const sampleRate = 48000, frames = sampleRate * 12, channels = 2;
  const buffer = new ArrayBuffer(44 + frames * channels * 2), view = new DataView(buffer);
  const writeTag = (offset, value) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  writeTag(0, "RIFF"); view.setUint32(4, buffer.byteLength - 8, true); writeTag(8, "WAVE"); writeTag(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 16, true);
  writeTag(36, "data"); view.setUint32(40, frames * 4, true);
  for (let frame = 0; frame < frames; frame++) {
    const t = frame / sampleRate, fade = Math.min(1, t / .15, (12 - t) / .3);
    const notes = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]][Math.min(3, Math.floor(t / 3))];
    const beatAge = ((t - .25) % .5 + .5) % .5;
    const pulse = .32 + .68 * Math.exp(-beatAge * 20);
    for (let channel = 0; channel < 2; channel++) {
      const chord = notes.reduce((sum, note) => {
        const hz = 440 * 2 ** ((note - 69) / 12);
        return sum + .105 * Math.sin(2 * Math.PI * hz * t + channel * .13);
      }, 0);
      const click = .12 * Math.exp(-beatAge * 100) * Math.sin(2 * Math.PI * 1700 * t);
      const value = fade * (pulse * chord + click);
      view.setInt16(44 + frame * 4 + channel * 2, Math.round(value * 32767), true);
    }
  }
  return buffer;
}
