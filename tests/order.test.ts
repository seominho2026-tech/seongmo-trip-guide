import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyTrip, Stop, upgradeDoc, type Stop as StopT } from '../src/trip/schema.js'
import { orderStops } from '../src/trip/order.js'
import { derive } from '../src/trip/derive.js'
import { clock, duration, instant } from '../src/lib/time.js'

const s = (id: string, time: string, extra: Partial<StopT> = {}): StopT => ({ id, time, title: id, kind: 'move', ...extra })

test('Incheon to LA: home-time departure sorts before the earlier-looking local arrival', () => {
  const doc = emptyTrip({ title: 't', startDate: '2026-10-20', nights: 3, tz: 'America/Los_Angeles', studentIdDigits: 4 })
  doc.days[0].stops = [
    s('hotel01', '13:00'),
    s('laarr01', '09:30', { place: { name: 'LAX', coords: [-118.4, 33.94] }, leg: { mode: 'flight' } }),
    s('icnmeet', '12:00', { zone: 'home', place: { name: '인천공항', coords: [126.45, 37.46] } }),
    s('icndep1', '15:00', { zone: 'home' }),
  ]
  assert.deepEqual(orderStops(doc, 0, doc.days[0].stops).map((x) => x.id), ['icnmeet', 'icndep1', 'laarr01', 'hotel01'])
  const d = derive(doc)
  const la = d.stopPages.find((p) => p.stop.id === 'laarr01')!
  assert.equal(la.from?.stop.id, 'icnmeet', 'flight arc starts at Incheon')
  assert.equal(clock(la.start, 'Asia/Seoul').ymd, '2026-10-21')
})

test('NY return flight: arrival in Korea time on the next day sorts after departure', () => {
  const doc = emptyTrip({ title: 't', startDate: '2026-10-20', nights: 4, tz: 'America/New_York', studentIdDigits: 4 })
  doc.days[3].stops = [s('icnarr1', '12:30', { zone: 'home', dayShift: 1 }), s('jfkdep1', '09:00')]
  const ordered = orderStops(doc, 3, doc.days[3].stops)
  assert.deepEqual(ordered.map((x) => x.id), ['jfkdep1', 'icnarr1'])
  const d = derive(doc)
  const arr = d.stopPages.find((p) => p.stop.id === 'icnarr1')!
  const dep = d.stopPages.find((p) => p.stop.id === 'jfkdep1')!
  assert.ok(arr.start > dep.start)
  assert.equal(clock(arr.start, 'Asia/Seoul').ymd, '2026-10-24')
})

test('domestic trips keep clock order; after-midnight stops use dayShift', () => {
  const doc = emptyTrip({ title: 't', startDate: '2026-10-21', nights: 1, tz: 'Asia/Seoul', studentIdDigits: 4 })
  doc.days[0].stops = [s('arrive1', '00:40', { dayShift: 1 }), s('depart1', '23:30'), s('lunch01', '12:00'), s('lunch02', '12:00')]
  assert.deepEqual(orderStops(doc, 0, doc.days[0].stops).map((x) => x.id), ['lunch01', 'lunch02', 'depart1', 'arrive1'])
})

test('legacy nextDay flag reads as dayShift 1', () => {
  const r = Stop.safeParse({ id: 'abcdef1', time: '00:40', nextDay: true, title: '도착', kind: 'move' })
  assert.ok(r.success)
  assert.equal(r.data.dayShift, 1)
  assert.equal('nextDay' in r.data, false)
})

test('time: DST gap moves forward, overlap takes the first, durations round', () => {
  // 2026-03-08 02:30 does not exist in New York; it becomes 03:30 EDT
  assert.equal(clock(instant('2026-03-08', '02:30', 'America/New_York'), 'America/New_York').time, '03:30')
  // 2026-11-01 01:30 happens twice; the first is EDT (05:30Z)
  assert.equal(instant('2026-11-01', '01:30', 'America/New_York').toISOString(), '2026-11-01T05:30:00.000Z')
  assert.equal(instant('2026-10-21', '10:00', 'Asia/Seoul').toISOString(), '2026-10-21T01:00:00.000Z')
  assert.equal(duration(119.6), '2시간')
  assert.equal(duration(59.4), '59분')
  assert.equal(duration(0.2), '')
})

