/**
 * 장소 사이 실제 길(OSRM, OpenStreetMap). 선생님이 저장할 때 바뀐 구간만 한 번 계산해 문서에 넣는다.
 * 학생 휴대폰은 길 서버를 부르지 않는다.
 *  - 버스·자동차: router.project-osrm.org (차 길)
 *  - 걸어서: routing.openstreetmap.de (걷는 길)
 *  - 지하철·기차·비행기·배: 계산하지 않는다(화면이 직선·호로 그린다)
 * 공개 서버라 초당 한 번 넘게 부르지 않는다.
 */
import type { LegMode, Route, TripDoc } from '../trip/schema'
import { routeFits, ROUTABLE } from '../trip/derive'
import { orderStops } from '../trip/order'
import type { LngLat } from './geo'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let lastCall = 0

/** Douglas-Peucker 로 점을 줄이고 소수 다섯째 자리로 자른다(약 15m 허용) */
export function simplify(points: LngLat[], tol = 0.00015): LngLat[] {
  if (points.length <= 2) return points
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const [x1, y1] = points[a]
    const [x2, y2] = points[b]
    let max = 0
    let idx = -1
    for (let i = a + 1; i < b; i++) {
      const [x, y] = points[i]
      const dx = x2 - x1
      const dy = y2 - y1
      const t = dx || dy ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy))) : 0
      const d = Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
      if (d > max) {
        max = d
        idx = i
      }
    }
    if (max > tol && idx > 0) {
      keep[idx] = 1
      stack.push([a, idx], [idx, b])
    }
  }
  return points.filter((_, i) => keep[i]).map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5] as LngLat)
}

/** 길(없으면 null). 'down': 서버가 응답하지 않음(남은 구간은 기다리지 않고 직선으로) */
export async function fetchRoute(mode: LegMode, a: LngLat, b: LngLat): Promise<Route | null | 'down'> {
  const base = mode === 'walk' ? 'https://routing.openstreetmap.de/routed-foot/route/v1/driving' : 'https://router.project-osrm.org/route/v1/driving'
  const url = `${base}/${a[0]},${a[1]};${b[0]},${b[1]}?overview=full&geometries=geojson`
  // 공용 서버가 응답을 붙잡고 있어도 저장이 멈추지 않게, 한 번에 8초까지만 기다리고 두 번 해 본다(안 되면 직선)
  for (let attempt = 0; attempt < 2; attempt++) {
    const wait = lastCall + 1100 - Date.now()
    if (wait > 0) await sleep(wait)
    lastCall = Date.now()
    try {
      const res = await fetch(url, { referrerPolicy: 'strict-origin', signal: AbortSignal.timeout(8_000) })
      if (res.ok) {
        const j = await res.json()
        const r = j.routes?.[0]
        if (r) return { coords: simplify(r.geometry.coordinates as LngLat[]), km: Math.round((r.distance / 1000) * 10) / 10, min: Math.round(r.duration / 60), from: a, to: b }
        return null
      }
      // 길이 없는 두 곳(섬·바다 건너, NoRoute)은 서버가 400 으로 답한다. 그 구간만 직선으로 두고 다음 구간은 계속 계산한다.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) return null
    } catch {
      /* 다시 시도 */
    }
    await sleep(1500 * (attempt + 1))
  }
  return 'down'
}

/** 같은 건물 안(150m 이내)이면 길을 그리지 않는다 */
function same(a: LngLat, b: LngLat) {
  return Math.hypot((a[0] - b[0]) * 88, (a[1] - b[1]) * 111) < 0.15
}

/** 길이 필요한데 아직 없거나 장소가 바뀐 구간 수 */
export function pendingRoutes(doc: TripDoc): number {
  return plan(doc).length
}

function plan(doc: TripDoc) {
  const todo: { day: number; id: string; mode: LegMode; a: LngLat; b: LngLat }[] = []
  let last: LngLat | null = null
  doc.days.forEach((d, di) => {
    for (const s of orderStops(doc, di, d.stops)) {
      if (!s.place) continue
      const here = s.place.coords as LngLat
      if (last && s.leg && ROUTABLE.includes(s.leg.mode) && !same(last, here) && !routeFits(s.leg.route, last, here)) todo.push({ day: di, id: s.id, mode: s.leg.mode, a: last, b: here })
      last = here
    }
  })
  return todo
}

/** 바뀐 구간만 길을 계산해 넣은 새 문서. 계산 못 한 구간은 직선으로 남는다. */
export async function fillRoutes(doc: TripDoc, onProgress?: (done: number, total: number) => void): Promise<{ doc: TripDoc; failed: number }> {
  const todo = plan(doc)
  const next: TripDoc = structuredClone(doc)
  let failed = 0
  // 길 계산은 다 합쳐 40초까지만 기다린다. 서버가 한 번 응답하지 않으면 남은 구간은 바로 직선으로 둔다.
  const deadline = Date.now() + 40_000
  let down = false
  for (let i = 0; i < todo.length; i++) {
    onProgress?.(i, todo.length)
    const t = todo[i]
    const got = down || Date.now() > deadline ? 'down' : await fetchRoute(t.mode, t.a, t.b)
    if (got === 'down') down = true
    const r = got === 'down' ? null : got
    const stop = next.days[t.day].stops.find((s) => s.id === t.id)
    if (stop?.leg) {
      if (r) stop.leg.route = r
      else {
        delete stop.leg.route
        failed++
      }
    }
  }
  // 수단이 비행기·배처럼 길을 안 그리는 것으로 바뀌었으면 옛 길을 지운다
  for (const d of next.days) for (const s of d.stops) if (s.leg && !ROUTABLE.includes(s.leg.mode)) delete s.leg.route
  onProgress?.(todo.length, todo.length)
  return { doc: next, failed }
}
