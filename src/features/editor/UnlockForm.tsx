import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { ApiFail, recoverTrip, setToken, unlockTrip } from '../../lib/api'
import { pinProblem, PIN_MAX } from '../../lib/pinPolicy'
import { addDays, clock } from '../../lib/time'
import { copyText } from '../../lib/clipboard'

/** PIN 넣기. 잊었으면 복구 코드로 새 PIN 정하기(성공하면 새 복구 코드를 한 번 보여 준다). */
export function UnlockForm({ id, title, trip, onOpen }: { id: string; title: string | null; trip: { startDate: string; nights: number } | null; onOpen: (token: string) => void }) {
  const [mode, setMode] = useState<'pin' | 'recover'>('pin')
  const codeRef = useRef<HTMLInputElement>(null)
  // 복구 화면으로 바뀌면(잠금 때문이든 직접 눌렀든) 복구 코드 칸으로 초점을 옮긴다
  useEffect(() => {
    if (mode === 'recover') codeRef.current?.focus()
  }, [mode])
  const [remember, setRemember] = useState(false)
  const [fresh, setFresh] = useState<{ token: string; code: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [kept, setKept] = useState(false)
  const [pin, setPin] = useState('')
  const [code, setCode] = useState('')
  const [newPin, setNewPin] = useState('')
  const [newPin2, setNewPin2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const fail = (e: unknown) => {
    const f = e as ApiFail
    if (f.code === 'locked-recovery') {
      setMode('recover')
      setErr(f.message)
    } else if (f.code === 'locked' && typeof f.data.lockedUntil === 'number') {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      const t = clock(new Date(f.data.lockedUntil), tz)
      const sameDay = t.ymd === clock(new Date(), tz).ymd
      const when = sameDay ? t.time : `${t.m}/${t.d}(${t.weekday}) ${t.time}`
      // 이 인터넷만 잠겼으면(학교 와이파이에서 누가 여러 번 틀린 경우 등) 다른 인터넷으로는 바로 넣을 수 있다
      const other = f.data.scope === 'address' ? ' 학교 와이파이처럼 여럿이 같은 인터넷을 쓰고 있다면 휴대폰 데이터로 바꿔 넣어 보세요.' : ''
      setErr(`${f.message} ${when}부터 다시 넣을 수 있어요.${other}${mode === 'pin' ? ' 복구 코드가 있으면 아래에서 바로 새 PIN을 정할 수 있어요.' : ''}`)
    } else setErr(f.message)
  }

  if (fresh)
    return (
      <div className="unlock">
        <div className="unlock__card">
          <h2 className="unlock__title">새 PIN을 정했어요</h2>
          <p className="body-text">쓴 복구 코드는 이제 쓸 수 없어요. 아래 새 복구 코드를 꼭 적어 두세요.</p>
          <div className="recovery">
            <span className="recovery__label">새 복구 코드</span>
            <strong className="recovery__code mono">{fresh.code}</strong>
            <span className="recovery__note">이 화면을 닫으면 다시 볼 수 없어요.</span>
          </div>
          <button type="button" className="btn btn--ghost" onClick={async () => setCopied(await copyText(fresh.code))}>
            <Icon name="copy" size="1.05rem" /> {copied ? '복사했어요' : '복사'}
          </button>
          <label className="agree">
            <input type="checkbox" checked={kept} onChange={(e) => setKept(e.target.checked)} />
            <span className="check__box" aria-hidden="true">
              <Icon name="check" size="0.9rem" strokeWidth={2.4} />
            </span>
            <span>새 복구 코드를 안전한 곳에 적어 두었어요.</span>
          </label>
          <button type="button" className="btn btn--primary btn--block" disabled={!kept} onClick={() => onOpen(fresh.token)}>
            편집하러 가기
          </button>
        </div>
      </div>
    )

  return (
    <div className="unlock">
      <div className="unlock__card">
        <span className="unlock__icon" aria-hidden="true">
          <Icon name="key" size="1.4rem" />
        </span>
        <h2 className="unlock__title">{title ? `「${title}」 고치기` : '여행 고치기'}</h2>
        {mode === 'pin' ? (
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault()
              setBusy(true)
              setErr(null)
              try {
                const r = await unlockTrip(id, pin, remember)
                setToken(id, r.token, remember)
                onOpen(r.token)
              } catch (er) {
                fail(er)
              } finally {
                setBusy(false)
              }
            }}
          >
            <label className="field">
              <span className="field__label">선생님 PIN</span>
              <input className="input mono input--pin" type="password" inputMode="numeric" autoComplete="current-password" maxLength={PIN_MAX} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoFocus />
            </label>
            <label className="agree">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span className="check__box" aria-hidden="true">
                <Icon name="check" size="0.9rem" strokeWidth={2.4} />
              </span>
              <span>이 기기 기억하기(30일). 학생도 쓰는 공용 컴퓨터에서는 켜지 마세요. 끄면 이 창을 닫을 때 편집이 끝나요.</span>
            </label>
            {err ? (
              <p className="form-error" role="alert">
                {err}
              </p>
            ) : null}
            <button type="submit" className="btn btn--primary btn--block" disabled={busy || pin.length < 6}>
              {busy ? '확인 중…' : '열기'}
            </button>
            <button type="button" className="link-btn" onClick={() => (setMode('recover'), setErr(null))}>
              PIN을 잊었어요
            </button>
          </form>
        ) : (
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault()
              setErr(null)
              const p = pinProblem(newPin, trip ? { startDate: trip.startDate, endDate: addDays(trip.startDate, trip.nights) } : undefined)
              if (p) return setErr(p)
              if (newPin !== newPin2) return setErr('새 PIN 두 번이 서로 달라요.')
              setBusy(true)
              try {
                const r = await recoverTrip(id, code, newPin)
                setToken(id, r.token)
                setFresh({ token: r.token, code: r.recovery })
              } catch (er) {
                fail(er)
              } finally {
                setBusy(false)
              }
            }}
          >
            <p className="body-text">여행을 만들 때 받은 복구 코드로 새 PIN을 정해요. 다른 기기에 열려 있던 편집 화면은 모두 닫혀요.</p>
            <label className="field">
              <span className="field__label">복구 코드</span>
              <input ref={codeRef} className="input mono" autoComplete="off" placeholder="XXXX-XXXX-XXXX-XXXX" aria-label="복구 코드" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            </label>
            <div className="field-row">
              <label className="field">
                <span className="field__label">새 PIN</span>
                <input className="input mono" type="password" inputMode="numeric" autoComplete="new-password" maxLength={PIN_MAX} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))} />
              </label>
              <label className="field">
                <span className="field__label">한 번 더</span>
                <input className="input mono" type="password" inputMode="numeric" autoComplete="new-password" maxLength={PIN_MAX} value={newPin2} onChange={(e) => setNewPin2(e.target.value.replace(/\D/g, ''))} />
              </label>
            </div>
            {err ? (
              <p className="form-error" role="alert">
                {err}
              </p>
            ) : null}
            <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
              {busy ? '확인 중…' : '새 PIN 정하고 열기'}
            </button>
            <button type="button" className="link-btn" onClick={() => (setMode('pin'), setErr(null))}>
              PIN 넣기로 돌아가기
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
