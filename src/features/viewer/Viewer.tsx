import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { rich } from '../../components/Rich'
import { Icon } from '../../components/Icon'
import { TripMap } from '../map/TripMap'
import { Pager } from '../pager/Pager'
import { pageAt, type Page } from '../../trip/derive'
import { useTrip } from '../../trip/context'
import { goTo, usePageKey } from '../../lib/router'
import { useStored } from '../../lib/storage'
import { daysUntil } from '../../lib/time'
import type { Announcement } from '../../trip/schema'
import { DayCover } from './DayCover'
import { GuideView } from './GuideView'
import { StopView } from './StopView'
import { DayStrip } from './DayStrip'
import { ScheduleSheet, GUIDE_TITLE } from './ScheduleSheet'
import { MenuSheet } from './MenuSheet'
import { NoticePopup, noticeVersion } from './NoticePopup'

function PageView({ page }: { page: Page }) {
  if (page.type === 'day') return <DayCover page={page} />
  if (page.type === 'stop') return <StopView page={page} />
  return <GuideView page={page} />
}

export function pageTitle(p: Page): string {
  return p.type === 'day' ? `${p.chapter.label} ${p.chapter.title}` : p.type === 'stop' ? p.stop.title : GUIDE_TITLE[p.kind]
}

/** 학생·보호자·선생님이 보는 안내: 지도 + 시간표 띠 + 한 장씩 넘기는 내용 */
export function Viewer({ banner, quiet = false }: { banner?: ReactNode; quiet?: boolean }) {
  const key = usePageKey()
  const { d, doc, at, role, scope } = useTrip()
  const [lastPage, setLastPage] = useStored<string | null>(`last-page:${scope}`, null)
  const [mapTall, setMapTall] = useStored<boolean>('map-tall', false)
  const [sheet, setSheet] = useState<'schedule' | 'menu' | null>(null)
  const [hidden, setHidden] = useStored<string[]>(`notices-hidden:${scope}`, [])
  const [closedNow, setClosedNow] = useState<string[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<HTMLElement>(null)
  const lastMapH = useRef(0)

  useEffect(() => {
    let hiddenAt = 0
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now()
      else if (hiddenAt && Date.now() - hiddenAt > 10 * 60 * 1000) setClosedNow([])
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const nowInfo = useMemo(() => pageAt(d, at), [d, at])
  const current: Page = (key && d.pageByKey.get(key)) || d.pages[0]

  // 주소에 장이 없으면: 여행 중이면 지금 장 → 마지막으로 본 장 → 첫 장
  useEffect(() => {
    if (key && d.pageByKey.has(key)) return
    const live = nowInfo.page && nowInfo.state === 'live' ? nowInfo.page.key : null
    goTo(live ?? (lastPage && d.pageByKey.has(lastPage) ? lastPage : d.pages[0].key), { replace: true })
  }, [key, lastPage, nowInfo, d])

  useEffect(() => {
    setLastPage(current.key)
  }, [current.key, setLastPage])

  // 휴대폰: 지도·띠·내용이 한 번에 스크롤된다. 장이 바뀌면 새 장의 윗부분을 보던 자리에 두고 지도를 부드럽게 다시 내린다.
  useLayoutEffect(() => {
    const box = scrollRef.current
    if (!box || !window.matchMedia('(max-width: 959px)').matches) return
    const mapH = mapRef.current?.offsetHeight ?? 0
    const prevH = lastMapH.current
    const keep = Math.max(0, Math.min(mapH, mapH - prevH + Math.min(box.scrollTop, prevH)))
    if (keep <= 0 && box.scrollTop <= 0) return
    box.scrollTop = keep
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      box.scrollTop = 0
      return
    }
    let frame = 0
    let t0 = -1
    const stop = () => cancelAnimationFrame(frame)
    const step = (t: number) => {
      if (t0 < 0) t0 = t
      const p = Math.max(0, Math.min(1, (t - t0) / 320))
      box.scrollTop = Math.round(keep * (1 - p) ** 3)
      if (p < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    box.addEventListener('touchstart', stop, { once: true, passive: true })
    box.addEventListener('wheel', stop, { once: true, passive: true })
    return () => {
      stop()
      box.removeEventListener('touchstart', stop)
      box.removeEventListener('wheel', stop)
    }
  }, [current.index])

  useLayoutEffect(() => {
    lastMapH.current = mapRef.current?.offsetHeight ?? 0
  })

  const ceiling = () => scrollRef.current?.querySelector('.strip')?.getBoundingClientRect().bottom ?? 0

  useEffect(() => {
    if (!role && !quiet) setSheet('menu')
  }, [role, quiet])

  const go = (i: number) => {
    if (i >= 0 && i < d.pages.length) goTo(d.pages[i].key, { replace: true })
  }
  const jump = (k: string) => {
    setSheet(null)
    goTo(k)
  }
  const goNow = () => {
    if (nowInfo.page) jump(nowInfo.page.key)
    else jump(nowInfo.state === 'after' ? 'after' : d.pages[0].key)
  }

  // 출발 전·다녀와서 장은 휴대폰에서 지도를 접는다(표지는 전체 동선을 보여 준다). 장소 없는 일정도 접는다.
  const noMap = (current.type === 'guide' && current.kind !== 'cover') || (current.type === 'stop' && !current.stop.place)

  const forMe = (n: Announcement) => n.popup && (n.audience === 'all' || (role === 'student' && n.audience === 'students') || (role === 'guardian' && n.audience === 'guardians'))
  const pending = role && role !== 'teacher' && !quiet ? doc.announcements.filter((n) => forMe(n) && !hidden.includes(noticeVersion(n)) && !closedNow.includes(noticeVersion(n))) : []

  const prev = d.pages[current.index - 1]
  const next = d.pages[current.index + 1]
  const dday = daysUntil(doc.startDate, at, doc.homeTz)
  const nextTime = (p: Page) => (p.type === 'stop' ? p.stop.time : '')

  return (
    <div className="app" data-map-tall={mapTall || undefined} data-nomap={noMap || undefined} data-banner={banner ? true : undefined}>
      <header className="topbar">
        <button type="button" className="topbar__chapter" onClick={() => setSheet('schedule')} aria-haspopup="dialog">
          <span className="topbar__chapter-label">{current.chapter.label}</span>
          {current.chapter.date ? <span className="topbar__chapter-date">{`${Number(current.chapter.date.slice(5, 7))}/${Number(current.chapter.date.slice(8))} ${current.chapter.weekday}`}</span> : null}
          <Icon name="chevronDown" size="1rem" />
        </button>
        <div className="topbar__actions">
          <button type="button" className="now-btn" onClick={goNow} data-live={nowInfo.state === 'live' || undefined}>
            {nowInfo.state === 'before' || nowInfo.state === 'after' ? (
              <span className="now-btn__label">{nowInfo.state === 'after' ? '다녀왔어요' : dday > 0 ? `D-${dday}` : dday === 0 ? '오늘 출발' : '여행 중'}</span>
            ) : (
              <>
                <span className="now-btn__dot" aria-hidden="true" />
                <span className="now-btn__label">지금</span>
              </>
            )}
          </button>
          <button type="button" className="icon-btn" onClick={() => setSheet('menu')} aria-label="메뉴와 역할">
            <Icon name="menu" />
          </button>
        </div>
      </header>
      {banner ? <div className="app__banner">{banner}</div> : null}

      <div className="app__scroll" ref={scrollRef}>
        <section className="app__map" aria-label="지도" ref={mapRef}>
          <TripMap d={d} page={current} onSelect={(k) => goTo(k)} />
          <button type="button" className="map-toggle" onClick={() => setMapTall(!mapTall)} aria-label={mapTall ? '지도 작게' : '지도 크게'}>
            <Icon name={mapTall ? 'collapse' : 'expand'} size="1.1rem" />
          </button>
        </section>
        <DayStrip page={current} nowKey={nowInfo.page?.key ?? null} onSelect={(k) => goTo(k, { replace: true })} />
        <main className="app__content">
          <Pager index={current.index} count={d.pages.length} onChange={go} ceiling={ceiling} render={(i) => <PageView page={d.pages[i]} />} />
        </main>
      </div>

      <nav className="bottombar" aria-label="장 넘기기">
        <button type="button" className="bottombar__prev" onClick={() => go(current.index - 1)} disabled={!prev} aria-label={prev ? `이전: ${pageTitle(prev)}` : '처음 장'}>
          <Icon name="chevronLeft" />
        </button>
        <div className="bottombar__pos" aria-live="polite">
          <span className="mono">{String(current.chapter.pages.indexOf(current) + 1).padStart(2, '0')}</span>
          <span className="bottombar__of">/ {String(current.chapter.pages.length).padStart(2, '0')}</span>
        </div>
        <button type="button" className="bottombar__next" onClick={() => go(current.index + 1)} disabled={!next}>
          {next ? (
            <>
              <span className="bottombar__next-text">
                <span className="bottombar__next-kicker">{next.chapter !== current.chapter ? next.chapter.label : nextTime(next) || '다음'}</span>
                <span className="bottombar__next-title">{rich(pageTitle(next).replace(/^\d+일차 /, ''))}</span>
              </span>
              <Icon name="chevronRight" />
            </>
          ) : (
            <span className="bottombar__next-text">
              <span className="bottombar__next-title">마지막 장이에요</span>
            </span>
          )}
        </button>
      </nav>

      {sheet === 'schedule' ? <ScheduleSheet current={current} nowKey={nowInfo.page?.key ?? null} onJump={jump} onClose={() => setSheet(null)} /> : null}
      {sheet === 'menu' ? <MenuSheet onJump={jump} onClose={() => setSheet(null)} /> : null}
      {sheet === null && pending.length ? <NoticePopup items={pending} onHide={(n) => setHidden((h) => [...h, noticeVersion(n)])} onClose={() => setClosedNow((c) => [...c, ...pending.map(noticeVersion)])} /> : null}
      <span className="sr-only" aria-live="polite">
        {current.chapter.label} {pageTitle(current)}
      </span>
    </div>
  )
}
