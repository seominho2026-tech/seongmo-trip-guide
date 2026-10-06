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
