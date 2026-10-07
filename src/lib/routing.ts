/**
 * 장소 사이 실제 길(OSRM, OpenStreetMap). 선생님이 저장할 때 바뀐 구간만 한 번 계산해 문서에 넣는다.
 * 학생 휴대폰은 길 서버를 부르지 않는다.
 *  - 버스·자동차: router.project-osrm.org (차 길)
 *  - 걸어서: routing.openstreetmap.de (걷는 길)
 *  - 대중교통·지하철·기차: api.transitous.org (공개 시간표로 찾는 대중교통 길, 오픈소스·비상업 앱에 열린 서비스)
 *  - 비행기·배: 계산하지 않는다(화면이 직선·호로 그린다)
 * 공개 서버라 초당 한 번 넘게 부르지 않는다.
 */
import { Route as RouteSchema, type LegMode, type Route, type Stop, type TripDoc } from '../trip/schema'
import { routeFits, ROUTABLE, TRANSIT } from '../trip/derive'
import { orderStops, stopInstant } from '../trip/order'
import type { LngLat } from './geo'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let lastCall = 0
let gate: Promise<void> = Promise.resolve()

/** 공개 서버 약속(초당 한 번): 부르는 곳이 여럿이어도 한 줄로 세워 1.1초 간격을 지킨다 */
function slot(): Promise<void> {
  const turn = gate.then(async () => {
    const wait = lastCall + 1100 - Date.now()
    if (wait > 0) await sleep(wait)
    lastCall = Date.now()
  })
  gate = turn.catch(() => {})
  return turn
}

/** 응답 선이 지나치게 길면 단순화(점 수의 제곱으로 느려진다) 전에 고르게 솎는다 */
const MAX_LINE = 20_000
function thin(line: LngLat[]): LngLat[] {
  if (line.length <= MAX_LINE) return line
  const step = Math.ceil(line.length / MAX_LINE)
  const out = line.filter((_, i) => i % step === 0)
  out.push(line[line.length - 1])
  return out
}

