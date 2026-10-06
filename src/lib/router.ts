/**
 * 주소.
 *   /                    첫 화면
 *   /new                 새 여행 만들기 (?from=sample 이면 샘플로 시작)
 *   /sample              샘플 여행 보기
 *   /t/<id>              여행 안내(학생·보호자·선생님)
 *   /t/<id>/edit         편집(선생님 PIN)
 *   /t/<id>/collect      느낀 점 모으기(선생님)
 * 여행 안의 장은 # 뒤에 둔다: /t/<id>#/p/<장>
 */
import { useEffect, useState } from 'react'

export type Route =
  | { name: 'landing' }
  | { name: 'new'; fromSample: boolean }
  | { name: 'sample' }
  | { name: 'trip'; id: string }
  | { name: 'edit'; id: string }
  | { name: 'collect'; id: string }
  | { name: 'missing' }

export function parsePath(path: string, search = ''): Route {
  const p = path.replace(/\/+$/, '') || '/'
  if (p === '/') return { name: 'landing' }
  if (p === '/new') return { name: 'new', fromSample: new URLSearchParams(search).get('from') === 'sample' }
  if (p === '/sample') return { name: 'sample' }
  const m = p.match(/^\/t\/([a-z2-9]{10})(\/edit|\/collect)?$/)
  if (m) return m[2] === '/edit' ? { name: 'edit', id: m[1] } : m[2] === '/collect' ? { name: 'collect', id: m[1] } : { name: 'trip', id: m[1] }
  return { name: 'missing' }
}

export function useRoute(): Route {
  const [r, setR] = useState(() => parsePath(window.location.pathname, window.location.search))
  useEffect(() => {
    const on = () => setR(parsePath(window.location.pathname, window.location.search))
    window.addEventListener('popstate', on)
    return () => window.removeEventListener('popstate', on)
  }, [])
  return r
}

/** 다른 화면으로(새로고침 없이) */
export function navigate(to: string, opts: { replace?: boolean } = {}) {
  if (opts.replace) history.replaceState(null, '', to)
  else history.pushState(null, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo(0, 0)
}

// ── 여행 안의 장(# 뒤) ──
export function pageKeyFromHash(hash = window.location.hash): string | null {
  const m = hash.replace(/^#/, '').match(/^\/p\/([a-z0-9-]+)/)
  return m ? m[1] : null
}

export function usePageKey(): string | null {
  const [k, setK] = useState(() => pageKeyFromHash())
  useEffect(() => {
    const on = () => setK(pageKeyFromHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return k
}

export const pageHref = (key: string) => `#/p/${key}`

/** 장 이동. replace 면 뒤로 가기 기록을 남기지 않는다(넘길 때마다 기록이 쌓이지 않게). */
export function goTo(key: string, opts: { replace?: boolean } = {}) {
  const href = pageHref(key)
  if (window.location.hash === href) return
  if (opts.replace) {
    history.replaceState(null, '', href)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else window.location.hash = href
}
