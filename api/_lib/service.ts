/**
 * 여행 저장·PIN 확인의 실제 규칙. 저장소와 시각·비밀값을 밖에서 받아, 시험에서 그대로 돌릴 수 있다.
 *
 * 저장 위치(전부 비공개)
 *   trips/<id>/doc.json                 안내 문서(누구나 읽기 가능, 쓰기는 편집 열쇠로만)
 *   trips/<id>/secret.json              PIN·복구 코드의 해시, 편집 열쇠 해시, 여행 전체 틀린 횟수
 *   trips/<id>/attempts/<ip해시>.json   그 인터넷 주소의 틀린 횟수(PIN·복구 코드)
 *   rate/<날짜>/<ip해시>.json            하루 새 여행 만들기 횟수(+ _all.json 전체 한도)
 *
 * PIN 원문은 어디에도 남기지 않는다. PBKDF2-SHA256(여행마다 다른 salt + 서버 비밀값)으로 바꾼 값만 둔다.
 * 확인은 이 서버에서만 한다.
 *  - 한 인터넷 주소에서 5번 틀리면 15분 잠그고, 계속 틀리면 두 배씩 길어진다(최대 24시간). 다른 주소의 선생님은 막히지 않는다.
 *  - 여행 전체로 50번 틀리면(여러 주소에서 나눠 시도) 1시간 잠그고, 50번마다 두 배(최대 24시간). 하루 동안 틀림이 없으면 다시 센다.
 *  - 복구 코드(약 79비트)는 주소별로만 막는다. 누가 PIN 을 일부러 틀려 잠가도 선생님은 복구 코드로 들어올 수 있다.
 * 틀린 횟수는 조건부 쓰기(ETag)로 세어, 동시에 여러 번 넣어도 새지 않는다.
 */
import { createHash, createHmac, pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { DOC_MAX_BYTES, TripDoc, type TripDoc as TripDocT } from '../../src/trip/schema.js'
import { findPii, PII_LABEL } from '../../src/lib/pii.js'
import { normalizeRecovery, pinProblem, RECOVERY_ABC } from '../../src/lib/pinPolicy.js'
import { PreconditionFailed, strongEtag, type Store } from './store.js'

const pbkdf2Async = promisify(pbkdf2)

export const PIN_ITER = 210_000
export const FAILS_PER_LOCK = 5
export const LOCK_BASE_MS = 15 * 60_000
export const LOCK_MAX_MS = 24 * 60 * 60_000
export const GLOBAL_FAILS_PER_LOCK = 50
export const GLOBAL_LOCK_BASE_MS = 60 * 60_000
/** 여행 전체 틀린 횟수는 하루에 1씩 빠진다(새는 양동이). 가끔 하는 오타는 쌓이지 않고, 오래 버티는 시도는 하루 1번 꼴로 묶인다 */
export const GLOBAL_LEAK_MS = 24 * 60 * 60_000
/** 여행 전체로 이만큼 틀리면 복구 코드로 새 PIN을 정하기 전까지 PIN 을 받지 않는다 */
export const GLOBAL_HARD_STOP = 100
/** 이 시각까지 잠그면 '복구 코드로만 풀림' */
export const UNTIL_RECOVERY = 8_640_000_000_000_000
/** 이 기기 기억하기를 안 고르면 12시간, 고르면 30일 */
export const SESSION_SHORT_MS = 12 * 60 * 60_000
export const SESSION_LONG_MS = 30 * 24 * 60 * 60_000
export const SESSIONS_MAX = 20
export const CREATES_PER_DAY = 10
export const CREATES_PER_DAY_ALL = 300
const DAY = 86_400_000

type Hashed = { salt: string; hash: string; iter: number }
type Session = { h: string; exp: number; at: number }
export type Secret = {
  v: 2
  pin: Hashed
  recovery: Hashed
  sessions: Session[]
  /** 여행 전체로 틀린 PIN 횟수(마지막 틀림에서 하루 지나면 0) */
  gFails: number
  gLastFail: number
  gLockedUntil: number
  /** PIN 을 마지막으로 바꿀 때의 gFails(선생님에게 보여 줄 횟수는 그 뒤부터 센다. 잠금 계산은 gFails 그대로) */
  gSeen?: number
  createdAt: number
}
type Attempts = { fails: number; lockedUntil: number; rfails: number; rLockedUntil: number; last: number }
export type DocRecord = { v: 1; doc: TripDocT; createdAt: string; updatedAt: string }

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message)
  }
}

