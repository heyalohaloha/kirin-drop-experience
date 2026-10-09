// HP-owned DSP; mathematical reference: ITU-R BS.1770-5, Annexes 1 and 2.
// Not a copy of Kirin OS, not a certification or a product-equivalence claim.
const level = (power) => power > 0 ? -.691 + 10 * Math.log10(power) : null;
const amplitudeDb = (amplitude) => amplitude > 0 ? 20 * Math.log10(amplitude) : null;
const average = (values) => values.reduce((sum, value) => sum + value / values.length, 0);

// Recover frequency/Q/gain from the published 48 kHz tables, then prewarp
// the bilinear transform at the ORIGINAL rate. Do not merely scale the analog
// polynomial: that drifts noticeably at low sample rates.
export function rateCoefficients(b, a, sampleRate) {
  if (sampleRate === 48000) return { b, a };
  const divisor = 1 - a[1] + a[2], kReference = Math.sqrt((1 + a[1] + a[2]) / divisor);
  const referenceDamping = 2 * (1 - a[2]) / divisor, q = kReference / referenceDamping;
  const frequency = 48000 / Math.PI * Math.atan(kReference), k = Math.tan(Math.PI * frequency / sampleRate);
  const denominator = 1 + k / q + k * k;
  const targetA = [1, 2 * (k * k - 1) / denominator, (1 - k / q + k * k) / denominator];
  if (b[0] === 1 && b[1] === -2 && b[2] === 1) return { b, a: targetA };
  const referenceDenominator = 1 + referenceDamping + kReference * kReference;
  const highGain = kReference * kReference - b[1] * referenceDenominator / 2;
  const middleGain = (b[0] - b[2]) * referenceDenominator / (2 * referenceDamping);
  return { b: [(highGain + middleGain * k / q + k * k) / denominator, 2 * (k * k - highGain) / denominator, (highGain - middleGain * k / q + k * k) / denominator], a: targetA };
}

export function biquad({ b, a }) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (value) => {
    const result = b[0] * value + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    x2 = x1; x1 = value; y2 = y1; y1 = result;
    return result;
  };
}

export function measureLoudness(audio) {
  const { sampleRate, frames, channels, readSample } = audio;
  const shelf = rateCoefficients([1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, .73248077421585], sampleRate);
  const highPass = rateCoefficients([1, -2, 1], [1, -1.99004745483398, .99007225036621], sampleRate);
  const filters = Array.from({ length: channels }, () => [biquad(shelf), biquad(highPass)]);
  const momentaryFrames = Math.round(sampleRate * .4), shortFrames = sampleRate * 3;
  const history = new Float64Array(shortFrames);
  const timeline = [], gateBlocks = [];
  let momentarySum = 0, shortSum = 0, slot = 1;
  for (let frame = 0; frame < frames; frame++) {
    let power = 0;
    for (let channel = 0; channel < channels; channel++) {
      const value = filters[channel][1](filters[channel][0](readSample(channel, frame)));
      power += value * value; // L/R/mono weight 1; NOT the mean channel power.
    }
    if (!Number.isFinite(power)) throw new Error("K-weightingの計算範囲を超えています。");
    if (frame >= momentaryFrames) momentarySum -= history[(frame - momentaryFrames) % shortFrames];
    if (frame >= shortFrames) shortSum -= history[frame % shortFrames];
    history[frame % shortFrames] = power;
    momentarySum += power; shortSum += power;
    if (frame + 1 === Math.round(slot * sampleRate / 10)) {
      const momentaryPower = frame + 1 >= momentaryFrames ? Math.max(0, momentarySum / momentaryFrames) : null;
      const shortPower = frame + 1 >= shortFrames ? Math.max(0, shortSum / shortFrames) : null;
      timeline.push({ end: (frame + 1) / sampleRate, momentary: momentaryPower === null ? null : level(momentaryPower), shortTerm: shortPower === null ? null : level(shortPower) });
      if (momentaryPower !== null) gateBlocks.push(momentaryPower);
      slot++;
    }
  }
  const absolute = gateBlocks.filter((power) => power > 0 && level(power) > -70);
  const relativeGate = absolute.length ? level(average(absolute)) - 10 : null;
  const gated = absolute.filter((power) => level(power) > relativeGate);
  const integrated = gated.length ? level(average(gated)) : null;
  if (integrated !== null && !Number.isFinite(integrated)) throw new Error("LUFSの計算範囲を超えています。");
  return { state: frames < momentaryFrames ? "too-short" : integrated === null ? "below-gate" : "measured", integrated, relativeGate, absoluteGate: -70, gateBlocks: gateBlocks.length, retainedBlocks: gated.length, timeline, method: "K-weighting / 400 ms / 100 ms hop / -70 LUFS and -10 LU gates" };
}

