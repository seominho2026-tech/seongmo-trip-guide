import { useRef, useState } from 'react'
import { rich } from '../../components/Rich'
import { Icon } from '../../components/Icon'
import { reflectStops, type GuidePage } from '../../trip/derive'
import { useTrip } from '../../trip/context'
import { goTo, navigate } from '../../lib/router'
import { clock, daysUntil, dateLabel } from '../../lib/time'
import { useStored } from '../../lib/storage'
import { useBook, useMe } from '../../lib/reflections'
import { buildFileData, buildReflectionText, parseReflectionFile, reflectionFilename } from '../../lib/reflectionFile'
import { giveFile } from '../../lib/download'
import { Body, Section } from './parts'
import { IdentityForm } from './Identity'

export function GuideView({ page }: { page: GuidePage }) {
  if (page.kind === 'cover') return <Cover />
  if (page.kind === 'before') return <Before />
  return <After />
}

function Cover() {
  const { d, doc, at, role, tripId, sample } = useTrip()
  const dday = daysUntil(doc.startDate, at, doc.homeTz)
  const today = clock(at, doc.tz).ymd
  const during = today >= doc.startDate && today <= d.endDate
  const days = d.chapters.filter((c) => c.date)
  return (
    <article className="page">
      <div className="cover">
        <div className="cover__hero">
          <p className="cover__title">
            {doc.school ? <span className="cover__school">{doc.school}</span> : null}
            <span className="cover__name">{rich(doc.title)}</span>
            <span className="cover__ko">
              {dateLabel(doc.startDate)}–{dateLabel(d.endDate)} · <span className="nowrap">{doc.nights ? `${doc.nights}박 ${doc.nights + 1}일` : '당일'}</span>
            </span>
          </p>
          <p className="cover__count mono">{dday > 0 ? `D-${dday}` : dday === 0 ? '오늘 출발' : during ? '여행 중' : '다녀왔어요'}</p>
        </div>
        {doc.summary?.trim() ? <p className="lead cover__lead">{rich(doc.summary)}</p> : null}
        <ol className="cover__days">
          {days.map((c) => (
            <li key={c.n}>
              <button type="button" onClick={() => goTo(c.pages[0].key)}>
                <span className="cover__day-n mono">{String(c.n).padStart(2, '0')}</span>
                <span className="cover__day-date mono">
                  {c.date!.slice(5).replace('-', '/')} {c.weekday}
                </span>
                <span className="cover__day-title">{rich(c.title)}</span>
                <Icon name="chevronRight" size="1rem" />
              </button>
            </li>
          ))}
        </ol>
      </div>
      {role === 'teacher' && !sample && tripId ? (
        <div className="teacher-entry">
          <button type="button" className="btn btn--primary" onClick={() => navigate(`/t/${tripId}/edit`)}>
            <Icon name="pen" size="1.1rem" /> 안내 고치기
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => navigate(`/t/${tripId}/collect`)}>
            <Icon name="upload" size="1.1rem" /> 느낀 점 모으기
          </button>
        </div>
      ) : null}
      {role === 'student' && reflectStops(d).length ? <StudentHint /> : null}
      <HomeScreenHint />
    </article>
  )
}

function StudentHint() {
  const { scope } = useTrip()
  const [me] = useMe(scope)
  const [editing, setEditing] = useState(false)
  if (me && !editing)
    return (
      <p className="whoami">
        <Icon name="user" size="1rem" />
        <span>
          <span className="mono">{me.no}</span> {me.name}
        </span>
        <button type="button" className="link-btn" onClick={() => setEditing(true)}>
          고치기
        </button>
      </p>
    )
  return (
    <Section title="느낀 점을 쓰려면" icon="user">
      <IdentityForm onDone={() => setEditing(false)} />
    </Section>
  )
}

