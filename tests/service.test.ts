import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MemoryStore } from '../api/_lib/store.js'
import {
  ApiError, changePin, checkSession, cleanup, createTrip, deleteTrip, FAILS_PER_LOCK, getTrip, LOCK_BASE_MS, recover, saveTrip, unlock, logoutAll,
  CREATES_PER_DAY, GLOBAL_FAILS_PER_LOCK, SESSION_SHORT_MS, SESSION_LONG_MS, ipBucket, checkStats, GLOBAL_HARD_STOP, GLOBAL_LEAK_MS, validTripId, type Ctx,
} from '../api/_lib/service.js'
import { handleManifest, handleTrip } from '../api/_lib/http.js'
import { emptyTrip, newId, type TripDoc } from '../src/trip/schema.js'
import { pinProblem, looksLikeDate } from '../src/lib/pinPolicy.js'

const T0 = Date.parse('2026-10-06T00:00:00Z')
function ctx(start = T0) {
  let t = start
  const c: Ctx & { advance: (ms: number) => void } = { store: new MemoryStore(() => t), pepper: 'x'.repeat(40), now: () => t, advance: (ms) => (t += ms) }
  return c
}
const IP = '1.1.1.1'
const PIN = '482916'

const doc = (): TripDoc => {
  const d = emptyTrip({ title: '경주 수학여행', startDate: '2026-10-21', nights: 2, tz: 'Asia/Seoul', studentIdDigits: 4 })
  d.days[0].stops.push({ id: newId(), time: '10:00', title: '불국사', kind: 'activity', place: { name: '불국사', coords: [129.33, 35.79] }, reflect: { on: true } })
  return d
}

async function rejects(p: Promise<unknown>, status: number, code?: string) {
  try {
    await p
  } catch (e) {
    assert.ok(e instanceof ApiError, String(e))
    assert.equal(e.status, status, e.message)
    if (code) assert.equal(e.code, code)
    return e
  }
  assert.fail(`expected ${status}`)
}

test('pin policy: sequences, repeats, dates, trip dates', () => {
  assert.equal(pinProblem('482916'), null)
  for (const bad of ['12345', '123456', '654321', '111111', '121212', 'abc123', '1234567890123', '261021', '20261021', '102126', '211026', '960315', '19960315', '000001', '135790'])
    assert.ok(pinProblem(bad), bad)
  assert.equal(looksLikeDate('483971'), false)
  assert.ok(looksLikeDate('240229'))
  assert.ok(pinProblem('481021', { startDate: '2026-10-21', endDate: '2026-10-23' }))
  assert.equal(pinProblem('904172635'), null)
})