export function truePeakKernels(factor, radius = 16) {
  return Array.from({ length: factor - 1 }, (_, phase) => {
    const fraction = (phase + 1) / factor, weights = [];
    for (let k = -radius + 1; k <= radius; k++) {
      const distance = fraction - k, x = distance / radius;
      const window = Math.abs(x) >= 1 ? 0 : .42 + .5 * Math.cos(Math.PI * x) + .08 * Math.cos(2 * Math.PI * x);
      weights.push(Math.sin(Math.PI * distance) / (Math.PI * distance) * window);
    }
    const sum = weights.reduce((total, value) => total + value, 0);
    return weights.map((value) => value / sum);
  });
}

export function measureTruePeak(audio, progress = () => {}) {
  const { frames, sampleRate, channels, readSample } = audio;
  let factor = 4;
  while (sampleRate * factor < 192000) factor *= 2;
  const kernels = truePeakKernels(factor), radius = 16;
  const channelPeaks = Array(channels).fill(0), blocks = Array(Math.ceil(frames / (sampleRate / 10))).fill(0);
  // Centered FIR, continuous across analysis blocks; zero padding at file edges.
  // Always include real samples, so this estimate cannot under-read Sample Peak.
  const length = radius * 2, neighbourhood = new Float64Array(length * 2);
  for (let channel = 0; channel < channels; channel++) {
    let head = 0;
    for (let k = 0; k < length; k++) {
      const source = k - radius + 1, value = source >= 0 && source < frames ? readSample(channel, source) : 0;
      neighbourhood[k] = neighbourhood[k + length] = value;
    }
    for (let frame = 0; frame < frames; frame++) {
      let peak = Math.abs(neighbourhood[head + radius - 1]);
      for (const weights of kernels) {
        let interpolated = 0;
        for (let k = 0; k < weights.length; k++) interpolated += weights[k] * neighbourhood[head + k];
        if (!Number.isFinite(interpolated)) throw new Error("True Peakの計算範囲を超えています。");
        peak = Math.max(peak, Math.abs(interpolated));
      }
      channelPeaks[channel] = Math.max(channelPeaks[channel], peak);
      const block = Math.min(blocks.length - 1, Math.floor(frame * 10 / sampleRate));
      blocks[block] = Math.max(blocks[block], peak);
      if (frame % Math.max(1, sampleRate * 5) === 0) progress((channel + frame / frames) / channels);
      const next = frame + radius + 1, value = next < frames ? readSample(channel, next) : 0;
      neighbourhood[head] = neighbourhood[head + length] = value;
      head = (head + 1) % length;
    }
  }
  return { state: "measured", db: amplitudeDb(Math.max(...channelPeaks)), channelDb: channelPeaks.map(amplitudeDb), factor, filterTapsPerPhase: 32, timeline: blocks.map((peak, i) => ({ start: i / 10, end: Math.min(audio.duration, (i + 1) / 10), db: amplitudeDb(peak) })), method: "Blackman-windowed sinc / zero-padded edges / original sample rate" };
}
