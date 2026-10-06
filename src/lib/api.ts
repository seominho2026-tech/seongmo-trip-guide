/**
 * 서버(/api/trip)와 주고받기. 서버 규칙은 api/_lib/service.ts 에 있다.
 * 학생·보호자는 읽기만 하고, 쓰기는 PIN 으로 받은 편집 열쇠(이 기기에만 저장)로 한다.
 */
import { upgradeDoc, type TripDoc } from '../trip/schema'
import { readStored, removeStored, writeStored } from './storage'

export class ApiFail extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public data: Record<string, unknown> = {},
  ) {
    super(message)
  }
}

async function call<T>(method: string, query: Record<string, string>, body?: unknown, token?: string | null): Promise<T> {
  // 이 앱은 쿼리를 늘 정해진 순서·이름으로만 보낸다(서버가 다른 쿼리를 거절한다)
  const qs = new URLSearchParams(query).toString()
  let res: Response
  try {
    res = await fetch(`/api/trip?${qs}`, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: method === 'GET' && query.fresh ? 'no-store' : 'default',
    })
  } catch {
    throw new ApiFail(0, 'offline', '인터넷에 연결되지 않았어요. 연결을 확인하고 다시 해 주세요.')
  }
  let data: Record<string, unknown> = {}
  try {
    data = await res.json()
  } catch {
    /* 본문이 없으면 빈 값 */
  }
  if (!res.ok) throw new ApiFail(res.status, String(data.error ?? 'error'), String(data.message ?? '잠시 문제가 생겼어요. 조금 뒤 다시 해 주세요.'), data)
  return data as T
}

export type Loaded = { doc: TripDoc; etag: string; updatedAt: string }

/** fresh 는 편집 열쇠가 있을 때만 서버가 받아 준다(없으면 캐시된 안내) */
export const fetchTrip = (id: string, fresh = false, token: string | null = null) =>
  call<Loaded>('GET', fresh ? { id, fresh: String(Date.now()) } : { id }, undefined, fresh ? token : null).then((r) => ({ ...r, doc: upgradeDoc(r.doc) }))
export const createTrip = (doc: TripDoc, pin: string) => call<{ id: string; token: string; recovery: string; etag: string; updatedAt: string }>('POST', { op: 'create' }, { doc, pin })
export const unlockTrip = (id: string, pin: string, remember: boolean) => call<{ token: string }>('POST', { op: 'unlock', id }, { pin, remember })
/** wrongPins: 최근 일주일 안쪽에 여행 전체로 틀린 PIN 횟수 */
export const checkToken = (id: string, token: string) => call<{ ok: true; wrongPins?: number; pinLocked?: boolean }>('POST', { op: 'check', id }, {}, token)
export const saveTrip = (id: string, token: string, doc: TripDoc, baseEtag: string) => call<{ etag: string; updatedAt: string }>('PUT', { id }, { doc, baseEtag }, token)
export const changePin = (id: string, token: string, pin: string, newPin: string) => call<{ token: string }>('POST', { op: 'pin', id }, { pin, newPin }, token)
export const recoverTrip = (id: string, code: string, newPin: string) => call<{ token: string; recovery: string }>('POST', { op: 'recover', id }, { code, newPin })
export const logoutAllTrip = (id: string, pin: string) => call<{ ok: true }>('POST', { op: 'logout-all', id }, { pin })
export const logoutTrip = (id: string, token: string) => call<{ ok: true }>('POST', { op: 'logout', id }, {}, token)
export const deleteTrip = (id: string, token: string, pin: string) => call<{ ok: true }>('POST', { op: 'delete', id }, { pin }, token)

// ── 편집 열쇠(이 기기에만) ──
// 기본은 이 탭이 열려 있는 동안만(sessionStorage, 서버에서도 12시간). '이 기기 기억하기'를 고르면 30일 남긴다(localStorage).
const tokenKey = (id: string) => `edit-token:${id}`
const SESSION_PREFIX = 'tripguide:'
function sessionGet(key: string): string | null {
  try {
    return window.sessionStorage.getItem(SESSION_PREFIX + key)
  } catch {
    return null
  }
}
function sessionSet(key: string, value: string | null) {
  try {
    if (value) window.sessionStorage.setItem(SESSION_PREFIX + key, value)
    else window.sessionStorage.removeItem(SESSION_PREFIX + key)
  } catch {
    /* 저장이 막힌 곳이면 다시 PIN 을 묻는다 */
  }
}
export const getToken = (id: string) => sessionGet(tokenKey(id)) ?? readStored<string | null>(tokenKey(id), null)
export function setToken(id: string, token: string | null, remember = false) {
  sessionSet(tokenKey(id), remember ? null : token)
  if (remember && token) writeStored(tokenKey(id), token)
  else removeStored(tokenKey(id))
}

/** 이 기기에서 만든·편집한 여행 목록(랜딩의 '내 여행') */
export type MyTrip = { id: string; title: string; startDate: string; at: string }
export function rememberTrip(t: Omit<MyTrip, 'at'>) {
  const list = readStored<MyTrip[]>('my-trips', []).filter((x) => x.id !== t.id)
  writeStored('my-trips', [{ ...t, at: new Date().toISOString() }, ...list].slice(0, 12))
}
/** 지운 여행을 이 기기 목록과 저장해 둔 안내 사본·초안·편집 열쇠에서 뺀다(학생 느낀 점은 그대로) */
export function forgetTrip(id: string) {
  writeStored('my-trips', readStored<MyTrip[]>('my-trips', []).filter((x) => x.id !== id))
  for (const k of ['doc-cache', 'draft', 'last-page', 'edit-token']) removeStored(`${k}:${id}`)
  sessionSet(tokenKey(id), null)
}

export const tripUrl = (id: string) => `${window.location.origin}/t/${id}`