export type Ctx = { store: Store; pepper: string; now: () => number }

const ID_ABC = 'abcdefghijkmnpqrstuvwxyz23456789'
export const ID_RE = /^[a-z2-9]{10}$/

/** 여행 주소 = 난수 8자 + 서버 서명 2자. 아무렇게나 지은 주소는 저장소를 읽기 전에 거른다(1024개 중 1023개) */
function idSig(ctx: Ctx, prefix: string): string {
  const h = createHmac('sha256', ctx.pepper).update(`id:${prefix}`).digest()
  return ID_ABC[h[0] & 31] + ID_ABC[h[1] & 31]
}
export function validTripId(ctx: Ctx, id: string): boolean {
  return ID_RE.test(id) && [...id].every((ch) => ID_ABC.includes(ch)) && idSig(ctx, id.slice(0, 8)) === id.slice(8)
}
function newTripId(ctx: Ctx): string {
  const prefix = randomFrom(ID_ABC, 8)
  return prefix + idSig(ctx, prefix)
}

function randomFrom(abc: string, len: number): string {
  const out: string[] = []
  while (out.length < len) {
    for (const b of randomBytes(len * 2)) {
      // 고르게 뽑으려고 알파벳 길이의 배수 안쪽 값만 쓴다
      if (b < 256 - (256 % abc.length)) out.push(abc[b % abc.length])
      if (out.length === len) break
    }
  }
  return out.join('')
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const docKey = (id: string) => `trips/${id}/doc.json`
const secretKey = (id: string) => `trips/${id}/secret.json`
const attemptsKey = (id: string, ipHash: string) => `trips/${id}/attempts/${ipHash}.json`

async function hashSecret(ctx: Ctx, value: string, salt = randomBytes(16).toString('base64url'), iter = PIN_ITER): Promise<Hashed> {
  const key = await pbkdf2Async(value, `${salt}:${ctx.pepper}`, iter, 32, 'sha256')
  return { salt, hash: key.toString('base64url'), iter }
}

/** 복구 코드(약 79비트 난수)는 늘이기가 필요 없어 HMAC 한 번으로 둔다(iter 0) */
function hmacSecret(ctx: Ctx, value: string, salt = randomBytes(16).toString('base64url')): Hashed {
  return { salt, hash: createHmac('sha256', ctx.pepper).update(`${salt}:${value}`).digest('base64url'), iter: 0 }
}

/** 시험 전용: PIN·복구 코드 확인 횟수(운영 동작에는 쓰지 않는다) */
export const checkStats = { checks: 0 }

async function matches(ctx: Ctx, value: string, h: Hashed): Promise<boolean> {
  checkStats.checks++
  const got = h.iter === 0 ? hmacSecret(ctx, value, h.salt) : await hashSecret(ctx, value, h.salt, h.iter)
  const a = Buffer.from(got.hash)
  const b = Buffer.from(h.hash)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** n번째 틀림에서 걸 잠금 시간(per 번마다, 두 배씩) */
function lockFor(fails: number, per: number, base: number): number {
  if (fails < per || fails % per !== 0) return 0
  return Math.min(LOCK_MAX_MS, base * 2 ** (fails / per - 1))
}

export function endDateOf(doc: { startDate: string; nights: number }): string {
  return new Date(Date.parse(`${doc.startDate}T00:00:00Z`) + doc.nights * DAY).toISOString().slice(0, 10)
}

export function validateDoc(input: unknown, now: number): TripDocT {
  const parsed = TripDoc.safeParse(input)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    throw new ApiError(422, 'invalid', `안내 내용을 저장할 수 없어요: ${first?.message ?? '형식이 맞지 않아요'}`, { path: first?.path })
  }
  const start = Date.parse(`${parsed.data.startDate}T00:00:00Z`)
  if (!(start > now - 365 * DAY && start < now + 3 * 365 * DAY)) throw new ApiError(422, 'invalid', '출발일은 1년 전부터 3년 뒤 사이로 정해 주세요.', { path: ['startDate'] })
  const bytes = Buffer.byteLength(JSON.stringify(parsed.data))
  if (bytes > DOC_MAX_BYTES) throw new ApiError(413, 'too-large', '안내 내용이 너무 길어요. 길게 쓴 안내를 나눠 줄여 주세요.')
  const pii = findPii(parsed.data)
  if (pii.length) {
    const h = pii[0]
    throw new ApiError(422, 'pii', `${h.where}에 ${PII_LABEL[h.kind]}로 보이는 글이 있어요. 링크만 있으면 누구나 보는 안내라 저장하지 않았어요.`, { hits: pii })
  }
  return parsed.data
}

function checkPin(pin: unknown, trip?: { startDate: string; nights: number }): string {
  if (typeof pin !== 'string') throw new ApiError(400, 'pin', 'PIN을 적어 주세요.')
  const problem = pinProblem(pin, trip ? { startDate: trip.startDate, endDate: endDateOf(trip) } : undefined)
  if (problem) throw new ApiError(422, 'weak-pin', problem)
  return pin
}

async function readSecret(ctx: Ctx, id: string) {
  const s = await ctx.store.get(secretKey(id), { fresh: true })
  if (!s) throw new ApiError(404, 'not-found', '이 여행을 찾을 수 없어요.')
  return { secret: withDefaults(JSON.parse(s.body) as Secret), etag: s.etag }
}

/** 처음 판 기록에는 여행 전체 칸이 없다(없으면 0) */
function withDefaults(s: Secret): Secret {
  s.gFails = Number(s.gFails) || 0
  s.gLastFail = Number(s.gLastFail) || 0
  s.gLockedUntil = Number(s.gLockedUntil) || 0
  return s
}

/** 한 파일을 조건부 쓰기로 고친다. 그 사이 다른 요청이 고쳤으면 다시 읽고 다시 고친다. */
async function updateJson<T, R>(ctx: Ctx, key: string, init: () => T | null, fn: (cur: T) => { next: T | null; result: R }): Promise<R> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const s = await ctx.store.get(key, { fresh: true })
    const cur = s ? (JSON.parse(s.body) as T) : init()
    if (cur === null) throw new ApiError(404, 'not-found', '이 여행을 찾을 수 없어요.')
    const { next, result } = fn(structuredClone(cur))
    if (!next) return result
    try {
      await ctx.store.put(key, JSON.stringify(next), s ? { ifMatch: s.etag } : { create: true })
      return result
    } catch (e) {
      if (e instanceof PreconditionFailed) continue
      throw e
    }
  }
  throw new ApiError(503, 'busy', '요청이 몰려 처리하지 못했어요. 잠시 뒤 다시 해 주세요.')
}

