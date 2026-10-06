import { ShiftTag } from './parts'
import type { Page, StopPage } from '../../trip/derive'
import { useTrip } from '../../trip/context'
import { zoneName } from '../../lib/time'

/**
 * 지도 아래 노선도 띠. 그날 일정을 한 줄의 시간 막대로 보여 준다.
 * 막대 길이 = 머무는 시간, 막대 사이 가는 선 = 이동. 지금 보는 장은 오렌지, 실제 지금 시각은 오렌지 세로선.
 * 출발 전·다녀와서처럼 시각이 없는 묶음은 장마다 같은 간격의 점으로 보여 준다.
 */
export function DayStrip({ page, nowKey, onSelect }: { page: Page; nowKey: string | null; onSelect: (key: string) => void }) {
  const { at, d } = useTrip()
  const timed = page.chapter.pages.filter((p): p is StopPage => p.type === 'stop')
  const currentKey = page.key

  if (timed.length < 2) {
    return (
      <div className="strip strip--dots" aria-label={`${page.chapter.label} 장 목록`}>
        <ol className="strip__dots">
          {page.chapter.pages.map((p) => (
            <li key={p.key}>
              <button type="button" className="strip__dot" data-current={p.key === currentKey || undefined} onClick={() => onSelect(p.key)} aria-label={p.type === 'stop' ? p.stop.title : p.chapter.label} aria-current={p.key === currentKey ? 'step' : undefined} />
            </li>
          ))}
        </ol>
      </div>
    )
  }

  const t0 = timed[0].start.getTime()
  const endOf = (p: StopPage) => {
    if (p.end) return p.end.getTime()
    const next = timed[timed.indexOf(p) + 1]
    return next ? next.start.getTime() : p.start.getTime() + 60 * 60000
  }
  const last = timed[timed.length - 1]
  const span = Math.max(180, (endOf(last) - t0) / 60000)
  const pos = (ms: number) => ((ms - t0) / 60000 / span) * 100
  const mixed = new Set(timed.map((p) => p.tz)).size > 1
  const fromStart = (at.getTime() - t0) / 60000
  const nowPos = fromStart >= 0 && fromStart <= span ? (fromStart / span) * 100 : null
  const edge = (p: StopPage, hhmm: string) => (mixed ? `${p.tz === d.doc.homeTz ? zoneName(d.doc.homeTz) : '현지'} ${hhmm}` : hhmm)

  return (
    <div className="strip" aria-label={`${page.chapter.label} 시간표 띠`}>
      <span className="strip__edge mono">{edge(timed[0], timed[0].stop.time)}</span>
      <div className="strip__rail">
        <div className="strip__line" />
        {timed.map((p) => {
          const left = pos(p.start.getTime())
          const width = Math.max(1.2, pos(endOf(p)) - left)
          const isCur = p.key === currentKey
          return (
            <button
              key={p.key}
              type="button"
              className="strip__stop"
              data-kind={p.stop.kind}
              data-current={isCur || undefined}
              data-now={p.key === nowKey || undefined}
              style={{ left: `${Math.min(99, left)}%`, width: `${width}%` }}
              onClick={() => onSelect(p.key)}
              aria-label={`${p.stop.time} ${p.stop.title}`}
              aria-current={isCur ? 'step' : undefined}
            />
          )
        })}
        {nowPos != null ? <span className="strip__now" style={{ left: `${nowPos}%` }} aria-hidden="true" /> : null}
      </div>
      <span className="strip__edge mono">
        {edge(last, last.stop.end ?? last.stop.time)}
        <ShiftTag page={last} />
      </span>
    </div>
  )
}
