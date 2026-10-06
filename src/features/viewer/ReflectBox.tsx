import { useEffect, useRef, useState } from 'react'
import { DEFAULT_PROMPT, type StopPage } from '../../trip/derive'
import { Icon } from '../../components/Icon'
import { useTrip } from '../../trip/context'
import { REFLECTION_MAX, useBook, useMe } from '../../lib/reflections'
import { clock } from '../../lib/time'
import { IdentityForm } from './Identity'

/**
 * 학생 느낀 점. 쓰는 대로 이 휴대폰에 저장되고, 다녀와서 장에서 파일로 모아 선생님께 낸다.
 */
export function ReflectBox({ page }: { page: StopPage }) {
  const { scope, doc } = useTrip()
  const [me] = useMe(scope)
  const [book, save] = useBook(scope)
  const saved = book[page.stop.id]
  const [text, setText] = useState(saved?.text ?? '')
  const [savedAt, setSavedAt] = useState<string | null>(saved?.updatedAt ?? null)
  const timer = useRef<number | null>(null)
  const latest = useRef(text)
  latest.current = text

  // 다른 탭에서 바뀌면 따라간다(입력 중이 아닐 때)
  useEffect(() => {
    if (timer.current != null) return
    setText(book[page.stop.id]?.text ?? '')
    setSavedAt(book[page.stop.id]?.updatedAt ?? null)
  }, [book, page.stop.id])

  // 장을 넘기기 직전에 쓰던 글을 저장한다
  useEffect(
    () => () => {
      if (timer.current) {
        window.clearTimeout(timer.current)
        save(page.stop.id, latest.current)
      }
    },
    [page.stop.id, save],
  )

  const commit = (v: string) => {
    save(page.stop.id, v)
    setSavedAt(v.trim() ? new Date().toISOString() : null)
  }

  return (
    <section className="reflect" data-noswipe>
      <h2 className="block__title">
        <Icon name="pen" size="1.05rem" /> 느낀 점
      </h2>
      <p className="reflect__prompt">{page.stop.reflect?.prompt?.trim() || DEFAULT_PROMPT}</p>
      {me ? (
        <>
          <textarea
            className="reflect__input"
            rows={5}
            value={text}
            maxLength={REFLECTION_MAX}
            placeholder="보고, 듣고, 생각한 것을 짧게라도 적어 두세요."
            onChange={(e) => {
              const v = e.target.value
              setText(v)
              if (timer.current) window.clearTimeout(timer.current)
              timer.current = window.setTimeout(() => {
                timer.current = null
                commit(latest.current)
              }, 600)
            }}
            onBlur={() => {
              if (timer.current) {
                window.clearTimeout(timer.current)
                timer.current = null
                commit(text)
              }
            }}
            aria-label={`${page.stop.title} 느낀 점`}
          />
          <p className="reflect__status" aria-live="polite">
            {savedAt ? `이 휴대폰에 저장했어요 · ${clock(new Date(savedAt), doc.tz).time}` : '쓰는 대로 이 휴대폰에 저장돼요. 다녀와서 장에서 파일로 모아 선생님께 내요.'}
            <span className="reflect__who mono">
              {me.no} {me.name}
            </span>
          </p>
        </>
      ) : (
        <>
          <p className="reflect__ask">느낀 점을 쓰려면 먼저 학번과 이름을 적어 주세요.</p>
          <IdentityForm compact />
        </>
      )}
    </section>
  )
}
