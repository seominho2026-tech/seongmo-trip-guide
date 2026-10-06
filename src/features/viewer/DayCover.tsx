import { LEG_LABEL, legMinutes, type DayPage, type StopPage } from '../../trip/derive'
import { rich } from '../../components/Rich'
import { Icon, KIND_ICON, LEG_ICON } from '../../components/Icon'
import { goTo } from '../../lib/router'
import { duration } from '../../lib/time'
import { useTrip } from '../../trip/context'
import { ShiftTag, timeText } from './parts'

/**
 * 일차 표지. 그날 날짜·들르는 곳·이동 시간과, 장소와 이동을 시간 순서로 잇는 시간 척추.
 * 척추의 한 줄을 누르면 그 장으로 간다.
 */
export function DayCover({ page }: { page: DayPage }) {
  const { d } = useTrip()
  const stops = page.chapter.pages.filter((p): p is StopPage => p.type === 'stop')
  const sum = (modes: string[]) => stops.reduce((n, p) => n + (p.stop.leg && modes.includes(p.stop.leg.mode) ? (legMinutes(p) ?? 0) : 0), 0)
  const busMin = sum(['bus', 'car'])
  const walkMin = sum(['walk'])
  const places = new Set(stops.flatMap((p) => (p.stop.place ? [p.stop.place.name] : []))).size
  const lodging = [...stops].reverse().find((p) => p.stop.kind === 'lodging' && p.stop.place)
  const [, m, dd] = (page.chapter.date ?? '0000-00-00').split('-').map(Number)

  return (
    <article className="page daycover">
      <header className="daycover__head">
        <p className="daycover__date">
          <span className="daycover__md mono">
            {m}.{String(dd).padStart(2, '0')}
          </span>
          <span className="daycover__wd">{page.chapter.weekday}요일</span>
          <span className="daycover__n">{page.chapter.label}</span>
        </p>
        <h1 className="page__title">{rich(page.chapter.title)}</h1>
      </header>

      <dl className="facts">
        <div>
          <dt>들르는 곳</dt>
          <dd className="mono">{places}곳</dd>
        </div>
        {busMin ? (
          <div>
            <dt>차로 이동</dt>
            <dd className="mono">{duration(busMin)}</dd>
          </div>
        ) : null}
        {walkMin ? (
          <div>
            <dt>걷기</dt>
            <dd className="mono">{duration(walkMin)}</dd>
          </div>
        ) : null}
        <div>
          <dt>일정</dt>
          <dd className="mono">{stops.length}개</dd>
        </div>
      </dl>

      {stops.length ? (
        <ol className="spine" aria-label={`${page.chapter.label} 일정`}>
          {stops.map((p) => {
            const t = timeText(d, p)
            return (
              <li key={p.key} className="spine__item">
                {p.stop.leg ? (
                  <div className="spine__leg">
                    <Icon name={LEG_ICON[p.stop.leg.mode] ?? 'bus'} size="0.95rem" />
                    <span>{legLine(p)}</span>
                  </div>
                ) : null}
                <button type="button" className="spine__stop" onClick={() => goTo(p.key, { replace: true })}>
                  <span className="spine__time mono">
                    {p.stop.time}
                    <ShiftTag page={p} />
                  </span>
                  <span className="spine__dot" data-kind={p.stop.kind} aria-hidden="true">
                    <Icon name={KIND_ICON[p.stop.kind] ?? 'pin'} size="0.85rem" />
                  </span>
                  <span className="spine__body">
                    <span className="spine__title">{rich(p.stop.title)}</span>
                    {t.stay ? <span className="spine__stay mono">{t.stay}</span> : null}
                  </span>
                  <Icon name="chevronRight" size="1rem" />
                </button>
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="empty-note">아직 이날 일정이 없어요.</p>
      )}

      {lodging ? (
        <section className="card hotel-card">
          <div className="hotel-card__icon" aria-hidden="true">
            <Icon name="bed" />
          </div>
          <div>
            <h2 className="hotel-card__name">오늘 밤: {lodging.stop.place!.name}</h2>
            {lodging.stop.place!.address ? <p className="hotel-card__addr">{lodging.stop.place!.address}</p> : null}
          </div>
        </section>
      ) : null}
    </article>
  )
}

function legLine(p: StopPage): string {
  const min = legMinutes(p)
  const label = LEG_LABEL[p.stop.leg!.mode]
  return `${label}${min ? ` ${duration(min)}` : ''}${p.stop.leg!.note ? ` · ${p.stop.leg!.note}` : ''}`
}