const updateSecret = <R>(ctx: Ctx, id: string, fn: (s: Secret) => { next: Secret | null; result: R }) => updateJson<Secret, R>(ctx, secretKey(id), () => null, (s) => fn(withDefaults(s)))
const emptyAttempts = (): Attempts => ({ fails: 0, lockedUntil: 0, rfails: 0, rLockedUntil: 0, last: 0 })

/** 편집 열쇠 = 난수 + 서버 서명. 서명이 안 맞는 열쇠는 저장소를 읽기 전에 거절한다(위조 열쇠로 원본 읽기를 일으키지 못하게). */
const tokenSig = (ctx: Ctx, id: string, rand: string) => createHmac('sha256', ctx.pepper).update(`tok:${id}:${rand}`).digest('base64url').slice(0, 22)

function tokenLooksSigned(ctx: Ctx, id: string, token: string): boolean {
  const m = /^([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{22})$/.exec(token)
  if (!m) return false
  const want = Buffer.from(tokenSig(ctx, id, m[1]))
  const got = Buffer.from(m[2])
  return want.length === got.length && timingSafeEqual(want, got)
}

function issueSession(ctx: Ctx, id: string, s: Secret, remember: boolean): string {
  const rand = randomBytes(32).toString('base64url')
  const token = `${rand}.${tokenSig(ctx, id, rand)}`
  const now = ctx.now()
  s.sessions = [...s.sessions.filter((x) => x.exp > now), { h: sha256(token), exp: now + (remember ? SESSION_LONG_MS : SESSION_SHORT_MS), at: now }].slice(-SESSIONS_MAX)
  return token
}

async function requireSession(ctx: Ctx, id: string, token: string | null): Promise<void> {
  if (!token || !tokenLooksSigned(ctx, id, token)) throw new ApiError(401, 'no-session', '편집하려면 PIN을 다시 넣어 주세요.')
  const { secret } = await readSecret(ctx, id)
  const h = sha256(token)
  if (!secret.sessions.some((x) => x.h === h && x.exp > ctx.now())) throw new ApiError(401, 'no-session', '편집하려면 PIN을 다시 넣어 주세요.')
}

/** 열쇠가 살아 있으면 여행 전체 틀린 PIN 횟수도 함께(선생님이 모르는 시도를 알아챌 수 있게) */
export async function sessionInfo(ctx: Ctx, id: string, token: string | null): Promise<{ wrongPins: number; pinLocked: boolean }> {
  if (!token || !tokenLooksSigned(ctx, id, token)) throw new ApiError(401, 'no-session', '편집하려면 PIN을 다시 넣어 주세요.')
  const { secret } = await readSecret(ctx, id)
  const h = sha256(token)
  if (!secret.sessions.some((x) => x.h === h && x.exp > ctx.now())) throw new ApiError(401, 'no-session', '편집하려면 PIN을 다시 넣어 주세요.')
  const now = ctx.now()
  return { wrongPins: Math.max(0, leaked(secret, now) - (secret.gSeen ?? 0)), pinLocked: secret.gLockedUntil >= UNTIL_RECOVERY }
}

export async function hasSession(ctx: Ctx, id: string, token: string | null): Promise<boolean> {
  try {
    await requireSession(ctx, id, token)
    return true
  } catch {
    return false
  }
}

export function newRecoveryCode(): string {
  return randomFrom(RECOVERY_ABC, 16).match(/.{4}/g)!.join('-')
}

/** IPv6 는 /64 로 묶는다(한 기기가 주소를 무한히 바꿔 가며 쓰지 못하게) */
export function ipBucket(ip: string): string {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip.trim())
  if (mapped) return mapped[1]
  if (!ip.includes(':')) return ip
  const raw = ip.split('%')[0]
  let groups: string[]
  if (raw.includes('::')) {
    const [a, b] = raw.split('::')
    const l = a ? a.split(':') : []
    const r = b ? b.split(':') : []
    groups = [...l, ...Array(Math.max(0, 8 - l.length - r.length)).fill('0'), ...r]
  } else groups = raw.split(':')
  return groups.slice(0, 4).map((x) => (x.toLowerCase().replace(/^0+/, '') || '0')).join(':') + '::/64'
}

