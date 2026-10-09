
// キリンの目の読み（2026-10-07）
// 保存済みの測定から、目の模様に使う数だけを取り出す。価値の判断はしない（R-22）。
// 外周の筋＝時間に沿った LUFS-M（12 時から時計回り）、瞳＝LRA、花輪＝Bark 帯域ごとの音の大きさ（上が低域、下が高域）、
// 色＝低域と高域の差（低域が厚いほど琥珀が外まで広がる）、星＝LUFS-M がいちばん大きい時刻。
// 帯域は Bark の平均（数万個の足し算）から取る。細かい帯域の釣り合いの展開は 1 回 0.1〜0.2 秒かかるので使わない。
export const KIRIN_EYE_FIBERS = 96
export const KIRIN_EYE_PETALS = 9

const clamp = (value, low, high) => Math.min(high, Math.max(low, value))
const finite = (value) => typeof value === 'number' && Number.isFinite(value)

function mean(values) {
  let sum = 0
  let count = 0
  for (const value of values) {
    if (!finite(value)) continue
    sum += value
    count += 1
  }
  return count ? sum / count : null
}

function median(values) {
  const sorted = values.filter(finite).sort((a, b) => a - b)
  if (!sorted.length) return null
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

// 最初と最後の測定の間を 96 の区間に分け、区間ごとのいちばん大きい LUFS-M を取る。値が 8 個に満たない時は目を開かない。
export function kirinEyeSeries(times, values, count = KIRIN_EYE_FIBERS) {
  if (!Array.isArray(times) || !Array.isArray(values)) return null
  let start = Infinity
  let end = 0
  for (let index = 0; index < values.length; index += 1) {
    if (!finite(values[index]) || !finite(times[index]) || times[index] < 0) continue
    start = Math.min(start, times[index])
    end = Math.max(end, times[index])
  }
  if (!(end > start)) return null
  const series = Array(count).fill(null)
  let measured = 0
  let peakMs = null
  let peakValue = -Infinity
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    const at = times[index]
    if (!finite(value) || !finite(at) || at < 0) continue
    const slot = Math.min(count - 1, Math.floor(((at - start) / (end - start)) * count))
    if (series[slot] === null || value > series[slot]) series[slot] = value
    if (value > peakValue) { peakValue = value; peakMs = at }
    measured += 1
  }
  if (measured < 8) return null
  let peakIndex = 0
  for (let slot = 1; slot < count; slot += 1) {
    if (series[slot] !== null && (series[peakIndex] === null || series[slot] > series[peakIndex])) peakIndex = slot
  }
  return { series, peakIndex, peakMs, peakValue, durationMs: end }
}

// Bark ごとの平均（sone/Bark）から、花輪の 9 枚と色の温度を作る。
// 値は 10·log2(sone)（音の大きさが倍で +10）にしてから比べる。手元の保存済みの曲では低域と高域の差が 18〜40 に入る。
export function kirinEyeTone(barkMeans) {
  const bands = (Array.isArray(barkMeans) ? barkMeans : [])
    .map((band) => ({ hz: band?.hz, level: finite(band?.value) && band.value > 0 ? 10 * Math.log2(band.value) : null }))
  if (bands.filter((band) => band.level !== null).length < 5) return null
  const groups = Array.from({ length: KIRIN_EYE_PETALS }, (_, group) => mean(
    bands.filter((_, index) => Math.min(KIRIN_EYE_PETALS - 1, Math.floor((index * KIRIN_EYE_PETALS) / bands.length)) === group).map((band) => band.level),
  ))
  const center = median(groups)
  const petals = groups.map((level) => (level === null || center === null ? 0.04 : clamp(0.5 + (level - center) / 30, 0.04, 1)))
  const low = mean(bands.filter((band) => finite(band.hz) && band.hz < 250).map((band) => band.level))
  const high = mean(bands.filter((band) => finite(band.hz) && band.hz > 4000).map((band) => band.level))
  const warmth = low === null || high === null ? 0.5 : clamp((low - high - 14) / 22, 0, 1)
  return { petals, warmth }
}

