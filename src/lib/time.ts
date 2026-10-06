/**
 * 시각 계산. 일정 시각은 여행지 시간대(문서의 tz)로 적고, 출발지(보호자) 시간대(homeTz)로 바꿔 보여 줄 수 있다.
 * 시간대 규칙(서머타임 포함)은 브라우저의 Intl 이 안다.
 */
const WEEK = ['일', '월', '화', '수', '목', '금', '토']

export const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

const fmtCache = new Map<string, Intl.DateTimeFormat>()
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' })
    fmtCache.set(tz, f)
  }
  return f
}

function parts(at: Date, tz: string) {
  const o: Record<string, string> = {}
  for (const p of fmt(tz).formatToParts(at)) o[p.type] = p.value
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday)
  return { y: Number(o.year), m: Number(o.month), d: Number(o.day), h: Number(o.hour) % 24, mi: Number(o.minute), s: Number(o.second), wd }
}

/** 그 시간대의 그 순간 UTC 와의 차이(분) */
function offsetMin(at: Date, tz: string): number {
  const p = parts(at, tz)
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s)
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000)
}

/** "2026-10-21" + "10:00" (그 시간대) → 실제 순간 */
export function instant(date: string, hhmm: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d, Number(hhmm.slice(0, 2)), Number(hhmm.slice(3, 5)))
  const t1 = guess - offsetMin(new Date(guess), tz) * 60000
  // 서머타임 경계 근처에서 한 번 더 맞춘다
  const t2 = guess - offsetMin(new Date(t1), tz) * 60000
  const fits = (t: number) => {
    const p = parts(new Date(t), tz)
    return p.d === d && p.h === Number(hhmm.slice(0, 2)) && p.mi === Number(hhmm.slice(3, 5))
  }
  if (fits(t2)) return new Date(t2)
  if (fits(t1)) return new Date(t1)
  // 서머타임이 시작돼 시계에 없는 시각(02:30)이면 앞으로 민다(03:30)
  return new Date(Math.max(t1, t2))
}

/** 순간을 어느 시간대의 {날짜, 시각, 요일} 로 */
export function clock(at: Date, tz: string) {
  const p = parts(at, tz)
  const pad = (n: number) => String(n).padStart(2, '0')
  return { m: p.m, d: p.d, weekday: WEEK[p.wd], time: `${pad(p.h)}:${pad(p.mi)}`, ymd: `${p.y}-${pad(p.m)}-${pad(p.d)}` }
}

/** 시작일에서 n 일 뒤 날짜(YYYY-MM-DD) */
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

export function weekdayOf(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

/** 90 → "1시간 30분", 45 → "45분" */
export function duration(min: number): string {
  const total = Math.round(min)
  if (total <= 0) return ''
  const h = Math.floor(total / 60)
  const m = total % 60
  if (!h) return `${m}분`
  return m ? `${h}시간 ${m}분` : `${h}시간`
}

/** "10/21(수)" */
export function dateLabel(ymd: string, withWeekday = true) {
  const [, m, d] = ymd.split('-').map(Number)
  return `${m}/${d}${withWeekday ? `(${weekdayOf(ymd)})` : ''}`
}

/** "2026. 10. 21.(수)" */
export function longDate(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number)
  return `${y}. ${m}. ${d}.(${weekdayOf(ymd)})`
}

/** 지금 시각. 주소에 ?now=2026-10-21T10:30+09:00 을 붙이면 그 순간으로 본다(미리 연습할 때). */
export function now(): Date {
  try {
    const q = new URLSearchParams(window.location.search).get('now')?.replace(' ', '+')
    if (q) {
      const t = new Date(q)
      if (!Number.isNaN(t.getTime())) return t
    }
  } catch {
    /* 주소를 못 읽으면 실제 시각 */
  }
  return new Date()
}

/** 출발까지 남은 날(출발지 날짜 기준). 출발일이면 0 */
export function daysUntil(startYmd: string, at: Date, tz: string): number {
  const [ty, tm, td] = clock(at, tz).ymd.split('-').map(Number)
  const [y, m, d] = startYmd.split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86_400_000)
}

/** 짧은 시간대 이름(화면용) */
export function zoneName(tz: string): string {
  return ZONES.find((z) => z.tz === tz)?.label ?? tz.split('/').pop()!.replace(/_/g, ' ')
}

/** 고르기 쉬운 시간대 목록(그 밖은 직접 고른다) */
export const ZONES: { tz: string; label: string }[] = [
  { tz: 'Asia/Seoul', label: '한국' },
  { tz: 'Asia/Tokyo', label: '일본' },
  { tz: 'Asia/Shanghai', label: '중국' },
  { tz: 'Asia/Taipei', label: '대만' },
  { tz: 'Asia/Hong_Kong', label: '홍콩' },
  { tz: 'Asia/Singapore', label: '싱가포르' },
  { tz: 'Asia/Bangkok', label: '태국·베트남' },
  { tz: 'Asia/Manila', label: '필리핀' },
  { tz: 'Australia/Sydney', label: '호주 동부' },
  { tz: 'Pacific/Guam', label: '괌' },
  { tz: 'Pacific/Honolulu', label: '하와이' },
  { tz: 'America/Los_Angeles', label: '미국 서부' },
  { tz: 'America/Chicago', label: '미국 중부' },
  { tz: 'America/New_York', label: '미국 동부' },
  { tz: 'America/Toronto', label: '캐나다 동부' },
  { tz: 'America/Vancouver', label: '캐나다 서부' },
  { tz: 'Europe/London', label: '영국' },
  { tz: 'Europe/Paris', label: '프랑스·독일·이탈리아' },
  { tz: 'Europe/Helsinki', label: '핀란드' },
]