export function ipHashOf(ctx: Ctx, ip: string): string {
  return sha256(`${ctx.pepper}:ip:${ipBucket(ip)}`).slice(0, 24)
}

async function bumpCreateCount(ctx: Ctx, ipHash: string) {
  const day = new Date(ctx.now()).toISOString().slice(0, 10)
  const bump = (key: string, max: number, message: string) =>
    updateJson<{ n: number }, void>(ctx, `rate/${day}/${key}.json`, () => ({ n: 0 }), (cur) => {
      if (cur.n >= max) throw new ApiError(429, 'rate', message)
      return { next: { n: cur.n + 1 }, result: undefined }
    })
  await bump(ipHash, CREATES_PER_DAY, '오늘은 이 인터넷에서 새 여행을 더 만들 수 없어요. 내일 다시 해 주세요.')
  await bump('_all', CREATES_PER_DAY_ALL, '오늘은 새 여행을 더 만들 수 없어요. 내일 다시 해 주세요.')
}

// ───────── 공개 동작 ─────────

export async function getTrip(ctx: Ctx, id: string, opts: { fresh?: boolean } = {}): Promise<{ record: DocRecord; etag: string }> {
  if (!ID_RE.test(id)) throw new ApiError(404, 'not-found', '이 여행을 찾을 수 없어요.')
  // 안내는 저장소 캐시를 거치지 않고 읽는다(고친 내용·지운 여행이 1~2분 남지 않게). 읽는 횟수는 앞단 캐시(10초)가 줄인다.
  void opts
  const s = await ctx.store.get(docKey(id), { fresh: true })
  if (!s) throw new ApiError(404, 'not-found', '이 여행을 찾을 수 없어요. 주소가 맞는지, 지워진 여행은 아닌지 확인해 주세요.')
  return { record: JSON.parse(s.body) as DocRecord, etag: s.etag }
}