test('docs saved with the old nextDay flag are read as dayShift 1', () => {
  const doc = emptyTrip({ title: 't', startDate: '2026-10-21', nights: 1, tz: 'Asia/Seoul', studentIdDigits: 4 })
  doc.days[0].stops = [{ id: 'arrive1', time: '00:40', title: 'a', kind: 'move', nextDay: true } as unknown as StopT, s('depart1', '23:30')]
  const up = upgradeDoc(doc)
  assert.equal(up.days[0].stops[0].dayShift, 1)
  assert.equal('nextDay' in up.days[0].stops[0], false)
  assert.deepEqual(orderStops(up, 0, up.days[0].stops).map((x) => x.id), ['depart1', 'arrive1'])
  assert.equal(upgradeDoc(up), up, 'no copy when nothing changes')
})

test('routes: a leg with no road stays straight but later legs are still computed', async () => {
  const { fillRoutes } = await import('../src/lib/routing.js')
  const doc = emptyTrip({ title: 't', startDate: '2026-10-21', nights: 0, tz: 'Asia/Seoul', studentIdDigits: 4 })
  const P = (id: string, x: number): StopT => ({ id, time: `1${id.slice(-1)}:00`, title: id, kind: 'activity', place: { name: id, coords: [126 + x, 37] }, leg: { mode: 'bus' } })
  doc.days[0].stops = [P('stopaa1', 0), P('stopaa2', 0.1), P('stopaa3', 0.2), P('stopaa4', 0.3)]
  const orig = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async () => {
    calls++
    if (calls === 1) return new Response(JSON.stringify({ code: 'NoRoute' }), { status: 400 })
    return new Response(JSON.stringify({ routes: [{ distance: 1000, duration: 120, geometry: { coordinates: [[126, 37], [126.05, 37], [126.1, 37]] } }] }), { status: 200 })
  }) as typeof fetch
  try {
    const { doc: out, failed } = await fillRoutes(doc)
    assert.equal(calls, 3, 'no retry for a NoRoute answer, and the next legs still asked')
    assert.equal(failed, 1)
    assert.equal(out.days[0].stops.filter((s) => s.leg?.route).length, 2)
  } finally {
    globalThis.fetch = orig
  }
})

test('transit: polyline decodes to [lng, lat] at precision 6', async () => {
  const { decodePolyline } = await import('../src/lib/routing.js')
  // 37.5547,126.9707 → 37.5550,126.9710 (precision 6, 구글 폴리라인 방식)
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1
    let out = ''
    while (n >= 0x20) {
      out += String.fromCharCode((0x20 | (n & 0x1f)) + 63)
      n >>= 5
    }
    return out + String.fromCharCode(n + 63)
  }
  const pts = [[37554700, 126970700], [37555000, 126971000]]
  let s = ''
  let pl = 0
  let pg = 0
  for (const [la, lg] of pts) {
    s += enc(la - pl) + enc(lg - pg)
    pl = la
    pg = lg
  }
  const got = decodePolyline(s, 6)
  assert.deepEqual(got.map(([x, y]) => [Math.round(x * 1e6), Math.round(y * 1e6)]), [[126970700, 37554700], [126971000, 37555000]])
})

test('transit: asks the trip time first, then the same weekday and time within the coming week', async () => {
  const { transitTimes } = await import('../src/lib/routing.js')
  const now = Date.UTC(2026, 9, 7, 1, 0)
  const DAY = 86_400_000
  // 두 달 뒤 수요일 09:30 → 그 시각 먼저, 다음은 같은 요일·시각의 가까운 날
  const far = new Date(Date.UTC(2026, 11, 9, 0, 30))
  const [a, b] = transitTimes(far, now)
  assert.equal(a.getTime(), far.getTime())
  assert.equal(b.getUTCDay(), far.getUTCDay())
  assert.equal(b.getUTCHours(), 0)
  assert.equal(b.getUTCMinutes(), 30)
  assert.ok(b.getTime() >= now + DAY && b.getTime() < now + 8 * DAY)
  // 이미 지난 날도 가까운 같은 요일로
  const past = new Date(Date.UTC(2026, 8, 1, 3, 0))
  const [, c] = transitTimes(past, now)
  assert.ok(c.getTime() >= now + DAY && c.getTime() < now + 8 * DAY)
  // 이번 주 안의 날이면 그날 하나만
  const soon = new Date(now + 3 * DAY)
  assert.equal(transitTimes(soon, now).length, 1)
})

