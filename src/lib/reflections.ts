/**
 * 학생 느낀 점과 학번·이름. 이 휴대폰에만 저장하고 서버로 보내지 않는다.
 * 여행이 끝나면 '내 느낀 점 저장'으로 파일을 받아 선생님께 낸다(src/lib/reflectionFile.ts).
 */
import { useCallback } from 'react'
import { useStored } from './storage'

export type Me = { no: string; name: string }
export type Reflection = { text: string; updatedAt: string }
export type Book = Record<string, Reflection>

export const REFLECTION_MAX = 3000

export function useMe(tripId: string) {
  return useStored<Me | null>(`me:${tripId}`, null)
}

export function useBook(tripId: string): [Book, (stopId: string, text: string | null) => void, (b: Book) => void] {
  const [book, setBook] = useStored<Book>(`reflections:${tripId}`, {})
  const save = useCallback(
    (stopId: string, text: string | null) =>
      setBook((prev) => {
        const next = { ...prev }
        if (text && text.trim()) next[stopId] = { text: text.slice(0, REFLECTION_MAX), updatedAt: new Date().toISOString() }
        else delete next[stopId]
        return next
      }),
    [setBook],
  )
  return [book, save, setBook]
}

export function studentNoProblem(no: string, digits: 4 | 5): string | null {
  if (!/^\d+$/.test(no)) return '학번은 숫자로만 적어요.'
  if (no.length !== digits) return digits === 4 ? '학번은 네 자리예요(학년 1, 반 1, 번호 2). 예: 1103' : '학번은 다섯 자리예요(학년 1, 반 2, 번호 2). 예: 10203'
  const grade = Number(no[0])
  const cls = Number(digits === 4 ? no[1] : no.slice(1, 3))
  const num = Number(no.slice(-2))
  if (!grade || !cls || !num) return '학년·반·번호에 0이 들어갈 수 없어요.'
  return null
}

export function nameProblem(name: string): string | null {
  const n = name.trim()
  if (!n) return '이름을 적어 주세요.'
  if (n.length > 20) return '이름이 너무 길어요.'
  if (/[\d@:/\\]/.test(n)) return '이름에는 숫자나 기호를 넣지 않아요.'
  return null
}
