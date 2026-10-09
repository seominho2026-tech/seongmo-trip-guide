import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../components/Icon'
import { navigate } from '../../lib/router'
import { useModal } from '../../components/Dialog'
import { readStored } from '../../lib/storage'
import type { MyTrip } from '../../lib/api'
import { dateLabel } from '../../lib/time'

/** 첫 화면: 무엇을 하는 앱인지, 샘플(실제로 움직이는 안내), 시작하기, 개인정보 약속 */
export function Landing() {
  const [big, setBig] = useState(false)
  const mine = readStored<MyTrip[]>('my-trips', [])
  const [open, setOpen] = useState('')
  const [openErr, setOpenErr] = useState<string | null>(null)

  const goEdit = () => {
    const m = open.trim().match(/(?:\/t\/)?([a-z2-9]{10})(?:[/?#]|$)/)
    if (!m) return setOpenErr('여행 링크(…/t/로 시작하는 주소)를 붙여 넣어 주세요.')
    navigate(`/t/${m[1]}/edit`)
  }

  return (
    <div className="land">
      <header className="land-top">
        <a className="land-top__brand" href="/" onClick={(e) => (e.preventDefault(), navigate('/'))}>
          <span className="land-top__mark" aria-hidden="true">
            <Icon name="pin" size="1.05rem" strokeWidth={2.2} />
          </span>
          대전성모여고 체험학습 가이드
        </a>
      </header>

      <main>
        <section className="land-hero">
          <div className="land-hero__copy">
            <h1 className="land-hero__title">체험학습 안내를 한 페이지로</h1>
            <p className="land-hero__lead">
              장소 주소와 시각만 넣으면 지도 동선과 시간표가 만들어져요. 링크와 QR로 나눠 줘요. 여행 중에 고쳐도 같은 링크에 15초 안에 반영돼요. 학생이 장소마다 쓴 느낀 점은 살핌 생기부 양식 엑셀로 모아요.
            </p>
            <div className="land-hero__cta">
              <button type="button" className="btn btn--paper btn--lg" onClick={() => navigate('/new')}>
                <Icon name="plus" size="1.15rem" /> 새 여행 만들기
              </button>
              <button type="button" className="btn btn--on-dark btn--lg" onClick={() => navigate('/sample')}>
                <Icon name="eye" size="1.15rem" /> 샘플 보기
              </button>
            </div>
            <p className="land-hero__note">로그인 없이 써요. 선생님은 여행을 만들 때 정한 PIN으로 고쳐요.</p>
          </div>
          <div className="land-hero__demo" aria-label="샘플 안내 화면">
            <PhonePreview />
            <p className="land-hero__caption">
              <button type="button" className="btn btn--on-dark btn--sm" onClick={() => setBig(true)}>
                <Icon name="expand" size="0.95rem" /> 크게 보기
              </button>
            </p>
          </div>
        </section>
        {big ? <PhoneModal onClose={() => setBig(false)} /> : null}

        <section className="land-steps" aria-labelledby="steps-title">
          <h2 className="land-h2" id="steps-title">
            이렇게 써요
          </h2>
          <ol className="steps-flow">
            <li>
              <span className="steps-flow__n mono">1</span>
              <div>
                <h3>만들기</h3>
                <p>여행 제목·출발일·몇 박을 정하고, 일차마다 시각·활동명·주소·안내사항을 넣어요. 주소를 찾으면 지도에 찍히고, 저장하면 장소 사이 길이 지도에 그려져요. 걸리는 시간은 선생님이 직접 적어요.</p>
              </div>
            </li>
            <li>
              <span className="steps-flow__n mono">2</span>
              <div>
                <h3>나눠 주기</h3>
                <p>링크와 QR을 학생·보호자에게 보내면 로그인 없이 열려요. 한 장씩 넘기면 그대로 시간표이자 동선이에요. 해외 여행이면 보호자 화면에 한국 시각이 함께 보여요.</p>
              </div>
            </li>
            <li>
              <span className="steps-flow__n mono">3</span>
              <div>
                <h3>모으기</h3>
                <p>학생은 장소마다 느낀 점을 써요. 다녀와서 「내 느낀 점 저장」으로 파일 하나를 받아 선생님이 지정한 제출 경로에 내요. 자동으로 제출되지는 않아요. 선생님은 그 파일들을 한꺼번에 끌어다 놓아 살핌에 바로 올릴 엑셀 하나로 받아요.</p>
              </div>
            </li>
          </ol>
        </section>

        <section className="land-privacy" aria-labelledby="privacy-title">
          <h2 className="land-h2" id="privacy-title">
            <Icon name="shield" size="1.2rem" /> 개인정보는 넣지 않아요
          </h2>
          <ul className="bullets">
            <li>안내는 링크를 아는 누구나 볼 수 있어요. 학생·교사 이름, 휴대전화 번호, 건강 정보, 방·좌석 배정은 적지 마세요. 휴대전화 번호·주민등록번호·이메일 주소가 들어가면 저장되지 않아요.</li>
            <li>학번·이름·느낀 점은 학생 휴대폰에만 저장되고 서버로 가지 않아요. 학생이 낸 파일로만 선생님께 전해져요.</li>
            <li>지도에 길을 그릴 때는 장소 위치와 출발 시각만 길 찾기 서버(OSRM, Transitous)로 보내요. 여행 이름이나 학생 정보는 보내지 않아요.</li>
            <li>PIN은 숫자 그대로 저장하지 않고, 여러 번 틀리면 잠깐 잠겨요.</li>
            <li>여행은 끝난 날로부터 1년이 지나면 자동으로 지워져요.</li>
          </ul>
        </section>

        {mine.length ? (
          <section className="land-mine" aria-labelledby="mine-title">
            <h2 className="land-h2" id="mine-title">
              이 기기에서 만든 여행
            </h2>
            <ul className="mine-trips">
              {mine.map((t) => (
                <li key={t.id}>
                  <span className="mine-trips__title">{t.title}</span>
                  <span className="mine-trips__date mono">{dateLabel(t.startDate)} 출발</span>
                  <span className="mine-trips__acts">
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate(`/t/${t.id}`)}>
                      보기
                    </button>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate(`/t/${t.id}/edit`)}>
                      고치기
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="land-open" aria-labelledby="open-title">
          <h2 className="land-h2" id="open-title">
            만든 여행 고치기
          </h2>
          <form
            className="land-open__form"
            onSubmit={(e) => {
              e.preventDefault()
              goEdit()
            }}
          >
            <input className="input" placeholder="여행 링크를 붙여 넣어 주세요" value={open} onChange={(e) => (setOpen(e.target.value), setOpenErr(null))} aria-label="여행 링크" />
            <button type="submit" className="btn btn--primary">
              PIN 넣고 고치기
            </button>
          </form>
          {openErr ? (
            <p className="form-error" role="alert">
              {openErr}
            </p>
          ) : null}
        </section>
      </main>

    </div>
  )
}

/** 실제 휴대폰 화면 크기(390×844)로 샘플을 그린 뒤 틀에 맞게 통째로 줄인다. 안의 앱은 진짜 휴대폰에서처럼 배치된다. */
const PHONE_W = 390
const PHONE_H = 844

/** 휴대폰 틀 하나. big 이면 창에 크게 띄우는 모양(키보드로도 안을 조작할 수 있게) */
function PhonePreview({ big = false, onEscape }: { big?: boolean; onEscape?: () => void }) {
  const viewRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const escRef = useRef(onEscape)
  escRef.current = onEscape
  // 휴대폰 화면 안을 누른 뒤에는 키가 안쪽 문서로 간다. 안쪽에서 일정표 같은 창을 닫는 데 쓰지 않은 Esc 만 바깥 창 닫기로 넘긴다.
  useEffect(() => {
    const frame = frameRef.current
    if (!frame || !onEscape) return
    let win: Window | null = null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) escRef.current?.()
    }
    const attach = () => {
      win?.removeEventListener('keydown', onKey)
      try {
        win = frame.contentWindow
        win?.addEventListener('keydown', onKey)
      } catch {
        win = null
      }
    }
    attach()
    frame.addEventListener('load', attach)
    return () => {
      frame.removeEventListener('load', attach)
      win?.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [scale, setScale] = useState(0.85)
  useEffect(() => {
    const el = viewRef.current
    if (!el) return
    // 소수 폭 그대로(반올림한 clientWidth 를 쓰면 1px 안팎 어긋난다)
    const fit = () => {
      const w = el.getBoundingClientRect().width
      if (w) setScale(w / PHONE_W)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div className={big ? 'phone phone--big' : 'phone'} style={{ '--phone-s': scale } as CSSProperties}>
      <div className="phone__view" ref={viewRef}>
        <iframe
          ref={frameRef}
          className="phone__screen"
          src="/sample?embed=1"
          title="경주 2박 3일 샘플 안내"
          loading={big ? 'eager' : 'lazy'}
          tabIndex={big ? 0 : -1}
          style={{ width: PHONE_W, height: PHONE_H, transform: `scale(${scale})` }}
        />
      </div>
    </div>
  )
}

/** 크게 보기: 화면 위에 휴대폰을 크게 띄워 직접 눌러 보게 한다. Esc·닫기·바깥 누르기로 닫힌다. */
function PhoneModal({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null)
  // 휴대폰 화면(iframe) 끝에서 Tab 을 더 누르면 바깥 문서로 초점이 나간다. 창이 열린 동안 뒤 화면을 통째로 막는다.
  // useModal 보다 먼저 두어, 닫을 때 막기를 먼저 풀고 나서 연 단추로 초점을 돌려준다.
  const openerRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    // 막기 전에 연 단추를 기억한다(막힌 요소는 초점을 잃는다)
    openerRef.current = document.activeElement as HTMLElement | null
    const back = document.querySelector<HTMLElement>('.land')
    back?.setAttribute('inert', '')
    return () => back?.removeAttribute('inert')
  }, [])
  useModal(panelRef, onClose, '.phone-modal__close', () => openerRef.current)
  return createPortal(
    <div className="phone-modal" onClick={onClose}>
      <div ref={panelRef} className="phone-modal__panel" role="dialog" aria-modal="true" aria-label="샘플 안내 크게 보기" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="icon-btn phone-modal__close" onClick={onClose} aria-label="닫기">
          <Icon name="close" />
        </button>
        <PhonePreview big onEscape={onClose} />
        {/* 휴대폰 안 마지막 단추에서 Tab 을 누르면 브라우저 바깥으로 나가지 않고 닫기로 돌아온다 */}
        <span tabIndex={0} onFocus={() => panelRef.current?.querySelector<HTMLElement>('.phone-modal__close')?.focus()} />
      </div>
    </div>,
    document.body,
  )
}