test('create, read, unlock, save, conflict', async () => {
  const c = ctx()
  const r = await createTrip(c, { doc: doc(), pin: PIN, ip: IP })
  assert.match(r.id, /^[a-z2-9]{10}$/)
  assert.match(r.recovery, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  const got = await getTrip(c, r.id)
  for (const v of (c.store as MemoryStore).data.values()) {
    assert.ok(!v.body.includes(PIN))
    assert.ok(!v.body.includes(r.recovery.replace(/-/g, '')))
  }
  await checkSession(c, r.id, r.token)
  const { token } = await unlock(c, r.id, IP, PIN)
  const d2 = { ...got.record.doc, title: '경주 수학여행 (수정)' }
  const saved = await saveTrip(c, r.id, token, { doc: d2, baseEtag: got.etag })
  await rejects(saveTrip(c, r.id, token, { doc: d2, baseEtag: got.etag }), 409, 'conflict')
  await saveTrip(c, r.id, token, { doc: d2, baseEtag: saved.etag })
  await rejects(saveTrip(c, r.id, null, { doc: d2, baseEtag: saved.etag }), 401)
  await rejects(saveTrip(c, r.id, 'A'.repeat(43), { doc: d2, baseEtag: saved.etag }), 401)
})

test('per-address lock at 4/5/6, other address still opens, escalation', async () => {
  const c = ctx()
  const r = await createTrip(c, { doc: doc(), pin: PIN, ip: IP })
  const BAD = '2.2.2.2'
  for (let i = 1; i <= FAILS_PER_LOCK - 1; i++) await rejects(unlock(c, r.id, BAD, '000777'), 401, 'wrong-pin')
  await rejects(unlock(c, r.id, BAD, '000777'), 423, 'locked')
  await rejects(unlock(c, r.id, BAD, PIN), 423, 'locked')
  // 다른 주소의 선생님은 막히지 않는다
  await unlock(c, r.id, IP, PIN)
  c.advance(LOCK_BASE_MS + 1000)
  for (let i = 1; i <= FAILS_PER_LOCK - 1; i++) await rejects(unlock(c, r.id, BAD, '000777'), 401)
  const e = (await rejects(unlock(c, r.id, BAD, '000777'), 423)) as ApiError
  assert.ok(Number(e.extra.lockedUntil) - c.now() >= LOCK_BASE_MS * 2 - 1000)
})

test('IPv6 addresses in one /64 share a counter', async () => {
  assert.equal(ipBucket('2001:db8:1:2:aaaa::1'), ipBucket('2001:0db8:0001:0002:ffff:ffff:ffff:fff0'))
  assert.notEqual(ipBucket('2001:db8:1:2::1'), ipBucket('2001:db8:1:3::1'))
  const c = ctx()
  const r = await createTrip(c, { doc: doc(), pin: PIN, ip: IP })
  for (let i = 0; i < FAILS_PER_LOCK - 1; i++) await rejects(unlock(c, r.id, `2001:db8:1:2::${i + 1}`, '000777'), 401)
  await rejects(unlock(c, r.id, '2001:db8:1:2::99', '000777'), 423, 'locked')
})

test('trip-wide lock after many addresses, recovery still works and clears it', async () => {
  const c = ctx()
  const r = await createTrip(c, { doc: doc(), pin: PIN, ip: IP })
  for (let i = 0; i < GLOBAL_FAILS_PER_LOCK; i++) {
    try {
      await unlock(c, r.id, `10.0.${Math.floor(i / 4)}.${i % 4}`, '000777')
    } catch {
      /* 틀림 */
    }
  }
  await rejects(unlock(c, r.id, IP, PIN), 423, 'locked')
  const rec = await recover(c, r.id, IP, { code: r.recovery, newPin: '591736' })
  assert.notEqual(rec.recovery, r.recovery)
  await unlock(c, r.id, IP, '591736')
  // 쓴 복구 코드는 다시 못 쓴다
  await rejects(recover(c, r.id, IP, { code: r.recovery, newPin: '730184' }), 401, 'wrong-code')
})

test('parallel wrong attempts from one address are all counted', async () => {
  const c = ctx()
  const r = await createTrip(c, { doc: doc(), pin: PIN, ip: IP })
  const results = await Promise.allSettled(Array.from({ length: 12 }, () => unlock(c, r.id, '3.3.3.3', '000777')))
  assert.ok(results.every((x) => x.status === 'rejected'))
  await rejects(unlock(c, r.id, '3.3.3.3', PIN), 423, 'locked')
})

test('a burst of parallel guesses gets at most the allowed number checked (pre-charged attempts)', async () => {
  const c = ctx()
  const r = await createTrip(c, { doc: doc(), pin: PIN, ip: IP })
  checkStats.checks = 0
  const one = await Promise.allSettled(Array.from({ length: 30 }, () => unlock(c, r.id, '5.5.5.5', '000777')))
  assert.ok(checkStats.checks <= FAILS_PER_LOCK, `PIN hash computed ${checkStats.checks} times for one address`)
  const wrong = one.filter((x) => x.status === 'rejected' && (x.reason as ApiError).status === 401).length
  assert.ok(wrong <= FAILS_PER_LOCK - 1, `checked ${wrong} wrong guesses from one address`)
  assert.ok(one.every((x) => x.status === 'rejected' && [401, 423, 503].includes((x.reason as ApiError).status)))
  // 여러 주소로 나눠도 여행 전체로는 50번까지만 확인된다
  const c2 = ctx()
  const r2 = await createTrip(c2, { doc: doc(), pin: PIN, ip: IP })
  let wrong2 = 0
  let busy = 0
  for (let batch = 0; batch < 9; batch++) {
    const many = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => unlock(c2, r2.id, `10.1.${batch}.${i}`, '000777')))
    wrong2 += many.filter((x) => x.status === 'rejected' && (x.reason as ApiError).status === 401).length
    busy += many.filter((x) => x.status === 'rejected' && (x.reason as ApiError).status === 503).length
  }
  assert.ok(wrong2 <= GLOBAL_FAILS_PER_LOCK - 1, `checked ${wrong2} wrong guesses across addresses`)
  // 몰려서 저장하지 못한 요청(503)은 확인 없이 거절됐다. 그만큼 덜 셌으니 잠금은 50번째 기록에서 걸린다.
  if (wrong2 + busy < 90 - 1) await rejects(unlock(c2, r2.id, IP, PIN), 423, 'locked')
})

