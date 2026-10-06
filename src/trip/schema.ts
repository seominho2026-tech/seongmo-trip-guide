/**
 * 여행 안내 문서의 구조. 화면(편집기·보는 화면)과 서버 함수(api/)가 함께 쓴다.
 *
 * 문서 하나 = 여행 하나. 출발 전 안내 → 1일차 … N일차 → 다녀와서 순서로 장이 이어진다.
 * 일정(stop)의 id 는 한 번 정하면 바꾸지 않는다(학생 느낀 점이 이 id 에 묶인다).
 * 이 문서는 링크만 있으면 누구나 볼 수 있으므로 개인정보를 넣지 않는다(src/lib/pii.ts 가 막는다).
 */
import { z } from 'zod'

export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const hhmm = z.string().regex(HHMM, '시각은 09:30 처럼 적어요')
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜는 2026-10-21 처럼 적어요')
const text = (max: number) => z.string().max(max)
const line = (max: number) => z.string().trim().min(1).max(max)

/** [경도, 위도] (지도 라이브러리 순서) */
export const Coords = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])

export const Place = z.object({
  name: line(80),
  address: text(160).optional(),
  coords: Coords,
})

export const LEG_MODES = ['bus', 'walk', 'subway', 'train', 'car', 'flight', 'boat'] as const
export const LegMode = z.enum(LEG_MODES)

export const Route = z.object({
  /** 실제 길(단순화한 선). 비행기·배는 비워 둔다(화면이 호·직선으로 그린다). */
  coords: z.array(Coords).max(4000),
  km: z.number().min(0),
  min: z.number().min(0),
  /** 이 길을 계산한 두 지점(장소를 옮기면 다시 계산하려고) */
  from: Coords,
  to: Coords,
})

export const Leg = z.object({
  mode: LegMode,
  /** 걸리는 시간(분). 비우면 계산한 길의 시간을 쓴다. */
  minutes: z.number().int().min(1).max(60 * 30).optional(),
  /** 한 줄 설명. 예: 버스로 이동, 2호차는 정문에 내려요 */
  note: text(120).optional(),
  route: Route.optional(),
})

export const STOP_KINDS = ['activity', 'meal', 'lodging', 'move', 'etc'] as const
export const StopKind = z.enum(STOP_KINDS)

const StopFields = z.object({
  id: z.string().regex(/^[a-z0-9]{6,16}$/),
  time: hhmm,
  end: hhmm.optional(),
  /** 'home' 이면 한국(출발지) 시각으로 적은 일정(해외 여행의 출발 날 공항 등) */
  zone: z.enum(['home']).optional(),
  /** 그 일차 날짜보다 며칠 뒤의 시각인지. 자정 넘긴 새벽 도착(23:30 출발 → 00:40 도착), 한국 시각으로 적은 귀국편 도착 등 */
  dayShift: z.union([z.literal(1), z.literal(2)]).optional(),
  title: line(60),
  kind: StopKind,
  place: Place.optional(),
  leg: Leg.optional(),
  /** 안내사항(여러 줄) */
  body: text(3000).optional(),
  /** 꼭 지킬 것(한 줄에 하나) */
  rules: z.array(line(200)).max(20).optional(),
  /** 다시 모이는 곳·시각 */
  meet: z.object({ place: text(80).optional(), time: hhmm.optional() }).optional(),
  /** 학생 느낀 점 받기 */
  reflect: z.object({ on: z.boolean(), prompt: text(140).optional() }).optional(),
})

/** 처음 판의 nextDay(참/거짓)는 dayShift 1 로 읽는다 */
export const Stop = z.preprocess((v) => {
  if (!v || typeof v !== 'object' || !('nextDay' in v)) return v
  const { nextDay, ...rest } = v as Record<string, unknown>
  return nextDay === true && !('dayShift' in rest) ? { ...rest, dayShift: 1 } : rest
}, StopFields)

export const Day = z.object({
  title: text(60).optional(),
  stops: z.array(Stop).max(40),
})

export const Announcement = z.object({
  id: z.string().regex(/^[a-z0-9]{6,16}$/),
  title: line(60),
  body: text(1000),
  /** 누구 화면에 띄울지 */
  audience: z.enum(['all', 'students', 'guardians']),
  /** 사이트를 열면 팝업으로 띄울지 */
  popup: z.boolean(),
  updatedAt: z.string().max(40),
})

