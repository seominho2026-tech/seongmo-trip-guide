import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { ApiFail, changePin, deleteTrip, forgetTrip, logoutAllTrip, logoutTrip, setToken } from '../../lib/api'
import { pinProblem, PIN_MAX } from '../../lib/pinPolicy'
import { navigate } from '../../lib/router'
import { addDays } from '../../lib/time'

/** PIN 바꾸기 · 편집 끝내기(이 기기·모든 기기) · 여행 지우기 */
export function SettingsSheet({ id, token, title, trip, onToken, onClose }: { id: string; token: string; title: string; trip: { startDate: string; nights: number }; onToken: (t: string) => void; onClose: () => void }) {
  const [allPin, setAllPin] = useState('')
  const [pin, setPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [newPin2, setNewPin2] = useState('')
  const [msg, setMsg] = useState<{ at: 'pin' | 'all' | 'delete'; ok: boolean; text: string } | null>(null)
  const [delPin, setDelPin] = useState('')
  const [delWord, setDelWord] = useState('')
  const [busy, setBusy] = useState(false)
  const digits = (v: string) => v.replace(/\D/g, '')

  return (
    <Sheet title="설정" onClose={onClose}>
      <div className="settings">
        <section className="settings__block">
          <h3 className="settings__h">PIN 바꾸기</h3>
          <p className="fineprint">바꾸면 다른 기기에 열려 있던 편집 화면은 모두 닫혀요. 함께 인솔하는 선생님께 새 PIN을 알려 주세요.</p>
          <div className="field-row">
            <input className="input mono" type="password" inputMode="numeric" placeholder="지금 PIN" maxLength={PIN_MAX} value={pin} onChange={(e) => setPin(digits(e.target.value))} aria-label="지금 PIN" />
            <input className="input mono" type="password" inputMode="numeric" placeholder="새 PIN" maxLength={PIN_MAX} value={newPin} onChange={(e) => setNewPin(digits(e.target.value))} aria-label="새 PIN" />
            <input className="input mono" type="password" inputMode="numeric" placeholder="새 PIN 한 번 더" maxLength={PIN_MAX} value={newPin2} onChange={(e) => setNewPin2(digits(e.target.value))} aria-label="새 PIN 한 번 더" />
          </div>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || !pin || !newPin}
            onClick={async () => {
              const p = pinProblem(newPin, { startDate: trip.startDate, endDate: addDays(trip.startDate, trip.nights) })
              if (p) return setMsg({ at: 'pin', ok: false, text: p })
              if (newPin !== newPin2) return setMsg({ at: 'pin', ok: false, text: '새 PIN 두 번이 서로 달라요.' })
              setBusy(true)
              try {
                const r = await changePin(id, token, pin, newPin)
                setToken(id, r.token)
                onToken(r.token)
                setPin('')
                setNewPin('')
                setNewPin2('')
                setMsg({ at: 'pin', ok: true, text: 'PIN을 바꿨어요.' })
              } catch (e) {
                setMsg({ at: 'pin', ok: false, text: (e as ApiFail).message })
              } finally {
                setBusy(false)
              }
            }}
          >
            <Icon name="key" size="1.05rem" /> PIN 바꾸기
          </button>
<Note msg={msg} at="pin" />
        </section>

        <section className="settings__block">
          <h3 className="settings__h">이 기기에서 편집 끝내기</h3>
          <p className="fineprint">공용 컴퓨터라면 다 고친 뒤 눌러 주세요. 다음에 고칠 때 PIN을 다시 넣어요.</p>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={async () => {
              await logoutTrip(id, token).catch(() => undefined)
              setToken(id, null)
              navigate(`/t/${id}`)
            }}
          >
            <Icon name="logout" size="1.05rem" /> 편집 끝내기
          </button>
        </section>

        <section className="settings__block">
          <h3 className="settings__h">모든 기기에서 편집 끝내기</h3>
          <p className="fineprint">교실 컴퓨터처럼 다른 기기에 편집 화면을 열어 두고 왔다면 눌러 주세요. PIN은 그대로이고, 이 기기도 다시 PIN을 넣어야 해요.</p>
          <div className="field-row">
            <input className="input mono" type="password" inputMode="numeric" placeholder="PIN" maxLength={PIN_MAX} value={allPin} onChange={(e) => setAllPin(digits(e.target.value))} aria-label="모든 기기에서 끝낼 때 넣는 PIN" />
          </div>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy || !allPin}
            onClick={async () => {
              setBusy(true)
              try {
                await logoutAllTrip(id, allPin)
                setToken(id, null)
                navigate(`/t/${id}`)
              } catch (e) {
                setMsg({ at: 'all', ok: false, text: (e as ApiFail).message })
              } finally {
                setBusy(false)
              }
            }}
          >
            <Icon name="logout" size="1.05rem" /> 모든 기기에서 끝내기
          </button>
          <Note msg={msg} at="all" />
        </section>

        <section className="settings__block settings__block--danger">
          <h3 className="settings__h">여행 지우기</h3>
          <p className="fineprint">안내가 지워져 링크와 QR이 더 이상 열리지 않아요. 되돌릴 수 없어요. 학생 휴대폰에 저장된 느낀 점은 지워지지 않아요.</p>
          <div className="field-row">
            <input className="input mono" type="password" inputMode="numeric" placeholder="PIN" maxLength={PIN_MAX} value={delPin} onChange={(e) => setDelPin(digits(e.target.value))} aria-label="여행을 지울 때 넣는 PIN" />
            <input className="input" placeholder="지울게요 라고 적어 주세요" value={delWord} onChange={(e) => setDelWord(e.target.value)} aria-label="확인 글" />
          </div>
          <button
            type="button"
            className="btn btn--danger"
            disabled={busy || delWord.trim() !== '지울게요' || !delPin}
            onClick={async () => {
              setBusy(true)
              try {
                await deleteTrip(id, token, delPin)
                setToken(id, null)
                forgetTrip(id)
                navigate('/', { replace: true })
              } catch (e) {
                setMsg({ at: 'delete', ok: false, text: (e as ApiFail).message })
              } finally {
                setBusy(false)
              }
            }}
          >
            <Icon name="trash" size="1.05rem" /> 「{title}」 지우기
          </button>
          <Note msg={msg} at="delete" />
        </section>
      </div>
    </Sheet>
  )
}

/** 그 칸 바로 아래에 뜨는 결과 안내(다른 칸의 안내는 그 칸에) */
function Note({ msg, at }: { msg: { at: string; ok: boolean; text: string } | null; at: string }) {
  if (!msg || msg.at !== at) return null
  return (
    // 시트 아래쪽 칸이면 안내가 화면 밖에 걸리지 않게 보이는 곳으로 당긴다
    <p className={msg.ok ? 'form-ok' : 'form-error'} role="status" ref={(el) => el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })}>
      {msg.text}
    </p>
  )
}
