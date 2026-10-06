import { lazy, Suspense, useEffect } from 'react'
import { useRoute } from '../lib/router'
import { TripProvider } from '../trip/context'
import { Viewer } from '../features/viewer/Viewer'
import { Landing } from '../features/landing/Landing'
import { LoadScreen, useTripDoc } from './TripLoader'
import { SampleViewer } from '../features/landing/SampleViewer'
import { Icon } from '../components/Icon'

const CreateTrip = lazy(() => import('../features/create/CreateTrip'))
const Editor = lazy(() => import('../features/editor/Editor'))
const Collect = lazy(() => import('../features/collect/Collect'))

export function App() {
  const route = useRoute()
  switch (route.name) {
    case 'landing':
      return <Landing />
    case 'sample':
      return <SampleViewer />
    case 'new':
      return (
        <Suspense fallback={<div className="boot" />}>
          <CreateTrip fromSample={route.fromSample} />
        </Suspense>
      )
    case 'trip':
      return <TripPage id={route.id} />
    case 'edit':
      return (
        <Suspense fallback={<div className="boot" />}>
          <Editor id={route.id} />
        </Suspense>
      )
    case 'collect':
      return (
        <Suspense fallback={<div className="boot" />}>
          <Collect id={route.id} />
        </Suspense>
      )
    default:
      return <Landing />
  }
}

function TripPage({ id }: { id: string }) {
  const { state } = useTripDoc(id)
  // 홈 화면에 추가하면 이 여행이 바로 열리게(여행별 앱 정보)
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    if (!link) return
    const prev = link.href
    link.href = `/t/${id}/manifest.webmanifest`
    return () => {
      link.href = prev
    }
  }, [id])
  return (
    <LoadScreen state={state}>
      {(data, stale) => (
        <TripProvider doc={data.doc} tripId={id} updatedAt={data.updatedAt}>
          <Viewer
            banner={
              stale && navigator.onLine === false ? (
                <p className="offline-banner" role="status">
                  <Icon name="info" size="0.95rem" /> 인터넷이 연결되지 않아 마지막으로 받은 안내를 보여 줘요.
                </p>
              ) : null
            }
          />
        </TripProvider>
      )}
    </LoadScreen>
  )
}
