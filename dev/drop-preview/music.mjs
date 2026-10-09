// Independent, uncalibrated Web music candidates. No private engine or model.
// Concepts: Ellis (2007) onset/tempo/path; AudioLabs FMP chroma/templates.

export const MUSIC_METHOD = "hp-music-candidates-v2";
export const CHORD_KINDS = Object.freeze([
  ["", [0, 4, 7]], ["m", [0, 3, 7]], ["dim", [0, 3, 6]], ["aug", [0, 4, 8]],
  ["sus2", [0, 2, 7]], ["sus4", [0, 5, 7]], ["7", [0, 4, 7, 10]], ["maj7", [0, 4, 7, 11]], ["m7", [0, 3, 7, 10]],
  ["dim7", [0, 3, 6, 9]], ["m7♭5", [0, 3, 6, 10]], ["m(maj7)", [0, 3, 7, 11]],
  ["6", [0, 4, 7, 9]], ["m6", [0, 3, 7, 9]], ["add9", [0, 4, 7, 2]], ["m(add9)", [0, 3, 7, 2]],
  ["9", [0, 4, 7, 10, 2]], ["maj9", [0, 4, 7, 11, 2]], ["m9", [0, 3, 7, 10, 2]],
  ["11", [0, 4, 7, 10, 2, 5]], ["m11", [0, 3, 7, 10, 2, 5]],
  ["13", [0, 4, 7, 10, 2, 5, 9]], ["m13", [0, 3, 7, 10, 2, 5, 9]],
]);
const NOTES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const mod = (value, base) => ((value % base) + base) % base;
const quantile = (values, q) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * q)];
};

// Music frontend only. Keep this small, HP-owned filter independent from the
// retired JavaScript level estimator, which is intentionally not served.
function biquad({ b, a }) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (value) => {
    const result = b[0] * value + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    x2 = x1; x1 = value; y2 = y1; y1 = result;
    return result;
  };
}

function lowPass(rate, cutoff, q) {
  const omega = 2 * Math.PI * cutoff / rate, cosine = Math.cos(omega), alpha = Math.sin(omega) / (2 * q), a0 = 1 + alpha;
  return biquad({ b: [(1 - cosine) / (2 * a0), (1 - cosine) / a0, (1 - cosine) / (2 * a0)], a: [1, -2 * cosine / a0, (1 - alpha) / a0] });
}

export function musicAudio(audio) {
  const rate = Math.min(12000, audio.sampleRate), frames = Math.ceil(audio.frames * rate / audio.sampleRate);
  const samples = Array.from({ length: audio.channels }, () => new Float32Array(frames));
  // Music ONLY: 6th-order low-pass then time interpolation to <=12 kHz.
  // Level/True Peak never use this frontend. Channels stay separate to avoid
  // cancelling opposite-polarity stereo, and all timestamps stay source seconds.
  for (let channel = 0; channel < audio.channels; channel++) {
    const filters = [.517638, .707107, 1.931852].map((q) => lowPass(audio.sampleRate, Math.min(rate * .4, audio.sampleRate * .4), q));
    let previous = 0, output = 0;
    for (let frame = 0; frame < audio.frames; frame++) {
      let value = audio.readSample(channel, frame);
      for (const filter of filters) value = filter(value);
      if (!Number.isFinite(value) || Math.abs(value) > 3.4e38) throw new Error("音楽解析の計算範囲を超えています。");
      while (output < frames && output * audio.sampleRate / rate <= frame) {
        const fraction = Math.max(0, Math.min(1, output * audio.sampleRate / rate - (frame - 1)));
        samples[channel][output++] = previous + (value - previous) * fraction;
      }
      previous = value;
    }
    while (output < frames) samples[channel][output++] = previous;
  }
  return { samples, rate, frames, duration: audio.duration };
}

