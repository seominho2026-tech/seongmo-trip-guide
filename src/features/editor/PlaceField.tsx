import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { searchPlaces, type GeoResult } from '../../lib/geocode'
import type { LngLat } from '../../lib/geo'
import type { Place } from '../../trip/schema'

/**
 * 장소 칸: 주소나 장소 이름으로 찾아 고르면 지도에 찍힌다.
 * 같은 이름의 다른 곳이 섞여 나오므로 후보를 주소와 함께 보여 주고 고르게 한다(예: 첨성대는 경주에도 부산에도 있다).
 */
export function PlaceField({ place, near, onChange }: { place?: Place; near: LngLat | null; onChange: (p: Place | undefined) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<GeoResult[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [searching, setSearching] = useState(!place)

  const run = async () => {
    if (q.trim().length < 2) return setErr('두 글자 이상 적어 주세요.')
    setBusy(true)
    setErr(null)
    try {
      const r = await searchPlaces(q, near)
      setResults(r)
      if (!r.length) setErr('찾지 못했어요. 장소 이름만 적거나(예: 불국사), 도로명 주소를 적거나, 구글 지도 주소를 붙여 넣어 보세요.')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="placef">
      {place && !searching ? (
        <div className="placef__now">
          <Icon name="pin" size="1.05rem" />
          <div className="placef__now-text">
            <input className="input input--bare" value={place.name} maxLength={80} aria-label="장소 이름(화면에 보이는 이름)" onChange={(e) => onChange({ ...place, name: e.target.value })} />
            <span className="placef__addr">{place.address || `${place.coords[1].toFixed(5)}, ${place.coords[0].toFixed(5)}`}</span>
          </div>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => (setSearching(true), setQ(''), setResults(null))}>
            바꾸기
          </button>
          <button type="button" className="icon-btn icon-btn--sm" onClick={() => onChange(undefined)} aria-label="장소 빼기">
            <Icon name="trash" size="1.05rem" />
          </button>
        </div>
      ) : (
        <>
          <div className="placef__search">
            <input
              className="input"
              placeholder="장소 이름이나 주소 (예: 국립경주박물관)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void run()
                }
              }}
              aria-label="장소 찾기"
            />
            <button type="button" className="btn btn--primary" onClick={() => void run()} disabled={busy}>
              {busy ? '찾는 중' : '찾기'}
            </button>
            {place ? (
              <button type="button" className="btn btn--ghost" onClick={() => setSearching(false)}>
                그대로 두기
              </button>
            ) : null}
          </div>
          {err ? <p className="field__hint" data-bad>{err}</p> : null}
          {results?.length ? (
            <ul className="placef__results">
              {results.map((r, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange({ name: r.name, address: r.address || undefined, coords: r.coords })
                      setSearching(false)
                      setResults(null)
                    }}
                  >
                    <span className="placef__r-name">{r.name}</span>
                    <span className="placef__r-addr">{r.address}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="field__hint">주소 찾기는 OpenStreetMap을 써요. 구글 지도에서 복사한 주소나 「37.52, 126.98」 같은 좌표를 붙여 넣어도 돼요.</p>
        </>
      )}
    </div>
  )
}
