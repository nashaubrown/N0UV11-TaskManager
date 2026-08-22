/* Generative "photography" for demo data: gradients, suns, waves, stripes.
 * Pure math — looks like abstract brand photography, no downloads. */
import { encodePng } from './png.mjs'

const lerp = (a, b, t) => a + (b - a) * t
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)]

// deterministic pseudo-random for star fields etc.
const rand = (seed) => () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}

function gradient(stops, t) {
  const n = stops.length - 1
  const seg = Math.min(n - 0.0001, t * n)
  const i = Math.floor(seg)
  return mix(stops[i], stops[i + 1], seg - i)
}

export function makeImage(spec, W = 720, H = 900) {
  const stars = []
  if (spec.stars) {
    const r = rand(spec.seed ?? 7)
    for (let i = 0; i < 90; i++) stars.push([r() * W, r() * H * 0.6, r() * 1.6 + 0.4])
  }
  return encodePng(W, H, (x, y) => {
    const u = x / W, v = y / H
    let c = gradient(spec.stops, spec.radial
      ? Math.min(1, Math.hypot(u - 0.5, v - 0.42) * 1.7)
      : v)

    if (spec.sun) {
      const d = Math.hypot(u - spec.sun.x, (v - spec.sun.y) * (H / W))
      if (d < spec.sun.r) c = mix(spec.sun.color, c, Math.pow(d / spec.sun.r, 2))
      else if (d < spec.sun.r * 2.4) c = mix(spec.sun.color, c, 0.75 + 0.25 * ((d - spec.sun.r) / (spec.sun.r * 1.4)))
    }
    if (spec.sea && v > spec.sea.y) {
      const depth = (v - spec.sea.y) / (1 - spec.sea.y)
      let s = mix(spec.sea.top, spec.sea.bottom, depth)
      const shimmer = Math.sin(u * 90 + depth * 40) * Math.sin(depth * 25) * 14 * (1 - depth)
      c = [s[0] + shimmer, s[1] + shimmer, s[2] + shimmer]
    }
    if (spec.waves) {
      const w = Math.sin(u * spec.waves.freq + Math.sin(v * 9) * 1.6 + v * 22)
      if (w > spec.waves.cut) c = mix(c, spec.waves.color, 0.35 * (w - spec.waves.cut) / (1 - spec.waves.cut))
    }
    if (spec.stripes && v < spec.stripes.h) {
      const k = Math.floor(u * spec.stripes.n) % 2
      c = k === 0 ? spec.stripes.a : spec.stripes.b
      if (v > spec.stripes.h - 0.015) c = mix(c, [0, 0, 0], 0.25)
    }
    if (spec.grid) {
      const gx = (u * spec.grid.nx) % 1, gy = ((v - 0.25) * spec.grid.ny) % 1
      if (v > 0.25 && v < 0.85 && gx > 0.15 && gx < 0.85 && gy > 0.15 && gy < 0.85) {
        c = mix(c, spec.grid.color, 0.55)
      }
    }
    if (spec.rings) {
      for (const ring of spec.rings) {
        const d = Math.hypot((u - ring.x) * (W / H), v - ring.y)
        if (Math.abs(d - ring.r) < ring.w) c = mix(c, ring.color, 0.5)
      }
    }
    for (const [sx, sy, sr] of stars) {
      const d = Math.hypot(x - sx, y - sy)
      if (d < sr) c = mix([255, 255, 240], c, d / sr)
    }
    // subtle vignette so everything feels photographic
    const vig = 1 - 0.35 * Math.pow(Math.hypot(u - 0.5, v - 0.5) * 1.35, 2.2)
    return [c[0] * vig, c[1] * vig, c[2] * vig]
  })
}

