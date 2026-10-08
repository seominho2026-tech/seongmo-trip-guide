import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyTrip, newId, type TripDoc } from '../src/trip/schema.js'
import { derive, pageAt, reflectStops } from '../src/trip/derive.js'
import { buildFileData, buildReflectionText, parseReflectionFile, reflectionFilename, DATA_TAG } from '../src/lib/reflectionFile.js'
import { collect } from '../src/lib/collect.js'
import { salpeemRows, salpeemQuestion } from '../src/lib/salpeem.js'
import { studentNoProblem } from '../src/lib/reflections.js'
import { instant } from '../src/lib/time.js'

function trip(digits: 4 | 5 = 4): TripDoc {
  const d = emptyTrip({ title: '경주 수학여행', startDate: '2026-10-21', nights: 1, tz: 'Asia/Seoul', studentIdDigits: digits })
  d.days[0].stops.push({ id: 'aaaaaa1', time: '10:00', title: '불국사', kind: 'activity', place: { name: '불국사', coords: [129.33, 35.79] }, reflect: { on: true, prompt: '타임스탬프: 이메일로 답하는 질문?' } })
  d.days[0].stops.push({ id: 'aaaaaa2', time: '12:00', title: '점심', kind: 'meal' })
  d.days[1].stops.push({ id: 'aaaaaa3', time: '09:00', title: '양동마을', kind: 'activity', place: { name: '양동마을', coords: [129.25, 35.99] }, reflect: { on: true } })
  return d
}

test('file round trip keeps every answer, names and ids', () => {
  const d = derive(trip())
  const data = buildFileData(d, 'trip123456', { no: '1103', name: '김 가람' }, { aaaaaa1: { text: '첫 줄\n둘째 줄 → 화살표', updatedAt: '2026-10-21T01:00:00Z' }, aaaaaa3: { text: '마을', updatedAt: '2026-10-22T01:00:00Z' } })
  const text = buildReflectionText(d, data)
  assert.ok(text.includes(DATA_TAG))
  assert.equal(reflectionFilename(data), '1103_김가람_느낀점.txt')
  const r = parseReflectionFile('﻿' + text.replace(/\n/g, '\r\n'))
  assert.ok(r.ok && !r.fromText)
  assert.equal(r.ok && r.data.items.length, 2)
  assert.equal(r.ok && r.data.items[0].a, '첫 줄\n둘째 줄 → 화살표')
})

test('body-only fallback when the data line is deleted', () => {
  const d = derive(trip())
  const data = buildFileData(d, 'trip123456', { no: '1103', name: '김가람' }, { aaaaaa1: { text: '탑을 봤다', updatedAt: 'x' }, aaaaaa3: { text: '마을을 걸었다\n두 줄', updatedAt: 'y' } })
  const cut = buildReflectionText(d, data).split('\n').filter((l) => !l.startsWith(DATA_TAG)).join('\n')
  const r = parseReflectionFile(cut)
  assert.ok(r.ok && r.fromText)
  if (!r.ok) return
  assert.equal(r.data.no, '1103')
  assert.deepEqual(r.data.items.map((i) => [i.d, i.t, i.a]), [[1, '불국사', '탑을 봤다'], [2, '양동마을', '마을을 걸었다\n두 줄']])
  const c = collect(d, 'trip123456', [{ name: 'a.txt', text: cut }])
  assert.equal(c.students[0].answers.get('aaaaaa3'), '마을을 걸었다\n두 줄')
  const legacy = parseReflectionFile(cut.replace('대전성모여고 체험학습 가이드 · 느낀 점', '도름스 체험학습 · 느낀 점'))
  assert.ok(legacy.ok && legacy.fromText)
  if (legacy.ok) assert.deepEqual(legacy.data, r.data)
})

test('garbage files are rejected', () => {
  assert.equal(parseReflectionFile('hello').ok, false)
  assert.equal(parseReflectionFile(`도름스 체험학습 · 느낀 점\n${DATA_TAG} !!!`).ok, false)
})

test('collect: latest duplicate wins, other trip skipped, unmatched counted', () => {
  const d = derive(trip())
  const mk = (no: string, name: string, at: string, text: string, tripId = 'trip123456') =>
    buildReflectionText(d, buildFileData(d, tripId, { no, name }, { aaaaaa1: { text, updatedAt: at } }, at))
  const files = [
    { name: '1103_old.txt', text: mk('1103', '김가람', '2026-10-22T00:00:00Z', '옛 글') },
    { name: '1103_new.txt', text: mk('1103', '김가람', '2026-10-23T00:00:00Z', '새 글') },
    { name: 'other.txt', text: mk('1201', '이나래', '2026-10-23T00:00:00Z', '다른 여행', 'zzzzzzzzzz') },
    { name: '9999.txt', text: mk('99999', '박다온', '2026-10-23T00:00:00Z', '자릿수') },
  ]
  const c = collect(d, 'trip123456', files)
  assert.equal(c.students.length, 2)
  assert.equal(c.students.find((s) => s.no === '1103')?.answers.get('aaaaaa1'), '새 글')
  assert.equal(c.skipped.length, 1)
  assert.ok(c.students.find((s) => s.no === '99999')?.warnings.some((w) => w.includes('네 자리')))
})

