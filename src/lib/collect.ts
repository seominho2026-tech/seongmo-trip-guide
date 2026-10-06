/**
 * 선생님 '느낀 점 모으기': 학생 파일 여러 개 → 학생마다 한 줄.
 * 같은 학번 파일이 여럿이면 가장 늦게 저장한 것을 쓴다. 다른 여행 파일은 뺀다.
 */
import type { Derived, StopPage } from '../trip/derive'
import { reflectStops } from '../trip/derive'
import { parseReflectionFile, type FileData } from './reflectionFile'
import { nameProblem, studentNoProblem } from './reflections'

export type Student = { no: string; name: string; savedAt: string; answers: Map<string, string>; file: string; warnings: string[] }
export type Collected = { students: Student[]; skipped: { file: string; reason: string }[]; questions: StopPage[] }

/** 본문으로만 읽은 파일의 글을 일정에 맞춘다(일차 + 장소 이름) */
function matchStop(d: Derived, item: FileData['items'][number]): StopPage | undefined {
  const qs = reflectStops(d)
  if (item.s) return qs.find((p) => p.stop.id === item.s)
  return qs.find((p) => p.dayN === item.d && (p.stop.place?.name ?? p.stop.title) === item.t)
}

export function collect(d: Derived, tripId: string, files: { name: string; text: string }[]): Collected {
  const questions = reflectStops(d)
  const skipped: Collected['skipped'] = []
  const byNo = new Map<string, Student>()
  for (const f of files) {
    const r = parseReflectionFile(f.text)
    if (!r.ok) {
      skipped.push({ file: f.name, reason: r.reason })
      continue
    }
    const data = r.data
    if (data.trip && data.trip !== tripId) {
      skipped.push({ file: f.name, reason: `다른 여행(「${data.title}」)의 파일이에요.` })
      continue
    }
    // 정보 줄이 지워진 파일은 여행 번호가 없으니 본문의 여행 제목으로 가른다.
    // 제목만 바뀐 같은 여행일 수 있으니, 제목이 달라도 적힌 곳의 절반 넘게 지금 일정과 맞으면 넣고 알려 준다.
    const warnings: string[] = []
    if (r.fromText && data.title.trim() && data.title.trim() !== d.doc.title.trim()) {
      const hit = data.items.filter((it) => matchStop(d, it)).length
      if (!hit || hit * 2 <= data.items.length) {
        skipped.push({ file: f.name, reason: `다른 여행(「${data.title.trim()}」)의 파일로 보여요. 이 여행 제목과 다르고 장소도 맞지 않아 넣지 않았어요.` })
        continue
      }
      warnings.push(`파일의 여행 제목(「${data.title.trim()}」)이 지금 제목과 달라요. 장소가 맞아서 넣었어요.`)
    }
    if (r.fromText) warnings.push('맨 아래 정보 줄이 지워져 본문으로 읽었어요.')
    const noErr = studentNoProblem(data.no, d.doc.studentIdDigits)
    if (noErr) warnings.push(noErr)
    const nameErr = nameProblem(data.name)
    if (nameErr) warnings.push(nameErr)
    const answers = new Map<string, string>()
    let unmatched = 0
    for (const it of data.items) {
      const p = matchStop(d, it)
      if (p) answers.set(p.stop.id, it.a)
      else unmatched++
    }
    if (unmatched) warnings.push(`지금 일정에 없는 곳의 글 ${unmatched}개는 넣지 않았어요.`)
    const s: Student = { no: data.no, name: data.name.trim(), savedAt: data.savedAt, answers, file: f.name, warnings }
    const prev = byNo.get(s.no)
    if (prev) {
      const keepNew = (s.savedAt || '') >= (prev.savedAt || '')
      const kept = keepNew ? s : prev
      const other = keepNew ? prev : s
      kept.warnings.push(`같은 학번 파일이 더 있어 늦게 저장한 「${kept.file}」을 썼어요(뺀 파일: ${other.file}).`)
      if (prev.name !== s.name) kept.warnings.push(`같은 학번에 이름이 다르게 적혀 있어요(${prev.name}, ${s.name}).`)
      byNo.set(s.no, kept)
    } else byNo.set(s.no, s)
  }
  const students = [...byNo.values()].sort((a, b) => a.no.localeCompare(b.no))
  return { students, skipped, questions }
}
