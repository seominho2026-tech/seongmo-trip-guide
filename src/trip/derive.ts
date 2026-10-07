/**
 * 여행 문서를 화면에서 넘기는 한 줄의 "장(page)" 흐름으로 바꾼다.
 *
 * 출발 전(표지·안내) → [1일차 표지, 1일차 일정들] → … → [N일차 표지, …] → 다녀와서
 * 넘기는 순서가 곧 시간 순서이고 동선이다. 장소가 있는 일정은 바로 앞 장소에서 오는 길을 안다.
 */
import type { Day, LegMode, Route, Stop, TripDoc } from './schema'
import { orderStops, stopDate, stopTz } from './order'
import { addDays, instant, toMin, weekdayOf } from '../lib/time'
import { km, type LngLat } from '../lib/geo'

export type Chapter = {
  /** 0 = 출발 전, 1..N = 일차, N+1 = 다녀와서 */
  n: number
  label: string
  /** 일차의 날짜(출발 전·다녀와서는 null) */
  date: string | null
  weekday: string | null
  title: string
  pages: Page[]
}

type PageBase = { key: string; index: number; chapter: Chapter }

export type GuidePage = PageBase & { type: 'guide'; kind: 'cover' | 'before' | 'after' }
export type DayPage = PageBase & { type: 'day'; day: Day; dayN: number }
export type StopPage = PageBase & {
  type: 'stop'
  stop: Stop
  dayN: number
  /** 그날 지도에 찍히는 장소 번호(장소가 없으면 null) */
  pin: number | null
  /** 바로 앞에 장소가 있는 일정(여기까지 오는 길의 출발점, 날을 넘어서도) */
  from: StopPage | null
  /** 앞 장소와의 직선 거리(km) */
  crowKm: number | null
  /** 이 일정 시각을 적은 시간대 */
  tz: string
  start: Date
  end: Date | null
}

export type Page = GuidePage | DayPage | StopPage

export type Derived = {
  doc: TripDoc
  chapters: Chapter[]
  pages: Page[]
  pageByKey: Map<string, Page>
  stopPages: StopPage[]
  endDate: string
  /** 해외 여행이면 true (여행지와 출발지 시간대가 다름) */
  abroad: boolean
}

export const stopKey = (id: string) => `s-${id}`

export function derive(doc: TripDoc): Derived {
  const chapters: Chapter[] = []
  const pages: Page[] = []
  const abroad = doc.tz !== doc.homeTz
  const nDays = doc.days.length

  const open = (n: number, label: string, title: string, date: string | null): Chapter => {
    const c: Chapter = { n, label, date, weekday: date ? weekdayOf(date) : null, title, pages: [] }
    chapters.push(c)
    return c
  }
  const push = (c: Chapter, p: Page) => {
    pages.push(p)
    c.pages.push(p)
  }

  const before = open(0, '출발 전', doc.title, null)
  push(before, { type: 'guide', kind: 'cover', key: 'cover', index: pages.length, chapter: before })
  if (doc.before.notes.trim() || doc.before.checklist.length) push(before, { type: 'guide', kind: 'before', key: 'before', index: pages.length, chapter: before })

  let lastPlaced: StopPage | null = null
  doc.days.forEach((day, i) => {
    const n = i + 1
    const date = addDays(doc.startDate, i)
    const ordered = orderStops(doc, i, day.stops)
    const c = open(n, `${n}일차`, day.title?.trim() || defaultDayTitle(ordered), date)
    push(c, { type: 'day', key: `day-${n}`, index: pages.length, chapter: c, day, dayN: n })
    let pin = 0
    const pinByCoords = new Map<string, number>()
    for (const stop of ordered) {
      const tz = stopTz(doc, stop)
      // 자정을 넘긴 새벽·날짜를 넘는 귀국편은 그만큼 뒤 날짜로 본다
      const sdate = stopDate(doc, i, stop)
      const start = instant(sdate, stop.time, tz)
      let end: Date | null = null
      if (stop.end) {
        end = instant(sdate, stop.end, tz)
        if (toMin(stop.end) < toMin(stop.time)) end = new Date(end.getTime() + 86_400_000)
        if (end < start) end = new Date(end.getTime() + 86_400_000)
      }
      const coordKey = stop.place ? stop.place.coords.join(',') : ''
      const page: StopPage = {
        type: 'stop',
        key: stopKey(stop.id),
        index: pages.length,
        chapter: c,
        stop,
        dayN: n,
        pin: stop.place ? (pinByCoords.get(coordKey) ?? (pinByCoords.set(coordKey, ++pin), pin)) : null,
        from: stop.place ? lastPlaced : null,
        crowKm: null,
        tz,
        start,
        end,
      }
      if (stop.place && lastPlaced?.stop.place) page.crowKm = km(lastPlaced.stop.place.coords as LngLat, stop.place.coords as LngLat)
      push(c, page)
      if (stop.place) lastPlaced = page
    }
  })

  const after = open(nDays + 1, '다녀와서', '다녀와서', null)
  push(after, { type: 'guide', kind: 'after', key: 'after', index: pages.length, chapter: after })

  const stopPages = pages.filter((p): p is StopPage => p.type === 'stop')
  return { doc, chapters, pages, pageByKey: new Map(pages.map((p) => [p.key, p])), stopPages, endDate: addDays(doc.startDate, doc.nights), abroad }
}

