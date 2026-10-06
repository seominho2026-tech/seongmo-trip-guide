import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import type { Announcement } from '../../trip/schema'
import { Body } from './parts'

const DOTS_MAX = 10

/** 공지 하나의 판(고치면 다시 뜬다) */
export const noticeVersion = (n: Announcement) => `${n.id}:${n.updatedAt}`

/**
 * 사이트를 열면 뜨는 공지 팝업. 여러 건이면 옆으로 밀거나 화살표로 넘긴다.
 * '다시 보지 않기'를 누른 공지는 이 휴대폰에서 다시 뜨지 않고, '닫기'만 누르면 다음에 열 때 또 뜬다.
 */
export function NoticePopup({ items, onHide, onClose, preview = false }: { items: Announcement[]; onHide: (n: Announcement) => void; onClose: () => void; preview?: boolean }) {
  const [at, setAt] = useState(0)
  const i = Math.min(at, items.length - 1)
  const current = items[i]
  const many = items.length > 1
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const countRef = useRef(items.length)
  countRef.current = items.length
  const go = (dd: number) =>
    setAt((v) => {
      const last = countRef.current - 1
      return Math.max(0, Math.min(last, Math.min(v, last) + dd))
    })

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      const panel = panelRef.current
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.stopPropagation()
        go(e.key === 'ArrowRight' ? 1 : -1)
      } else if (e.key === 'Tab' && panel) {
        const stops = Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex="0"]'))
        if (!stops.length) return
        const first = stops[0]
        const last = stops[stops.length - 1]
        const active = document.activeElement
        if (e.shiftKey && (active === first || active === panel || !panel.contains(active))) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      opener?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!current) return null
  const titleId = `notice-title-${current.id}`
  return (
    <div className="notice-pop" data-noswipe>
      <div
        ref={panelRef}
        className="notice-pop__panel"
        data-many={many || undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onPointerDown={(e) => {
          if (!many || e.pointerType === 'mouse' || (e.target as HTMLElement).closest('button')) return
          swipe.current = { x: e.clientX, y: e.clientY }
        }}
        onPointerUp={(e) => {
          const s = swipe.current
          swipe.current = null
          if (!s) return
          const dx = e.clientX - s.x
          if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.5) go(dx < 0 ? 1 : -1)
        }}
        onPointerCancel={() => (swipe.current = null)}
      >
        <div className="notice-pop__head">
          <span className="notice-pop__kicker">
            <Icon name="megaphone" size="1.05rem" />
            {preview ? '공지 미리 보기' : '공지'}
          </span>
          {many ? (
            <span className="notice-pop__pager">
              <button type="button" className="icon-btn" onClick={() => go(-1)} disabled={i === 0} aria-label="이전 공지">
                <Icon name="chevronLeft" />
              </button>
              <span className="mono notice-pop__count" aria-hidden="true">
                {i + 1} / {items.length}
              </span>
              <button type="button" className="icon-btn" onClick={() => go(1)} disabled={i === items.length - 1} aria-label="다음 공지">
                <Icon name="chevronRight" />
              </button>
            </span>
          ) : null}
        </div>
        <span className="sr-only" aria-live="polite">
          {many ? `공지 ${items.length}건 가운데 ${i + 1}번째. ${current.title}` : ''}
        </span>
        <div className="notice-pop__body">
          <article className="notice">
            <h2 className="notice__title" id={titleId}>
              {current.title}
            </h2>
            {current.body.trim() ? <Body text={current.body} /> : null}
          </article>
        </div>
        {many && items.length <= DOTS_MAX ? (
          <div className="notice-pop__dots" aria-hidden="true">
            {items.map((n, k) => (
              <span key={n.id} data-on={k === i || undefined} />
            ))}
          </div>
        ) : null}
        <div className="notice-pop__foot">
          {preview ? null : (
            <button type="button" className="btn btn--ghost" onClick={() => onHide(current)}>
              다시 보지 않기
            </button>
          )}
          <button type="button" className="btn btn--primary" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
