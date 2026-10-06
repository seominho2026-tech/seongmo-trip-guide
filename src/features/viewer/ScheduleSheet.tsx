import { useEffect, useRef, useState } from 'react'
import { rich } from '../../components/Rich'
import type { Page } from '../../trip/derive'
import { Icon, KIND_ICON } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { useTrip } from '../../trip/context'
import { ShiftTag, timeText } from './parts'

/** 전체 일정표. 일차를 누르면 펼쳐지고, 줄을 누르면 그 장으로 간다. */
export function ScheduleSheet({ current, nowKey, onJump, onClose }: { current: Page; nowKey: string | null; onJump: (key: string) => void; onClose: () => void }) {
  const { d } = useTrip()
  const [open, setOpen] = useState<number>(current.chapter.n)
  const listRef = useRef<HTMLOListElement>(null)
  useEffect(() => {
    listRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'center' })
  }, [])
  return (
    <Sheet title="전체 일정" onClose={onClose}>
      <ol className="sched" ref={listRef}>
        {d.chapters.map((c) => {
          const isOpen = open === c.n
          return (
            <li key={c.n} className="sched__chapter" data-open={isOpen || undefined} data-current={c === current.chapter || undefined}>
              <button type="button" className="sched__head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? -1 : c.n)}>
                <span className="sched__label">{c.label}</span>
                <span className="sched__date mono">{c.date ? `${c.date.slice(5).replace('-', '/')} ${c.weekday}` : ''}</span>
                <span className="sched__title">{rich(c.title)}</span>
                <Icon name="chevronDown" size="1rem" />
              </button>
              {isOpen ? (
                <ol className="sched__pages">
                  {c.pages.map((p) => (
                    <li key={p.key}>
                      <button type="button" className="sched__row" aria-current={p.key === current.key ? 'page' : undefined} data-now={p.key === nowKey || undefined} onClick={() => onJump(p.key)}>
                        <span className="sched__time mono">
                          {p.type === 'stop' ? p.stop.time : ''}
                          {p.type === 'stop' ? <ShiftTag page={p} /> : null}
                        </span>
                        <span className="sched__icon" aria-hidden="true">
                          <Icon name={p.type === 'day' ? 'calendar' : p.type === 'stop' ? (KIND_ICON[p.stop.kind] ?? 'info') : 'info'} size="0.95rem" />
                        </span>
                        <span className="sched__name">
                          {p.type === 'day' ? '하루 한눈에 보기' : p.type === 'stop' ? rich(p.stop.title) : GUIDE_TITLE[p.kind]}
                          {p.key === nowKey ? <span className="tag tag--live">지금</span> : null}
                        </span>
                        <span className="sched__stay mono">{p.type === 'stop' ? (timeText(d, p).stay ?? '') : ''}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              ) : null}
            </li>
          )
        })}
      </ol>
    </Sheet>
  )
}

export const GUIDE_TITLE = { cover: '여행 한눈에 보기', before: '출발 전에 챙겨요', after: '다녀와서' } as const
