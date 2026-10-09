import React, { memo, useCallback, useRef, useState } from 'react'
import { useTranslation } from './host-hooks.mjs'
import { KIRIN_VU_LAMP_DBFS, KIRIN_VU_REFERENCES, kirinVuLin as lin, kirinVuSwing } from './kirinVuModel.js'

export { KIRIN_VU_REFERENCES, kirinVuSwing }

// 石の VU メーター（左右 / 2026-10-07）
// 入力は再生中の音の直近 100 ms の整流平均（解析の Worker が 100 ms ごとに出す）。
// 針の速さは本物の VU に合わせ、CSS の遷移で付ける（約 300 ms で 99%、わずかに行き過ぎて戻る）。毎フレームの処理は持たない。
// 0 VU は、その dBFS の正弦波（AES17：正弦波の頂点がその値）を入れた時の振れ。
// 感度は実機の VU の Sensitivity のつまみと同じ 12 / 14 / 16 / 18 / 20（0 VU ＝ −12〜−20 dBFS）。選んだ値は覚えておく。
// 頂点が −1 dBFS 以上になった時だけ、右上の小さな灯がともる。
// HP体験は通常モードのみ。
// つまみの目盛りの角度（実機と同じく、12 が左下、16 が真上、20 が右下）。
const KNOB_ANGLES = [-110, -55, 0, 55, 110]
const VU = { cx: 64, cy: 72, R: 46, span: 44, peg: 47 }
const clamp = (value, low, high) => Math.min(high, Math.max(low, value))
const f2 = (value) => value.toFixed(2)

// 振れ（0 VU で 1）から針の角度へ。目盛りは振れに比例して刻む（本物の VU と同じ）。
export function kirinVuAngle(swing) {
  return clamp(-VU.span + ((swing - lin(-20)) / (lin(3) - lin(-20))) * VU.span * 2, -VU.peg, VU.peg + 2)
}


const point = (r, deg) => [VU.cx + r * Math.sin((deg * Math.PI) / 180), VU.cy - r * Math.cos((deg * Math.PI) / 180)]

function engraved(key, Tag, attrs, kind, text) {
  return [
    <Tag key={`${key}h`} {...attrs} data-vu-hl data-vu-part={kind} transform="translate(.45 .65)">{text}</Tag>,
    <Tag key={key} {...attrs} data-vu-part={kind}>{text}</Tag>,
  ]
}

const Face = memo(function Face({ channel, referenceLabel }) {
  const arc = (a0, a1) => {
    const [x0, y0] = point(VU.R, a0); const [x1, y1] = point(VU.R, a1)
    return `M${f2(x0)} ${f2(y0)} A${VU.R} ${VU.R} 0 0 1 ${f2(x1)} ${f2(y1)}`
  }
  const angle = (db) => kirinVuAngle(lin(db))
  const parts = [
    ...engraved('arc', 'path', { d: arc(angle(-20), angle(0)) }, 'scale'),
    ...engraved('hot', 'path', { d: arc(angle(0), angle(3)) }, 'scale-hot'),
  ]
  for (const db of [-20, -10, -7, -5, -3, -2, -1, 0, 1, 2, 3]) {
    const a = angle(db); const hot = db >= 0; const major = [-20, -10, -5, 0, 3].includes(db)
    const [x1, y1] = point(VU.R, a); const [x2, y2] = point(VU.R + (major ? 5.5 : 3.5), a)
    parts.push(...engraved(`t${db}`, 'line', { x1: f2(x1), y1: f2(y1), x2: f2(x2), y2: f2(y2) }, hot ? 'tick-hot' : 'tick'))
    if (major) {
      const [tx, ty] = point(VU.R + 11, a)
      parts.push(...engraved(`n${db}`, 'text', { x: f2(tx), y: f2(ty + 2.2) }, hot ? 'number-hot' : 'number', db > 0 ? `+${db}` : String(db)))
    }
  }
  parts.push(...engraved('vu', 'text', { x: 64, y: 49 }, 'label', 'VU'))
  parts.push(...engraved('ch', 'text', { x: 9, y: 55 }, 'channel', channel))
  parts.push(...engraved('ref', 'text', { x: 119, y: 55 }, 'reference', referenceLabel))
  return <svg viewBox="0 0 128 60" aria-hidden="true" focusable="false">{parts}</svg>
})