/** 12 branded demo shots. */
export const DEMO_SHOTS = [
  { key: 'sunset-jetty', title: 'Sunset from the jetty', merchant: 'Island Resort Group', tags: ['sunset', 'jetty', 'golden hour'],
    spec: { stops: [[255, 200, 140], [255, 130, 100], [196, 60, 70]], sun: { x: 0.5, y: 0.38, r: 0.09, color: [255, 240, 200] }, sea: { y: 0.55, top: [220, 110, 90], bottom: [90, 35, 60] } } },
  { key: 'lagoon-morning', title: 'Lagoon at first light', merchant: 'Island Resort Group', tags: ['lagoon', 'ocean', 'morning'],
    spec: { stops: [[190, 235, 235], [90, 190, 200], [20, 110, 140]], sea: { y: 0.42, top: [110, 205, 205], bottom: [10, 90, 120] } } },
  { key: 'overwater-villa', title: 'Overwater villa deck', merchant: 'Island Resort Group', tags: ['villa', 'deck', 'resort'],
    spec: { stops: [[210, 235, 245], [120, 190, 210], [35, 120, 150]], sea: { y: 0.5, top: [90, 185, 195], bottom: [15, 95, 125] }, rings: [{ x: 0.3, y: 0.72, r: 0.1, w: 0.012, color: [235, 245, 245] }, { x: 0.72, y: 0.62, r: 0.06, w: 0.01, color: [235, 245, 245] }] } },
  { key: 'latte-art', title: 'Latte art — rosetta', merchant: 'Café Aroma', tags: ['latte', 'coffee', 'close-up'],
    spec: { radial: true, stops: [[240, 225, 205], [190, 130, 80], [90, 50, 30]], rings: [{ x: 0.5, y: 0.42, r: 0.18, w: 0.02, color: [245, 235, 220] }, { x: 0.5, y: 0.42, r: 0.1, w: 0.015, color: [245, 235, 220] }] } },
  { key: 'espresso-pour', title: 'Espresso pour', merchant: 'Café Aroma', tags: ['espresso', 'coffee', 'crema'],
    spec: { stops: [[70, 40, 25], [110, 60, 35], [45, 25, 15]], waves: { freq: 30, cut: 0.55, color: [200, 150, 100] } } },
  { key: 'cafe-counter', title: 'Counter in morning light', merchant: 'Café Aroma', tags: ['interior', 'counter', 'cafe'],
    spec: { stops: [[250, 235, 210], [225, 190, 150], [140, 100, 70]], grid: { nx: 4, ny: 5, color: [255, 245, 225] } } },
  { key: 'pastry-case', title: 'Pastry case detail', merchant: 'Café Aroma', tags: ['pastry', 'food', 'detail'],
    spec: { radial: true, stops: [[255, 230, 190], [235, 170, 110], [150, 90, 50]] } },
  { key: 'storefront-awning', title: 'Storefront awning', merchant: 'Novelty Traders', tags: ['storefront', 'retail', 'signage'],
    spec: { stops: [[245, 240, 235], [230, 220, 210], [120, 110, 105]], stripes: { n: 8, h: 0.35, a: [232, 90, 80], b: [248, 244, 240] }, grid: { nx: 3, ny: 3, color: [70, 65, 60] } } },
  { key: 'shelf-display', title: 'Shelf display — new stock', merchant: 'Novelty Traders', tags: ['product', 'display', 'retail'],
    spec: { stops: [[250, 245, 238], [235, 225, 212], [180, 165, 150]], grid: { nx: 5, ny: 6, color: [215, 120, 90] } } },
  { key: 'spa-stones', title: 'Treatment room stones', merchant: 'Seaside Spa & Wellness', tags: ['spa', 'wellness', 'calm'],
    spec: { radial: true, stops: [[225, 240, 230], [150, 195, 180], [60, 110, 100]], rings: [{ x: 0.5, y: 0.55, r: 0.14, w: 0.05, color: [240, 245, 240] }, { x: 0.5, y: 0.75, r: 0.09, w: 0.04, color: [225, 235, 228] }] } },
  { key: 'pool-dusk', title: 'Pool at dusk', merchant: 'Seaside Spa & Wellness', tags: ['pool', 'dusk', 'ambience'],
    spec: { stops: [[90, 80, 140], [60, 90, 150], [20, 45, 90]], sea: { y: 0.45, top: [70, 120, 170], bottom: [15, 40, 80] }, stars: true, seed: 11 } },
  { key: 'night-sky', title: 'Night sky over the atoll', merchant: 'Island Resort Group', tags: ['night', 'stars', 'sky'],
    spec: { stops: [[25, 30, 70], [15, 20, 50], [8, 10, 30]], stars: true, seed: 42, sea: { y: 0.75, top: [20, 35, 70], bottom: [5, 12, 30] } } },
]
