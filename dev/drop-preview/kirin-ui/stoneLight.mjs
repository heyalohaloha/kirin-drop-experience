// 白い石の光（通常モード / 2026-10-07）
//
// 通常モードの画面は、一枚の白い石に一つの光源が当たっているように見せる。光源は本物の太陽で、
// 機器の時間帯からおおよその場所を決め、日付と時刻から太陽の高さと向きを出す。日の出・日の入りは
// 場所と季節どおりになる。日が沈むと、石は月明かりの青みのある灰に沈み、縁の光は月の銀になる。
// 夕陽は温かく横から、夜は冷たく上から。夜に暖かい色は使わない（2026-10-08、日没後を焚き火の橙に
// していたら強い夕陽に見えた。足元だけに暖かい光を溜める案も、明るい石の画面では夕陽と見分けられなかった）。
//
// 画面は赤道の方を向いた窓に見立てる。北半球では朝の光が左から、南半球では右から差す。真昼でも
// わずかに左上から当てて、Hypha の光源（左上）と向きをそろえる。
//
// 季節の名前（二十四節気）は太陽の黄経から出す。南半球では半年ずらして、その土地の季節に合わせる。
// 位置情報は使わない（時間帯の都市の座標で足りる）。

const RAD = Math.PI / 180

// 時間帯ごとの代表の都市（緯度・経度・表示名）。無い時間帯は UTC との差から経度を、名前から半球を推す。
export const STONE_ZONES = {
  'Asia/Tokyo': [35.68, 139.69, '東京', 'Tokyo'],
  'Asia/Seoul': [37.57, 126.98, 'ソウル', 'Seoul'],
  'Asia/Shanghai': [31.23, 121.47, '上海', 'Shanghai'],
  'Asia/Hong_Kong': [22.32, 114.17, '香港', 'Hong Kong'],
  'Asia/Taipei': [25.03, 121.56, '台北', 'Taipei'],
  'Asia/Singapore': [1.35, 103.82, 'シンガポール', 'Singapore'],
  'Asia/Bangkok': [13.75, 100.5, 'バンコク', 'Bangkok'],
  'Asia/Jakarta': [-6.2, 106.85, 'ジャカルタ', 'Jakarta'],
  'Asia/Kolkata': [28.61, 77.21, 'デリー', 'Delhi'],
  'Asia/Dubai': [25.2, 55.27, 'ドバイ', 'Dubai'],
  'Europe/London': [51.51, -0.13, 'ロンドン', 'London'],
  'Europe/Paris': [48.86, 2.35, 'パリ', 'Paris'],
  'Europe/Berlin': [52.52, 13.4, 'ベルリン', 'Berlin'],
  'Europe/Madrid': [40.42, -3.7, 'マドリード', 'Madrid'],
  'Europe/Rome': [41.9, 12.5, 'ローマ', 'Rome'],
  'Europe/Amsterdam': [52.37, 4.9, 'アムステルダム', 'Amsterdam'],
  'Europe/Stockholm': [59.33, 18.07, 'ストックホルム', 'Stockholm'],
  'Europe/Moscow': [55.76, 37.62, 'モスクワ', 'Moscow'],
  'Atlantic/Reykjavik': [64.15, -21.94, 'レイキャビク', 'Reykjavik'],
  'America/New_York': [40.71, -74.01, 'ニューヨーク', 'New York'],
  'America/Chicago': [41.88, -87.63, 'シカゴ', 'Chicago'],
  'America/Denver': [39.74, -104.99, 'デンバー', 'Denver'],
  'America/Los_Angeles': [34.05, -118.24, 'ロサンゼルス', 'Los Angeles'],
  'America/Toronto': [43.65, -79.38, 'トロント', 'Toronto'],
  'America/Vancouver': [49.28, -123.12, 'バンクーバー', 'Vancouver'],
  'America/Mexico_City': [19.43, -99.13, 'メキシコシティ', 'Mexico City'],
  'America/Sao_Paulo': [-23.55, -46.63, 'サンパウロ', 'São Paulo'],
  'America/Argentina/Buenos_Aires': [-34.6, -58.38, 'ブエノスアイレス', 'Buenos Aires'],
  'Australia/Sydney': [-33.87, 151.21, 'シドニー', 'Sydney'],
  'Australia/Melbourne': [-37.81, 144.96, 'メルボルン', 'Melbourne'],
  'Australia/Perth': [-31.95, 115.86, 'パース', 'Perth'],
  'Pacific/Auckland': [-36.85, 174.76, 'オークランド', 'Auckland'],
  'Pacific/Honolulu': [21.31, -157.86, 'ホノルル', 'Honolulu'],
  'Africa/Johannesburg': [-26.2, 28.05, 'ヨハネスブルグ', 'Johannesburg'],
  'Africa/Cairo': [30.04, 31.24, 'カイロ', 'Cairo'],
  'Africa/Lagos': [6.52, 3.38, 'ラゴス', 'Lagos'],
}

