import { DEFAULT_PROMPT, KIND_LABEL, pageAt, type StopPage } from '../../trip/derive'
import { rich } from '../../components/Rich'
import { Icon, KIND_ICON } from '../../components/Icon'
import { useTrip } from '../../trip/context'
import { goTo } from '../../lib/router'
import { ReflectBox } from './ReflectBox'
import { Body, LegChip, MeetingPass, Section, ShiftTag, homeText, mapsLink, timeText } from './parts'

export function StopView({ page }: { page: StopPage }) {
  const { d, role, at } = useTrip()
  const s = page.stop
  const t = timeText(d, page)
  const home = homeText(d, page)
  const live = pageAt(d, at)
  const isLive = live.page?.key === page.key && live.state === 'live'
  const isNext = live.page?.key === page.key && live.state === 'next'
  const next = d.pages[page.index + 1]
  const maps = mapsLink(d, page)
  const pos = page.chapter.pages.indexOf(page) + 1

  return (
    <article className="page" data-kind={s.kind}>
      <header className="page__head">
        <p className="page__meta">
          <span className="page__time mono">{rich(t.range)}</span>
          {t.stay ? <span className="page__stay mono">{t.stay}</span> : null}
          <span className="page__kind">
            <Icon name={KIND_ICON[s.kind] ?? 'info'} size="0.95rem" />
            {KIND_LABEL[s.kind]}
          </span>
        </p>
        {isLive || isNext ? (
          <p className="page__flags">
            {isLive ? <span className="tag tag--live">지금 진행 중</span> : null}
            {isNext ? <span className="tag tag--next">곧 시작</span> : null}
          </p>
        ) : null}
        <h1 className="page__title">{rich(s.title)}</h1>
        {s.place ? (
          <p className="page__place">
            <Icon name="pin" size="1rem" />
            <span>
              {s.place.name}
              {s.place.address ? <span className="page__place-en"> · {s.place.address}</span> : null}
            </span>
            {maps ? (
              <a className="page__maps" href={maps} target="_blank" rel="noreferrer noopener">
                지도 앱
                <Icon name="external" size="0.9rem" />
              </a>
            ) : null}
          </p>
        ) : null}
        {home && role === 'guardian' ? <p className="page__kst mono">{home}</p> : null}
      </header>

      <LegChip page={page} />
      {home && role !== 'guardian' ? <p className="page__kst page__kst--quiet mono">{home}</p> : null}

      {s.body?.trim() ? (
        <Section title="안내" icon="list">
          <Body text={s.body} />
        </Section>
      ) : null}

      {s.meet?.place || s.meet?.time ? <MeetingPass place={s.meet.place} time={s.meet.time} /> : null}

      {s.rules?.length ? (
        <Section title="꼭 지켜요" icon="alert" tone="warn">
          <ul className="bullets">
            {s.rules.map((r, i) => (
              <li key={i}>{rich(r)}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      {s.reflect?.on && role === 'student' ? <ReflectBox page={page} /> : null}
      {s.reflect?.on && role === 'teacher' ? (
        <p className="fineprint reflect-note">
          <Icon name="pen" size="0.95rem" /> 학생 느낀 점 받는 곳 · 질문: {s.reflect.prompt?.trim() || DEFAULT_PROMPT}
        </p>
      ) : null}

      {next ? (
        <button type="button" className="next-card" onClick={() => goTo(next.key, { replace: true })}>
          <span className="next-card__label">
            다음 장 <span className="mono">{String(pos).padStart(2, '0')}/{String(page.chapter.pages.length).padStart(2, '0')}</span>
          </span>
          <span className="next-card__title">
            {next.type === 'stop' ? (
              <span className="mono">
                {next.stop.time}
                <ShiftTag page={next} />
              </span>
            ) : null}
            {next.type === 'stop' ? rich(next.stop.title) : next.type === 'day' ? rich(`${next.chapter.label} · ${next.chapter.title}`) : rich(next.chapter.label)}
          </span>
          <Icon name="arrowRight" />
        </button>
      ) : null}
    </article>
  )
}
