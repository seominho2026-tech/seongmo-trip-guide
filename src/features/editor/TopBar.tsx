import type { ReactNode } from 'react'
import { Icon } from '../../components/Icon'

/** 만들기·편집·모으기 화면의 위 띠 */
export function TopBar({ title, back, children }: { title: ReactNode; back?: () => void; children?: ReactNode }) {
  return (
    <header className="tb">
      {back ? (
        <button type="button" className="icon-btn" onClick={back} aria-label="뒤로">
          <Icon name="chevronLeft" />
        </button>
      ) : (
        <span className="tb__mark" aria-hidden="true">
          <Icon name="pin" size="1rem" strokeWidth={2.2} />
        </span>
      )}
      <h1 className="tb__title">{title}</h1>
      {children ? <div className="tb__acts">{children}</div> : null}
    </header>
  )
}
