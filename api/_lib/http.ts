/**
 * /api/trip 요청을 나눠 서비스로 보낸다. 배포 함수(api/trip.ts)와 개발 서버(vite.config.ts)가 같은 함수를 쓴다.
 *
 *   GET    /api/trip?id=…                 안내 문서 읽기(누구나)
 *   POST   /api/trip?op=create            새 여행 {doc, pin}
 *   POST   /api/trip?op=unlock&id=…       PIN → 편집 열쇠
 *   POST   /api/trip?op=check&id=…        편집 열쇠가 아직 살아 있는지
 *   PUT    /api/trip?id=…                 저장 {doc, baseEtag} (편집 열쇠)
 *   POST   /api/trip?op=pin&id=…          PIN 바꾸기 {pin, newPin} (편집 열쇠)
 *   POST   /api/trip?op=recover&id=…      복구 코드로 새 PIN {code, newPin}
 *   POST   /api/trip?op=logout&id=…       이 기기 편집 열쇠 지우기
 *   POST   /api/trip?op=logout-all&id=…   모든 기기 편집 열쇠 지우기 {pin}
 *   POST   /api/trip?op=delete&id=…       여행 지우기 {pin} (편집 열쇠)
 * 정해진 쿼리 말고 다른 것이 붙으면 저장소를 읽기 전에 거절한다(캐시를 피해 저장소를 두드리지 못하게).
 */
import { timingSafeEqual } from 'node:crypto'
import { ApiError, changePin, checkSession, cleanup, createTrip, deleteTrip, getTrip, getTripCached, hasSession, logout, logoutAll, recover, saveTrip, unlock, validTripId, type Ctx } from './service.js'
import { defaultStore } from './store.js'

const BODY_MAX = 400_000

export function serverCtx(): Ctx {
  const pepper = process.env.PIN_PEPPER ?? ''
  if (pepper.length < 32) throw new ApiError(500, 'config', '서버 설정이 끝나지 않았어요.')
  return { store: defaultStore(), pepper, now: () => Date.now() }
}

function json(status: number, data: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers },
  })
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const len = Number(req.headers.get('content-length') ?? '0')
  if (len > BODY_MAX) throw new ApiError(413, 'too-large', '보낸 내용이 너무 커요.')
  const buf = await req.arrayBuffer()
  if (buf.byteLength > BODY_MAX) throw new ApiError(413, 'too-large', '보낸 내용이 너무 커요.')
  const text = new TextDecoder().decode(buf)
  if (!text) return {}
  try {
    const v = JSON.parse(text)
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  } catch {
    throw new ApiError(400, 'bad-json', '보낸 내용을 읽을 수 없어요.')
  }
}

function bearer(req: Request): string | null {
  const h = req.headers.get('authorization') ?? ''
  const m = h.match(/^Bearer\s+([A-Za-z0-9_.-]{20,200})$/)
  return m ? m[1] : null
}

function clientIp(req: Request): string {
  return (req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown').trim()
}

/** 다른 사이트가 사용자 브라우저로 이 API 를 부르지 못하게, 쓰기 요청은 같은 출처에서 온 것만 받는다 */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true
  try {
    return new URL(origin).host === new URL(req.url).host
  } catch {
    return false
  }
}

const RAW_GET = /^id=[a-z2-9]{10}(?:&fresh=\d{1,16})?$/
const RAW_WRITE = /^(?:op=create|op=[a-z-]{2,12}&id=[a-z2-9]{10}|id=[a-z2-9]{10}(?:&op=[a-z-]{2,12})?)$/