test('transit: a subway leg asks Transitous with the time the previous stop ends', async () => {
  const { fillRoutes } = await import('../src/lib/routing.js')
  const doc = emptyTrip({ title: 't', startDate: '2026-10-21', nights: 0, tz: 'Asia/Seoul', studentIdDigits: 4 })
  doc.days[0].stops = [
    { id: 'stopbb1', time: '09:00', end: '10:30', title: 'a', kind: 'activity', place: { name: 'a', coords: [126.9707, 37.5547] } },
    { id: 'stopbb2', time: '11:00', title: 'b', kind: 'activity', place: { name: 'b', coords: [126.9735, 37.5759] }, leg: { mode: 'subway' } },
  ]
  const orig = globalThis.fetch
  const urls: string[] = []
  globalThis.fetch = (async (u: string) => {
    urls.push(String(u))
    return new Response(JSON.stringify({ itineraries: [{ duration: 1500, legs: [] }, { duration: 1080, legs: [] }] }), { status: 200 })
  }) as typeof fetch
  try {
    const { doc: out, failed } = await fillRoutes(doc)
    assert.equal(failed, 0)
    assert.equal(urls.length, 1)
    const q = new URL(urls[0])
    assert.equal(q.origin + q.pathname, 'https://api.transitous.org/api/v5/plan')
    assert.equal(q.searchParams.get('fromPlace'), '37.55470,126.97070', 'sent at five decimals')
    // 10:30 KST = 01:30 UTC
    assert.equal(q.searchParams.get('time'), '2026-10-21T01:30:00.000Z')
    assert.equal(out.days[0].stops[1].leg?.route?.min, 18, 'the fastest of the itineraries')
  } finally {
    globalThis.fetch = orig
  }
})

test('routing: concurrent calls are spaced 1.1s apart and the same leg is asked once', async () => {
  const { fetchRoute, forgetRoutes } = await import('../src/lib/routing.js')
  forgetRoutes()
  const orig = globalThis.fetch
  const at: number[] = []
  globalThis.fetch = (async () => {
    at.push(Date.now())
    return new Response(JSON.stringify({ routes: [{ distance: 1000, duration: 120, geometry: { coordinates: [[127, 36], [127.01, 36]] } }] }), { status: 200 })
  }) as typeof fetch
  try {
    const A: [number, number] = [127, 36]
    const B: [number, number] = [127.01, 36]
    const C: [number, number] = [127.02, 36]
    const D: [number, number] = [127.03, 36]
    const [r1, r2] = await Promise.all([fetchRoute('bus', A, B), fetchRoute('bus', A, B), fetchRoute('bus', B, C), fetchRoute('car', C, D)])
    assert.equal(at.length, 3, 'the duplicate leg shares one request')
    assert.deepEqual(r1, r2)
    for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= 1050, `gap ${at[i] - at[i - 1]}ms`)
  } finally {
    globalThis.fetch = orig
  }
})

test('routing: 429 is not retried, malformed answers become straight lines', async () => {
  const { fetchRoute, forgetRoutes } = await import('../src/lib/routing.js')
  forgetRoutes()
  const orig = globalThis.fetch
  let calls = 0
  const answers: Response[] = [
    new Response('', { status: 429 }),
    new Response(JSON.stringify({ itineraries: [{ duration: 600, legs: [{ legGeometry: { points: null } }, 'x', { legGeometry: { points: 12 } }] }] }), { status: 200 }),
    new Response(JSON.stringify({ itineraries: 'nope' }), { status: 200 }),
    new Response(JSON.stringify({ itineraries: [{ duration: 1e300, legs: [] }] }), { status: 200 }),
    new Response(JSON.stringify({ routes: [{ distance: 'x', duration: 60, geometry: { coordinates: [[1, 2]] } }] }), { status: 200 }),
    new Response(JSON.stringify({ routes: [{ distance: 10, duration: 60, geometry: { coordinates: [[500, 2], [1, 2]] } }] }), { status: 200 }),
  ]
  globalThis.fetch = (async () => answers[calls++]) as typeof fetch
  try {
    const P = (x: number): [number, number] => [128 + x / 100, 35]
    assert.equal(await fetchRoute('bus', P(0), P(1)), 'down')
    assert.equal(calls, 1, '429 is not asked again')
    const soon = new Date(Date.now() + 3 * 86_400_000)
    const ok = await fetchRoute('transit', P(1), P(2), soon)
    assert.ok(ok && ok !== 'down' && ok.min === 10 && ok.coords.length === 2, 'bad leg geometry is skipped, time kept')
    assert.equal(await fetchRoute('subway', P(2), P(3), soon), null)
    assert.equal(await fetchRoute('train', P(3), P(4), soon), null, 'absurd duration is refused')
    assert.equal(await fetchRoute('bus', P(4), P(5)), null)
    assert.equal(await fetchRoute('car', P(5), P(6)), null, 'out-of-range coordinates are refused')
  } finally {
    globalThis.fetch = orig
  }
})