export function spectrum(samples, start, size) {
  const real = new Float64Array(size), imaginary = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    const position = start + i;
    real[i] = (position < 0 || position >= samples.length ? 0 : samples[position]) * (.5 - .5 * Math.cos(2 * Math.PI * i / (size - 1)));
  }
  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [real[i], real[j]] = [real[j], real[i]];
  }
  for (let length = 2; length <= size; length *= 2) {
    const angle = -2 * Math.PI / length, baseR = Math.cos(angle), baseI = Math.sin(angle);
    for (let start = 0; start < size; start += length) {
      let wr = 1, wi = 0;
      for (let j = 0; j < length / 2; j++) {
        const left = start + j, right = left + length / 2;
        const r = real[right] * wr - imaginary[right] * wi, im = real[right] * wi + imaginary[right] * wr;
        real[right] = real[left] - r; imaginary[right] = imaginary[left] - im;
        real[left] += r; imaginary[left] += im;
        const nextR = wr * baseR - wi * baseI; wi = wr * baseI + wi * baseR; wr = nextR;
      }
    }
  }
  return Float64Array.from({ length: size / 2 }, (_, i) => Math.hypot(real[i], imaginary[i]) / size);
}

function summedSpectrum(audio, center, size) {
  const result = new Float64Array(size / 2);
  for (const channel of audio.samples) {
    const bins = spectrum(channel, Math.round(center - size / 2), size);
    for (let i = 0; i < bins.length; i++) result[i] += bins[i] / audio.samples.length;
  }
  return result;
}

function tempoFromPath(beats, initialPeriod) {
  const pulse = [0];
  for (let i = 1; i < beats.length; i++) pulse.push(pulse[i - 1] + Math.max(1, Math.round((beats[i] - beats[i - 1]) / initialPeriod)));
  const meanPulse = pulse.reduce((sum, value) => sum + value, 0) / pulse.length;
  const meanTime = beats.reduce((sum, value) => sum + value, 0) / beats.length;
  let cross = 0, power = 0;
  for (let i = 0; i < beats.length; i++) { cross += (pulse[i] - meanPulse) * (beats[i] - meanTime); power += (pulse[i] - meanPulse) ** 2; }
  const period = cross / power;
  // Refine the chosen constant-tempo hypothesis using actual evidence over the
  // whole path. Do not replace the onsets with fitted/grid positions.
  if (!(period > 0) || Math.abs(period / initialPeriod - 1) > .05) return 60 / initialPeriod;
  return 60 / period;
}

