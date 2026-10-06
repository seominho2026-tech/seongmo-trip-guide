/**
 * 안내 문서에 개인정보가 들어갔는지 살핀다(편집기 저장 전, 서버 저장 전 두 곳에서 같은 함수를 쓴다).
 *
 * 이 문서는 링크만 있으면 누구나 보므로 휴대전화 번호·주민등록번호·전자 우편 주소는 저장을 막는다.
 * 숙소·식당 대표 번호(지역 번호로 시작하는 유선 번호)는 안내에 필요해 막지 않는다.
 * 이름은 기계로 가려낼 수 없으니 편집 화면의 고정 안내로 알린다.
 */
import type { TripDoc } from '../trip/schema.js'

export type PiiHit = { where: string; kind: 'phone' | 'rrn' | 'email'; sample: string }

const PATTERNS: { kind: PiiHit['kind']; re: RegExp }[] = [
  // 010-1234-5678, 010 1234 5678, 01012345678, +82 10-1234-5678
  { kind: 'phone', re: /(?:\+82[\s.-]?|\b0)1[016789][\s.-]?\d{3,4}[\s.-]?\d{4}\b/g },
  // 주민등록번호 900101-1234567
  { kind: 'rrn', re: /\b\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[\s-]?[1-8]\d{6}\b/g },
  { kind: 'email', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
]

export const PII_LABEL: Record<PiiHit['kind'], string> = {
  phone: '휴대전화 번호',
  rrn: '주민등록번호',
  email: '이메일 주소',
}

/** 문서 안 모든 글을 [어디, 글] 짝으로 */
function texts(doc: TripDoc): [string, string][] {
  const out: [string, string][] = [
    ['여행 제목', doc.title],
    ['학교 이름', doc.school ?? ''],
    ['여행 소개', doc.summary ?? ''],
    ['출발 전 안내', doc.before.notes],
    ['다녀와서 안내', doc.after.notes],
  ]
  doc.before.checklist.forEach((c, i) => out.push([`준비물 ${i + 1}`, c]))
  doc.announcements.forEach((a) => out.push([`공지 「${a.title}」`, `${a.title}\n${a.body}`]))
  doc.days.forEach((d, di) => {
    out.push([`${di + 1}일차 제목`, d.title ?? ''])
    for (const s of d.stops) {
      const where = `${di + 1}일차 ${s.time} 「${s.title}」`
      out.push([where, [s.title, s.body, s.place?.name, s.place?.address, s.leg?.note, s.meet?.place, s.reflect?.prompt, ...(s.rules ?? [])].filter(Boolean).join('\n')])
    }
  })
  return out
}

export function findPii(doc: TripDoc): PiiHit[] {
  const hits: PiiHit[] = []
  for (const [where, t] of texts(doc)) {
    if (!t) continue
    for (const { kind, re } of PATTERNS) {
      re.lastIndex = 0
      const m = re.exec(t)
      if (m) hits.push({ where, kind, sample: mask(m[0]) })
    }
  }
  return hits
}

/** 화면에 다시 보여 줄 때는 가운데를 가린다 */
function mask(s: string): string {
  if (s.length <= 4) return '*'.repeat(s.length)
  return s.slice(0, 3) + '*'.repeat(Math.max(1, s.length - 5)) + s.slice(-2)
}