function defaultDayTitle(stops: Day['stops']): string {
  const names = stops.filter((s) => s.place).map((s) => s.place!.name)
  return names.length ? names.slice(0, 3).join(', ') : '일정'
}

/** 끝 시각이 없으면 다음 일정 시작을 끝으로 본다 */
export function effectiveEnd(d: Derived, p: StopPage): Date | null {
  if (p.end) return p.end
  const i = d.stopPages.indexOf(p)
  const next = d.stopPages[i + 1]
  if (next && next.dayN === p.dayN) return next.start
  return null
}

/** 지금 순간에 해당하는 일정. 여행 전이면 before, 끝났으면 after */
export function pageAt(d: Derived, at: Date): { page: StopPage; state: 'live' | 'next' } | { page: null; state: 'before' | 'after' } {
  const timed = d.stopPages
  if (!timed.length) {
    const startDay = instant(d.doc.startDate, '00:00', d.doc.tz)
    const endDay = instant(d.endDate, '23:59', d.doc.tz)
    return { page: null, state: at < startDay ? 'before' : at > endDay ? 'after' : 'before' }
  }
  if (at < timed[0].start) return { page: null, state: 'before' }
  for (const p of timed) {
    const end = effectiveEnd(d, p) ?? new Date(p.start.getTime() + 60 * 60000)
    if (at >= p.start && at < end) return { page: p, state: 'live' }
    if (at < p.start) return { page: p, state: 'next' }
  }
  return { page: null, state: 'after' }
}

/** 오는 길 선: 계산해 둔 길이 지금 두 장소와 맞으면 그 길, 아니면 직선 */
export function legLine(p: StopPage): LngLat[] | null {
  const leg = p.stop.leg
  if (!leg || !p.from?.stop.place || !p.stop.place) return null
  const a = p.from.stop.place.coords as LngLat
  const b = p.stop.place.coords as LngLat
  if (routeFits(leg.route, a, b) && leg.route!.coords.length > 1) return leg.route!.coords as LngLat[]
  return [a, b]
}

export function routeFits(route: Route | undefined, a: LngLat, b: LngLat): boolean {
  if (!route) return false
  const near = (x: readonly number[], y: readonly number[]) => Math.abs(x[0] - y[0]) < 1e-5 && Math.abs(x[1] - y[1]) < 1e-5
  return near(route.from, a) && near(route.to, b)
}

/** 시간표로 계산하는 이동 수단(대중교통 길 찾기) */
export const TRANSIT: LegMode[] = ['transit', 'subway', 'train']
/** 길과 걸리는 시간을 자동으로 계산하는 이동 수단(비행기·배는 직접 적는다) */
export const ROUTABLE: LegMode[] = ['bus', 'car', 'walk', ...TRANSIT]

/** 이 일정에서 오는 길의 걸리는 시간(분): 적은 값이 우선, 없으면 계산한 길 */
export function legMinutes(p: StopPage): number | null {
  const leg = p.stop.leg
  if (!leg) return null
  if (leg.minutes) return leg.minutes
  if (leg.route && p.from?.stop.place && p.stop.place && routeFits(leg.route, p.from.stop.place.coords as LngLat, p.stop.place.coords as LngLat)) return Math.round(leg.route.min)
  return null
}

/** 학생이 느낀 점을 쓰는 일정 */
export const reflectStops = (d: Derived) => d.stopPages.filter((p) => p.stop.reflect?.on)

export const KIND_LABEL: Record<Stop['kind'], string> = {
  activity: '활동',
  meal: '식사',
  lodging: '숙소',
  move: '이동',
  etc: '기타',
}

export const LEG_LABEL: Record<LegMode, string> = {
  bus: '버스',
  walk: '걸어서',
  transit: '대중교통',
  subway: '지하철',
  train: '기차',
  car: '자동차',
  flight: '비행기',
  boat: '배',
}

export const DEFAULT_PROMPT = '이곳에서 보고 듣고 느낀 점'