// 二十四節気。黄経 0° の春分から 15° ずつ。[漢字, 読み, 英語]
export const STONE_SOLAR_TERMS = [
  ['春分', 'しゅんぶん', 'Spring Equinox'], ['清明', 'せいめい', 'Clear and Bright'], ['穀雨', 'こくう', 'Grain Rain'],
  ['立夏', 'りっか', 'Start of Summer'], ['小満', 'しょうまん', 'Grain Buds'], ['芒種', 'ぼうしゅ', 'Grain in Ear'],
  ['夏至', 'げし', 'Summer Solstice'], ['小暑', 'しょうしょ', 'Minor Heat'], ['大暑', 'たいしょ', 'Major Heat'],
  ['立秋', 'りっしゅう', 'Start of Autumn'], ['処暑', 'しょしょ', 'End of Heat'], ['白露', 'はくろ', 'White Dew'],
  ['秋分', 'しゅうぶん', 'Autumn Equinox'], ['寒露', 'かんろ', 'Cold Dew'], ['霜降', 'そうこう', "Frost's Descent"],
  ['立冬', 'りっとう', 'Start of Winter'], ['小雪', 'しょうせつ', 'Minor Snow'], ['大雪', 'たいせつ', 'Major Snow'],
  ['冬至', 'とうじ', 'Winter Solstice'], ['小寒', 'しょうかん', 'Minor Cold'], ['大寒', 'だいかん', 'Major Cold'],
  ['立春', 'りっしゅん', 'Start of Spring'], ['雨水', 'うすい', 'Rain Water'], ['啓蟄', 'けいちつ', 'Awakening of Insects'],
]

const SOUTHERN_ZONE = /Australia|Auckland|Sao_Paulo|Argentina|Santiago|Johannesburg|Lima|Montevideo|Jakarta/

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const mix = (a, b, t) => a + (b - a) * t
const mixRgb = (a, b, t) => a.map((v, i) => Math.round(mix(v, b[i], t)))

export function stoneLocalZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

// 時間帯から場所を決める。表にない時間帯は UTC との差から経度を、時間帯の名前から半球を推す。
export function stonePlaceForZone(zone, date = new Date()) {
  const known = STONE_ZONES[zone]
  if (known) return { zone, lat: known[0], lon: known[1], nameJa: known[2], nameEn: known[3] }
  const south = SOUTHERN_ZONE.test(zone || '')
  const city = String(zone || 'UTC').split('/').pop().replace(/_/g, ' ')
  return { zone, lat: south ? -30 : 35, lon: -date.getTimezoneOffset() / 4, nameJa: city, nameEn: city }
}

// 太陽の位置（低精度の天文式。数十年の範囲で 0.01° 程度）。高さ・方位（北から時計回り）・黄経。
export function stoneSunAt(date, lat, lon) {
  const d = date.getTime() / 86400000 - 10957.5
  const g = (357.529 + 0.98560028 * d) * RAD
  const q = 280.459 + 0.98564736 * d
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD
  const e = (23.439 - 0.00000036 * d) * RAD
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L))
  const dec = Math.asin(Math.sin(e) * Math.sin(L))
  const H = ((18.697374558 + 24.06570982441908 * d) * 15 + lon) * RAD - ra
  const phi = lat * RAD
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H))
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) / RAD + 180
  return { alt: alt / RAD, az: ((az % 360) + 360) % 360, eclipticLongitude: (((L / RAD) % 360) + 360) % 360 }
}

// 月の満ち欠け（0 が新月、0.5 が満月）。
export function stoneMoonPhaseAt(date) {
  const synodic = 29.530588853
  let age = (date.getTime() / 86400000 + 2440587.5 - 2451550.1) % synodic
  if (age < 0) age += synodic
  return age / synodic
}

export function stoneSolarTerm(sun, southern) {
  const lon = (sun.eclipticLongitude + (southern ? 180 : 0)) % 360
  return STONE_SOLAR_TERMS[Math.floor(lon / 15) % 24]
}

