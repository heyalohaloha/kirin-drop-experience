import React, { memo, useEffect, useId, useRef, useState } from 'react'
import { useStoneLightContext } from './host-hooks.mjs'
import { KIRIN_EYE_PETALS } from './kirinEyeModel.js'

// キリンの目（Kirin OS の印 / 2026-10-07）
// 保存済みの測定を、一つの目の模様にする。外周の筋＝時間に沿った LUFS-M（12 時から時計回り）、瞳＝LRA、
// 花輪＝帯域ごとの音の大きさ（上が低域）、色＝低域と高域の差、星＝LUFS-M がいちばん大きい時刻。
// 模様は測定が替わった時だけ描き直す。開く動きは CSS だけで一度きり（毎フレームの処理は持たない）。
// 再生中は、外周を回る小さな光が再生位置を、瞳の大きさが今の LUFS-M を示す（どちらも CSS の変数だけを替える）。
const TAU = Math.PI * 2
const R = 93
const OPEN_MS = 1100
const AMBER = [226, 172, 92]
const TEAL = [110, 200, 212]
const CREAM = [250, 243, 228]
const INK = [8, 12, 24]
const f2 = (value) => value.toFixed(2)
const clamp = (value, low, high) => Math.min(high, Math.max(low, value))
const rgb = (c, a = 1) => `rgb(${c[0]} ${c[1]} ${c[2]} / ${a})`
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))

function seeded(seed) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
}

// 瞳の奥の小さな星（どの目でも同じ並び）
const SKY = (() => {
  const random = seeded(2226)
  return Array.from({ length: 44 }, () => {
    const d = Math.sqrt(random()) * 94
    const a = random() * TAU
    return [Math.cos(a) * d, Math.sin(a) * d, 0.35 + random() ** 3 * 1.2, random() < 0.55]
  })
})()

function smoothClosed(points) {
  const n = points.length
  let d = `M${f2(points[0][0])} ${f2(points[0][1])}`
  for (let i = 0; i < n; i += 1) {
    const p0 = points[(i - 1 + n) % n]; const p1 = points[i]; const p2 = points[(i + 1) % n]; const p3 = points[(i + 2) % n]
    d += ` C${f2(p1[0] + (p2[0] - p0[0]) / 6)} ${f2(p1[1] + (p2[1] - p0[1]) / 6)} ${f2(p2[0] - (p3[0] - p1[0]) / 6)} ${f2(p2[1] - (p3[1] - p1[1]) / 6)} ${f2(p2[0])} ${f2(p2[1])}`
  }
  return `${d}Z`
}

const starPath = (s) => `M0 ${-s} Q0 0 ${s} 0 Q0 0 0 ${s} Q0 0 ${-s} 0 Q0 0 0 ${-s}Z`

export function kirinEyePupilRadius(lra) {
  return typeof lra === 'number' && Number.isFinite(lra) ? 15 + clamp(lra / 14, 0, 1) * 23 : 24
}

const fiberReach = (rIn, value) => (R - rIn) * (value === null ? 0.12 : 0.28 + 0.72 * clamp((value + 36) / 31, 0, 1))

// 星（LUFS-M がいちばん大きい時刻）の位置と、曲の中での割合（0〜1、12 時から時計回り）。
export function kirinEyeStar(reading) {
  const n = reading?.series?.length || 0
  if (!n || !Number.isInteger(reading.peakIndex)) return null
  const rIn = kirinEyePupilRadius(reading.lra) + 3.5
  const fraction = (reading.peakIndex + 0.5) / n
  const angle = fraction * TAU - Math.PI / 2
  const radius = rIn + fiberReach(rIn, reading.series[reading.peakIndex])
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, fraction }
}

