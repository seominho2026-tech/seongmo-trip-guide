import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/**
 * 한 장씩 넘기기. 옆으로 밀거나(휴대폰) ←/→ 키(컴퓨터)로 앞뒤 장으로 간다.
 *
 * - 앞·지금·뒤 세 장만 그려 두고, 손가락을 따라 함께 움직인다.
 * - 처음 10px 에서 옆 방향이 더 크면 넘기기, 아래위가 더 크면 그 장의 스크롤로 넘긴다.
 * - 글 입력칸·출석판·좌석표처럼 [data-noswipe] 안에서 시작한 손짓은 넘기기로 쓰지 않는다.
 * - 너비의 22% 넘게 밀었거나 빠르게 튕기면 넘어가고, 아니면 제자리로 돌아온다.
 * - 휴대폰에서는 바깥 상자가 스크롤되므로, 넘기기 시작할 때 옆 장의 윗부분을 ceiling(띠 아래 선)에 맞춘다.
 */
export function Pager({
  index,
  count,
  onChange,
  render,
  ceiling,
}: {
  index: number
  count: number
  onChange: (next: number) => void
  render: (i: number) => ReactNode
  ceiling?: () => number
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dx, setDx] = useState(0)
  const [animating, setAnimating] = useState(false)
  const [peerY, setPeerY] = useState(0)
  const drag = useRef<{ x: number; y: number; t: number; axis: 'x' | 'y' | null; id: number } | null>(null)
  const pending = useRef<number | null>(null)
  /** 옆으로 밀다 손을 뗀 직후의 클릭(사진·단추 위에서 시작한 경우)은 누른 것으로 치지 않는다 */
  const swallowClick = useRef(false)

  // 장이 바뀌면 새 장을 맨 위부터
  useEffect(() => {
    trackRef.current?.querySelector<HTMLElement>('[data-slot="0"]')?.scrollTo({ top: 0 })
  }, [index])

  // 새 장이 가운데로 오면 옆 장 맞춤을 푼다
  useLayoutEffect(() => {
    setPeerY(0)
  }, [index])

  const alignPeers = () => {
    const track = trackRef.current
    if (!track || !ceiling) return
    setPeerY(Math.max(0, Math.round(ceiling() - track.getBoundingClientRect().top)))
  }

  const width = () => trackRef.current?.clientWidth ?? window.innerWidth
  const reduce = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

  function settle(dir: -1 | 0 | 1) {
    const target = index + dir
    if (dir !== 0 && (target < 0 || target >= count)) dir = 0
    if (reduce() || dir === 0) {
      setAnimating(!reduce())
      setDx(0)
      if (dir !== 0) onChange(target)
      return
    }
    pending.current = target
    // 키보드로 넘길 때도 옆 장을 띠 아래에 맞춘다(손으로 밀 때는 밀기 시작할 때 맞춘 값과 같다)
    alignPeers()
    setAnimating(true)
    setDx(-dir * width())
  }

  function onTransitionEnd(e: React.TransitionEvent<HTMLDivElement>) {
    // 안쪽 단추·카드의 전환이 끝난 신호는 무시하고, 넘기기 트랙의 이동만 본다
    if (e.target !== e.currentTarget || e.propertyName !== 'transform') return
    setAnimating(false)
    if (pending.current != null) {
      const t = pending.current
      pending.current = null
      setDx(0)
      onChange(t)
    }
  }

  // 키보드 ←/→ (글을 쓰는 중이면 쓰지 않는다)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
      if (e.key === 'ArrowRight') settle(1)
      if (e.key === 'ArrowLeft') settle(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div
      ref={trackRef}
      className="pager"
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        if ((e.target as HTMLElement).closest('[data-noswipe], input, textarea, select')) return
        drag.current = { x: e.clientX, y: e.clientY, t: performance.now(), axis: null, id: e.pointerId }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d || d.id !== e.pointerId) return
        const mx = e.clientX - d.x
        const my = e.clientY - d.y
        if (!d.axis) {
          if (Math.abs(mx) < 10 && Math.abs(my) < 10) return
          d.axis = Math.abs(mx) > Math.abs(my) * 1.2 ? 'x' : 'y'
          if (d.axis === 'x') {
            ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
            alignPeers()
          }
        }
        if (d.axis !== 'x') return
        // 처음·마지막 장에서는 고무줄처럼 덜 끌린다
        const edge = (index === 0 && mx > 0) || (index === count - 1 && mx < 0)
        setAnimating(false)
        setDx(edge ? mx * 0.3 : mx)
      }}
      onPointerUp={(e) => {
        const d = drag.current
        drag.current = null
        if (!d || d.axis !== 'x') return
        swallowClick.current = true
        window.setTimeout(() => (swallowClick.current = false), 0)
        const mx = e.clientX - d.x
        const v = mx / Math.max(1, performance.now() - d.t)
        const w = width()
        if (mx < -w * 0.22 || v < -0.55) settle(1)
        else if (mx > w * 0.22 || v > 0.55) settle(-1)
        else settle(0)
      }}
      onDragStart={(e) => e.preventDefault()}
      onClickCapture={(e) => {
        if (swallowClick.current) {
          e.preventDefault()
          e.stopPropagation()
          swallowClick.current = false
        }
      }}
      onPointerCancel={() => {
        drag.current = null
        settle(0)
      }}
    >
      <div className="pager__track" data-animating={animating || undefined} style={{ transform: `translate3d(${dx}px,0,0)`, ['--peer-y' as string]: `${peerY}px` }} onTransitionEnd={onTransitionEnd}>
        {[-1, 0, 1].map((off) => {
          const i = index + off
          if (i < 0 || i >= count) return <div key={off} className="pager__slot" data-slot={off} aria-hidden="true" />
          return (
            <div key={i} className="pager__slot" data-slot={off} aria-hidden={off !== 0 || undefined} inert={off !== 0 || undefined}>
              {render(i)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