test('the right PIN on the 5th try opens and gives the try back', async () => {
  const c = ctx()
  const r = await createTrip(c, { doc: doc(), pin: PIN, ip: IP })
  for (let i = 0; i < FAILS_PER_LOCK - 1; i++) await rejects(unlock(c, r.id, '6.6.6.6', '000777'), 401)
  await unlock(c, r.id, '6.6.6.6', PIN)
  // 맞힌 뒤에는 주소별 횟수가 처음부터 다시 센다
  await rejects(unlock(c, r.id, '6.6.6.6', '000777'), 401)
  await unlock(c, r.id, '6.6.6.6', PIN)
  const secret = JSON.parse((await c.store.get(`trips/${r.id}/secret.json`))!.body)
  assert.equal(secret.gFails, FAILS_PER_LOCK, 'only the wrong guesses stay counted trip-wide')
  assert.equal(secret.gLockedUntil, 0)
})

test('recovery code: wrong attempts lock only that address', async () => {
  const c = ctx()
  const r = await createTrip(c, { doc: doc(), pin: PIN, ip: IP })
  for (let i = 0; i < FAILS_PER_LOCK - 1; i++) await rejects(recover(c, r.id, '4.4.4.4', { code: 'AAAA-BBBB-CCCC-DDDD', newPin: '591736' }), 401)
  await rejects(recover(c, r.id, '4.4.4.4', { code: 'AAAA-BBBB-CCCC-DDDD', newPin: '591736' }), 423)
  await rejects(recover(c, r.id, '4.4.4.4', { code: r.recovery, newPin: '591736' }), 423)
  await recover(c, r.id, IP, { code: r.recovery.toLowerCase().replace(/-/g, ' '), newPin: '591736' })
})

test('change pin revokes sessions; logout-all keeps pin', async () => {
  const c = ctx()
  const r = await createTrip(c, { doc: doc(), pin: PIN, ip: IP })
  const other = (await unlock(c, r.id, IP, PIN)).token
  await rejects(changePin(c, r.id, IP, r.token, { pin: PIN, newPin: '123456' }), 422, 'weak-pin')
  await rejects(changePin(c, r.id, IP, r.token, { pin: PIN, newPin: '481021' }), 422, 'weak-pin')
  const { token } = await changePin(c, r.id, IP, r.token, { pin: PIN, newPin: '730184' })
  await rejects(checkSession(c, r.id, other), 401)
  await checkSession(c, r.id, token)
  await logoutAll(c, r.id, IP, { pin: '730184' })
  await rejects(checkSession(c, r.id, token), 401)
  await unlock(c, r.id, IP, '730184')
})

test('session length: 12h by default, 30 days when remembered (boundaries)', async () => {
  const c = ctx()
  const r = await createTrip(c, { doc: doc(), pin: PIN, ip: IP })
  const short = (await unlock(c, r.id, IP, PIN)).token
  const long = (await unlock(c, r.id, IP, PIN, true)).token
  c.advance(SESSION_SHORT_MS - 1000)
  await checkSession(c, r.id, short)
  c.advance(2000)
  await rejects(checkSession(c, r.id, short), 401)
  await checkSession(c, r.id, long)
  c.advance(SESSION_LONG_MS)
  await rejects(checkSession(c, r.id, long), 401)
})

test('pii and invalid docs are rejected; start date bounds', async () => {
  const c = ctx()
  const d = doc()
  d.days[0].stops[0].body = '담당 선생님 010-1234-5678로 연락'
  await rejects(createTrip(c, { doc: d, pin: PIN, ip: IP }), 422, 'pii')
  const d2 = doc()
  d2.before.notes = '숙소 대표 번호 054-123-4567'
  await createTrip(c, { doc: d2, pin: PIN, ip: IP })
  const raw = doc() as unknown as Record<string, unknown>
  await rejects(createTrip(c, { doc: { ...raw, nights: 5 }, pin: PIN, ip: IP }), 422, 'invalid')
  await rejects(createTrip(c, { doc: { ...raw, tz: 'Mars/Base' }, pin: PIN, ip: IP }), 422, 'invalid')
  await rejects(createTrip(c, { doc: { ...raw, startDate: '2099-12-01' }, pin: PIN, ip: IP }), 422, 'invalid')
  await rejects(createTrip(c, { doc: { ...raw, startDate: '2024-01-01' }, pin: PIN, ip: IP }), 422, 'invalid')
})

