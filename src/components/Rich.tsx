import { Fragment, type ReactNode } from 'react'
import { Icon } from './Icon'

/** "10/12", "10/12(월)", "2026. 11. 3.(화)" 같은 날짜. 화면 폭이 좁아도 날짜 한가운데서 줄이 바뀌지 않게 묶는다. */
const DATE = /(\d{4}\. \d{1,2}\. \d{1,2}\.(?:\([월화수목금토일]\))?|\d{1,2}\/\d{1,2}(?:\([월화수목금토일]\))?)/g

function dates(text: string): ReactNode {
  DATE.lastIndex = 0
  if (!DATE.test(text)) return text
  return text.split(DATE).map((p, i) =>
    i % 2 === 1 ? (
      <span key={i} className="nowrap">
        {p}
      </span>
    ) : (
      p
    ),
  )
}

/**
 * 안내 글 속 화살표(→)를 문자 대신 SVG 화살표로 그린다(화면 기호는 SVG 만 쓴다).
 * 내용 JSON 은 사람이 읽고 고치기 쉽게 "서울 → 경주" 처럼 두고, 화면에 낼 때만 바꾼다.
 * 날짜는 한 덩어리로 묶어 줄이 날짜 중간에서 바뀌지 않게 한다.
 * 문장 전체도 한 요소로 묶어 grid/flex 부모가 날짜·화살표를 별도 칸에 배치하지 않게 한다.
 */
export function rich(text: string | undefined | null): ReactNode {
  if (!text) return text
  if (!text.includes('→')) return <span className="rich">{dates(text)}</span> // emoji-guard-ok: 문자 화살표를 SVG 로 바꾸는 곳
  const parts = text.split('→') // emoji-guard-ok
  return (
    <span className="rich">
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 ? (
            <>
              <Icon name="arrowRight" size="0.95em" strokeWidth={2} className="icon icon--inline" />
              <span className="sr-only">에서 </span>
            </>
          ) : null}
          {dates(i === 0 ? p.replace(/\s+$/, '') : i === parts.length - 1 ? p.replace(/^\s+/, '') : p.trim())}
        </Fragment>
      ))}
    </span>
  )
}
