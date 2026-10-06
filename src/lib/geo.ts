export type LngLat = [number, number]

/** 두 점 사이 거리(km, 대원 거리) */
export function km(a: LngLat, b: LngLat): number {
  const R = 6371
  const rad = Math.PI / 180
  const dLat = (b[1] - a[1]) * rad
  const dLng = (b[0] - a[0]) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** 대원 호를 따라 n 개 점 (비행 경로 그리기용). 날짜변경선을 넘으면 경도를 이어 붙인다. */
export function greatCircle(a: LngLat, b: LngLat, n = 128): LngLat[] {
  const rad = Math.PI / 180
  const [lng1, lat1] = [a[0] * rad, a[1] * rad]
  const [lng2, lat2] = [b[0] * rad, b[1] * rad]
  const d = 2 * Math.asin(Math.sqrt(Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2))
  const out: LngLat[] = []
  let prevLng: number | null = null
  for (let i = 0; i <= n; i++) {
    const f = i / n
    const A = Math.sin((1 - f) * d) / Math.sin(d)
    const B = Math.sin(f * d) / Math.sin(d)
    const x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2)
    const y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2)
    const z = A * Math.sin(lat1) + B * Math.sin(lat2)
    let lng = Math.atan2(y, x) / rad
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) / rad
    if (prevLng !== null) {
      while (lng - prevLng > 180) lng -= 360
      while (lng - prevLng < -180) lng += 360
    }
    prevLng = lng
    out.push([lng, lat])
  }
  return out
}

export function bbox(points: LngLat[]): [LngLat, LngLat] | null {
  if (!points.length) return null
  let [w, s] = points[0]
  let [e, n] = points[0]
  for (const [x, y] of points) {
    if (x < w) w = x
    if (x > e) e = x
    if (y < s) s = y
    if (y > n) n = y
  }
  return [
    [w, s],
    [e, n],
  ]
}
