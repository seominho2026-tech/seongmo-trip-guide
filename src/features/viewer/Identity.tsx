import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { useTrip } from '../../trip/context'
import { nameProblem, studentNoProblem, useMe } from '../../lib/reflections'

/** 학번·이름 적기. 이 휴대폰에만 저장하고, 선생님께 낼 느낀 점 파일에 들어간다. */
export function IdentityForm({ onDone, compact = false }: { onDone?: () => void; compact?: boolean }) {
  const { scope, doc } = useTrip()
  const [me, setMe] = useMe(scope)
  const [no, setNo] = useState(me?.no ?? '')
  const [name, setName] = useState(me?.name ?? '')
  const [err, setErr] = useState<string | null>(null)
  const example = doc.studentIdDigits === 4 ? '1103' : '10203'
  return (
    <form
      className="idform"
      data-compact={compact || undefined}
      data-noswipe
      onSubmit={(e) => {
        e.preventDefault()
        const p = studentNoProblem(no.trim(), doc.studentIdDigits) ?? nameProblem(name)
        if (p) return setErr(p)
        setMe({ no: no.trim(), name: name.trim() })
        setErr(null)
        onDone?.()
      }}
    >
      <div className="idform__row">
        <label className="field">
          <span className="field__label">학번 {doc.studentIdDigits}자리</span>
          <input className="input mono" inputMode="numeric" autoComplete="off" maxLength={doc.studentIdDigits} placeholder={example} value={no} onChange={(e) => setNo(e.target.value.replace(/\D/g, ''))} />
        </label>
        <label className="field">
          <span className="field__label">이름</span>
          <input className="input" autoComplete="off" maxLength={20} placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      </div>
      {err ? (
        <p className="form-error" role="alert">
          {err}
        </p>
      ) : null}
      <button type="submit" className="btn btn--primary btn--block">
        <Icon name="check" size="1.1rem" /> 저장
      </button>
      <p className="fineprint">학번과 이름은 이 휴대폰에만 저장돼요. 느낀 점 파일에 함께 들어가 선생님이 모을 때 써요.</p>
    </form>
  )
}