test('routing: a doc over the size limit gets coarser routes, then straight lines', async () => {
  const { fitRoutes } = await import('../src/lib/routing.js')
  const doc = emptyTrip({ title: 't', startDate: '2026-10-21', nights: 0, tz: 'Asia/Seoul', studentIdDigits: 4 })
  const zig = (n: number) => Array.from({ length: n }, (_, i) => [127 + i * 0.001, 36 + (i % 2) * 0.01] as [number, number])
  doc.days[0].stops = [0, 1, 2].map((i) => ({ id: `stopcc${i}`, time: `1${i}:00`, title: 's', kind: 'activity' as const, place: { name: 's', coords: [127, 36] as [number, number] }, leg: { mode: 'bus' as const, route: { coords: zig(3000), km: 1, min: 1, from: [127, 36] as [number, number], to: [127, 36] as [number, number] } } }))
  const big = new TextEncoder().encode(JSON.stringify(doc)).length
  const { doc: out, straightened } = fitRoutes(doc, Math.floor(big / 4))
  assert.ok(new TextEncoder().encode(JSON.stringify(out)).length <= Math.floor(big / 4))
  assert.ok(straightened >= 1)
  assert.equal(fitRoutes(doc, big + 10).straightened, 0, 'no change when it already fits')
})

test('routes saved before the caps (over 30 hours) still open, trimmed to the cap', async () => {
  const { TripDoc } = await import('../src/trip/schema.js')
  const doc = emptyTrip({ title: 't', startDate: '2026-10-21', nights: 0, tz: 'Asia/Seoul', studentIdDigits: 4 })
  doc.days[0].stops = [{ id: 'stopdd1', time: '09:00', title: 's', kind: 'activity', place: { name: 's', coords: [127, 36] }, leg: { mode: 'bus', route: { coords: [[126, 36], [127, 36]], km: 4100, min: 2460, from: [126, 36], to: [127, 36] } } }]
  const r = TripDoc.safeParse(doc)
  assert.ok(r.success)
  assert.equal(r.data.days[0].stops[0].leg?.route?.min, 1800)
})

test('routing: an OSRM answer that the schema would refuse is not used', async () => {
  const { fetchRoute, forgetRoutes } = await import('../src/lib/routing.js')
  forgetRoutes()
  const orig = globalThis.fetch
  const answers = [
    { routes: [{ distance: -5000, duration: 60, geometry: { coordinates: [[129, 35], [129.01, 35]] } }] },
    { routes: [{ distance: 1000, duration: 60, geometry: { coordinates: [[129, 35, 'xxx'], [129.01, 35]] } }] },
  ]
  let i = 0
  globalThis.fetch = (async () => new Response(JSON.stringify(answers[i++]), { status: 200 })) as typeof fetch
  try {
    const neg = await fetchRoute('bus', [129, 35], [129.01, 35])
    assert.ok(neg && neg !== 'down' && neg.km === 0, 'negative distance becomes 0')
    const extra = await fetchRoute('car', [129, 35], [129.01, 35])
    assert.ok(extra && extra !== 'down' && extra.coords.every((p) => p.length === 2), 'extra elements dropped')
  } finally {
    globalThis.fetch = orig
  }
})