/** 바깥 서버가 준 선을 문서에 넣을 모양으로(좌표 범위 확인, 4000점 안으로). 이상하면 null */
function toCoords(line: LngLat[]): LngLat[] | null {
  if (line.length < 2 || line.length > 200_000) return null
  if (!line.every((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90)) return null
  let coords = simplify(thin(line.map((p) => [p[0], p[1]] as LngLat)))
  // 처음 줄인 결과가 지나치게 많으면 정상 길이 아니다(한 번 더 줄이는 데 시간만 든다)
  if (coords.length > 8000) return null
  if (coords.length > 4000) coords = simplify(coords, 0.0006)
  return coords.length > 4000 ? null : coords
}

/** 보내는 좌표는 소수 다섯째 자리(약 1m)까지만 */
const q5 = (n: number) => n.toFixed(5)

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

/** 구글 인코딩 폴리라인 → [경도, 위도][] (Transitous 는 precision 6) */
export function decodePolyline(points: string, precision = 6): LngLat[] {
  const f = 10 ** precision
  const out: LngLat[] = []
  let i = 0
  let lat = 0
  let lng = 0
  const next = () => {
    let shift = 0
    let result = 0
    let b: number
    do {
      b = points.charCodeAt(i++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20 && i < points.length)
    return result & 1 ? ~(result >> 1) : result >> 1
  }
  while (i < points.length) {
    lat += next()
    lng += next()
    out.push([lng / f, lat / f])
  }
  return out
}

/** 두 점 사이 거리(km) */
function km(a: LngLat, b: LngLat) {
  const R = 6371
  const r = Math.PI / 180
  const dLat = (b[1] - a[1]) * r
  const dLng = (b[0] - a[0]) * r
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** 한 번 부르기: 응답 JSON, 길 없음(null), 서버 응답 없음('down') */
async function getJson(url: string): Promise<unknown | null | 'down'> {
  // 공용 서버가 응답을 붙잡고 있어도 저장이 멈추지 않게, 한 번에 8초까지만 기다리고 두 번 해 본다(안 되면 직선)
  for (let attempt = 0; attempt < 2; attempt++) {
    await slot()
    try {
      const res = await fetch(url, { referrerPolicy: 'strict-origin', signal: AbortSignal.timeout(8_000) })
      if (res.ok) return await res.json()
      // 너무 자주 불렀다는 답(429)이면 다시 두드리지 않고 이번에는 직선으로 둔다
      if (res.status === 429) return 'down'
      // 길이 없는 두 곳(섬·바다 건너, NoRoute)은 서버가 400 으로 답한다. 그 구간만 직선으로 두고 다음 구간은 계속 계산한다.
      if (res.status >= 400 && res.status < 500) return null
    } catch {
      /* 다시 시도 */
    }
    await sleep(1500 * (attempt + 1))
  }
  return 'down'
}

type Got = Route | null | 'down'

/** 고른 수단만 타는 길(지하철은 지하철만, 기차는 열차만, 대중교통은 무엇이든). Transitous 의 RAIL 은 지하철까지 넣어서 열차 종류를 하나씩 적는다. */
const TRANSIT_MODES: Partial<Record<LegMode, string>> = { subway: 'SUBWAY', train: 'HIGHSPEED_RAIL,LONG_DISTANCE,NIGHT_RAIL,REGIONAL_FAST_RAIL,REGIONAL_RAIL' }

/** 그 시각의 대중교통 길 가운데 가장 빨리 가는 것(시간표가 없으면 null). 남의 서버 응답이라 모양과 범위를 다 확인한다. */

async function transitAt(mode: LegMode, a: LngLat, b: LngLat, at: Date): Promise<Got> {
  const q = new URLSearchParams({ fromPlace: `${q5(a[1])},${q5(a[0])}`, toPlace: `${q5(b[1])},${q5(b[0])}`, time: at.toISOString(), numItineraries: '3' })
  if (TRANSIT_MODES[mode]) q.set('transitModes', TRANSIT_MODES[mode]!)
  const j = await getJson(`https://api.transitous.org/api/v5/plan?${q}`)
  if (j === null || j === 'down') return j
  try {
    const raw = (j as { itineraries?: unknown }).itineraries
    const its = (Array.isArray(raw) ? raw : []).filter(
      (x): x is { duration: number; legs: unknown[] } => !!x && Number.isFinite(x.duration) && x.duration > 0 && x.duration < 2 * 86_400 && Array.isArray(x.legs),
    )
    if (!its.length) return null
    const best = its.reduce((m, x) => (x.duration < m.duration ? x : m))
    const line: LngLat[] = []
    for (const l of best.legs) {
      const g = (l as { legGeometry?: { points?: unknown; precision?: unknown } } | null)?.legGeometry
      if (typeof g?.points !== 'string' || g.points.length > 200_000) continue
      const p = Number.isInteger(g.precision) && (g.precision as number) >= 5 && (g.precision as number) <= 7 ? (g.precision as number) : 6
      line.push(...decodePolyline(g.points, p))
      if (line.length > 200_000) return null
    }
    const coords = line.length > 1 ? toCoords(line) : [a, b]
    if (!coords) return null
    const dist = line.length > 1 ? line.slice(1).reduce((n, pt, i) => n + km(line[i], pt), 0) : km(a, b)
    if (!Number.isFinite(dist)) return null
    return { coords, km: Math.min(20_000, Math.round(dist * 10) / 10), min: Math.min(1800, Math.max(1, Math.round(best.duration / 60))), from: a, to: b }
  } catch {
    return null
  }
}

const WEEK = 7 * 86_400_000

/**
 * 대중교통 시각: 여행 날 그 시각으로 먼저 찾고, 시간표가 아직 없거나(먼 미래) 이미 지난 날이면
 * 같은 요일·같은 시각의 가까운 날(내일부터 일주일 안)로 다시 찾는다.
 */
export function transitTimes(depart: Date | null, now = Date.now()): Date[] {
  const at = depart && Number.isFinite(depart.getTime()) ? depart : new Date(now + 86_400_000)
  const k = Math.ceil((now + 86_400_000 - at.getTime()) / WEEK)
  const near = new Date(at.getTime() + k * WEEK)
  return Math.abs(near.getTime() - at.getTime()) < 3_600_000 ? [at] : [at, near]
}

async function compute(mode: LegMode, a: LngLat, b: LngLat, depart: Date | null): Promise<Got> {
  if (TRANSIT.includes(mode)) {
    let last: Got = null
    for (const at of transitTimes(depart)) {
      last = await transitAt(mode, a, b, at)
      if (last !== null) return last
    }
    return last
  }
  const base = mode === 'walk' ? 'https://routing.openstreetmap.de/routed-foot/route/v1/driving' : 'https://router.project-osrm.org/route/v1/driving'
  const j = await getJson(`${base}/${q5(a[0])},${q5(a[1])};${q5(b[0])},${q5(b[1])}?overview=full&geometries=geojson`)
  if (j === null || j === 'down') return j
  try {
    const r = (j as { routes?: { distance?: unknown; duration?: unknown; geometry?: { coordinates?: unknown } }[] }).routes?.[0]
    const line = r?.geometry?.coordinates
    if (!r || !Array.isArray(line) || line.length > 200_000 || !Number.isFinite(r.distance) || !Number.isFinite(r.duration)) return null
    const coords = toCoords(line as LngLat[])
    if (!coords) return null
    return { coords, km: Math.max(0, Math.min(20_000, Math.round(((r.distance as number) / 1000) * 10) / 10)), min: Math.min(1800, Math.max(0, Math.round((r.duration as number) / 60))), from: a, to: b }
  } catch {
    return null
  }
}

/** 이 세션에서 이미 물어본 구간(여러 번 저장해도 같은 구간을 두 번 묻지 않게). 오래된 것부터 300개까지 */
const memo = new Map<string, Promise<Got>>()
const MEMO_MAX = 300

/** 마지막 관문: 문서 스키마를 못 넘는 길은 넣지 않는다(상한이 바뀌어도 어긋나지 않게 한 곳에서) */
async function checked(p: Promise<Got>): Promise<Got> {
  const r = await p
  return r && typeof r === 'object' && !RouteSchema.safeParse(r).success ? null : r
}

/** 길(없으면 null). 'down': 서버가 응답하지 않음(남은 구간은 기다리지 않고 직선으로). 같은 구간은 한 번만 묻는다. */
export async function fetchRoute(mode: LegMode, a: LngLat, b: LngLat, depart: Date | null = null): Promise<Route | null | 'down'> {
  const hour = TRANSIT.includes(mode) && depart ? Math.floor(depart.getTime() / 3_600_000) : 0
  const key = `${mode}|${a.join(',')}|${b.join(',')}|${hour}`
  let p = memo.get(key)
  if (!p) {
    p = checked(compute(mode, a, b, depart))
    memo.set(key, p)
    if (memo.size > MEMO_MAX) memo.delete(memo.keys().next().value!)
    // 서버가 안 받은 것과 예외로 끝난 것은 기억하지 않는다(다음에 다시 묻는다)
    p.then(
      (r) => r === 'down' && memo.delete(key),
      () => memo.delete(key),
    )
  }
  return p
}

/** 시험에서 기억을 비운다 */
export function forgetRoutes() {
  memo.clear()
}

/** 길을 넣은 뒤 문서가 서버 상한을 넘으면 길을 더 거칠게 줄이고, 그래도 넘치면 긴 길부터 직선으로 둔다 */
export function fitRoutes(doc: TripDoc, maxBytes: number): { doc: TripDoc; straightened: number } {
  const size = (d: TripDoc) => new TextEncoder().encode(JSON.stringify(d)).length
  if (size(doc) <= maxBytes) return { doc, straightened: 0 }
  const next: TripDoc = structuredClone(doc)
  const legs = next.days.flatMap((d) => d.stops.flatMap((s) => (s.leg?.route ? [s.leg] : [])))
  for (const l of legs) l.route!.coords = simplify(l.route!.coords as LngLat[], 0.0006)
  let straightened = 0
  legs.sort((x, y) => y.route!.coords.length - x.route!.coords.length)
  for (const l of legs) {
    if (size(next) <= maxBytes) break
    delete l.route
    straightened++
  }
  return { doc: next, straightened }
}

/** 그 일정을 떠나는 순간(끝 시각, 없으면 시작 시각). 대중교통 시간표를 찾을 때 쓴다. */
export function departureOf(doc: Pick<TripDoc, 'startDate' | 'tz' | 'homeTz'>, dayIndex: number, s: Stop): Date | null {
  const start = stopInstant(doc, dayIndex, s)
  if (!start || !s.end) return start
  const end = stopInstant(doc, dayIndex, { ...s, time: s.end })
  if (!end) return start
  // 끝이 시작보다 이르면 자정을 넘긴 것
  return end.getTime() < start.getTime() ? new Date(end.getTime() + 86_400_000) : end
}

/** 같은 건물 안(150m 이내)이면 길을 그리지 않는다 */
export function same(a: LngLat, b: LngLat) {
  return Math.hypot((a[0] - b[0]) * 88, (a[1] - b[1]) * 111) < 0.15
}

/** 길이 필요한데 아직 없거나 장소가 바뀐 구간 수 */
export function pendingRoutes(doc: TripDoc): number {
  return plan(doc).length
}

function plan(doc: TripDoc) {
  const todo: { day: number; id: string; mode: LegMode; a: LngLat; b: LngLat; depart: Date | null }[] = []
  let last: LngLat | null = null
  let leftAt: Date | null = null
  doc.days.forEach((d, di) => {
    for (const s of orderStops(doc, di, d.stops)) {
      if (!s.place) continue
      const here = s.place.coords as LngLat
      if (last && s.leg && ROUTABLE.includes(s.leg.mode) && !same(last, here) && !routeFits(s.leg.route, last, here)) todo.push({ day: di, id: s.id, mode: s.leg.mode, a: last, b: here, depart: leftAt })
      last = here
      leftAt = departureOf(doc, di, s)
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
    const got = down || Date.now() > deadline ? 'down' : await fetchRoute(t.mode, t.a, t.b, t.depart)
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
