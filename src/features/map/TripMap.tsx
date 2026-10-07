/**
 * 여행 지도(MapLibre + OpenFreeMap, API 키 없음).
 *
 * 장을 넘길 때마다 지도가 따라간다.
 * - 장소가 있는 일정: 앞 장소에서 이 장소까지 오는 길을 오렌지로 그리고 두 곳이 함께 보이게 옮긴다.
 *   같은 곳이거나 아주 가까우면 그 장소로 가까이 다가간다.
 * - 일차 표지: 그날 동선 전체
 * - 출발 전·다녀와서: 여행 전체 동선(해외 여행이면 여행지 쪽만)
 * - 비행기로 먼 곳에 오는 장: 지구본으로 바꿔 두 공항 사이 대원 호를 그린다.
 * 편집기에서 장소를 바꾸면 같은 지도가 바로 다시 그린다.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Map as MapLibre, AttributionControl, setWorkerUrl, type GeoJSONSource, type LngLatBoundsLike } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec'
import { legLine, type Derived, type Page, type StopPage } from '../../trip/derive'
import { bbox, greatCircle, km, type LngLat } from '../../lib/geo'
import { paintPaper } from './paint'

setWorkerUrl(maplibreWorkerUrl)

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'
const INK = '#111111'
const ACCENT = '#ed5a14'
const PAPER = '#fbf8f2'
const SHEET = '#fbfaf7'
const KOREA: LngLat = [127.8, 36.3]

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
const FAR_KM = 1200

type LegFeature = GeoJSON.Feature<GeoJSON.LineString, { day: number; mode: string; to: string; index: number }>

function isFlight(p: StopPage) {
  return p.stop.leg?.mode === 'flight' && !!p.from?.stop.place && !!p.stop.place && (p.crowKm ?? 0) > FAR_KM
}

function buildData(d: Derived) {
  const legs: LegFeature[] = []
  const flights: LegFeature[] = []
  const stops: GeoJSON.Feature<GeoJSON.Point>[] = []
  const lodgings: GeoJSON.Feature<GeoJSON.Point>[] = []
  const seen = new Set<string>()
  const lodgingSeen = new Set<string>()
  for (const p of d.stopPages) {
    const place = p.stop.place
    if (!place) continue
    if (isFlight(p)) {
      flights.push({ type: 'Feature', properties: { day: p.dayN, mode: 'flight', to: p.key, index: p.index }, geometry: { type: 'LineString', coordinates: greatCircle(p.from!.stop.place!.coords as LngLat, place.coords as LngLat) } })
    } else {
      const line = legLine(p)
      if (line && line.length > 1) legs.push({ type: 'Feature', properties: { day: p.dayN, mode: p.stop.leg?.mode ?? 'bus', to: p.key, index: p.index }, geometry: { type: 'LineString', coordinates: line } })
    }
    const coordKey = `${p.dayN}:${place.coords.join(',')}`
    if (!seen.has(coordKey)) {
      seen.add(coordKey)
      stops.push({ type: 'Feature', properties: { key: p.key, day: p.dayN, pin: p.pin, index: p.index, name: place.name }, geometry: { type: 'Point', coordinates: place.coords } })
    }
    if (p.stop.kind === 'lodging' && !lodgingSeen.has(place.coords.join(','))) {
      lodgingSeen.add(place.coords.join(','))
      lodgings.push({ type: 'Feature', properties: { label: place.name }, geometry: { type: 'Point', coordinates: place.coords } })
    }
  }
  return { legs, flights, stops, lodgings }
}

/** 전체 동선을 볼 때 담을 점: 해외 여행이면 출발지 시각으로 적은 일정(공항 등)은 뺀다 */
function overviewPoints(d: Derived): LngLat[] {
  const all = d.stopPages.filter((p) => p.stop.place)
  const dest = d.abroad ? all.filter((p) => p.stop.zone !== 'home') : all
  return (dest.length ? dest : all).map((p) => p.stop.place!.coords as LngLat)
}

