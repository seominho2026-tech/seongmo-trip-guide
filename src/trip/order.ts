/**
 * 일차 안 일정 순서. 시각 글자가 아니라 실제 순간으로 줄 세운다.
 * 해외 여행은 한국 시각으로 적은 일정(인천 출발)과 현지 시각 일정(LA 도착)이 한 날에 섞이므로,
 * "15:00 한국 출발 → 09:30 현지 도착"처럼 글자 순서와 실제 순서가 다를 수 있다.
 * 장 순서·지도 동선·길 계산·저장·편집기 목록이 모두 이 함수 하나를 쓴다.
 */
import type { Stop, TripDoc } from './schema'
import { addDays, instant } from '../lib/time'

type When = Pick<TripDoc, 'startDate' | 'tz' | 'homeTz'>

export function stopDate(doc: Pick<TripDoc, 'startDate'>, dayIndex: number, s: Pick<Stop, 'dayShift'>): string {
  return addDays(doc.startDate, dayIndex + (s.dayShift ?? 0))
}

export function stopTz(doc: Pick<TripDoc, 'tz' | 'homeTz'>, s: Pick<Stop, 'zone'>): string {
  return s.zone === 'home' ? doc.homeTz : doc.tz
}

/** 그 일정의 실제 순간(날짜·시간대가 이상하면 null) */
export function stopInstant(doc: When, dayIndex: number, s: Stop): Date | null {
  try {
    const t = instant(stopDate(doc, dayIndex, s), s.time, stopTz(doc, s))
    return Number.isFinite(t.getTime()) ? t : null
  } catch {
    return null
  }
}

/** 실제 순간 순서로(같은 순간이면 원래 순서). 순간을 못 구하면 원래 순서를 지킨다. */
export function orderStops(doc: When, dayIndex: number, stops: Stop[]): Stop[] {
  const keyed = stops.map((s, i) => ({ s, i, t: stopInstant(doc, dayIndex, s)?.getTime() ?? null }))
  if (keyed.some((k) => k.t === null)) return stops.slice()
  return keyed.sort((a, b) => a.t! - b.t! || a.i - b.i).map((k) => k.s)
}
