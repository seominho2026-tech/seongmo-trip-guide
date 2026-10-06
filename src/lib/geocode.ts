/**
 * 주소·장소 이름으로 좌표 찾기(Nominatim, OpenStreetMap).
 * 공개 서버 규칙: 초당 한 번까지, 글자를 칠 때마다 부르는 자동완성 금지 → '찾기' 단추를 눌렀을 때만 부른다.
 * 구글 지도 주소(…/@37.52,126.98,…)나 "37.52, 126.98" 같은 좌표를 붙여 넣으면 서버 없이 바로 쓴다.
 */
import type { LngLat } from './geo'

export type GeoResult = { name: string; address: string; coords: LngLat }

const cache = new Map<string, GeoResult[]>()
let lastCall = 0
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 붙여 넣은 글에서 좌표를 바로 읽는다(위도, 경도 순서로 적은 것) */
export function coordsFromText(text: string): LngLat | null {
  const t = text.trim()
  const at = t.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/)
  const q = t.match(/[?&](?:q|query|ll)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/)
  const plain = t.match(/^(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})$/)
  const m = at ?? q ?? plain
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return [Math.round(lng * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6]
}

/** near 를 주면 그 근처(약 50km)를 먼저 보여 준다(같은 이름의 먼 곳보다). */
export async function searchPlaces(query: string, near: LngLat | null = null): Promise<GeoResult[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const direct = coordsFromText(q)
  if (direct) return [{ name: '붙여 넣은 위치', address: `${direct[1]}, ${direct[0]}`, coords: direct }]
  const cacheKey = near ? `${q}@${near[0].toFixed(1)},${near[1].toFixed(1)}` : q
  const hit = cache.get(cacheKey)
  if (hit) return hit
  const wait = lastCall + 1100 - Date.now()
  if (wait > 0) await sleep(wait)
  lastCall = Date.now()
  const params: Record<string, string> = { q, format: 'jsonv2', limit: '6', 'accept-language': 'ko', addressdetails: '0' }
  if (near) {
    params.viewbox = [near[0] - 0.5, near[1] + 0.5, near[0] + 0.5, near[1] - 0.5].map((v) => v.toFixed(4)).join(',')
    params.bounded = '0'
  }
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams(params)}`
  let res: Response
  try {
    res = await fetch(url, { referrerPolicy: 'strict-origin', signal: AbortSignal.timeout(10_000) })
  } catch (e) {
    const slow = e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')
    throw new Error(slow ? '주소 찾기가 오래 걸려요. 잠시 뒤 다시 찾아 주세요.' : '인터넷 연결을 확인하고 다시 찾아 주세요.')
  }
  if (!res.ok) throw new Error(res.status === 429 ? '잠시 뒤 다시 찾아 주세요.' : '주소를 찾지 못했어요.')
  const rows = (await res.json()) as { name?: string; display_name: string; lat: string; lon: string }[]
  const out = rows.map((r) => {
    const parts = r.display_name.split(',').map((x) => x.trim())
    const name = r.name?.trim() || parts[0]
    return { name, address: shortAddress(parts), coords: [Math.round(Number(r.lon) * 1e6) / 1e6, Math.round(Number(r.lat) * 1e6) / 1e6] as LngLat }
  })
  cache.set(cacheKey, out)
  return out
}

/** "불국사, 385, 불국로, 진현동, 불국동, 경주시, 경상북도, 38127, 대한민국" → "경상북도 경주시 불국로 385" 처럼 읽기 좋게 */
function shortAddress(parts: string[]): string {
  const rest = parts.slice(1).filter((p) => !/^\d{5}$/.test(p))
  if (rest[rest.length - 1] === '대한민국') {
    const nums = rest.filter((p) => /^\d+(-\d+)?$/.test(p))
    const words = rest.filter((p) => !/^\d+(-\d+)?$/.test(p) && p !== '대한민국')
    const road = words.find((p) => /(로|길)$/.test(p))
    const city = words.filter((p) => /(시|군|구|도|특별시|광역시)$/.test(p)).reverse()
    return [...city, road, nums[0]].filter(Boolean).join(' ')
  }
  return rest.slice(0, 5).join(', ')
}
