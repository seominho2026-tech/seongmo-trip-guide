import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ApiFail, fetchTrip, type Loaded } from '../lib/api'
import { readStored, writeStored } from '../lib/storage'
import { TripDoc, upgradeDoc } from '../trip/schema'
import { Icon } from '../components/Icon'
import { navigate } from '../lib/router'

type State = { status: 'loading' } | { status: 'ok'; data: Loaded; stale: boolean } | { status: 'error'; message: string; notFound: boolean }

/**
 * 여행 문서를 받아 온다. 받은 것은 이 기기에 남겨 두어 인터넷이 끊겨도 마지막 안내를 보여 준다.
 * 화면을 다시 보거나 5분이 지나면 새로 받아 선생님이 고친 내용을 반영한다.
 */
export function useTripDoc(id: string) {
  const [state, setState] = useState<State>(() => {
    const cached = readStored<Loaded | null>(`doc-cache:${id}`, null)
    return cached && TripDoc.safeParse(cached.doc).success ? { status: 'ok', data: { ...cached, doc: upgradeDoc(cached.doc) }, stale: true } : { status: 'loading' }
  })
  const load = useCallback(async () => {
    try {
      const data = await fetchTrip(id)
      writeStored(`doc-cache:${id}`, data)
      setState({ status: 'ok', data, stale: false })
      return data
    } catch (e) {
      const f = e as ApiFail
      setState((prev) => (prev.status === 'ok' && f.status !== 404 ? { ...prev, stale: true } : { status: 'error', message: f.message, notFound: f.status === 404 }))
      return null
    }
  }, [id])
  useEffect(() => {
    void load()
    const onVis = () => document.visibilityState === 'visible' && void load()
    document.addEventListener('visibilitychange', onVis)
    const t = window.setInterval(() => document.visibilityState === 'visible' && void load(), 5 * 60_000)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.clearInterval(t)
    }
  }, [load])
  return { state, reload: load, setState }
}

export function LoadScreen({ state, children }: { state: State; children: (data: Loaded, stale: boolean) => ReactNode }) {
  if (state.status === 'loading') return <div className="boot" aria-busy="true" />
  if (state.status === 'error')
    return (
      <main className="lone">
        <div className="lone__card">
          <Icon name="info" size="1.6rem" />
          <h1 className="lone__title">{state.notFound ? '여행을 찾을 수 없어요' : '안내를 불러오지 못했어요'}</h1>
          <p className="lone__text">{state.message}</p>
          <button type="button" className="btn btn--primary" onClick={() => navigate('/')}>
            첫 화면으로
          </button>
        </div>
      </main>
    )
  return <>{children(state.data, state.stale)}</>
}
