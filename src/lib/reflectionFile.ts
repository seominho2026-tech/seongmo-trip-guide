/**
 * 학생 '내 느낀 점' 파일(.txt).
 *
 * 사람이 그대로 읽을 수 있는 본문 + 맨 끝 한 줄의 데이터(DORMSTRIP1 …).
 * 선생님 '느낀 점 모으기'는 데이터 줄을 읽고, 그 줄이 지워졌으면 본문의 [일차 · 시각 · 장소] 머리로 다시 읽는다.
 * 휴대폰 메모 앱·카톡·클래스룸 어디서 열어도 깨지지 않게 그냥 글 파일로 둔다.
 */
import { z } from 'zod'
import type { Derived } from '../trip/derive'
import { DEFAULT_PROMPT, reflectStops } from '../trip/derive'
import { clock, dateLabel, longDate } from './time'
import type { Book, Me } from './reflections'

export const DATA_TAG = 'DORMSTRIP1'
const SEPARATOR = '----- 아래 줄은 선생님이 느낀 점을 모을 때 쓰는 정보예요. 지우거나 고치지 마세요 -----'

const Item = z.object({ s: z.string().max(20), d: z.number().int().min(1).max(40), t: z.string().max(120), q: z.string().max(200), a: z.string().max(3000), u: z.string().max(40) })
export const FileData = z.object({
  v: z.literal(1),
  trip: z.string().max(20),
  title: z.string().max(80),
  no: z.string().max(10),
  name: z.string().max(30),
  savedAt: z.string().max(40),
  items: z.array(Item).max(200),
})
export type FileData = z.infer<typeof FileData>

function toB64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64(s: string): string {
  const b = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

export function buildFileData(d: Derived, tripId: string, me: Me, book: Book, savedAt = new Date().toISOString()): FileData {
  const items = reflectStops(d)
    .filter((p) => book[p.stop.id]?.text.trim())
    .map((p) => ({
      s: p.stop.id,
      d: p.dayN,
      t: p.stop.place?.name ?? p.stop.title,
      q: p.stop.reflect?.prompt?.trim() || DEFAULT_PROMPT,
      a: book[p.stop.id].text.trim(),
      u: book[p.stop.id].updatedAt,
    }))
  return { v: 1, trip: tripId, title: d.doc.title, no: me.no, name: me.name.trim(), savedAt, items }
}

export function buildReflectionText(d: Derived, data: FileData): string {
  const lines: string[] = []
  lines.push('도름스 체험학습 · 느낀 점')
  lines.push(`여행: ${d.doc.title} (${longDate(d.doc.startDate)}부터 ${d.doc.nights}박 ${d.doc.nights + 1}일)`)
  lines.push(`학번: ${data.no}`)
  lines.push(`이름: ${data.name}`)
  const saved = clock(new Date(data.savedAt), d.doc.homeTz)
  lines.push(`저장한 때: ${saved.ymd} ${saved.time}`)
  lines.push('')
  const byStop = new Map(data.items.map((i) => [i.s, i]))
  let wrote = 0
  for (const p of reflectStops(d)) {
    const it = byStop.get(p.stop.id)
    if (!it) continue
    wrote++
    lines.push(`[${p.dayN}일차 · ${dateLabel(p.chapter.date!)} ${p.stop.time} · ${it.t}]`)
    lines.push(`질문: ${it.q}`)
    lines.push(it.a)
    lines.push('')
  }
  if (!wrote) lines.push('(아직 쓴 느낀 점이 없어요)', '')
  lines.push(SEPARATOR)
  lines.push(`${DATA_TAG} ${toB64(JSON.stringify(data))}`)
  return lines.join('\n') + '\n'
}

export function reflectionFilename(data: FileData): string {
  return `${data.no}_${data.name.replace(/[\\/:*?"<>|\s]/g, '')}_느낀점.txt`
}

export type ParseResult = { ok: true; data: FileData; fromText: boolean } | { ok: false; reason: string }

/** 파일 글을 읽는다. 데이터 줄이 있으면 그것을, 없으면 본문을 읽는다. */
export function parseReflectionFile(text: string): ParseResult {
  const clean = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const m = clean.match(new RegExp(`^${DATA_TAG} ([A-Za-z0-9_-]+)\\s*$`, 'm'))
  if (m) {
    try {
      const data = FileData.parse(JSON.parse(fromB64(m[1])))
      return { ok: true, data, fromText: false }
    } catch {
      /* 데이터 줄이 망가졌으면 본문으로 */
    }
  }
  return parseBody(clean)
}

function parseBody(text: string): ParseResult {
  if (!text.startsWith('도름스 체험학습 · 느낀 점')) return { ok: false, reason: '도름스 체험학습 느낀 점 파일이 아니에요.' }
  const head = (label: string) => text.match(new RegExp(`^${label}: (.+)$`, 'm'))?.[1]?.trim() ?? ''
  const no = head('학번')
  const name = head('이름')
  // 끝에 붙인 「 (2026. 10. 21.(수)부터 2박 3일)」만 뗀다(제목 안의 괄호는 그대로)
  const title = head('여행').replace(/ \(\d{4}\. \d{1,2}\. \d{1,2}\.\([^)]\)부터 \d+박 \d+일\)$/, '')
  if (!no || !name) return { ok: false, reason: '학번이나 이름 줄이 지워졌어요.' }
  const lines = text.split(SEPARATOR)[0].split('\n')
  const items: FileData['items'] = []
  const sectionHead = /^\[(\d+)일차 · [^·\]]* · (.+)\]$/
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(sectionHead)
    if (!m) continue
    const q = lines[i + 1]?.startsWith('질문: ') ? lines[i + 1].slice(4).trim() : ''
    const start = q ? i + 2 : i + 1
    let end = start
    while (end < lines.length && !sectionHead.test(lines[end])) end++
    const a = lines.slice(start, end).join('\n').trim()
    if (a) items.push({ s: '', d: Number(m[1]), t: m[2].trim(), q, a, u: '' })
    i = end - 1
  }
  // 본문으로 읽은 것도 데이터 줄과 같은 길이 한도를 지킨다(손으로 늘린 파일이 표를 부풀리지 않게)
  const checked = FileData.safeParse({ v: 1, trip: '', title: title.slice(0, 80), no, name, savedAt: '', items: items.slice(0, 200) })
  if (!checked.success) return { ok: false, reason: '파일 내용이 너무 길거나 모양이 맞지 않아요.' }
  return { ok: true, data: checked.data, fromText: true }
}