function Meter({ channel, rectifiedDbfs, peakDbfs, reference, referenceLabel }) {
  const angle = kirinVuAngle(kirinVuSwing(rectifiedDbfs, reference))
  const lamp = typeof peakDbfs === 'number' && peakDbfs >= KIRIN_VU_LAMP_DBFS
  return <span data-kirin-vu-meter style={{ '--kirin-vu-angle': `${angle.toFixed(2)}deg` }}>
    <Face channel={channel} referenceLabel={referenceLabel} />
    <i data-kirin-vu-lamp={lamp ? 'on' : 'off'} />
    <i data-kirin-vu-needle-shadow />
    <i data-kirin-vu-needle />
  </span>
}

// 感度のつまみ。目盛りの数字を押すとその値へ、つまみを押すと一つ右へ（20 の次は 12）。矢印のキーでも回る。
function SensitivityKnob({ reference, onChange, caption = null }) {
  const { t } = useTranslation()
  const index = Math.max(0, KIRIN_VU_REFERENCES.indexOf(reference))
  const marks = useRef([])
  const move = (next) => {
    const clamped = Math.min(KIRIN_VU_REFERENCES.length - 1, Math.max(0, next))
    onChange(KIRIN_VU_REFERENCES[clamped])
    marks.current[clamped]?.focus()
  }
  const onKeyDown = (event) => {
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key]
    if (event.key === 'Home') { event.preventDefault(); move(0) }
    else if (event.key === 'End') { event.preventDefault(); move(KIRIN_VU_REFERENCES.length - 1) }
    else if (step) { event.preventDefault(); move(index + step) }
  }
  return <div data-kirin-vu-sensitivity role="radiogroup" aria-label={t('VU sensitivity')} onKeyDown={onKeyDown}>
    <span data-kirin-vu-sensitivity-label aria-hidden="true">{t('Sensitivity')}</span>
    {KIRIN_VU_REFERENCES.map((value, markIndex) => {
      const a = (KNOB_ANGLES[markIndex] * Math.PI) / 180
      return <button key={value} type="button" role="radio" ref={(node) => { marks.current[markIndex] = node }}
        aria-checked={value === reference} tabIndex={value === reference ? 0 : -1}
        aria-label={t('0 VU = sine at {{reference}} dBFS', { reference: `−${Math.abs(value)}` })}
        data-kirin-vu-sensitivity-mark style={{ left: `calc(50% + ${(Math.sin(a) * 25).toFixed(1)}px)`, top: `calc(58% - ${(Math.cos(a) * 21).toFixed(1)}px)` }}
        onClick={() => onChange(value)}>{Math.abs(value)}</button>
    })}
    <button type="button" data-kirin-vu-knob aria-hidden="true" tabIndex={-1} style={{ '--kirin-vu-knob-angle': `${KNOB_ANGLES[index]}deg` }}
      onClick={() => onChange(KIRIN_VU_REFERENCES[(index + 1) % KIRIN_VU_REFERENCES.length])}><i /></button>
    {caption ? <span data-kirin-vu-sensitivity-caption aria-hidden="true">{caption}</span> : null}
  </div>
}

export default function KirinVuPair({ level }) {
  const { t } = useTranslation()
  const [reference, setReference] = useState(-18)
  const referenceLabel = `${reference < 0 ? '−' : ''}${Math.abs(reference)}`
  const choose = useCallback((next) => {
    setReference(next)
  }, [])
  const label = t('VU meter (0 VU = sine at {{reference}} dBFS)', { reference: referenceLabel })
  return <div data-kirin-vu-pair>
    <span data-kirin-vu-meters role="img" aria-label={label} title={label}>
      <Meter channel="L" rectifiedDbfs={level?.rectifiedLeftDbfs} peakDbfs={level?.peakLeftDbfs} reference={reference} referenceLabel={referenceLabel} />
      <Meter channel="R" rectifiedDbfs={level?.rectifiedRightDbfs} peakDbfs={level?.peakRightDbfs} reference={reference} referenceLabel={referenceLabel} />
    </span>
    <SensitivityKnob reference={reference} onChange={choose} />
  </div>
}
