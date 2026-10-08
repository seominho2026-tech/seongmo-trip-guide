import { useEffect, useState } from 'react'
import { TripProvider } from '../../trip/context'
import type { TripDoc } from '../../trip/schema'
import { Viewer } from '../viewer/Viewer'
import { navigate } from '../../lib/router'
import { loadSample } from './sample'

/** /sample: 가상 학교의 경주 2박 3일. ?embed=1 이면 랜딩의 휴대폰 틀 안(학생 화면, 팝업 없음). */
export function SampleViewer() {
  const [doc, setDoc] = useState<TripDoc | null>(null)
  const embed = new URLSearchParams(window.location.search).has('embed')
  useEffect(() => {
    void loadSample().then(setDoc)
  }, [])
  if (!doc) return <div className="boot" aria-busy="true" />
  return (
    <TripProvider doc={doc} tripId={null} defaultRole="student">
      <Viewer
        quiet={embed}
        banner={
          embed ? null : (
            <div className="sample-banner" role="note">
              <span className="sample-banner__text">가상 예시예요. 실제 대전성모여자고등학교 일정이 아니며, 장소는 실제 경주예요.</span>
              <span className="sample-banner__acts">
                <button type="button" className="btn btn--primary btn--sm" onClick={() => navigate('/new?from=sample')}>
                  이 샘플로 시작하기
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate('/')}>
                  첫 화면
                </button>
              </span>
            </div>
          )
        }
      />
    </TripProvider>
  )
}