/** 홈 화면 앱 이름처럼 늦어도 되는 곳은 저장소 캐시를 거쳐 읽는다 */
export async function getTripCached(ctx: Ctx, id: string): Promise<DocRecord | null> {
  if (!validTripId(ctx, id)) return null
  const s = await ctx.store.get(docKey(id), { fresh: false })
  return s ? (JSON.parse(s.body) as DocRecord) : null
}

export async function createTrip(ctx: Ctx, input: { doc: unknown; pin: unknown; ip: string }) {
  const doc = validateDoc(input.doc, ctx.now())
  const pin = checkPin(input.pin, doc)
  await bumpCreateCount(ctx, ipHashOf(ctx, input.ip))
  const recovery = newRecoveryCode()
  const secret: Secret = {
    v: 2,
    pin: await hashSecret(ctx, pin),
    recovery: hmacSecret(ctx, normalizeRecovery(recovery)),
    sessions: [],
    gFails: 0,
    gLastFail: 0,
    gLockedUntil: 0,
    createdAt: ctx.now(),
  }
  const stamp = new Date(ctx.now()).toISOString()
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = newTripId(ctx)
    secret.sessions = []
    const token = issueSession(ctx, id, secret, false)
    try {
      await ctx.store.put(secretKey(id), JSON.stringify(secret), { create: true })
    } catch (e) {
      if (e instanceof PreconditionFailed) continue
      throw e
    }
    const record: DocRecord = { v: 1, doc, createdAt: stamp, updatedAt: stamp }
    const { etag } = await ctx.store.put(docKey(id), JSON.stringify(record), { create: true })
    return { id, token, recovery, etag, updatedAt: stamp }
  }
  throw new ApiError(503, 'busy', '여행 주소를 만들지 못했어요. 다시 해 주세요.')
}

/** scope: 이 인터넷 주소만 잠겼는지(address), 여행 전체가 잠겼는지(trip) */
function lockedError(until: number, what: 'PIN' | '복구 코드' = 'PIN', scope: 'address' | 'trip' = 'address') {
  if (until >= UNTIL_RECOVERY) return new ApiError(423, 'locked-recovery', 'PIN이 너무 여러 번 틀려 잠겼어요. 복구 코드로 새 PIN을 정해 주세요.', { recoveryOnly: true })
  return new ApiError(423, 'locked', `${what}${what === 'PIN' ? '을' : '를'} 여러 번 틀려 잠시 잠겼어요.`, { lockedUntil: until, scope })
}


/**
 * 한 번 시도할 권리를 먼저 쓴다(선차감). 확인하기 전에 틀린 횟수를 하나 올려 저장하고, 저장에 성공한 요청만 확인한다.
 * 그래서 동시에 수백 건을 보내도 잠기기 전까지 확인되는 것은 정해진 횟수(주소별 5번, 여행 전체 50번)뿐이다.
 * 맞으면 쓴 것을 되돌린다. 저장이 몰려 실패하면 확인하지 않고 거절한다.
 */
async function chargeAttempt(ctx: Ctx, key: string, kind: 'pin' | 'recovery', now: number) {
  return updateJson<Attempts, { fails: number; lockSet: boolean; until: number }>(ctx, key, emptyAttempts, (cur) => {
    const until = kind === 'pin' ? cur.lockedUntil : cur.rLockedUntil
    if (until > now) throw lockedError(until, kind === 'pin' ? 'PIN' : '복구 코드')
    const fails = (kind === 'pin' ? cur.fails : cur.rfails) + 1
    const lock = lockFor(fails, FAILS_PER_LOCK, LOCK_BASE_MS)
    if (kind === 'pin') {
      cur.fails = fails
      if (lock) cur.lockedUntil = now + lock
    } else {
      cur.rfails = fails
      if (lock) cur.rLockedUntil = now + lock
    }
    cur.last = now
    return { next: cur, result: { fails, lockSet: !!lock, until: lock ? now + lock : 0 } }
  })
}

/** 확인 없이 끝난 시도는 주소별 횟수를 돌려준다(여행 전체 차감이 잠금·경합으로 실패했을 때) */
async function refundAttempt(ctx: Ctx, key: string, kind: 'pin' | 'recovery', charged: { lockSet: boolean; until: number }) {
  await updateJson<Attempts, null>(ctx, key, emptyAttempts, (cur) => {
    if (kind === 'pin') {
      cur.fails = Math.max(0, cur.fails - 1)
      if (charged.lockSet && cur.lockedUntil === charged.until) cur.lockedUntil = 0
    } else {
      cur.rfails = Math.max(0, cur.rfails - 1)
      if (charged.lockSet && cur.rLockedUntil === charged.until) cur.rLockedUntil = 0
    }
    return { next: cur, result: null }
  }).catch(() => undefined)
}