test('salpeem header: no colon, no skip words, one-line answers, empty rows dropped', () => {
  const d = derive(trip())
  const q = salpeemQuestion(reflectStops(d)[0])
  assert.ok(!/[:：]/.test(q), q)
  for (const w of ['타임스탬프', '이메일', '응답시간', '제출시간']) assert.ok(!q.includes(w), q)
  const c = collect(d, 'trip123456', [
    { name: 'a', text: buildReflectionText(d, buildFileData(d, 'trip123456', { no: '1103', name: '김가람' }, { aaaaaa1: { text: '한 줄\n두 줄 _x000A_ =SUM(1)', updatedAt: 'a' } })) },
    { name: 'b', text: buildReflectionText(d, buildFileData(d, 'trip123456', { no: '1104', name: '빈칸' }, {})) },
  ])
  const rows = salpeemRows(c)
  assert.deepEqual(rows[0].slice(0, 2), ['학번', '이름'])
  assert.equal(rows.length, 2)
  assert.ok(!rows[1][2].includes('\n'))
  assert.ok(!rows[1][2].includes('_x000A_'))
})

test('student number rules for 4 and 5 digits (boundaries)', () => {
  assert.equal(studentNoProblem('1103', 4), null)
  assert.ok(studentNoProblem('110', 4))
  assert.ok(studentNoProblem('11030', 4))
  assert.ok(studentNoProblem('1003', 4))
  assert.equal(studentNoProblem('10203', 5), null)
  assert.ok(studentNoProblem('1203', 5))
  assert.ok(studentNoProblem('10200', 5))
})

test('derive: midnight rollover and live page', () => {
  const doc = trip()
  doc.days[1].stops.push({ id: 'aaaaaa4', time: '23:30', end: '00:40', title: '야간 이동', kind: 'move' })
  doc.days[1].stops.push({ id: 'aaaaaa5', time: '00:50', dayShift: 1, title: '도착', kind: 'move' })
  const d = derive(doc)
  const night = d.stopPages.find((p) => p.stop.id === 'aaaaaa4')!
  const arrive = d.stopPages.find((p) => p.stop.id === 'aaaaaa5')!
  assert.equal(night.end!.getTime() - night.start.getTime(), 70 * 60000)
  assert.ok(arrive.start > night.start)
  const at = instant('2026-10-21', '10:30', 'Asia/Seoul')
  const live = pageAt(d, at)
  assert.equal(live.state, 'live')
  assert.equal(live.page?.stop.id, 'aaaaaa1')
  assert.equal(pageAt(d, instant('2026-10-20', '10:00', 'Asia/Seoul')).state, 'before')
})

test('abroad: home-zone stop uses home time', () => {
  const doc = emptyTrip({ title: '뉴욕', startDate: '2026-10-15', nights: 1, tz: 'America/New_York', studentIdDigits: 4 })
  doc.days[0].stops.push({ id: newId(), time: '10:00', zone: 'home', title: '인천공항 출발', kind: 'move', place: { name: '인천공항', coords: [126.44, 37.46] } })
  doc.days[0].stops.push({ id: newId(), time: '11:10', title: 'JFK 도착', kind: 'move', place: { name: 'JFK', coords: [-73.78, 40.64] }, leg: { mode: 'flight' } })
  const d = derive(doc)
  assert.ok(d.abroad)
  const [a, b] = d.stopPages
  assert.equal(a.start.toISOString(), '2026-10-15T01:00:00.000Z')
  assert.equal(b.start.toISOString(), '2026-10-15T15:10:00.000Z')
  assert.ok((b.crowKm ?? 0) > 10000)
})

test('body-only files keep titles that contain parentheses; renamed trips still match by place', () => {
  const doc = trip()
  doc.title = '경주 수학여행 (2학년)'
  const d = derive(doc)
  const data = buildFileData(d, 'trip123456', { no: '1103', name: '김가람' }, { aaaaaa1: { text: '탑', updatedAt: 'x' }, aaaaaa3: { text: '마을', updatedAt: 'y' } })
  const cut = buildReflectionText(d, data).split('\n').filter((l) => !l.startsWith(DATA_TAG)).join('\n')
  const r = parseReflectionFile(cut)
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.data.title, '경주 수학여행 (2학년)')
  const same = collect(d, 'trip123456', [{ name: 'a.txt', text: cut }])
  assert.equal(same.students.length, 1)
  assert.deepEqual(same.students[0].warnings.filter((w) => w.includes('제목')), [])
  const renamed = derive({ ...doc, title: '경주 수학여행 (최종)' })
  const c2 = collect(renamed, 'trip123456', [{ name: 'a.txt', text: cut }])
  assert.equal(c2.students.length, 1)
  assert.ok(c2.students[0].warnings.some((w) => w.includes('제목')))
})