export function rhythmCandidates(audio) {
  const hop = Math.round(audio.rate / 100), size = 512, flux = [], times = [];
  let previous = new Float64Array(size / 2), maximumEnergy = 0;
  for (let center = 0; center < audio.frames; center += hop) {
    const current = summedSpectrum(audio, center, size);
    let change = 0, energy = 0;
    for (let bin = Math.ceil(70 * size / audio.rate); bin < current.length; bin++) {
      change += Math.max(0, current[bin] - previous[bin]); energy += current[bin];
    }
    flux.push(change); times.push(center / audio.rate); maximumEnergy = Math.max(maximumEnergy, energy); previous = current;
  }
  const maximum = Math.max(0, ...flux.slice(0, 1000), ...[quantile(flux, .999)]);
  const normalized = flux.map((value) => maximum ? Math.min(3, value / maximum) : 0);
  const threshold = Math.max(.08, quantile(normalized, .5) * 5, quantile(normalized, .9) * .3);
  const peaks = [];
  for (let i = 2; i < normalized.length - 2; i++) {
    if (normalized[i] < threshold || normalized[i] < normalized[i - 1] || normalized[i] <= normalized[i + 1]) continue;
    if (peaks.length && times[i] - peaks.at(-1).time < .08) {
      if (normalized[i] > peaks.at(-1).strength) peaks[peaks.length - 1] = { time: times[i], strength: normalized[i] };
    } else peaks.push({ time: times[i], strength: normalized[i] });
  }
  const unknown = (reason) => ({ state: "unknown", reason, candidates: [], onsets: peaks, meter: null, downbeats: [], method: MUSIC_METHOD });
  if (maximumEnergy < 1e-5 || maximum < maximumEnergy * .01 || peaks.length < 4 || audio.duration < 2) return unknown("拍を支える繰り返しを確認できません。");
  const correlations = [];
  for (let lag = Math.floor(60 / 200 * audio.rate / hop); lag <= Math.ceil(60 / 40 * audio.rate / hop); lag++) {
    let cross = 0, energyA = 0, energyB = 0;
    for (let i = lag; i < normalized.length; i++) { cross += normalized[i] * normalized[i - lag]; energyA += normalized[i] ** 2; energyB += normalized[i - lag] ** 2; }
    const agreement = energyA && energyB ? cross / Math.sqrt(energyA * energyB) : 0, bpm = 60 * audio.rate / (hop * lag);
    // Gentle rank prior, not a default BPM, and never a calibrated probability.
    const rank = agreement * (.9 + .1 * Math.exp(-.5 * (Math.log2(bpm / 110)) ** 2));
    correlations.push({ bpm, agreement, rank });
  }
  const maxima = correlations.filter((row, i) => (!i || row.agreement >= correlations[i - 1].agreement) && (i === correlations.length - 1 || row.agreement > correlations[i + 1].agreement));
  maxima.sort((a, b) => b.rank - a.rank);
  const candidates = [];
  for (const tempo of maxima) {
    if (tempo.agreement < .2 || candidates.some((candidate) => Math.abs(candidate.bpm - tempo.bpm) < 3)) continue;
    const period = 60 / tempo.bpm, scores = [], parents = [], counts = [];
    for (let i = 0; i < peaks.length; i++) {
      scores[i] = peaks[i].strength; parents[i] = -1; counts[i] = 1;
      for (let j = i - 1; j >= 0 && peaks[i].time - peaks[j].time <= period * 4.2; j--) {
        const gap = (peaks[i].time - peaks[j].time) / period, multiple = Math.round(gap);
        if (multiple < 1 || multiple > 4) continue;
        const penalty = 8 * Math.log(gap / multiple) ** 2 + .35 * (multiple - 1);
        const score = scores[j] + peaks[i].strength - penalty;
        if (score > scores[i]) { scores[i] = score; parents[i] = j; counts[i] = counts[j] + 1; }
      }
    }
    let end = scores.indexOf(Math.max(...scores)), beats = [];
    while (end >= 0) { beats.push(peaks[end].time); end = parents[end]; }
    beats.reverse();
    // Only actual onset evidence in this path: no evenly spaced BPM grid.
    if (beats.length >= 4 && beats.at(-1) - beats[0] >= period * 3) candidates.push({ bpm: tempoFromPath(beats, period), agreement: tempo.agreement, beats, calibratedReliability: null });
    if (candidates.length === 3) break;
  }
  if (!candidates.length) return unknown("安定した拍の候補を確認できません。");
  return { state: "candidate", candidates, onsets: peaks, meter: null, downbeats: [], calibratedReliability: null, reason: "全曲の一定テンポ候補。倍・半分のテンポ、変拍子、テンポ変化は耳で確認してください。", method: MUSIC_METHOD };
}

export function chordHypotheses(chroma) {
  const norm = Math.hypot(...chroma), candidates = [];
  if (!norm) return [];
  for (let root = 0; root < 12; root++) for (const [suffix, intervals] of CHORD_KINDS) {
    let dot = 0, normTemplate = 0;
    intervals.forEach((interval, i) => { const weight = i < 3 ? 1 : i === 3 ? .8 : .65; dot += chroma[(root + interval) % 12] * weight; normTemplate += weight ** 2; });
    candidates.push({ symbol: NOTES[root] + suffix, root, suffix, agreement: dot / (norm * Math.sqrt(normTemplate)), calibratedReliability: null });
  }
  return candidates.sort((a, b) => b.agreement - a.agreement).slice(0, 3);
}