/** 새는 양동이: 마지막 틀림(잠금 중이었으면 잠금이 끝난 때)부터 지난 날수만큼 뺀 여행 전체 틀린 횟수. 복구 전용 잠금 중에는 빠지지 않는다 */
function leaked(s: Secret, now: number): number {
  if (s.gLockedUntil >= UNTIL_RECOVERY) return s.gFails
  const since = Math.max(s.gLastFail, Math.min(s.gLockedUntil, now))
  if (!since) return s.gFails
  return Math.max(0, s.gFails - Math.floor((now - since) / GLOBAL_LEAK_MS))
}

/**
 * PIN 을 확인하고, 맞으면 onOk 로 비밀 기록을 고친다.
 * 순서: 여행 전체 잠금 확인 → 주소별 시도 선차감 → 여행 전체 시도 선차감 → PIN 해시 한 번 계산 → 맞으면 되돌리고 onOk.
 */
async function withPin<T>(ctx: Ctx, id: string, ip: string, pin: unknown, onOk: (s: Secret) => T): Promise<T> {
  if (typeof pin !== 'string' || !/^\d{1,12}$/.test(pin)) throw new ApiError(400, 'pin', 'PIN은 숫자로 적어 주세요.')
  const aKey = attemptsKey(id, ipHashOf(ctx, ip))
  const now = ctx.now()
  // 여행 전체가 잠겼으면 주소별 횟수를 쓰지 않고 바로 알린다
  const first = await readSecret(ctx, id)
  if (first.secret.gLockedUntil > now) throw lockedError(first.secret.gLockedUntil, 'PIN', 'trip')
  const a = await chargeAttempt(ctx, aKey, 'pin', now)
  let g: { pin: Hashed; lockSet: boolean; until: number }
  try {
    g = await updateSecret(ctx, id, (s) => {
      if (s.gLockedUntil > now) throw lockedError(s.gLockedUntil, 'PIN', 'trip')
      s.gFails = leaked(s, now)
      s.gSeen = Math.min(s.gSeen ?? 0, s.gFails)
      s.gFails += 1
      s.gLastFail = now
      // 100번째 틀림부터는 복구 코드로만 풀린다. 그 전에는 50번마다 1시간부터 두 배씩(최대 24시간).
      const lock = s.gFails >= GLOBAL_HARD_STOP ? UNTIL_RECOVERY : lockFor(s.gFails, GLOBAL_FAILS_PER_LOCK, GLOBAL_LOCK_BASE_MS)
      if (lock) s.gLockedUntil = lock === UNTIL_RECOVERY ? UNTIL_RECOVERY : now + lock
      return { next: s, result: { pin: s.pin, lockSet: !!lock, until: s.gLockedUntil } }
    })
  } catch (e) {
    // 확인을 못 했으니 주소별로 쓴 시도는 돌려준다
    await refundAttempt(ctx, aKey, 'pin', a)
    throw e
  }
  const ok = await matches(ctx, pin, g.pin)

  if (ok) {
    const result = await updateSecret<T>(ctx, id, (s) => {
      // 그 사이 PIN 이 바뀌었으면 이번 판정은 무효
      if (s.pin.hash !== g.pin.hash) throw new ApiError(409, 'pin-changed', 'PIN이 방금 바뀌었어요. 새 PIN으로 다시 넣어 주세요.')
      // 이번에 쓴 시도는 되돌린다(이번 시도가 건 잠금도)
      s.gFails = Math.max(0, s.gFails - 1)
      if (g.lockSet && s.gLockedUntil === g.until) s.gLockedUntil = 0
      return { next: s, result: onOk(s) }
    })
    await updateJson<Attempts, null>(ctx, aKey, emptyAttempts, (cur) => ({ next: { ...cur, fails: 0, lockedUntil: 0 }, result: null })).catch(() => undefined)
    return result
  }

  if (g.lockSet && g.until >= UNTIL_RECOVERY) throw lockedError(g.until)
  if (a.lockSet) throw lockedError(a.until)
  if (g.lockSet) throw lockedError(g.until, 'PIN', 'trip')
  const left = FAILS_PER_LOCK - (a.fails % FAILS_PER_LOCK)
  throw new ApiError(401, 'wrong-pin', `PIN이 맞지 않아요. ${left}번 더 틀리면 잠시 잠겨요.`, { left })
}