test('create limit per address per day (N-1, N, N+1)', async () => {
  const c = ctx()
  for (let i = 0; i < CREATES_PER_DAY; i++) await createTrip(c, { doc: doc(), pin: PIN, ip: '9.9.9.9' })
  await rejects(createTrip(c, { doc: doc(), pin: PIN, ip: '9.9.9.9' }), 429, 'rate')
  await createTrip(c, { doc: doc(), pin: PIN, ip: '8.8.8.8' })
  c.advance(86_400_000)
  await createTrip(c, { doc: doc(), pin: PIN, ip: '9.9.9.9' })
})

test('delete needs pin; cleanup removes trips ended over a year ago', async () => {
  const c = ctx()
  const a = await createTrip(c, { doc: doc(), pin: PIN, ip: IP })
  await rejects(deleteTrip(c, a.id, IP, a.token, { pin: '000777' }), 401)
  await deleteTrip(c, a.id, IP, a.token, { pin: PIN })
  await rejects(getTrip(c, a.id), 404)
  assert.equal((await c.store.list(`trips/${a.id}/`)).length, 0)
  const b = await createTrip(c, { doc: doc(), pin: PIN, ip: IP })
  c.advance(Date.parse('2027-10-23T00:00:00Z') - c.now() - 3600_000)
  assert.equal((await cleanup(c)).removed, 0)
  c.advance(2 * 86_400_000)
  assert.equal((await cleanup(c)).removed, 1)
  await rejects(getTrip(c, b.id), 404)
})

test('http: unknown query rejected, id required, fresh only with a session, cross-site writes blocked', async () => {
  const c = ctx(Date.now())
  const created = await (await handleTrip(new Request('http://x/api/trip?op=create', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ doc: { ...doc(), startDate: new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10) }, pin: PIN }) }), c)).json()
  assert.ok(created.id, JSON.stringify(created))
  assert.equal((await handleTrip(new Request(`http://x/api/trip?id=${created.id}&r=1`), c)).status, 400)
  assert.equal((await handleTrip(new Request('http://x/api/trip?op=unlock', { method: 'POST', body: '{}' }), c)).status, 400)
  // 해석하면 같은 주소지만 글자가 다른 것(캐시 열쇠가 달라지는 것)은 모두 거절
  for (const q of [`%69d=${created.id}`, `id=${created.id}&`, `id=${created.id}&fresh`, `id=${created.id.toUpperCase()}`, `fresh=1&id=${created.id}`, `id=${created.id}#x&r=1`.replace('#x', '')])
    assert.equal((await handleTrip(new Request(`http://x/api/trip?${q}`), c)).status, 400, q)
  assert.equal((await handleTrip(new Request(`http://x/api/trip?id=${created.id}&id=${created.id}`), c)).status, 400)
  const pub = await handleTrip(new Request(`http://x/api/trip?id=${created.id}`), c)
  assert.match(pub.headers.get('cache-control') ?? '', /s-maxage=5/)
  // 열쇠 없이, 또는 위조 열쇠로 최신 원본을 달라고 하면 저장소를 읽기 전에 거절한다
  assert.equal((await handleTrip(new Request(`http://x/api/trip?id=${created.id}&fresh=1`), c)).status, 401)
  const reads = { n: 0 }
  const origGet = c.store.get.bind(c.store)
  c.store.get = async (k, o) => (reads.n++, origGet(k, o))
  const forged = `${'A'.repeat(43)}.${'B'.repeat(22)}`
  assert.equal((await handleTrip(new Request(`http://x/api/trip?id=${created.id}&fresh=1`, { headers: { authorization: `Bearer ${forged}` } }), c)).status, 401)
  assert.equal((await handleTrip(new Request(`http://x/api/trip?op=check&id=${created.id}`, { method: 'POST', headers: { authorization: `Bearer ${forged}` }, body: '{}' }), c)).status, 401)
  assert.equal((await handleTrip(new Request(`http://x/api/trip?op=logout&id=${created.id}`, { method: 'POST', headers: { authorization: `Bearer ${forged}` }, body: '{}' }), c)).status, 200)
  assert.equal(reads.n, 0, 'forged keys must not reach storage')
  // 열쇠는 최신 읽기에만: fresh 없이 Authorization 이 붙으면 앞단 캐시를 피하려는 것이므로 거절
  assert.equal((await handleTrip(new Request(`http://x/api/trip?id=${created.id}`, { headers: { authorization: 'Bearer x' } }), c)).status, 400)
  assert.equal((await handleTrip(new Request(`http://x/api/trip/?id=${created.id}`), c)).status, 404)
  assert.equal(reads.n, 0)
  // 홈 화면 앱 정보: 정해진 모양만 여행 이름을 읽는다
  const man = await (await handleManifest(new Request(`http://x/api/manifest?id=${created.id}`), c)).json()
  assert.equal(man.start_url, `/t/${created.id}`)
  const other = await (await handleManifest(new Request(`http://x/api/manifest?id=${created.id}&z=1`), c)).json()
  assert.equal(other.start_url, '/')
  c.store.get = origGet
  const priv = await handleTrip(new Request(`http://x/api/trip?id=${created.id}&fresh=1`, { headers: { authorization: `Bearer ${created.token}` } }), c)
  assert.equal(priv.headers.get('cache-control'), 'no-store')
  const evil = await handleTrip(new Request(`http://x/api/trip?op=unlock&id=${created.id}`, { method: 'POST', headers: { origin: 'https://evil.example' }, body: JSON.stringify({ pin: PIN }) }), c)
  assert.equal(evil.status, 403)
})