const Iris = memo(function Iris({ reading, uid }) {
  const pupilR = kirinEyePupilRadius(reading.lra)
  const rIn = pupilR + 3.5
  const reachWarm = 0.08 + 0.92 * clamp((reading.warmth - 0.12) / 0.76, 0, 1)
  const o0 = rIn / 96
  const ot = (rIn + (R - rIn) * reachWarm) / 96
  let last = 0
  const stops = [[o0, mix(AMBER, CREAM, 0.45)], [ot - 0.07, AMBER], [ot + 0.07, TEAL], [1, mix(TEAL, INK, 0.3)]].map(([offset, color], index) => {
    last = clamp(Math.max(offset, last), 0, 1)
    return <stop key={index} offset={last.toFixed(3)} stopColor={rgb(color)} />
  })
  const n = reading.series.length
  const reach = (value) => fiberReach(rIn, value)
  const fibers = []
  for (let k = 0; k < n; k += 1) {
    const a = ((k + 0.5) / n) * TAU - Math.PI / 2
    const c = Math.cos(a); const s = Math.sin(a); const r2 = rIn + reach(reading.series[k])
    fibers.push(<line key={`f${k}`} x1={f2(c * rIn)} y1={f2(s * rIn)} x2={f2(c * r2)} y2={f2(s * r2)} pathLength="1" strokeWidth="1.7" style={{ '--d': `${Math.round((k * OPEN_MS) / n)}ms` }} />)
    const b = a + Math.PI / n
    const next = reading.series[(k + 1) % n]
    const between = reading.series[k] === null || next === null ? null : (reading.series[k] + next) / 2
    const rb = rIn + reach(between) * 0.78
    fibers.push(<line key={`t${k}`} data-thin x1={f2(Math.cos(b) * (rIn + 2))} y1={f2(Math.sin(b) * (rIn + 2))} x2={f2(Math.cos(b) * rb)} y2={f2(Math.sin(b) * rb)} pathLength="1" strokeWidth="0.8" style={{ '--d': `${Math.round(((k + 0.5) * OPEN_MS) / n)}ms` }} />)
  }
  const petals = reading.petals
  const petalAt = (q) => {
    if (!petals) return 0.5
    const i = Math.floor(q); const t = q - i
    return petals[Math.min(KIRIN_EYE_PETALS - 1, i)] * (1 - t) + petals[Math.min(KIRIN_EYE_PETALS - 1, i + 1)] * t
  }
  const collar = []
  for (let j = 0; j < 96; j += 1) {
    const t = j / 96
    const q = (KIRIN_EYE_PETALS - 1) * (1 - Math.abs(1 - 2 * t))
    const a = t * TAU - Math.PI / 2
    const r = pupilR + 7 + petalAt(q) * 17 + Math.cos(t * TAU * 16) * 1.4
    collar.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  const star = kirinEyeStar(reading)
  return <g data-kirin-eye-iris>
    <defs><radialGradient id={`${uid}-f`} gradientUnits="userSpaceOnUse" cx="0" cy="0" r="96">{stops}</radialGradient></defs>
    <circle data-kirin-eye-base r={R} fill={`url(#${uid}-f)`} fillOpacity="0.26" />
    <g data-kirin-eye-fibers stroke={`url(#${uid}-f)`}>{fibers}</g>
    <path data-kirin-eye-collar d={smoothClosed(collar)} pathLength="1" stroke={rgb(mix(AMBER, CREAM, 0.55), 0.95)} fill={rgb(AMBER, 0.24)} />
    <circle data-kirin-eye-limbus r={R + 2.2} />
    <g data-kirin-eye-pupil-live><circle data-kirin-eye-pupil r={f2(pupilR)} fill={`url(#${uid}-p)`} /></g>
    {star ? <g transform={`translate(${f2(star.x)} ${f2(star.y)})`}><path data-kirin-eye-star d={starPath(7.5)} /></g> : null}
  </g>
})

const Lens = memo(function Lens({ uid }) {
  return <>
    <defs>
      <linearGradient id={`${uid}-b`} gradientUnits="userSpaceOnUse" x1="-60" y1="-106" x2="60" y2="106"><stop offset="0" stopColor="#f4dca6" /><stop offset=".5" stopColor="#b8914b" /><stop offset="1" stopColor="#6e5222" /></linearGradient>
      <radialGradient id={`${uid}-l`} cx=".4" cy=".34" r=".74"><stop offset="0" stopColor="#26314f" /><stop offset=".5" stopColor="#121a31" /><stop offset="1" stopColor="#060912" /></radialGradient>
      <radialGradient id={`${uid}-s`} cx=".5" cy=".5" r=".5"><stop offset=".76" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".5" /></radialGradient>
      <radialGradient id={`${uid}-p`} cx=".45" cy=".4" r=".62"><stop offset="0" stopColor="#0c111d" /><stop offset="1" stopColor="#010204" /></radialGradient>
      <radialGradient id={`${uid}-c`} cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#fffaf0" stopOpacity=".78" /><stop offset="1" stopColor="#fffaf0" stopOpacity="0" /></radialGradient>
    </defs>
    <circle data-kirin-eye-bezel r="108.6" stroke={`url(#${uid}-b)`} />
    <circle data-kirin-eye-lens r="106" fill={`url(#${uid}-l)`} />
    <g data-kirin-eye-sky>{SKY.map(([x, y, r, warm], index) => <circle key={index} cx={f2(x)} cy={f2(y)} r={f2(r)} fill={rgb(warm ? AMBER : TEAL, 0.9)} />)}</g>
  </>
})

// 光の来る向き（白い石の光と同じ）。石の外では左上から。
function lightDirection(light) {
  const sx = Number(light?.vars?.['--sx'])
  const sy = Number(light?.vars?.['--sy'])
  const n = Math.hypot(sx, sy)
  return Number.isFinite(n) && n > 0.01 ? [sx / n, sy / n] : [0.32, 0.95]
}

export default function KirinEye({ reading, label, title, onActivate, position = null, loudness = null, size = 104 }) {
  const uid = `kirin-eye-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const light = useStoneLightContext()
  const [ux, uy] = lightDirection(light)
  const deg = (Math.atan2(-uy, -ux) * 180) / Math.PI + 90
  const live = typeof position === 'number' && Number.isFinite(position)
  const pupil = typeof loudness === 'number' && Number.isFinite(loudness) ? 1.06 - 0.22 * clamp((loudness + 26) / 18, 0, 1) : 1
  const angle = live ? clamp(position, 0, 1) * TAU - Math.PI / 2 : 0
  // 再生の光が星（いちばん大きい所）を通り過ぎた時だけ、星が一度瞬く（2026-10-08）。
  const star = reading ? kirinEyeStar(reading) : null
  const lastPosition = useRef(null)
  const [twinkle, setTwinkle] = useState(0)
  useEffect(() => {
    const previous = lastPosition.current
    lastPosition.current = live ? position : null
    if (!live || !star || previous === null) return
    if (previous < star.fraction && position >= star.fraction && position - previous < 0.08) setTwinkle((count) => count + 1)
  }, [live, position, star?.fraction])
  const style = { width: size, height: size, '--kirin-eye-pupil-live': pupil.toFixed(3) }
  const svg = <svg data-kirin-eye data-kirin-eye-open={reading ? 'true' : 'false'} data-kirin-eye-live={live ? 'true' : undefined} viewBox="-112 -112 224 224" style={style}
    role={onActivate ? undefined : 'img'} aria-label={onActivate ? undefined : label} aria-hidden={onActivate ? 'true' : undefined} focusable="false">
    <Lens uid={uid} />
    {reading ? <Iris reading={reading} uid={uid} /> : null}
    {twinkle && star ? <g key={twinkle} transform={`translate(${f2(star.x)} ${f2(star.y)})`}><path data-kirin-eye-twinkle d={starPath(7.5)} /></g> : null}
    {live ? <g data-kirin-eye-position transform={`translate(${f2(Math.cos(angle) * (R + 2.2))} ${f2(Math.sin(angle) * (R + 2.2))})`}><circle r="5.5" data-glow /><circle r="2.2" /></g> : null}
    <circle data-kirin-eye-shade r="106" fill={`url(#${uid}-s)`} />
    <g data-kirin-eye-catch transform={`translate(${f2(-ux * 50)} ${f2(-uy * 50)}) rotate(${deg.toFixed(1)})`}>
      <ellipse rx="15" ry="8.5" fill={`url(#${uid}-c)`} /><circle data-kirin-eye-spark r="2.3" />
    </g>
  </svg>
  if (!onActivate) return <span data-kirin-eye-frame title={title}>{svg}</span>
  return <button type="button" data-kirin-eye-frame title={title} aria-label={label} onClick={onActivate}>{svg}</button>
}
