/*
 * 오프라인 대비 서비스 워커.
 * - 화면(html): 먼저 인터넷에서 받고, 안 되면 저장해 둔 것을 보여 준다.
 * - 이름에 해시가 붙은 파일(js·css·글꼴): 한 번 받으면 저장해 두고 쓴다.
 * - 여행 안내(/api/trip?id=…): 먼저 인터넷에서 받고, 안 되면 마지막으로 받은 것을 쓴다(고친 내용이 늦게 반영되지 않게).
 * - 지도 타일: 본 것만 저장하고 오래된 것부터 지운다.
 * 쓰기 요청(저장·PIN)은 건드리지 않는다.
 */
const PREFIX = 'tripguide-'
const SHELL = PREFIX + 'shell-v1'
const ASSETS = PREFIX + 'assets-v1'
const TRIPS = PREFIX + 'trips-v1'
const TILES = PREFIX + 'tiles-v1'
const KEEP = [SHELL, ASSETS, TRIPS, TILES]
const LIMIT = { [TILES]: 1800, [TRIPS]: 20 }

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(['/', '/manifest.webmanifest', '/icons/icon-192.png']))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

async function trim(name) {
  const max = LIMIT[name]
  if (!max) return
  const cache = await caches.open(name)
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i])
}

async function cacheFirst(request, name) {
  const cache = await caches.open(name)
  const hit = await cache.match(request)
  if (hit) return hit
  const res = await fetch(request)
  if (res.ok) {
    cache.put(request, res.clone())
    trim(name)
  }
  return res
}

async function networkFirst(request, name, key) {
  const cache = await caches.open(name)
  try {
    const res = await fetch(request)
    if (res.ok) cache.put(key ?? request, res.clone()).then(() => trim(name))
    return res
  } catch {
    return (await cache.match(key ?? request)) || Response.error()
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') {
      // 어느 주소로 들어와도 같은 앱 화면(index.html)이다
      event.respondWith(networkFirst(req, SHELL, '/'))
      return
    }
    if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) event.respondWith(cacheFirst(req, ASSETS))
    else if (url.pathname === '/api/trip' && url.searchParams.get('id') && !url.searchParams.has('op')) {
      // 여행마다 하나만 남긴다(fresh 같은 덧붙임은 빼고)
      const key = new Request(`/api/trip?id=${url.searchParams.get('id')}`)
      event.respondWith(networkFirst(req, TRIPS, key))
    } else if (url.pathname.startsWith('/sample/')) event.respondWith(networkFirst(req, SHELL))
    return
  }
  if (url.hostname === 'tiles.openfreemap.org') {
    if (/\.(pbf|png|webp)$/.test(url.pathname) || url.pathname.includes('/fonts/') || url.pathname.includes('/sprites/')) event.respondWith(cacheFirst(req, TILES))
    else event.respondWith(fetch(req).catch(() => caches.match(req).then((r) => r || Response.error())))
  }
})