test('trip-wide: 100 wrong PINs lock until recovery; the count leaks one per day', async () => {
  const c = ctx()
  const r = await createTrip(c, { doc: doc(), pin: PIN, ip: IP })
  let ipn = 0
  const wrong = async () => {
    try {
      await unlock(c, r.id, `10.9.${Math.floor(ipn / 200)}.${ipn++ % 200}`, '000777')
    } catch (e) {
      return (e as ApiError).code
    }
    return 'ok'
  }
  // 50번 → 1시간 잠금
  for (let i = 0; i < GLOBAL_FAILS_PER_LOCK; i++) await wrong()
  await rejects(unlock(c, r.id, IP, PIN), 423, 'locked')
  // 잠금이 끝난 바로 뒤에는 횟수가 이어진다
  c.advance(61 * 60_000)
  for (let i = 0; i < GLOBAL_HARD_STOP - GLOBAL_FAILS_PER_LOCK - 1; i++) assert.equal(await wrong(), 'wrong-pin')
  assert.equal(await wrong(), 'locked-recovery')
  // 맞는 PIN 도, 며칠이 지나도 PIN 으로는 안 열린다(복구 전용 잠금 중에는 빠지지 않는다)
  c.advance(10 * 86_400_000)
  await rejects(unlock(c, r.id, IP, PIN), 423, 'locked-recovery')
  const info = await checkSession(c, r.id, (await recover(c, r.id, IP, { code: r.recovery, newPin: '591736' })).token)
  assert.equal(info.pinLocked, false)
  await unlock(c, r.id, IP, '591736')

  // 새는 양동이: 하루에 하나씩(경계 N-1·N·N+1 일)
  const c2 = ctx()
  const r2 = await createTrip(c2, { doc: doc(), pin: PIN, ip: IP })
  for (let i = 0; i < 10; i++) await unlock(c2, r2.id, `10.8.0.${i}`, '000777').catch(() => undefined)
  const gf = async () => JSON.parse((await c2.store.get(`trips/${r2.id}/secret.json`))!.body).gFails
  assert.equal(await gf(), 10)
  c2.advance(3 * GLOBAL_LEAK_MS - 60_000)
  await unlock(c2, r2.id, '10.8.1.1', '000777').catch(() => undefined)
  assert.equal(await gf(), 10 - 2 + 1)
  c2.advance(GLOBAL_LEAK_MS)
  await unlock(c2, r2.id, '10.8.1.2', '000777').catch(() => undefined)
  assert.equal(await gf(), 9 - 1 + 1)
  c2.advance(30 * GLOBAL_LEAK_MS)
  await unlock(c2, r2.id, '10.8.1.3', '000777').catch(() => undefined)
  assert.equal(await gf(), 1)
})