// 光の変数：--sx --sy（影の向き）、--la（光の角度）、--hl（光の色）、--lpx --lpy（光の当たる場所）、
// --night（月明かりへの移り）、--stone --stone-lit --stone-deep（石の色）。
export function stoneLightAt(date = new Date(), place = stonePlaceForZone(stoneLocalZone(), date)) {
  const sun = stoneSunAt(date, place.lat, place.lon)
  const southern = place.lat < 0
  const raw = Math.sin(((sun.az - (southern ? 0 : 180)) * Math.PI) / 180)
  const lx = clamp(raw - 0.35 * (1 - Math.abs(raw)), -1, 1)
  const elev = clamp(Math.sin(Math.max(0, sun.alt) * RAD) / Math.sin(Math.PI / 3), 0, 1)
  const k = 1.2 - 0.3 * elev
  const low = (1 - elev) ** 2
  const morning = southern ? raw > 0 : raw < 0
  const tint = mixRgb([255, 252, 246], morning ? [236, 242, 250] : [255, 214, 160], low)
  const day = { sx: -lx * k, sy: (0.45 + 0.6 * elev) * k, hl: tint, amb: mix(0.975, 1, elev), lpx: 50 + lx * 46, lpy: -14 + (1 - elev) * 18 }
  // 夜の主な光は上からの月明かり。影の色も温かい茶から冷たい墨へ移る。
  const moon = { sx: 0.22, sy: 0.85, hl: [228, 233, 244], sh: [30, 34, 52], amb: 0.937, lpx: 30, lpy: -10 }
  const night = clamp((-sun.alt - 1) / 7, 0, 1)
  const sx = mix(day.sx, moon.sx, night)
  const sy = mix(day.sy, moon.sy, night)
  const amb = mix(day.amb, moon.amb, night)
  const hl = mixRgb(day.hl, moon.hl, night)
  const sh = mixRgb([84, 66, 46], moon.sh, night)
  const l = 0.945 * amb
  // 色みはごく淡いまま、温かい石（82°）から月明かりの青み（252°）へ。途中の薄明では色みを落として、緑に寄らせない。
  const c = 0.008 - 0.001 * night - 0.016 * night * (1 - night)
  const h = 82 + 170 * night
  const vars = {
    '--sx': sx.toFixed(3),
    '--sy': sy.toFixed(3),
    '--la': `${(Math.atan2(sx, -sy) * 180 / Math.PI).toFixed(1)}deg`,
    '--hl': hl.join(' '),
    '--sh': sh.join(' '),
    '--lpx': `${mix(day.lpx, moon.lpx, night).toFixed(1)}%`,
    '--lpy': `${mix(day.lpy, moon.lpy, night).toFixed(1)}%`,
    '--night': night.toFixed(3),
    '--stone': `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${h.toFixed(1)})`,
    '--stone-lit': `oklch(${(l + 0.03).toFixed(4)} ${(c - 0.002).toFixed(4)} ${(h + 3).toFixed(1)})`,
    '--stone-deep': `oklch(${(l - 0.04).toFixed(4)} ${(c + 0.003).toFixed(4)} ${(h - 4).toFixed(1)})`,
  }
  return { vars, sun, place, southern, night, term: stoneSolarTerm(sun, southern), moonPhase: stoneMoonPhaseAt(date) }
}

// 時間帯の UTC との差（分）。
export function stoneZoneOffsetMinutes(zone, date) {
  try {
    const parts = {}
    new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      .formatToParts(date)
      .forEach((part) => { parts[part.type] = Number(part.value) })
    return Math.round((Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second) - date.getTime()) / 60000)
  } catch {
    return -date.getTimezoneOffset()
  }
}

function localInstant(isoDate, place, hour) {
  const [y, m, d] = String(isoDate || '').slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  const guess = Date.UTC(y, m - 1, d, hour)
  return new Date(guess - stoneZoneOffsetMinutes(place.zone, new Date(guess)) * 60000)
}

// その日の日没（太陽の上の縁が沈む高さ −0.833°）。正午から 15 時間の間に沈まない日（白夜・極夜）は null。
export function stoneSunsetOn(isoDate, place) {
  const noon = localInstant(isoDate, place, 12)
  if (!noon) return null
  const above = (t) => stoneSunAt(new Date(t), place.lat, place.lon).alt + 0.833
  let lo = noon.getTime()
  let hi = lo + 15 * 3600000 // 高緯度の夏は真夜中を過ぎて沈む
  if (above(lo) <= 0 || above(hi) > 0) return null
  for (let i = 0; i < 28; i += 1) {
    const mid = (lo + hi) / 2
    if (above(mid) > 0) lo = mid
    else hi = mid
  }
  return new Date(hi)
}

// その日の夜（21 時）の月の満ち欠けと、その日の二十四節気。
export function stoneNightMoonOn(isoDate, place) {
  const night = localInstant(isoDate, place, 21)
  return night ? stoneMoonPhaseAt(night) : null
}

export function stoneSolarTermOn(isoDate, place) {
  const noon = localInstant(isoDate, place, 12)
  if (!noon) return null
  return stoneSolarTerm(stoneSunAt(noon, place.lat, place.lon), place.lat < 0)
}
