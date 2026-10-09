// VU の数の決まり（石の VU とジャングルの VU で共通 / 2026-10-08）。
// 0 VU は、その dBFS の正弦波（AES17：正弦波の頂点がその値）を入れた時の振れ。目盛りは振れに比例して刻む（本物の VU と同じ）。
export const KIRIN_VU_REFERENCES = [-12, -14, -16, -18, -20]
export const KIRIN_VU_LAMP_DBFS = -1
const SINE_RECTIFIED_PER_PEAK = 2 / Math.PI

export const kirinVuLin = (db) => 10 ** (db / 20)
const clamp = (value, low, high) => Math.min(high, Math.max(low, value))

// 整流平均（dBFS）から振れへ。0 VU で 1、音が無い時は 0。
export function kirinVuSwing(rectifiedDbfs, referenceDbfs) {
  if (typeof rectifiedDbfs !== 'number' || !Number.isFinite(rectifiedDbfs)) return 0
  return kirinVuLin(rectifiedDbfs) / (SINE_RECTIFIED_PER_PEAK * kirinVuLin(referenceDbfs))
}

// 振れを目盛りの上の位置へ（−20 VU で 0、+3 VU で 1）。針は両端の止めで少しだけはみ出して止まる。
export function kirinVuPosition(swing) {
  return clamp((swing - kirinVuLin(-20)) / (kirinVuLin(3) - kirinVuLin(-20)), -0.04, 1.04)
}

// 目盛りを刻む VU の値と、数字を添える値。
export const KIRIN_VU_TICKS = [-20, -10, -7, -5, -3, -2, -1, 0, 1, 2, 3]
export const KIRIN_VU_NUMBERED = [-20, -10, -5, 0, 3]