export async function handleTrip(req: Request, ctxOverride?: Ctx): Promise<Response> {
  try {
    const ctx = ctxOverride ?? serverCtx()
    const url = new URL(req.url)
    // 정해진 모양의 주소만 받는다. 이름 두 번·대소문자·덧붙인 이름은 앞단 캐시의 열쇠를 쪼개므로 거절한다.
    // (Vercel 앞단은 퍼센트 인코딩을 풀고 열쇠를 만들지만, 그 동작이 바뀌어도 안전하게 글자 그대로를 본다)
    const raw = url.search.replace(/^\?/, '')
    const okRaw = req.method === 'GET' ? RAW_GET.test(raw) : RAW_WRITE.test(raw)
    if (!okRaw) throw new ApiError(400, 'query', '알 수 없는 요청이에요.')
    if (url.pathname !== '/api/trip') throw new ApiError(404, 'not-found', '알 수 없는 요청이에요.')
    const id = url.searchParams.get('id') ?? ''
    const op = url.searchParams.get('op') ?? ''
    // 서명 글자가 맞지 않는 여행 주소는 저장소를 읽기 전에 거른다
    if (!(req.method === 'POST' && op === 'create') && !validTripId(ctx, id)) throw new ApiError(404, 'not-found', '이 여행을 찾을 수 없어요.')

    if (req.method === 'GET') {
      // 최신 원본 읽기는 편집 열쇠가 있는 선생님만(아무나 원본을 계속 읽게 두지 않는다)
      const fresh = url.searchParams.has('fresh')
      // 앞단 캐시는 Authorization 이 붙은 요청을 캐시하지 않는다. 열쇠는 최신 읽기(fresh)에만 쓰므로, 그 밖에 붙어 오면 거절한다
      if (!fresh && req.headers.has('authorization')) throw new ApiError(400, 'query', '알 수 없는 요청이에요.')
      if (fresh && !(await hasSession(ctx, id, bearer(req)))) throw new ApiError(401, 'no-session', '편집하려면 PIN을 다시 넣어 주세요.')
      const { record, etag } = await getTrip(ctx, id, { fresh })
      return json(200, { doc: record.doc, etag, updatedAt: record.updatedAt }, fresh ? {} : { 'cache-control': 'public, max-age=0, s-maxage=5, stale-while-revalidate=10' })
    }

    if (req.method !== 'POST' && req.method !== 'PUT') throw new ApiError(405, 'method', '지원하지 않는 요청이에요.')
    if (!sameOrigin(req)) throw new ApiError(403, 'origin', '다른 사이트에서 보낸 요청은 받지 않아요.')
    const body = await readBody(req)
    const token = bearer(req)

    if (req.method === 'PUT') return json(200, await saveTrip(ctx, id, token, { doc: body.doc, baseEtag: body.baseEtag }))

    switch (op) {
      case 'create': {
        const ip = clientIp(req)
        // 배포본에서 주소를 모르면 하루 만들기 한도를 모두가 나눠 쓰게 되므로 받지 않는다
        if (ip === 'unknown' && process.env.VERCEL) throw new ApiError(400, 'ip', '지금은 새 여행을 만들 수 없어요. 잠시 뒤 다시 해 주세요.')
        return json(201, await createTrip(ctx, { doc: body.doc, pin: body.pin, ip }))
      }
      case 'unlock':
        return json(200, await unlock(ctx, id, clientIp(req), body.pin, body.remember === true))
      case 'check':
        return json(200, await checkSession(ctx, id, token))
      case 'pin':
        return json(200, await changePin(ctx, id, clientIp(req), token, { pin: body.pin, newPin: body.newPin }))
      case 'recover':
        return json(200, await recover(ctx, id, clientIp(req), { code: body.code, newPin: body.newPin }))
      case 'logout-all':
        return json(200, await logoutAll(ctx, id, clientIp(req), { pin: body.pin }))
      case 'logout':
        return json(200, await logout(ctx, id, token))
      case 'delete':
        return json(200, await deleteTrip(ctx, id, clientIp(req), token, { pin: body.pin }))
      default:
        throw new ApiError(404, 'op', '지원하지 않는 요청이에요.')
    }
  } catch (e) {
    if (e instanceof ApiError) return json(e.status, { error: e.code, message: e.message, ...e.extra })
    console.error('[trip api]', e)
    return json(500, { error: 'server', message: '잠시 문제가 생겼어요. 조금 뒤 다시 해 주세요.' })
  }
}

/** 여행별 홈 화면 앱 정보: 홈 화면에 추가하면 그 여행이 바로 열린다 */
export async function handleManifest(req: Request, ctxOverride?: Ctx): Promise<Response> {
  const url = new URL(req.url)
  const raw = url.search.replace(/^\?/, '')
  // 정해진 모양(id 하나)만, 열쇠 없이. 그 밖에는 저장소를 읽지 않고 기본 앱 정보를 준다
  const id = /^id=[a-z2-9]{10}$/.test(raw) && !req.headers.has('authorization') ? raw.slice(3) : ''
  let name = '대전성모여고 체험학습 가이드'
  let known = false
  try {
    const ctx = ctxOverride ?? serverCtx()
    const rec = id ? await getTripCached(ctx, id) : null
    if (rec) {
      name = rec.doc.title.slice(0, 45)
      known = true
    }
  } catch {
    /* 이름을 못 읽으면 기본 이름 */
  }
  const start = known ? `/t/${id}` : '/'
  const manifest = {
    name,
    short_name: name.length > 12 ? name.slice(0, 12) : name,
    start_url: start,
    scope: start,
    display: 'standalone',
    background_color: '#f4f1eb',
    theme_color: '#f4f1eb',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
  return new Response(JSON.stringify(manifest), { headers: { 'content-type': 'application/manifest+json; charset=utf-8', 'cache-control': 'public, max-age=300, s-maxage=3600' } })
}

/** 매일 한 번(Vercel Cron): 끝난 지 1년 지난 여행 지우기 */
export async function handleCleanup(req: Request, ctxOverride?: Ctx): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!ctxOverride) {
    const got = Buffer.from(req.headers.get('authorization') ?? '')
    const want = Buffer.from(`Bearer ${secret ?? ''}`)
    if (!secret || got.length !== want.length || !timingSafeEqual(got, want)) return json(401, { error: 'auth' })
  }
  try {
    return json(200, await cleanup(ctxOverride ?? serverCtx()))
  } catch (e) {
    console.error('[cleanup]', e)
    return json(500, { error: 'server' })
  }
}