export async function unlock(ctx: Ctx, id: string, ip: string, pin: unknown, remember = false): Promise<{ token: string }> {
  return withPin(ctx, id, ip, pin, (s) => ({ token: issueSession(ctx, id, s, remember) }))
}

export async function checkSession(ctx: Ctx, id: string, token: string | null) {
  const info = await sessionInfo(ctx, id, token)
  return { ok: true, ...info }
}

export async function saveTrip(ctx: Ctx, id: string, token: string | null, input: { doc: unknown; baseEtag: unknown }) {
  await requireSession(ctx, id, token)
  const doc = validateDoc(input.doc, ctx.now())
  const cur = await getTrip(ctx, id, { fresh: true })
  if (typeof input.baseEtag !== 'string' || strongEtag(input.baseEtag) !== cur.etag) {
    throw new ApiError(409, 'conflict', '그 사이 다른 선생님이 안내를 고쳤어요. 최신 내용을 불러온 뒤 다시 고쳐 주세요.', { etag: cur.etag, updatedAt: cur.record.updatedAt })
  }
  const stamp = new Date(ctx.now()).toISOString()
  const record: DocRecord = { ...cur.record, doc, updatedAt: stamp }
  try {
    const { etag } = await ctx.store.put(docKey(id), JSON.stringify(record), { ifMatch: cur.etag })
    return { etag, updatedAt: stamp }
  } catch (e) {
    if (e instanceof PreconditionFailed) throw new ApiError(409, 'conflict', '그 사이 다른 선생님이 안내를 고쳤어요. 최신 내용을 불러온 뒤 다시 고쳐 주세요.')
    throw e
  }
}

export async function changePin(ctx: Ctx, id: string, ip: string, token: string | null, input: { pin: unknown; newPin: unknown }) {
  await requireSession(ctx, id, token)
  const { record } = await getTrip(ctx, id, { fresh: true })
  const newPin = checkPin(input.newPin, record.doc)
  const next = await hashSecret(ctx, newPin)
  return withPin(ctx, id, ip, input.pin, (s) => {
    s.pin = next
    s.sessions = []
    s.gSeen = s.gFails
    return { token: issueSession(ctx, id, s, false) }
  })
}

/** 모든 기기의 편집 열쇠를 지운다(PIN 은 그대로). 공용 컴퓨터에 열어 둔 편집 화면을 닫을 때 */
export async function logoutAll(ctx: Ctx, id: string, ip: string, input: { pin: unknown }) {
  return withPin(ctx, id, ip, input.pin, (s) => {
    s.sessions = []
    return { ok: true as const }
  })
}

/** 복구 코드로 새 PIN. 성공하면 복구 코드를 새로 바꿔 한 번 보여 준다(쓴 코드는 더 못 쓴다). */
export async function recover(ctx: Ctx, id: string, ip: string, input: { code: unknown; newPin: unknown }) {
  if (typeof input.code !== 'string') throw new ApiError(400, 'code', '복구 코드를 적어 주세요.')
  const code = normalizeRecovery(input.code)
  // 모양이 틀린 코드는 저장소를 읽기 전에 돌려보낸다
  if (code.length !== 16 || [...code].some((ch) => !RECOVERY_ABC.includes(ch))) throw new ApiError(401, 'wrong-code', '복구 코드가 맞지 않아요.')
  // 쓰기 전에 확인할 수 있는 것은 모두 먼저 본다: 새 PIN 규칙, 여행이 있는지, 여행 날짜가 든 PIN 인지(공개된 안내로 판단하므로 먼저 알려 줘도 새는 것이 없다)
  checkPin(input.newPin)
  const { record } = await getTrip(ctx, id, { fresh: true })
  const newPin = checkPin(input.newPin, record.doc)
  const now = ctx.now()
  const aKey = attemptsKey(id, ipHashOf(ctx, ip))
  // 복구 코드도 먼저 한 번 쓴 것으로 센 뒤 확인한다(주소별 5번마다 잠금)
  const a = await chargeAttempt(ctx, aKey, 'recovery', now)
  const { secret } = await readSecret(ctx, id)
  const recHash = secret.recovery.hash
  const ok = await matches(ctx, code, secret.recovery)
  if (!ok) {
    if (a.lockSet) throw lockedError(a.until, '복구 코드')
    throw new ApiError(401, 'wrong-code', '복구 코드가 맞지 않아요.')
  }
  const nextPin = await hashSecret(ctx, newPin)
  const recovery = newRecoveryCode()
  const nextRecovery = hmacSecret(ctx, normalizeRecovery(recovery))
  const token = await updateSecret(ctx, id, (s) => {
    if (s.recovery.hash !== recHash) throw new ApiError(409, 'code-changed', '복구 코드가 방금 바뀌었어요.')
    s.pin = nextPin
    s.recovery = nextRecovery
    s.sessions = []
    s.gFails = 0
    s.gSeen = 0
    s.gLockedUntil = 0
    return { next: s, result: issueSession(ctx, id, s, false) }
  })
  await ctx.store.del([aKey]).catch(() => undefined)
  return { token, recovery }
}