function framePoints(d: Derived, page: Page): { points: LngLat[]; zoomIn: boolean } {
  if (page.type === 'guide') return { points: overviewPoints(d), zoomIn: false }
  if (page.type === 'day') {
    const dayStops = page.chapter.pages.filter((p): p is StopPage => p.type === 'stop' && !!p.stop.place)
    const near = dayStops.filter((p) => !isFlight(p) && p.stop.zone !== 'home')
    const use = near.length ? near : dayStops
    if (!use.length) return { points: overviewPoints(d), zoomIn: false }
    const pts = use.map((p) => p.stop.place!.coords as LngLat)
    const from = use[0].from?.stop.place?.coords as LngLat | undefined
    if (from && km(from, pts[0]) < FAR_KM) pts.unshift(from)
    return { points: pts, zoomIn: pts.length === 1 }
  }
  const place = page.stop.place
  if (!place) return { points: overviewPoints(d), zoomIn: false }
  const here = place.coords as LngLat
  const line = legLine(page)
  if (line && page.crowKm && page.crowKm > 0.25 && page.crowKm < FAR_KM) return { points: [...line, here], zoomIn: false }
  return { points: [here], zoomIn: true }
}

const empty = { type: 'FeatureCollection' as const, features: [] }

export function TripMap({ d, page, onSelect }: { d: Derived; page: Page; onSelect?: (key: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibre | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const data = useMemo(() => buildData(d), [d])
  const selectRef = useRef(onSelect)
  selectRef.current = onSelect
  const animRef = useRef<number | null>(null)
  const firstFrame = useRef(true)

  useEffect(() => {
    if (!containerRef.current) return
    let map: MapLibre
    try {
      map = new MapLibre({
        container: containerRef.current,
        style: STYLE_URL,
        center: KOREA,
        zoom: 5.5,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        fadeDuration: 0,
        localIdeographFontFamily: "'Wanted Sans', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif",
      })
    } catch {
      setFailed(true)
      return
    }
    map.touchZoomRotate.disableRotation()
    // 대중교통 길 출처(Transitous)는 늘 밝힌다(편집 중에 대중교통 길을 넣어도 빠지지 않게)
    map.addControl(new AttributionControl({ compact: true, customAttribution: '<a href="https://transitous.org/sources/" target="_blank" rel="noreferrer noopener">대중교통 길 Transitous</a>' }), 'bottom-right')
    map.once('style.load', () => {
      paintPaper(map)
      map.addSource('legs', { type: 'geojson', data: empty })
      map.addSource('stops', { type: 'geojson', data: empty })
      map.addSource('stops-day', {
        type: 'geojson',
        data: empty,
        cluster: true,
        clusterRadius: 26,
        clusterMaxZoom: 14,
        clusterProperties: { minPin: ['min', ['get', 'pin']], maxPin: ['max', ['get', 'pin']], minIndex: ['min', ['get', 'index']] },
      })
      map.addSource('lodgings', { type: 'geojson', data: empty })
      map.addSource('leg-now', { type: 'geojson', lineMetrics: true, data: empty })
      map.addSource('flight', { type: 'geojson', lineMetrics: true, data: empty })
      const round = { 'line-cap': 'round', 'line-join': 'round' } as const
      map.addLayer({ id: 'legs-all', type: 'line', source: 'legs', layout: round, paint: { 'line-color': INK, 'line-opacity': 0.14, 'line-width': 1.5 } })
      map.addLayer({ id: 'legs-day', type: 'line', source: 'legs', layout: round, filter: ['==', ['get', 'day'], -1], paint: { 'line-color': INK, 'line-opacity': 0.72, 'line-width': 2.6 } })
      map.addLayer({ id: 'legs-day-walk', type: 'line', source: 'legs', layout: round, filter: ['==', ['get', 'day'], -1], paint: { 'line-color': INK, 'line-opacity': 0.8, 'line-width': 2.4, 'line-dasharray': [0.2, 2] } })
      map.addLayer({ id: 'leg-now-casing', type: 'line', source: 'leg-now', layout: round, paint: { 'line-color': PAPER, 'line-width': 9, 'line-opacity': 0.9 } })
      map.addLayer({ id: 'leg-now', type: 'line', source: 'leg-now', layout: round, paint: { 'line-width': 5, 'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, ACCENT, 1, ACCENT] } })
      map.addLayer({
        id: 'flight',
        type: 'line',
        source: 'flight',
        layout: { ...round, visibility: 'none' },
        paint: { 'line-width': 4, 'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, '#1e5fce', 0.4, '#7a42b8', 0.72, '#c9477f', 1, ACCENT] },
      })
      map.addLayer({ id: 'stops-all', type: 'circle', source: 'stops', paint: { 'circle-radius': 2.5, 'circle-color': INK, 'circle-opacity': 0.25 } })
      const idx = ['coalesce', ['get', 'index'], ['get', 'minIndex']] as ExpressionSpecification
      map.addLayer({
        id: 'stops-day',
        type: 'circle',
        source: 'stops-day',
        paint: {
          'circle-radius': ['case', ['has', 'point_count'], 13, 10],
          'circle-color': ['case', ['<', idx, ['global-state', 'current']], '#e4ded2', SHEET],
          'circle-stroke-color': INK,
          'circle-stroke-width': ['case', ['<', idx, ['global-state', 'current']], 1.2, 1.8],
        },
      })
      map.addLayer({
        id: 'stops-day-num',
        type: 'symbol',
        source: 'stops-day',
        layout: {
          'text-field': ['case', ['has', 'point_count'], ['concat', ['to-string', ['get', 'minPin']], '-', ['to-string', ['get', 'maxPin']]], ['to-string', ['get', 'pin']]],
          'text-font': ['Noto Sans Bold'],
          'text-size': ['case', ['has', 'point_count'], 10, 11],
          'text-allow-overlap': true,
          'text-ignore-placement': false,
          'text-padding': 9,
        },
        paint: { 'text-color': INK },
      })
      map.addLayer({ id: 'lodgings', type: 'circle', source: 'lodgings', layout: { visibility: 'none' }, paint: { 'circle-radius': 7, 'circle-color': INK, 'circle-stroke-color': PAPER, 'circle-stroke-width': 2 } })
      map.addLayer({
        id: 'lodging-labels',
        type: 'symbol',
        source: 'lodgings',
        layout: { visibility: 'none', 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-anchor': 'left', 'text-offset': [1, 0], 'text-allow-overlap': true, 'text-max-width': 9 },
        paint: { 'text-color': INK, 'text-halo-color': PAPER, 'text-halo-width': 2 },
      })
      map.addLayer({ id: 'stop-now-halo', type: 'circle', source: 'stops', filter: ['==', ['get', 'key'], ''], paint: { 'circle-radius': 22, 'circle-color': ACCENT, 'circle-opacity': 0.18 } })
      map.addLayer({ id: 'stop-now', type: 'circle', source: 'stops', filter: ['==', ['get', 'key'], ''], paint: { 'circle-radius': 13, 'circle-color': ACCENT, 'circle-stroke-color': INK, 'circle-stroke-width': 2 } })
      map.addLayer({
        id: 'stop-now-num',
        type: 'symbol',
        source: 'stops',
        filter: ['==', ['get', 'key'], ''],
        layout: { 'text-field': ['to-string', ['get', 'pin']], 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-allow-overlap': true, 'text-padding': 10 },
        paint: { 'text-color': INK },
      })
      map.addLayer({
        id: 'stop-now-label',
        type: 'symbol',
        source: 'stops',
        filter: ['==', ['get', 'key'], ''],
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-anchor': 'left', 'text-offset': [1.4, 0], 'text-max-width': 9, 'text-allow-overlap': true },
        paint: { 'text-color': INK, 'text-halo-color': PAPER, 'text-halo-width': 2.2 },
      })
      map.setGlobalStateProperty('current', -1)
      for (const id of ['stops-day', 'stops-day-num', 'stop-now']) {
        map.on('click', id, (e) => {
          const f = e.features?.[0]
          if (f?.properties?.point_count) {
            map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as LngLat, zoom: map.getZoom() + 2.5 })
            return
          }
          const key = f?.properties?.key
          if (typeof key === 'string') selectRef.current?.(key)
        })
        map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'))
        map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''))
      }
      setReady(true)
    })
    map.on('error', (e) => {
      if (import.meta.env.DEV) console.warn('[map]', e.error?.message)
      if (!map.isStyleLoaded() && /style/i.test(String(e.error?.message ?? ''))) setFailed(true)
    })
    const collapseAttribution = () => containerRef.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
    map.once('load', collapseAttribution)
    map.once('idle', collapseAttribution)
    mapRef.current = map
    const ro = new ResizeObserver(() => map.resize())
    ro.observe(containerRef.current)
    return () => {
      ro.disconnect()
      if (animRef.current) cancelAnimationFrame(animRef.current)
      map.remove()
      mapRef.current = null
    }
  }, [])

  // 문서가 바뀌면(편집기) 선·장소를 다시 넣는다
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    ;(map.getSource('legs') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: data.legs })
    ;(map.getSource('stops') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: data.stops })
    ;(map.getSource('lodgings') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: data.lodgings })
  }, [data, ready])

  // 장이 바뀌면: 강조·경로·카메라
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const dayN = page.type === 'guide' ? 0 : page.type === 'day' ? page.dayN : page.dayN
    const flight = page.type === 'stop' && isFlight(page)
    const set = (id: string, filter: unknown) => map.getLayer(id) && map.setFilter(id, filter as never)

    map.setGlobalStateProperty('current', page.index)
    set('legs-day', ['all', ['==', ['get', 'day'], dayN], ['!=', ['get', 'mode'], 'walk']])
    set('legs-day-walk', ['all', ['==', ['get', 'day'], dayN], ['==', ['get', 'mode'], 'walk']])
    const nowStopKey = page.type === 'stop' && page.stop.place ? stopKeyFor(page) : ''
    ;(map.getSource('stops-day') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: dayN >= 1 && !flight ? data.stops.filter((f) => f.properties?.day === dayN && f.properties?.key !== nowStopKey) : [],
    })
    const guide = page.type === 'guide'
    map.setPaintProperty('legs-all', 'line-opacity', guide ? 0.55 : 0.14)
    map.setPaintProperty('legs-all', 'line-width', guide ? 2.2 : 1.5)
    for (const id of ['lodgings', 'lodging-labels']) map.setLayoutProperty(id, 'visibility', guide ? 'visible' : 'none')
    for (const id of ['stop-now-halo', 'stop-now', 'stop-now-num', 'stop-now-label']) set(id, ['==', ['get', 'key'], nowStopKey])

    const flightSrc = map.getSource('flight') as GeoJSONSource | undefined
    const arc = flight ? greatCircle(page.from!.stop.place!.coords as LngLat, page.stop.place!.coords as LngLat) : null
    flightSrc?.setData(arc ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: arc } } : empty)
    map.setLayoutProperty('flight', 'visibility', flight ? 'visible' : 'none')
    map.setLayoutProperty('stop-now-label', 'visibility', flight ? 'none' : 'visible')
    map.setProjection({ type: flight ? 'globe' : 'mercator' })

    const legSrc = map.getSource('leg-now') as GeoJSONSource | undefined
    const line = page.type === 'stop' && !flight ? legLine(page) : null
    legSrc?.setData(line && line.length > 1 ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line } } : empty)
    if (animRef.current) cancelAnimationFrame(animRef.current)
    const drawTo = (t: number) => map.setPaintProperty('leg-now', 'line-gradient', ['step', ['line-progress'], ACCENT, Math.max(0.0001, Math.min(0.9999, t)), 'rgba(237,90,20,0)'])
    if (line && !reduceMotion()) {
      const t0 = performance.now()
      const step = (ts: number) => {
        const k = Math.min(1, (ts - t0) / 700)
        drawTo(1 - Math.pow(1 - k, 3))
        if (k < 1) animRef.current = requestAnimationFrame(step)
      }
      drawTo(0)
      animRef.current = requestAnimationFrame(step)
    } else drawTo(1)

    const duration = reduceMotion() || firstFrame.current ? 0 : 900
    firstFrame.current = false
    const el = containerRef.current
    const w = el?.clientWidth ?? 390
    const h = el?.clientHeight ?? 280
    if (flight && arc) {
      // 두 공항이 함께 보이게: 호 가운데에서 공항까지의 각도(θ)가 화면 짧은 변의 40% 안에 들어오는 줌.
      // 지구본은 가운데 위도(φ)가 높을수록 1/cos φ 만큼 크게 그리므로 그만큼 줌을 낮춘다(북극 항로).
      const mid = arc[Math.floor(arc.length / 2)]
      const rad = Math.PI / 180
      const from = page.from!.stop.place!.coords as LngLat
      const theta = 2 * Math.asin(Math.min(1, Math.sqrt(Math.sin(((from[1] - mid[1]) * rad) / 2) ** 2 + Math.cos(from[1] * rad) * Math.cos(mid[1] * rad) * Math.sin(((from[0] - mid[0]) * rad) / 2) ** 2)))
      const cosPhi = Math.cos(Math.min(80, Math.abs(mid[1])) * rad)
      const room = Math.min(w, h) * 0.4
      const zoom = Math.log2((room * 2 * Math.PI * cosPhi) / (512 * Math.max(0.15, Math.sin(Math.min(theta, Math.PI / 2)))))
      map.easeTo({ center: mid, zoom: Math.max(-1.8, Math.min(4, zoom)), duration: reduceMotion() ? 0 : 1400 })
      return
    }
    const { points, zoomIn } = framePoints(d, page)
    const box = bbox(points)
    if (!box) {
      map.easeTo({ center: KOREA, zoom: 5.5, duration })
      return
    }
    const hasLabel = page.type === 'stop' && !!page.stop.place
    const base = Math.max(24, Math.min(56, Math.round(Math.min(w, h) * 0.1)))
    const padding = { top: base + (w < 960 ? 34 : 0), bottom: base, left: base, right: base + (hasLabel ? Math.min(150, Math.round(w * 0.34)) : w < 960 ? 34 : 0) }
    if (zoomIn) map.easeTo({ center: points[0], zoom: 15, offset: [hasLabel ? -Math.round(Math.min(150, w * 0.34) / 2) : 0, 14], duration })
    else map.fitBounds(box as LngLatBoundsLike, { padding, maxZoom: 15, duration, linear: false })
  }, [page, ready, data, d])

  return (
    <div className="map">
      <div ref={containerRef} className="map__canvas" role="region" aria-label="여행 동선 지도" />
      {failed ? (
        <div className="map__fail" role="status">
          <p>지도를 불러오지 못했어요. 인터넷이 연결되면 다시 보여요. 일정 안내는 그대로 볼 수 있어요.</p>
        </div>
      ) : null}
    </div>
  )
}

/** 같은 좌표의 여러 일정은 첫 일정의 핀을 쓴다 */
function stopKeyFor(page: StopPage): string {
  const c = page.stop.place!.coords.join(',')
  const first = page.chapter.pages.find((p): p is StopPage => p.type === 'stop' && !!p.stop.place && p.stop.place.coords.join(',') === c)
  return first?.key ?? page.key
}
