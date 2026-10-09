
// 白い石の、指に応える二つの工夫（2026-10-08、画面案 白い石 第 5 版と同じ）
//   縁に光が差す：指の近くの部品（ボタン・札・受け口）の縁だけに、指の位置から金の光が差す。
//     光の輪は画面に一つだけ（[data-kirin-glint]）。指の下の部品の形に合わせて置き直すので、部品ごとの処理は持たない。
//   札が指で傾く：[data-kirin-tilt] の札が、指の下でわずかに沈むように傾き、影も合わせて動く（最大 2.2°）。
// どちらも白い石の画面の中だけ。タッチでは動かさない。紺のガラスの計器の中（.work-observation）には光を差さない。
const GLINT_SELECTOR = 'button, [role="button"], [role="tab"], [data-kirin-tilt]'
const TILT = 2.2

const clamp = (value, low, high) => Math.min(high, Math.max(low, value))

export function stoneGlintTarget(target) {
  if (!(target instanceof Element)) return null
  if (!target.closest('[data-kirin-stone="true"]') || target.closest('.work-observation, [data-kirin-no-glint]')) return null
  return target.closest(GLINT_SELECTOR)
}

export function installStonePointerPlay(enabled = true) {
    if (!enabled || typeof document === 'undefined') return undefined
    let glintTarget = null
    let tiltTarget = null
    let tiltBase = null
    const glint = () => document.querySelector('[data-kirin-stone="true"] [data-kirin-glint]')
    const hideGlint = () => {
      glintTarget = null
      glint()?.removeAttribute('data-on')
    }
    const resetTilt = () => {
      if (!tiltTarget) return
      for (const name of ['--rx', '--ry', '--sx', '--sy', '--tilt-p']) tiltTarget.style.removeProperty(name)
      tiltTarget.removeAttribute('data-tilting')
      tiltTarget = null
    }
    const onMove = (event) => {
      if (event.pointerType === 'touch') return
      const target = stoneGlintTarget(event.target)
      const ring = glint()
      if (target && ring) {
        const r = target.getBoundingClientRect()
        if (target !== glintTarget) {
          glintTarget = target
          ring.style.borderRadius = window.getComputedStyle(target).borderRadius
        }
        ring.style.left = `${r.left}px`
        ring.style.top = `${r.top}px`
        ring.style.width = `${r.width}px`
        ring.style.height = `${r.height}px`
        ring.style.setProperty('--mx', `${(event.clientX - r.left).toFixed(1)}px`)
        ring.style.setProperty('--my', `${(event.clientY - r.top).toFixed(1)}px`)
        ring.setAttribute('data-on', 'true')
      } else if (glintTarget) {
        hideGlint()
      }
      const card = event.target instanceof Element ? event.target.closest('[data-kirin-stone="true"] [data-kirin-tilt]') : null
      if (card !== tiltTarget) resetTilt()
      if (!card || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
      if (tiltTarget !== card) {
        // 影の向きは、その札が受けている光（白い石の --sx・--sy）を起点に、傾けた分だけずらす。
        const style = window.getComputedStyle(card)
        tiltBase = { sx: Number.parseFloat(style.getPropertyValue('--sx')) || 0, sy: Number.parseFloat(style.getPropertyValue('--sy')) || 0 }
      }
      tiltTarget = card
      const r = card.getBoundingClientRect()
      const nx = clamp(((event.clientX - r.left) / r.width) * 2 - 1, -1, 1)
      const ny = clamp(((event.clientY - r.top) / r.height) * 2 - 1, -1, 1)
      // 横に長い札（最近の行など）は、同じ角度だと端が大きく動くので、幅に合わせて角度と遠近を弱める。
      const wide = Math.min(1, 420 / Math.max(1, r.width))
      card.style.setProperty('--tilt-p', `${Math.max(700, Math.round(r.width * 2))}px`)
      card.style.setProperty('--ry', `${(nx * TILT * wide).toFixed(2)}deg`)
      card.style.setProperty('--rx', `${(-ny * TILT).toFixed(2)}deg`)
      card.style.setProperty('--sx', (tiltBase.sx - nx * 0.22).toFixed(3))
      card.style.setProperty('--sy', (tiltBase.sy - ny * 0.22).toFixed(3))
      card.setAttribute('data-tilting', 'true')
    }
    const onLeave = () => { hideGlint(); resetTilt() }
    document.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerleave', onLeave)
    window.addEventListener('blur', onLeave)
    window.addEventListener('scroll', hideGlint, { capture: true, passive: true })
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('blur', onLeave)
      window.removeEventListener('scroll', hideGlint, { capture: true })
      onLeave()
    }
}
