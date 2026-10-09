// 受け口の波紋（2026-10-08）
// 受け口を押した所（音源を落とした所）に小さな凹みができ、3 つの輪が 0.22 秒ずつずれて広がりながら消える。
// 受け口全体も 0.7 秒だけ深く沈む。画面案（白い石の Kirin OS 第 5 版）の「受け口が受け止める」と同じ動き。
// 輪は大きさ（transform）と濃さ（opacity）だけを CSS のアニメーションで動かし、終わったら取り除く。
// 画面全体を描き直さないよう、React の状態は使わず、受け口の中の空の層へ直接足す。
const RING_DELAYS = [0, 220, 440]
const MAX_PARTS = 16

function add(layer, kind, x, y, delay) {
  const part = document.createElement('span')
  part.setAttribute('data-drop-ripple', kind)
  part.style.left = `${x.toFixed(1)}px`
  part.style.top = `${y.toFixed(1)}px`
  if (delay) part.style.animationDelay = `${delay}ms`
  const remove = () => part.remove()
  part.addEventListener('animationend', remove, { once: true })
  setTimeout(remove, 2800)
  layer.appendChild(part)
}

// layer：受け口の中の波紋の層。clientX / clientY は押した（落とした）画面上の位置。無ければ受け口の真ん中。
export function kirinDropRipple(layer, clientX, clientY, { reduceMotion = false } = {}) {
  if (!layer || typeof document === 'undefined') return false
  const basin = layer.closest('[data-stone-basin]') || layer.parentElement
  if (basin) {
    basin.setAttribute('data-taking', 'true')
    clearTimeout(basin.__kirinTakingTimer)
    basin.__kirinTakingTimer = setTimeout(() => basin.removeAttribute('data-taking'), 700)
  }
  if (reduceMotion) return true
  const rect = layer.getBoundingClientRect()
  const inside = Number.isFinite(clientX) && Number.isFinite(clientY) && (clientX !== 0 || clientY !== 0)
  const x = inside ? clientX - rect.left : rect.width / 2
  const y = inside ? clientY - rect.top : rect.height / 2
  // 何度も続けて押した時は、古い輪から外して数を抑える。
  while (layer.childElementCount > MAX_PARTS - 4) layer.firstElementChild?.remove()
  add(layer, 'dimple', x, y, 0)
  for (const delay of RING_DELAYS) add(layer, 'ring', x, y, delay)
  return true
}

export function kirinPrefersReducedMotion() {
  try {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  } catch {
    return false
  }
}