export async function logout(ctx: Ctx, id: string, token: string | null) {
  // 서명이 맞지 않는 열쇠는 저장소를 읽지 않고 끝낸다
  if (!token || !tokenLooksSigned(ctx, id, token)) return { ok: true }
  const h = sha256(token)
  await updateSecret(ctx, id, (s) => {
    const before = s.sessions.length
    s.sessions = s.sessions.filter((x) => x.h !== h)
    return { next: s.sessions.length === before ? null : s, result: null }
  })
  return { ok: true }
}

async function removeTrip(ctx: Ctx, id: string) {
  const attempts = await ctx.store.list(`trips/${id}/attempts/`)
  await ctx.store.del([docKey(id), secretKey(id), ...attempts])
}

export async function deleteTrip(ctx: Ctx, id: string, ip: string, token: string | null, input: { pin: unknown }) {
  await requireSession(ctx, id, token)
  await withPin(ctx, id, ip, input.pin, () => true)
  await removeTrip(ctx, id)
  return { ok: true }
}

/** 끝난 지 365일 지난 여행, 만들다 끊긴 여행, 이틀 지난 횟수 기록을 지운다(매일 한 번, 20개씩 나눠 동시에) */
export async function cleanup(ctx: Ctx) {
  const now = ctx.now()
  const keys = await ctx.store.list('trips/')
  const ids = [...new Set(keys.map((k) => k.split('/')[1]).filter((x): x is string => !!x && ID_RE.test(x)))]
  let removed = 0
  for (let i = 0; i < ids.length; i += 20) {
    await Promise.all(
      ids.slice(i, i + 20).map(async (id) => {
        const s = await ctx.store.get(docKey(id), { fresh: true })
        if (!s) {
          const sec = await ctx.store.get(secretKey(id), { fresh: true })
          const born = sec ? ((JSON.parse(sec.body) as Secret).createdAt ?? 0) : 0
          if (now - born > DAY) {
            await removeTrip(ctx, id)
            removed++
          }
          return
        }
        const rec = JSON.parse(s.body) as DocRecord
        const end = Date.parse(`${endDateOf(rec.doc)}T00:00:00Z`)
        if (now - end > 365 * DAY) {
          await removeTrip(ctx, id)
          removed++
        }
      }),
    )
  }
  const rates = await ctx.store.list('rate/')
  const cutoff = new Date(now - 2 * DAY).toISOString().slice(0, 10)
  const old = rates.filter((k) => (k.split('/')[1] ?? '') < cutoff)
  await ctx.store.del(old)
  // 이틀 넘게 손대지 않은 주소별 틀린 횟수 기록. 시도할 때마다 파일을 새로 쓰므로 마지막으로 쓴 시각만 보고 고른다
  // (주소별 잠금은 길어야 24시간이라 이틀 지난 파일의 잠금은 이미 끝났다). 파일을 열지 않으니 수가 많아도 시간 안에 끝난다.
  const stale = (await ctx.store.entries('trips/')).filter((e) => e.key.includes('/attempts/') && now - e.at > 2 * DAY).map((e) => e.key)
  await ctx.store.del(stale)
  return { removed, rates: old.length, attempts: stale.length }
}
