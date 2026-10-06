/**
 * 선생님 PIN 규칙. 화면(입력 안내)과 서버(최종 판정)가 같은 함수를 쓴다.
 * 숫자 6~12자리. 같은 숫자 반복·연속 숫자·흔한 조합·날짜 모양(생일·여행 날짜)은 받지 않는다.
 * 날짜를 막는 까닭: 함께 쓰는 PIN 은 외우기 쉬운 여행 날짜로 정하기 쉬운데, 그 날짜는 안내에 공개돼 있다.
 */
const COMMON = new Set(['123123', '112233', '121212', '123321', '111222', '147258', '159753', '102030', '010203', '123654', '789456', '456789', '987654', '135790', '246810', '147369', '102938', '000001', '999998', '200000'])

/** 휴대폰·계산기 숫자판에서 줄·대각선을 그대로 따라 누른 모양(앞 6자리) */
const KEYPAD = ['147852', '369258', '741852', '852963', '159357', '357159', '951753', '753951', '258369', '963852', '321654', '456123', '123789', '789123', '147963', '369147', '741963', '963741', '258147', '852741', '159951', '357753', '2580', '0852']

export const PIN_MIN = 6
export const PIN_MAX = 12

const isDate = (y: number, m: number, d: number) => {
  if (m < 1 || m > 12 || d < 1) return false
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return d <= dim
}

const isYear = (y: number) => y >= 1900 && y <= 2100

/** 6자리(YYMMDD·MMDDYY·DDMMYY·YYYYMM)·7자리(YYYYMDD·YYYYMMD)·8자리(YYYYMMDD·MMDDYYYY·DDMMYYYY)로 읽히는 날짜인가 */
export function looksLikeDate(pin: string): boolean {
  const n = (s: string) => Number(s)
  if (pin.length === 6) {
    const [a, b, c] = [pin.slice(0, 2), pin.slice(2, 4), pin.slice(4, 6)]
    if (isYear(n(pin.slice(0, 4))) && n(c) >= 1 && n(c) <= 12) return true
    return isDate(2000 + n(a), n(b), n(c)) || isDate(2000 + n(c), n(a), n(b)) || isDate(2000 + n(c), n(b), n(a))
  }
  if (pin.length === 7) {
    const y = n(pin.slice(0, 4))
    return isYear(y) && (isDate(y, n(pin.slice(4, 5)), n(pin.slice(5, 7))) || isDate(y, n(pin.slice(4, 6)), n(pin.slice(6, 7))))
  }
  if (pin.length === 8) {
    const y1 = n(pin.slice(0, 4))
    const y2 = n(pin.slice(4, 8))
    return (y1 >= 1900 && y1 <= 2100 && isDate(y1, n(pin.slice(4, 6)), n(pin.slice(6, 8)))) || (y2 >= 1900 && y2 <= 2100 && (isDate(y2, n(pin.slice(0, 2)), n(pin.slice(2, 4))) || isDate(y2, n(pin.slice(2, 4)), n(pin.slice(0, 2)))))
  }
  return false
}

/** trip 을 주면 그 여행의 출발·도착 날짜(월일)가 들어간 PIN 도 막는다 */
export function pinProblem(pin: string, trip?: { startDate: string; endDate: string }): string | null {
  if (!/^\d+$/.test(pin)) return 'PIN은 숫자로만 정해요.'
  if (pin.length < PIN_MIN || pin.length > PIN_MAX) return `PIN은 숫자 ${PIN_MIN}~${PIN_MAX}자리로 정해요.`
  if (/^(\d)\1+$/.test(pin)) return '같은 숫자만 이어진 PIN은 쓸 수 없어요.'
  const d = pin.split('').map(Number)
  const step = d[1] - d[0]
  if ((step === 1 || step === -1) && d.every((v, i) => i === 0 || v - d[i - 1] === step)) return '123456처럼 이어지는 숫자는 쓸 수 없어요.'
  if (COMMON.has(pin) || KEYPAD.some((k) => k.length === 6 && pin.startsWith(k)) || pin === [...pin].reverse().join('')) return '너무 흔한 조합이에요. 다른 숫자로 정해 주세요.'
  if (/^(\d{2,3})\1+$/.test(pin)) return '같은 묶음이 되풀이되는 PIN은 쓸 수 없어요.'
  if (looksLikeDate(pin)) return '날짜처럼 읽히는 숫자(생일·여행 날짜)는 짐작하기 쉬워서 쓸 수 없어요.'
  if (trip) {
    for (const ymd of [trip.startDate, trip.endDate]) {
      const [y, m, dd] = ymd.split('-')
      for (const part of [m + dd, dd + m, y.slice(2) + m]) if (pin.includes(part)) return '여행 날짜가 들어간 PIN은 짐작하기 쉬워서 쓸 수 없어요.'
    }
  }
  return null
}

/** 복구 코드 글자(헷갈리는 0·O·1·I·L 빼고) */
export const RECOVERY_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function normalizeRecovery(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '')
}
