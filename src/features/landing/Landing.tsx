import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { navigate } from '../../lib/router'
import { readStored } from '../../lib/storage'
import type { MyTrip } from '../../lib/api'
import { dateLabel } from '../../lib/time'

const LINKTREE = 'https://dorms.school/links'

/** 첫 화면: 무엇을 하는 앱인지, 샘플(실제로 움직이는 안내), 시작하기, 개인정보 약속 */
export function Landing() {
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
          도름스 체험학습
        </a>
        <a className="land-top__link" href={LINKTREE} target="_blank" rel="noreferrer noopener">
          Team DoRm
          <Icon name="external" size="0.9rem" />
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
            <p className="land-hero__caption">실제로 넘겨 보세요. 경주 2박 3일 샘플이에요.</p>
          </div>
        </section>

        <section className="land-steps" aria-labelledby="steps-title">
          <h2 className="land-h2" id="steps-title">
            이렇게 써요
          </h2>
          <ol className="steps-flow">
            <li>
              <span className="steps-flow__n mono">1</span>
              <div>
                <h3>만들기</h3>
                <p>여행 제목·출발일·몇 박을 정하고, 일차마다 시각·활동명·주소·안내사항을 넣어요. 주소를 찾으면 지도에 찍혀요. 장소 사이 길과 걸리는 시간은 저장할 때 앱이 계산해요.</p>
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
                <p>학생은 장소마다 느낀 점을 써요. 다녀와서 「내 느낀 점 저장」으로 파일 하나를 받아 클래스룸 등에 내요. 선생님은 그 파일들을 한꺼번에 끌어다 놓아 살핌에 바로 올릴 엑셀 하나로 받아요.</p>
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

      <footer className="land-foot">
        <a className="btn btn--ghost land-foot__tree" href={LINKTREE} target="_blank" rel="noreferrer noopener">
          <Icon name="link" size="1.05rem" /> 도름스 링크트리
        </a>
        <p className="land-foot__small">
          Team DoRm · 지도 © OpenStreetMap contributors, OpenFreeMap · 길 계산 OSRM · <a href="/licenses.txt">사용한 글꼴과 프로그램</a>
        </p>
      </footer>
    </div>
  )
}

/** 실제 휴대폰 화면 크기(390×844)로 샘플을 그린 뒤 틀에 맞게 통째로 줄인다. 안의 앱은 진짜 휴대폰에서처럼 배치된다. */
const PHONE_W = 390
const PHONE_H = 844

function PhonePreview() {
  const viewRef = useRef<HTMLDivElement>(null)
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
    <div className="phone" style={{ '--phone-s': scale } as CSSProperties}>
      <div className="phone__view" ref={viewRef}>
        <iframe
          className="phone__screen"
          src="/sample?embed=1"
          title="경주 2박 3일 샘플 안내"
          loading="lazy"
          tabIndex={-1}
          style={{ width: PHONE_W, height: PHONE_H, transform: `scale(${scale})` }}
        />
      </div>
    </div>
  )
}
