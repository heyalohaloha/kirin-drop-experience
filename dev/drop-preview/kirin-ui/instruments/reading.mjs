import { kirinEyeSeries, kirinEyeTone } from './kirinEyeModel.js';
// Legacy display centres from the published Hypha BARK_CENTER_HZ table, as used by OS.
const hz = [50, 150, 250, 350, 450, 570, 700, 840, 1000, 1170, 1370, 1600, 1850, 2150, 2500, 2900, 3400, 4000, 4800, 5800];
export function eyeReading(result) {
  const rows = result?.loudness?.timeline ?? [];
  const series = kirinEyeSeries(rows.map(row => row.end * 1000), rows.map(row => row.momentary));
  if (!series) return null;
  const tone = result?.psycho?.state === 'measured' ? kirinEyeTone(result.psycho.specific.map((value, band) => ({ value, hz: hz[band] }))) : null;
  return { ...series, lra: Number.isFinite(result.loudness.lra) ? Math.max(0, result.loudness.lra) : null, petals: tone?.petals ?? null, warmth: tone?.warmth ?? .5 };
}
export function instrumentPosition(result, seconds) {
  if (!result) return { level: null, position: null, loudness: null };
  const rows = result.timeline.filter(row => row.end <= seconds && row.end > seconds - .4);
  const row = rows.at(-1);
  const peak = channel => {
    const values = rows.map(item => item.peakDb[channel]).filter(Number.isFinite);
    return values.length ? Math.max(...values) : null;
  };
  const right = result.channels === 1 ? 0 : 1;
  return { level: { rectifiedLeftDbfs: row?.rectifiedDb?.[0] ?? null, rectifiedRightDbfs: row?.rectifiedDb?.[right] ?? null, peakLeftDbfs: peak(0), peakRightDbfs: peak(right) }, position: Math.max(0, Math.min(1, seconds / result.duration)), loudness: result.loudness?.timeline.findLast(item => item.end <= seconds)?.momentary ?? null };
}