export const NIGHTS_MAX = 30

export const TripDoc = z
  .object({
    v: z.literal(1),
    title: line(60),
    school: text(40).optional(),
    summary: text(300).optional(),
    startDate: ymd,
    nights: z.number().int().min(0).max(NIGHTS_MAX),
    /** 여행지 시간대(IANA). 국내 여행이면 Asia/Seoul */
    tz: z.string().min(3).max(40),
    /** 출발지(보호자) 시간대 */
    homeTz: z.string().min(3).max(40),
    /** 살핌 학번 체계: 4 = 학년1·반1·번호2(G1C1N2), 5 = 학년1·반2·번호2(G1C2N2) */
    studentIdDigits: z.union([z.literal(4), z.literal(5)]),
    before: z.object({ notes: text(5000), checklist: z.array(line(120)).max(60) }),
    after: z.object({ notes: text(3000) }),
    announcements: z.array(Announcement).max(30),
    days: z.array(Day).min(1).max(NIGHTS_MAX + 1),
  })
  .superRefine((doc, ctx) => {
    if (doc.days.length !== doc.nights + 1) ctx.addIssue({ code: 'custom', message: `일차 수(${doc.days.length})가 ${doc.nights}박 ${doc.nights + 1}일과 달라요`, path: ['days'] })
    if (!isTimeZone(doc.tz) || !isTimeZone(doc.homeTz)) ctx.addIssue({ code: 'custom', message: '알 수 없는 시간대예요', path: ['tz'] })
    const ids = new Set<string>()
    doc.days.forEach((d, di) => {
      d.stops.forEach((s, si) => {
        if (ids.has(s.id)) ctx.addIssue({ code: 'custom', message: '일정 id 가 겹쳐요', path: ['days', di, 'stops', si, 'id'] })
        ids.add(s.id)
      })
    })
  })

export type Coords = z.infer<typeof Coords>
export type Place = z.infer<typeof Place>
export type LegMode = z.infer<typeof LegMode>
export type Route = z.infer<typeof Route>
export type Leg = z.infer<typeof Leg>
export type StopKind = z.infer<typeof StopKind>
export type Stop = z.infer<typeof Stop>
export type Day = z.infer<typeof Day>
export type Announcement = z.infer<typeof Announcement>
export type TripDoc = z.infer<typeof TripDoc>

/** 문서 크기 상한(바이트) */
export const DOC_MAX_BYTES = 300_000

export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** 영문 소문자·숫자 id (일정·공지) */
export function newId(len = 10): string {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789'
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => abc[b % abc.length]).join('')
}

/** 빈 여행 문서 */
export function emptyTrip(init: { title: string; startDate: string; nights: number; tz: string; homeTz?: string; studentIdDigits: 4 | 5; school?: string }): TripDoc {
  return {
    v: 1,
    title: init.title,
    school: init.school || undefined,
    startDate: init.startDate,
    nights: init.nights,
    tz: init.tz,
    homeTz: init.homeTz ?? 'Asia/Seoul',
    studentIdDigits: init.studentIdDigits,
    before: { notes: '', checklist: [] },
    after: { notes: '' },
    announcements: [],
    days: Array.from({ length: init.nights + 1 }, () => ({ stops: [] })),
  }
}

/** 일차 수를 바꾸면 뒤쪽 일차를 더하거나 덜어 낸다(덜어 낼 일차에 일정이 있으면 호출하는 쪽에서 먼저 확인한다) */
export function resizeDays(doc: TripDoc, nights: number): TripDoc {
  const days = doc.days.slice(0, nights + 1)
  while (days.length < nights + 1) days.push({ stops: [] })
  return { ...doc, nights, days }
}

/** 처음 판(nextDay)으로 저장된 일정을 지금 모양(dayShift)으로 읽는다. 서버가 저장한 문서를 그대로 내주므로 읽는 쪽에서 맞춘다. */
export function upgradeDoc(doc: TripDoc): TripDoc {
  let changed = false
  const days = doc.days.map((d) => ({
    ...d,
    stops: d.stops.map((s) => {
      const legacy = s as Stop & { nextDay?: boolean }
      if (!('nextDay' in legacy)) return s
      changed = true
      const { nextDay, ...rest } = legacy
      return nextDay === true && !rest.dayShift ? { ...rest, dayShift: 1 as const } : rest
    }),
  }))
  return changed ? { ...doc, days } : doc
}