/** 홈 화면에 추가하면 아이폰이 오래 안 연 사이트의 저장 내용을 지우지 않는다 */
function HomeScreenHint() {
  const standalone = typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone)
  if (standalone) return null
  return (
    <p className="fineprint home-hint">
      <Icon name="home" size="0.95rem" /> 휴대폰 홈 화면에 추가해 두면 앱처럼 바로 열려요. 인터넷이 약한 곳에서도 이미 본 안내는 그대로 보여요. 아이폰은 공유 단추에서 「홈 화면에 추가」, 안드로이드는 메뉴에서 「홈 화면에 추가」를 눌러요.
    </p>
  )
}

function Before() {
  const { doc, scope } = useTrip()
  const [checks, setChecks] = useStored<Record<string, boolean>>(`checklist:${scope}`, {})
  const items = doc.before.checklist
  const done = items.filter((c) => checks[c]).length
  return (
    <article className="page">
      <header className="page__head">
        <h1 className="page__title">출발 전에 챙겨요</h1>
      </header>
      {doc.before.notes.trim() ? (
        <Section title="안내" icon="info">
          <Body text={doc.before.notes} />
        </Section>
      ) : null}
      {items.length ? (
        <Section title="챙길 것" icon="bag">
          <div className="checklist" data-noswipe>
            <div className="checklist__progress">
              <span className="mono">
                {done} / {items.length}
              </span>
              <span className="checklist__bar" aria-hidden="true">
                <span style={{ transform: `scaleX(${items.length ? done / items.length : 0})` }} />
              </span>
              <span className="sr-only">
                {items.length}개 가운데 {done}개 챙겼어요
              </span>
            </div>
            <div className="checklist__group">
              {items.map((c) => (
                <label key={c} className="check" data-done={checks[c] || undefined}>
                  <input type="checkbox" checked={!!checks[c]} onChange={(e) => setChecks((x) => ({ ...x, [c]: e.target.checked }))} />
                  <span className="check__box" aria-hidden="true">
                    <Icon name="check" size="0.9rem" strokeWidth={2.4} />
                  </span>
                  <span className="check__text">
                    <span className="check__label">{rich(c)}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="fineprint">체크한 것은 이 휴대폰에만 저장돼요.</p>
          </div>
        </Section>
      ) : null}
    </article>
  )
}

function After() {
  const { doc, role, tripId, sample } = useTrip()
  return (
    <article className="page">
      <header className="page__head">
        <h1 className="page__title">다녀와서</h1>
      </header>
      {doc.after.notes.trim() ? (
        <Section title="안내" icon="info">
          <Body text={doc.after.notes} />
        </Section>
      ) : null}
      {role === 'student' ? <MyReflections /> : null}
      {role === 'teacher' && tripId && !sample ? (
        <Section title="느낀 점 모으기" icon="upload">
          <p className="body-text">학생들이 낸 느낀 점 파일을 한꺼번에 올리면 살핌에 바로 올릴 수 있는 엑셀 파일 하나로 바꿔 드려요.</p>
          <button type="button" className="btn btn--primary btn--block" onClick={() => navigate(`/t/${tripId}/collect`)}>
            <Icon name="upload" size="1.1rem" /> 느낀 점 모으기
          </button>
        </Section>
      ) : null}
      {role === 'guardian' ? <p className="fineprint">학생이 쓴 느낀 점은 학생 휴대폰에만 저장돼요. 다녀와서 학생이 파일로 선생님께 내요.</p> : null}
    </article>
  )
}

function MyReflections() {
  const { d, scope, tripId, doc } = useTrip()
  const [me] = useMe(scope)
  const [book, , setBook] = useBook(scope)
  const [msg, setMsg] = useState<string | null>(null)
  const [lastSaved, setLastSaved] = useStored<string | null>(`file-saved:${scope}`, null)
  const fileRef = useRef<HTMLInputElement>(null)
  const qs = reflectStops(d)
  const written = qs.filter((p) => book[p.stop.id]?.text.trim()).length

  if (!qs.length) return <p className="fineprint">이 여행은 느낀 점을 받지 않아요.</p>

  return (
    <Section title="내 느낀 점 내기" icon="pen">
      {!me ? (
        <>
          <p className="body-text">먼저 학번과 이름을 적어 주세요.</p>
          <IdentityForm />
        </>
      ) : (
        <div className="mine" data-noswipe>
          <p className="mine__count">
            <span className="mono">{written}</span> / <span className="mono">{qs.length}</span>곳 썼어요
          </p>
          <ol className="mine__list">
            {qs.map((p) => (
              <li key={p.key}>
                <button type="button" onClick={() => goTo(p.key)} data-done={!!book[p.stop.id]?.text.trim() || undefined}>
                  <span className="mine__mark" aria-hidden="true">
                    {book[p.stop.id]?.text.trim() ? <Icon name="check" size="0.85rem" strokeWidth={2.4} /> : null}
                  </span>
                  <span className="mono mine__day">{p.dayN}일차</span>
                  <span className="mine__name">{p.stop.place?.name ?? p.stop.title}</span>
                  <span className="sr-only">{book[p.stop.id]?.text.trim() ? '씀' : '아직 안 씀'}</span>
                </button>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={!written}
            onClick={async () => {
              const data = buildFileData(d, tripId ?? 'sample', me, book)
              const text = buildReflectionText(d, data)
              const r = await giveFile(new Blob(['﻿' + text], { type: 'text/plain;charset=utf-8' }), reflectionFilename(data))
              if (r !== 'cancelled') {
                const stamp = new Date().toISOString()
                setLastSaved(stamp)
                setMsg(r === 'shared' ? '보냈어요. 선생님이 알려 준 곳(클래스룸 등)에 냈는지 확인해 주세요.' : '파일을 받았어요. 선생님이 알려 준 곳(클래스룸 등)에 올려 주세요.')
              }
            }}
          >
            <Icon name="download" size="1.1rem" /> 내 느낀 점 저장
          </button>
          {lastSaved ? <p className="fineprint">마지막으로 저장한 때 {clock(new Date(lastSaved), doc.homeTz).ymd} {clock(new Date(lastSaved), doc.homeTz).time}. 저장한 뒤 더 쓰면 다시 저장해 내요.</p> : null}
          {msg ? (
            <p className="form-ok" role="status">
              {msg}
            </p>
          ) : null}
          <p className="fineprint">
            파일 이름은 학번_이름_느낀점.txt예요. 휴대폰 메모처럼 열어 읽을 수 있어요. 아이폰은 오랫동안 이 안내를 열지 않으면 저장한 글이 지워질 수 있으니, 다녀오면 바로 저장해서 내 주세요.
          </p>
          <button type="button" className="link-btn" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size="1rem" /> 다른 휴대폰에서 저장한 파일 불러오기
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,text/plain"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              if (f.size > 500_000) return setMsg('파일이 너무 커요.')
              const r = parseReflectionFile(await f.text())
              if (!r.ok) return setMsg(r.reason)
              if (r.data.trip && r.data.trip !== (tripId ?? 'sample')) return setMsg('다른 여행의 파일이에요.')
              // 다른 학생의 파일이면 내 이름으로 합쳐지기 전에 한 번 묻는다
              const sameStudent = !me?.no || ((r.data.no || me.no) === me.no && (r.data.name.trim() || me.name.trim()) === me.name.trim())
              if (!sameStudent && !window.confirm(`이 파일은 ${r.data.no} ${r.data.name.trim()} 학생의 느낀 점이에요. 내 느낀 점으로 불러올까요?`)) return setMsg('불러오지 않았어요.')
              const next = { ...book }
              let n = 0
              for (const it of r.data.items) {
                const p = qs.find((q) => (it.s ? q.stop.id === it.s : q.dayN === it.d && (q.stop.place?.name ?? q.stop.title) === it.t))
                if (p && !next[p.stop.id]?.text.trim()) {
                  next[p.stop.id] = { text: it.a, updatedAt: it.u || new Date().toISOString() }
                  n++
                }
              }
              setBook(next)
              setMsg(n ? `${n}곳의 느낀 점을 불러왔어요. 이 휴대폰에 이미 쓴 곳은 그대로 두었어요.` : '새로 불러올 느낀 점이 없어요.')
            }}
          />
        </div>
      )}
    </Section>
  )
}