export function harmonyCandidates(audio) {
  const size = 4096, step = .25, observations = [];
  for (let start = 0; start < audio.duration; start += step) {
    const end = Math.min(audio.duration, start + step), center = (start + end) / 2;
    const bins = summedSpectrum(audio, center * audio.rate, size), chroma = Array(12).fill(0);
    const firstBin = Math.ceil(55 * size / audio.rate), lastBin = Math.min(bins.length - 1, Math.floor(3500 * size / audio.rate));
    let energy = 0, logPower = 0, totalPower = 0;
    for (let bin = firstBin; bin < lastBin; bin++) { const power = bins[bin] ** 2; logPower += Math.log(Math.max(1e-30, power)); totalPower += power; }
    const spectralFlatness = totalPower > 1e-20 ? Math.exp(logPower / (lastBin - firstBin)) / (totalPower / (lastBin - firstBin)) : 1;
    const fundamentals = [];
    for (let bin = firstBin; bin < lastBin; bin++) {
      if (bins[bin] < bins[bin - 1] || bins[bin] <= bins[bin + 1] || bins[bin] < 1e-6) continue;
      const left = Math.log(Math.max(1e-20, bins[bin - 1])), middle = Math.log(Math.max(1e-20, bins[bin])), right = Math.log(Math.max(1e-20, bins[bin + 1]));
      const shift = Math.max(-.5, Math.min(.5, .5 * (left - right) / (left - 2 * middle + right || 1)));
      const frequency = (bin + shift) * audio.rate / size;
      // A weak upper partial of an already supported lower tone must not invent
      // a third/seventh. This is a conservative frontend heuristic, not source
      // separation: louder independent upper notes remain possible evidence.
      const partial = fundamentals.some((lower) => {
        const harmonic = Math.round(frequency / lower.frequency);
        return harmonic >= 2 && harmonic <= 8 && Math.abs(frequency / lower.frequency - harmonic) < harmonic * .012 && bins[bin] <= lower.amplitude * 1.4 / harmonic;
      });
      if (partial) continue;
      const midi = 69 + 12 * Math.log2(frequency / 440), nearest = Math.round(midi);
      if (Math.abs(midi - nearest) > .45) continue;
      const value = bins[bin] * (1 - Math.abs(midi - nearest));
      fundamentals.push({ frequency, amplitude: bins[bin] });
      chroma[mod(nearest, 12)] += value; energy += value;
    }
    const candidates = energy > 1e-5 ? chordHypotheses(chroma) : [], maximum = Math.max(...chroma);
    const supportedNotes = chroma.filter((value) => value > maximum * .18).length;
    // Dense/broadband evidence also correlates with large chord templates. Never
    // call that a chord merely because a cosine score is high. The fences are
    // conservative, uncalibrated rejection rules; they are not probabilities.
    const hasTonalEvidence = spectralFlatness < .45 && supportedNotes >= 3 && supportedNotes <= 7;
    const symbol = hasTonalEvidence && candidates[0]?.agreement >= .7 ? candidates[0].symbol : null;
    observations.push({ start, end, symbol, state: symbol ? "candidate" : "unknown", candidates: symbol ? candidates : [], chroma, spectralFlatness, supportedNotes, calibratedReliability: null });
  }
  const regions = [];
  for (const row of observations) {
    const last = regions.at(-1);
    if (last && last.symbol === row.symbol) { last.end = row.end; last.observations++; }
    else regions.push({ ...row, observations: 1 });
  }
  return { state: regions.some((row) => row.symbol) ? "candidate" : "unknown", regions, method: MUSIC_METHOD, vocabulary: CHORD_KINDS.map(([suffix]) => suffix || "major"), calibratedReliability: null, reason: "12音のクロマと理論テンプレートによる候補。転回・ベース音・調・テンションの実音検出は未検証。コードなしと判定不能も区別できません。" };
}

export function analyzeMusic(audio) {
  const frontend = musicAudio(audio);
  return { rhythm: rhythmCandidates(frontend), harmony: harmonyCandidates(frontend), musicFrontend: { sampleRate: frontend.rate, channelPolicy: "independent-channel-magnitude", cutoffHz: frontend.rate * .4 } };
}