test('recovery: no writes before the trip and the new PIN are checked; random trip ids never reach storage', async () => {
  const c = ctx()
  const r = await createTrip(c, { doc: doc(), pin: PIN, ip: IP })
  // 여행 날짜(10/21)가 든 새 PIN 은 차감 없이 거절
  for (let i = 0; i < 20; i++) await rejects(recover(c, r.id, '7.7.6.1', { code: 'AAAA-BBBB-CCCC-DDDD', newPin: '981021' }), 422, 'weak-pin')
  assert.equal((await c.store.list(`trips/${r.id}/attempts/`)).length, 0)
  // 없는 여행에는 시도 파일을 만들지 않는다
  const fake = 'abcdefgh' + (r.id.slice(8) === 'zz' ? 'yy' : 'zz')
  await rejects(recover(c, fake, '7.7.6.2', { code: 'AAAA-BBBB-CCCC-DDDD', newPin: '591736' }), 404)
  assert.equal((await c.store.list(`trips/${fake}/`)).length, 0)
  assert.equal(validTripId(c, r.id), true)
  const reads = { n: 0 }
  const origGet = c.store.get.bind(c.store)
  c.store.get = async (k, o) => (reads.n++, origGet(k, o))
  let rejected = 0
  for (let i = 0; i < 50; i++) {
    const id = Array.from({ length: 10 }, () => 'abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 32)]).join('')
    if (validTripId(c, id)) continue
    rejected++
    assert.equal((await handleTrip(new Request(`http://x/api/trip?id=${id}`), c)).status, 404)
  }
  assert.ok(rejected >= 45)
  assert.equal(reads.n, 0, 'unsigned trip ids must not reach storage')
  c.store.get = origGet
})

test('recovery codes: badly shaped codes cost nothing; codes are checked with one HMAC', async () => {
  const c = ctx()
  const r = await createTrip(c, { doc: doc(), pin: PIN, ip: IP })
  for (let i = 0; i < 20; i++) await rejects(recover(c, r.id, '7.7.7.7', { code: 'not-a-code', newPin: '591736' }), 401, 'wrong-code')
  assert.equal((await c.store.list(`trips/${r.id}/attempts/`)).length, 0, 'shape failures leave no attempt files')
  const secret = JSON.parse((await c.store.get(`trips/${r.id}/secret.json`))!.body)
  assert.equal(secret.recovery.iter, 0)
  checkStats.checks = 0
  await rejects(recover(c, r.id, '7.7.7.8', { code: 'AAAA-BBBB-CCCC-DDDD', newPin: '591736' }), 401, 'wrong-code')
  assert.equal(checkStats.checks, 1)
})

test('cleanup removes attempt files untouched for two days without opening them', async () => {
  const c = ctx()
  const r = await createTrip(c, { doc: doc(), pin: PIN, ip: IP })
  for (let i = 0; i < 30; i++) await unlock(c, r.id, `10.7.0.${i}`, '000777').catch(() => undefined)
  c.advance(86_400_000)
  await unlock(c, r.id, '10.7.1.1', '000777').catch(() => undefined)
  c.advance(86_400_000 + 60_000)
  const reads = { n: 0 }
  const origGet = c.store.get.bind(c.store)
  c.store.get = async (k, o) => (k.includes('/attempts/') && reads.n++, origGet(k, o))
  const out = await cleanup(c)
  c.store.get = origGet
  assert.equal(out.attempts, 30)
  assert.equal(reads.n, 0)
  assert.equal((await c.store.list(`trips/${r.id}/attempts/`)).length, 1)
})

test('IPv4-mapped IPv6 addresses count as the IPv4 address', () => {
  assert.equal(ipBucket('::ffff:1.2.3.4'), '1.2.3.4')
  assert.notEqual(ipBucket('::ffff:1.2.3.4'), ipBucket('::ffff:5.6.7.8'))
})

test('the teacher notice counts wrong PINs since the last PIN change', async () => {
  const c = ctx()
  const r = await createTrip(c, { doc: doc(), pin: PIN, ip: IP })
  for (let i = 0; i < 7; i++) await unlock(c, r.id, `10.6.0.${i}`, '000777').catch(() => undefined)
  assert.equal((await checkSession(c, r.id, r.token)).wrongPins, 7)
  const { token } = await changePin(c, r.id, IP, r.token, { pin: PIN, newPin: '730184' })
  assert.equal((await checkSession(c, r.id, token)).wrongPins, 0)
  await unlock(c, r.id, '10.6.1.1', '000777').catch(() => undefined)
  assert.equal((await checkSession(c, r.id, token)).wrongPins, 1)
})

test('a weak ETag from a compressed read still matches the saved version', async () => {
  const c = ctx()
  const r = await createTrip(c, { doc: doc(), pin: PIN, ip: IP })
  const got = await getTrip(c, r.id)
  const d2 = { ...got.record.doc, title: '두 번째 저장' }
  const saved = await saveTrip(c, r.id, r.token, { doc: d2, baseEtag: `W/${got.etag}` })
  await saveTrip(c, r.id, r.token, { doc: { ...d2, title: '세 번째 저장' }, baseEtag: `W/${saved.etag}` })
})
