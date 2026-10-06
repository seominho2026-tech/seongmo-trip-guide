import type { ReactNode } from 'react'
import { rich } from '../../components/Rich'
import { Icon, LEG_ICON, type IconName } from '../../components/Icon'
import { LEG_LABEL, legMinutes, routeFits, type Derived, type StopPage } from '../../trip/derive'
import { clock, dateLabel, duration, zoneName } from '../../lib/time'
import type { LngLat } from '../../lib/geo'

export function Section({ title, icon, tone, children }: { title: string; icon?: IconName; tone?: 'warn' | 'tip'; children: ReactNode }) {
  return (
    <section className="block" data-tone={tone}>
      <h2 className="block__title">
        {icon ? <Icon name={icon} size="1.05rem" /> : null}
        {title}
      </h2>
      {children}
    </section>
  )
}

/**
 * 선생님이 쓴 여러 줄 안내를 읽기 좋게: 빈 줄로 문단을 나누고, "- "·"· "로 시작하는 줄은 목록으로.
 * 글은 모두 글자로만 넣는다(HTML 로 해석하지 않는다).
 */
export function Body({ text }: { text: string }) {
  const blocks = text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
  return (
    <div className="body-text">
      {blocks.map((b, i) => {
        const lines = b.split('\n')
        if (lines.every((l) => /^\s*[-·•*]\s+/.test(l)))
          return (
            <ul key={i} className="bullets">
              {lines.map((l, j) => (
                <li key={j}>{rich(l.replace(/^\s*[-·•*]\s+/, ''))}</li>
              ))}
            </ul>
          )
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <span key={j}>
                {j ? <br /> : null}
                {rich(l)}
              </span>
            ))}
          </p>
        )
      })}
    </div>
  )
}

/** 그 일차 날짜와 며칠 차이 나는 시각인지(자정 넘긴 새벽 도착, 한국 시각으로 적은 귀국편 도착 등). 같은 날이면 0 */
export function shiftDays(p: StopPage): number {
  if (!p.chapter.date) return 0
  const ymd = clock(p.start, p.tz).ymd
  return Math.round((Date.parse(`${ymd}T00:00:00Z`) - Date.parse(`${p.chapter.date}T00:00:00Z`)) / 86_400_000)
}

/** 시각 옆 작은 표시: "+1일" */
export function ShiftTag({ page }: { page: StopPage }) {
  const n = shiftDays(page)
  if (!n) return null
  return <span className="time-shift">{n > 0 ? `+${n}일` : `${n}일`}</span>
}

/** 시각 줄: "14:30 – 16:30 · 2시간". 해외 여행에서 한국 시각으로 적은 일정이면 표시하고, 날짜가 그 일차와 다르면 날짜를 붙인다 */
export function timeText(d: Derived, p: StopPage): { range: string; stay: string | null } {
  const s = p.stop
  const stay = p.end ? duration(Math.round((p.end.getTime() - p.start.getTime()) / 60000)) : null
  const day = shiftDays(p) ? `${dateLabel(clock(p.start, p.tz).ymd)} ` : ''
  const range = `${day}${s.end ? `${s.time} – ${s.end}` : `${s.time}부터`}`
  return { range: d.abroad && s.zone === 'home' ? `${range} ${zoneName(d.doc.homeTz)} 시각` : range, stay }
}

/** 해외 여행: 현지 시각 일정의 출발지(한국) 시각. 보호자용 */
export function homeText(d: Derived, p: StopPage): string | null {
  if (!d.abroad || p.stop.zone === 'home') return null
  const k = clock(p.start, d.doc.homeTz)
  return `${zoneName(d.doc.homeTz)} ${k.m}/${k.d}(${k.weekday}) ${k.time}`
}

const kmText = (v: number) => (v < 1 ? `${Math.round((v * 1000) / 50) * 50}m` : `${Math.round(v)}km`)

/** 앞 장소에서 여기까지 오는 길 */
export function LegChip({ page }: { page: StopPage }) {
  const leg = page.stop.leg
  if (!leg) return null
  const min = legMinutes(page)
  const a = page.from?.stop.place?.coords as LngLat | undefined
  const b = page.stop.place?.coords as LngLat | undefined
  const routed = a && b && routeFits(leg.route, a, b) ? leg.route! : null
  const dist = routed ? `약 ${kmText(routed.km)}` : page.crowKm && page.crowKm > 1.5 ? `직선 약 ${kmText(page.crowKm)}` : null
  return (
    <div className="leg">
      <span className="leg__icon" aria-hidden="true">
        <Icon name={LEG_ICON[leg.mode] ?? 'bus'} size="1.1rem" />
      </span>
      <span className="leg__text">
        <span className="leg__label">{page.stop.place ? '오는 길' : '이동'}</span>
        <span className="leg__main">
          {page.from?.stop.place ? `${page.from.stop.place.name}에서 ` : ''}
          {LEG_LABEL[leg.mode]}
          {leg.note ? <> · {rich(leg.note)}</> : null}
        </span>
      </span>
      {min || dist ? (
        <span className="leg__nums mono">
          {min ? <span>{duration(min)}</span> : null}
          {dist ? <span>{dist}</span> : null}
        </span>
      ) : null}
    </div>
  )
}

/** 다시 모이는 곳(탑승권 스텁처럼 시각을 크게) */
export function MeetingPass({ place, time }: { place?: string; time?: string }) {
  if (!place && !time) return null
  return (
    <div className="pass" role="note" aria-label="다시 모이는 곳">
      <div className="pass__main">
        <span className="pass__label">
          <Icon name="flag" size="1rem" /> 다시 모이는 곳
        </span>
        <strong className="pass__place">{place ? rich(place) : '정해지면 알려 줘요'}</strong>
      </div>
      {time ? (
        <div className="pass__time">
          <span className="pass__time-label">모이는 시각</span>
          <span className="pass__time-value mono">{time}</span>
        </div>
      ) : null}
    </div>
  )
}

/** 지도 앱 바로 가기: 국내는 카카오맵(그 자리 핀), 해외는 구글 지도 */
export function mapsLink(d: Derived, p: StopPage): string | null {
  const place = p.stop.place
  if (!place) return null
  const [lng, lat] = place.coords
  if (!d.abroad && d.doc.tz === 'Asia/Seoul') return `https://map.kakao.com/link/map/${encodeURIComponent(place.name)},${lat},${lng}`
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}
