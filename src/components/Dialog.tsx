import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * 화면을 덮는 창의 공통 동작: 열 때 초점을 창 안으로, Tab 은 창 안에서만 돌고, Esc 로 닫고,
 * 뒤 화면은 스크롤되지 않으며, 닫으면 연 단추로 초점을 돌려준다.
 */
export function useModal(panelRef: RefObject<HTMLElement | null>, onClose: () => void, initial?: string, returnTo?: () => HTMLElement | null) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const returnRef = useRef(returnTo)
  returnRef.current = returnTo
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const first = (initial && panel?.querySelector<HTMLElement>(initial)) || panel
    first?.focus()
    const onKey = (e: KeyboardEvent) => {
      const p = panelRef.current
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
      } else if (e.key === 'Tab' && p) {
        const items = [...p.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.getClientRects().length > 0)
        if (!items.length) {
          e.preventDefault()
          return
        }
        const a = items[0]
        const z = items[items.length - 1]
        const inside = p.contains(document.activeElement)
        if (e.shiftKey && (!inside || document.activeElement === a || document.activeElement === p)) {
          e.preventDefault()
          z.focus()
        } else if (!e.shiftKey && (!inside || document.activeElement === z)) {
          e.preventDefault()
          a.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey, true)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prev
      // 연 단추가 그사이 꺼졌으면(저장 중인 저장 단추 등) 정해 둔 곳으로 돌아간다
      const back = returnRef.current?.() ?? (opener && opener !== document.body ? opener : null)
      back?.focus?.()
    }
    // 창이 열려 있는 동안 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

/** 가운데 뜨는 확인 창(제목 · 본문 · 아래 단추 줄). Esc·바깥 누르기는 onClose(창만 닫기). */
export function Dialog({ title, onClose, children, foot, returnTo }: { title: ReactNode; onClose: () => void; children: ReactNode; foot: ReactNode; returnTo?: () => HTMLElement | null }) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useModal(panelRef, onClose, undefined, returnTo)
  return (
    <div className="notice-pop" onClick={onClose}>
      <div ref={panelRef} className="notice-pop__panel" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="notice-pop__head">
          <h2 className="dialog__title" id={titleId}>
            {title}
          </h2>
        </div>
        <div className="notice-pop__body">{children}</div>
        <div className="notice-pop__foot">{foot}</div>
      </div>
    </div>
  )
}
