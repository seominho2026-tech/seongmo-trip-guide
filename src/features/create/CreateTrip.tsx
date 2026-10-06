import { useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import { createTrip, rememberTrip, setToken, ApiFail } from '../../lib/api'
import { navigate } from '../../lib/router'
import { emptyTrip, NIGHTS_MAX, resizeDays, type TripDoc } from '../../trip/schema'
import { addDays, clock, ZONES } from '../../lib/time'
import { pinProblem, PIN_MAX, PIN_MIN } from '../../lib/pinPolicy'
import { findPii, PII_LABEL } from '../../lib/pii'
import { copyText } from '../../lib/clipboard'
import { loadSample } from '../landing/sample'
import { TopBar } from '../editor/TopBar'

const nightsLabel = (n: number) => (n === 0 ? '당일' : `${n}박 ${n + 1}일`)

export default function CreateTrip({ fromSample }: { fromSample: boolean }) {
  const today = clock(new Date(), 'Asia/Seoul').ymd
  const [sample, setSample] = useState<TripDoc | null>(null)
  const [title, setTitle] = useState('')
  const [school, setSchool] = useState('')
  const [startDate, setStartDate] = useState(addDays(today, 14))
  const [nights, setNights] = useState(2)
  const [abroad, setAbroad] = useState(false)
  const [tz, setTz] = useState('Asia/Tokyo')
  const [digits, setDigits] = useState<4 | 5>(4)
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<{ id: string; recovery: string; token: string; title: string; startDate: string } | null>(null)

  useEffect(() => {
    if (!fromSample) return
    void loadSample().then((s) => {
      setSample(s)
      setTitle(s.title)
      setNights(s.nights)
    })
  }, [fromSample])

  const tripDates = { startDate, endDate: addDays(startDate || today, nights) }
  const pinErr = pin ? pinProblem(pin, tripDates) : null
  const mismatch = pin2 && pin !== pin2

  const submit = async () => {
    setErr(null)
    if (!title.trim()) return setErr('여행 제목을 적어 주세요.')
    if (!startDate) return setErr('출발일을 골라 주세요.')
    const p = pinProblem(pin, tripDates)
    if (p) return setErr(p)
    if (pin !== pin2) return setErr('PIN 두 번이 서로 달라요.')
    if (!agree) return setErr('개인정보를 넣지 않겠다는 칸에 체크해 주세요.')
    let doc: TripDoc = emptyTrip({ title: title.trim(), school: school.trim(), startDate, nights, tz: abroad ? tz : 'Asia/Seoul', studentIdDigits: digits })
    if (sample) doc = resizeDays({ ...sample, title: title.trim(), school: school.trim() || undefined, startDate, tz: abroad ? tz : 'Asia/Seoul', studentIdDigits: digits, nights: sample.nights }, nights)
    const pii = findPii(doc)
    if (pii.length) return setErr(`${pii[0].where}에 ${PII_LABEL[pii[0].kind]}로 보이는 글이 있어요. 빼고 다시 해 주세요.`)
    setBusy(true)
    try {
      const r = await createTrip(doc, pin)
      setToken(r.id, r.token)
      rememberTrip({ id: r.id, title: doc.title, startDate: doc.startDate })
      setDone({ id: r.id, recovery: r.recovery, token: r.token, title: doc.title, startDate: doc.startDate })
    } catch (e) {
      setErr((e as ApiFail).message)
    } finally {
      setBusy(false)
    }
  }

  if (done) return <RecoveryScreen id={done.id} code={done.recovery} title={done.title} />

  return (
    <div className="screen">
      <TopBar title={fromSample ? '샘플로 새 여행 만들기' : '새 여행 만들기'} back={() => navigate(fromSample ? '/sample' : '/')} />
      <main className="screen__body screen__body--narrow">
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          {fromSample ? <p className="callout">경주 2박 3일 샘플의 일정과 안내를 그대로 가져와요. 만든 뒤 마음대로 고칠 수 있어요.</p> : null}
          <label className="field">
            <span className="field__label">여행 제목</span>
            <input className="input" maxLength={60} placeholder="예: 경주 2박 3일 수학여행" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label className="field">
            <span className="field__label">
              학교·학년 <span className="field__opt">넣지 않아도 돼요</span>
            </span>
            <input className="input" maxLength={40} placeholder="예: 도름고등학교 2학년" value={school} onChange={(e) => setSchool(e.target.value)} />
          </label>
          <div className="field-row">
            <label className="field">
              <span className="field__label">출발일</span>
              <input className="input mono" type="date" value={startDate} min="2020-01-01" max="2099-12-31" onChange={(e) => setStartDate(e.target.value)} required />
            </label>
            <label className="field">
              <span className="field__label">기간</span>
              <select className="input" value={nights} onChange={(e) => setNights(Number(e.target.value))}>
                {Array.from({ length: NIGHTS_MAX + 1 }, (_, n) => (
                  <option key={n} value={n}>
                    {nightsLabel(n)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset className="field">
            <legend className="field__label">여행지</legend>
            <div className="seg-group" role="group">
              <button type="button" aria-pressed={!abroad} className="seg" data-on={!abroad || undefined} onClick={() => setAbroad(false)}>
                국내
              </button>
              <button type="button" aria-pressed={abroad} className="seg" data-on={abroad || undefined} onClick={() => setAbroad(true)}>
                해외
              </button>
            </div>
            {abroad ? (
              <label className="field field--inner">
                <span className="field__hint">일정 시각을 적을 현지 시간. 보호자 화면에는 한국 시각이 함께 보여요.</span>
                <select className="input" value={tz} onChange={(e) => setTz(e.target.value)}>
                  {ZONES.filter((z) => z.tz !== 'Asia/Seoul').map((z) => (
                    <option key={z.tz} value={z.tz}>
                      {z.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </fieldset>
          <fieldset className="field">
            <legend className="field__label">학번 자릿수</legend>
            <div className="seg-group" role="group">
              <button type="button" aria-pressed={digits === 4} className="seg" data-on={digits === 4 || undefined} onClick={() => setDigits(4)}>
                4자리 <span className="mono seg__sub">1103</span>
              </button>
              <button type="button" aria-pressed={digits === 5} className="seg" data-on={digits === 5 || undefined} onClick={() => setDigits(5)}>
                5자리 <span className="mono seg__sub">10203</span>
              </button>
            </div>
            <span className="field__hint">학생이 느낀 점을 낼 때 적는 학번이에요. 살핌에 등록한 학번 체계(4자리는 학년·반·번호 1·1·2, 5자리는 1·2·2)와 같게 골라요.</span>
          </fieldset>
          <div className="field-row">
            <label className="field">
              <span className="field__label">선생님 PIN</span>
              <input className="input mono" type="password" inputMode="numeric" autoComplete="new-password" maxLength={PIN_MAX} placeholder={`숫자 ${PIN_MIN}~${PIN_MAX}자리`} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
            </label>
            <label className="field">
              <span className="field__label">PIN 한 번 더</span>
              <input className="input mono" type="password" inputMode="numeric" autoComplete="new-password" maxLength={PIN_MAX} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} />
            </label>
          </div>
          <p className="field__hint" aria-live="polite" data-bad={pinErr || mismatch ? true : undefined}>
            {pinErr ?? (mismatch ? 'PIN 두 번이 서로 달라요.' : '함께 인솔하는 선생님과 나눠 쓰는 번호예요. 생일·여행 날짜·전화번호 끝자리처럼 짐작하기 쉬운 숫자는 쓸 수 없어요.')}
          </p>
          <label className="agree">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span className="check__box" aria-hidden="true">
              <Icon name="check" size="0.9rem" strokeWidth={2.4} />
            </span>
            <span>안내는 링크를 아는 누구나 볼 수 있어요. 학생·교사 이름, 휴대전화 번호, 건강 정보, 방·좌석 배정은 넣지 않을게요.</span>
          </label>
          {err ? (
            <p className="form-error" role="alert">
              {err}
            </p>
          ) : null}
          <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={busy}>
            {busy ? '만드는 중…' : '여행 만들기'}
          </button>
        </form>
      </main>
    </div>
  )
}

/** 만든 직후 한 번만 보여 주는 복구 코드. 이것이 있어야 PIN 을 잊었을 때 다시 정할 수 있다. */
function RecoveryScreen({ id, code, title }: { id: string; code: string; title: string }) {
  const [copied, setCopied] = useState(false)
  const [kept, setKept] = useState(false)
  return (
    <div className="screen">
      <TopBar title="여행을 만들었어요" />
      <main className="screen__body screen__body--narrow">
        <div className="form">
          <p className="lead">「{title}」 여행을 만들었어요. 편집을 시작하기 전에 복구 코드를 꼭 적어 두세요.</p>
          <div className="recovery">
            <span className="recovery__label">복구 코드</span>
            <strong className="recovery__code mono">{code}</strong>
            <span className="recovery__note">PIN을 잊었을 때 새 PIN을 정하는 데 써요. 이 화면을 닫으면 다시 볼 수 없어요.</span>
          </div>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={async () => {
                setCopied(await copyText(`도름스 체험학습 「${title}」 복구 코드: ${code}`))
              }}
            >
              <Icon name="copy" size="1.05rem" /> {copied ? '복사했어요' : '복사'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => window.print()}>
              <Icon name="print" size="1.05rem" /> 인쇄
            </button>
          </div>
          <label className="agree">
            <input type="checkbox" checked={kept} onChange={(e) => setKept(e.target.checked)} />
            <span className="check__box" aria-hidden="true">
              <Icon name="check" size="0.9rem" strokeWidth={2.4} />
            </span>
            <span>복구 코드를 안전한 곳에 적어 두었어요.</span>
          </label>
          <button type="button" className="btn btn--primary btn--block btn--lg" disabled={!kept} onClick={() => navigate(`/t/${id}/edit`, { replace: true })}>
            일정 넣으러 가기
          </button>
        </div>
      </main>
    </div>
  )
}
