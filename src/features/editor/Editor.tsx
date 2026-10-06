import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon, KIND_ICON } from '../../components/Icon'
import { ApiFail, checkToken, fetchTrip, getToken, rememberTrip, saveTrip, setToken, type Loaded } from '../../lib/api'
import { navigate } from '../../lib/router'
import { readStored, writeStored } from '../../lib/storage'
import { fillRoutes, pendingRoutes } from '../../lib/routing'
import { findPii, PII_LABEL } from '../../lib/pii'
import { addDays, clock, dateLabel, zoneName } from '../../lib/time'
import { derive, stopKey } from '../../trip/derive'
import { newId, resizeDays, TripDoc, type Stop, type TripDoc as TripDocT } from '../../trip/schema'
import { orderStops } from '../../trip/order'
import { TripMap } from '../map/TripMap'
import { Dialog } from '../../components/Dialog'
import { TopBar } from './TopBar'
import { UnlockForm } from './UnlockForm'
import { StopForm } from './StopForm'
import { ShareSheet } from './ShareSheet'
import { SettingsSheet } from './SettingsSheet'
import { InfoPanel, NotesPanel, NoticesPanel } from './Panels'
import { normalizeDoc } from './normalize'
import type { LngLat } from '../../lib/geo'

type Tab = { kind: 'info' } | { kind: 'before' } | { kind: 'after' } | { kind: 'notices' } | { kind: 'day'; i: number }
type Draft = { doc: TripDocT; baseEtag: string; at: string }

const tabKey = (t: Tab) => (t.kind === 'day' ? `day-${t.i}` : t.kind)

export default function Editor({ id }: { id: string }) {
  const [token, setTok] = useState<string | null>(() => getToken(id))
  const [auth, setAuth] = useState<'checking' | 'ok' | 'need'>(() => (getToken(id) ? 'checking' : 'need'))
  const [server, setServer] = useState<Loaded | null>(null)
  /** 편집 열쇠로 원본에서 받은 안내인지(캐시된 안내로 편집을 시작하지 않는다) */
  const [freshLoaded, setFreshLoaded] = useState(false)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [draft, setDraft] = useState<TripDocT | null>(null)
  const [baseEtag, setBaseEtag] = useState('')
  /** 이 기기에 남은 저장 안 한 고침을 이어 보여 주는 중인지. stale: 그 사이 다른 기기에서 저장함 */
  const [restored, setRestored] = useState<false | 'same' | 'stale'>(false)
  const [tab, setTab] = useState<Tab>({ kind: 'day', i: 0 })
  const [openStop, setOpenStop] = useState<string | null>(null)
  const [sheet, setSheet] = useState<'share' | 'settings' | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [conflict, setConflict] = useState<Loaded | null>(null)
  const [mapOpen, setMapOpen] = useState(false)
  const saveRef = useRef<HTMLButtonElement>(null)
  const statusRef = useRef<HTMLParagraphElement>(null)
  /** 최근 틀린 PIN 시도(선생님이 모르는 시도를 알아챌 수 있게) */
  const [wrongPins, setWrongPins] = useState(0)
  const [pinLocked, setPinLocked] = useState(false)

  // 최신 안내 받기: 편집 열쇠가 확인되면 원본에서(캐시를 거치지 않고), 그 전에는 제목만 보려고 보통으로
  useEffect(() => {
    const fresh = auth === 'ok'
    fetchTrip(id, fresh, fresh ? token : null)
      .then((r) => {
        setServer(r)
        if (fresh) setFreshLoaded(true)
      })
      .catch((e: ApiFail) => setLoadErr(e.message))
  }, [id, auth, token])

  // 편집 열쇠가 살아 있는지
  useEffect(() => {
    if (!token) return setAuth('need')
    checkToken(id, token)
      .then((r) => {
        setWrongPins(r.wrongPins ?? 0)
        setPinLocked(!!r.pinLocked)
        setAuth('ok')
      })
      .catch((e: ApiFail) => {
        if (e.status === 0) setAuth('ok')
        else {
          setToken(id, null)
          setTok(null)
          setAuth('need')
        }
      })
  }, [id, token])

  // 편집 시작: 이 기기에 저장 안 한 고침이 남아 있으면 이어서
  useEffect(() => {
    if (auth !== 'ok' || !server || !freshLoaded || draft) return
    // 비워 둔 칸이 있어도(저장 검사는 저장할 때만) 고친 내용은 살린다. 모양이 아예 깨진 것만 버린다.
    const local = readStored<Draft | null>(`draft:${id}`, null)
    const localNorm = local ? safeNormalize(local.doc) : null
    if (local && localNorm && JSON.stringify(localNorm) !== JSON.stringify(server.doc)) {
      setDraft(local.doc)
      const stale = local.baseEtag !== server.etag
      setRestored(stale ? 'stale' : 'same')
      // 다른 기기가 그 뒤 저장했으면 옛 판을 기준으로 두어, 저장할 때 어느 쪽을 남길지 묻게 한다
      setBaseEtag(stale ? local.baseEtag : server.etag)
    } else {
      setDraft(server.doc)
      setBaseEtag(server.etag)
    }
    rememberTrip({ id, title: server.doc.title, startDate: server.doc.startDate })
    const first = server.doc.days.findIndex((d) => d.stops.length === 0)
    setTab({ kind: 'day', i: first >= 0 && server.doc.days.every((d, i) => i >= first || d.stops.length) ? first : 0 })
  }, [auth, server, freshLoaded, draft, id])

  const update = (fn: (d: TripDocT) => TripDocT) =>
    setDraft((prev) => {
      if (!prev) return prev
      const next = fn(prev)
      writeStored<Draft>(`draft:${id}`, { doc: next, baseEtag, at: new Date().toISOString() })
      return next
    })

  const normalized = useMemo(() => (draft ? normalizeDoc(draft) : null), [draft])
  const dirty = !!(normalized && server && JSON.stringify(normalized) !== JSON.stringify(server.doc))
  const d = useMemo(() => (normalized ? derive(normalized) : null), [normalized])

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // 옛 Safari·Firefox 는 이 값이 있어야 나가기 전 확인을 띄운다
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const save = async (overrideEtag?: string) => {
    if (!normalized || !token) return
    setSaveMsg(null)
    const parsed = TripDoc.safeParse(normalized)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const where = issueStop(normalized, issue.path)
      if (where) {
        setTab({ kind: 'day', i: where.day })
        setOpenStop(where.id)
      }
      return setSaveMsg({ ok: false, text: `저장하지 못했어요. ${describeIssue(normalized, issue.path, issue.code)}` })
    }
    const pii = findPii(parsed.data)
    if (pii.length) return setSaveMsg({ ok: false, text: `${pii[0].where}에 ${PII_LABEL[pii[0].kind]}(${pii[0].sample})로 보이는 글이 있어요. 링크만 있으면 누구나 보는 안내라 빼고 저장해 주세요.` })
    const snapshot = JSON.stringify(normalized)
    try {
      const total = pendingRoutes(parsed.data)
      setSaving(total ? `길 계산 0/${total}` : '저장 중')
      const { doc, failed } = await fillRoutes(parsed.data, (done, all) => all && setSaving(`길 계산 ${done}/${all}`))
      setSaving('저장 중')
      const r = await saveTrip(id, token, doc, overrideEtag ?? baseEtag)
      const fresh: Loaded = { doc, etag: r.etag, updatedAt: r.updatedAt }
      setServer(fresh)
      // 저장하는 동안 더 고쳤으면 그 고침은 화면과 이 기기에 남긴다(다음 저장 때 길을 다시 계산한다)
      setDraft((cur) => {
        const more = !!cur && JSON.stringify(safeNormalize(cur)) !== snapshot
        writeStored<Draft | null>(`draft:${id}`, more && cur ? { doc: cur, baseEtag: r.etag, at: new Date().toISOString() } : null)
        return more && cur ? cur : doc
      })
      setBaseEtag(r.etag)
      setRestored(false)
      setConflict(null)
      writeStored(`doc-cache:${id}`, fresh)
      rememberTrip({ id, title: doc.title, startDate: doc.startDate })
      setSaveMsg({ ok: true, text: failed ? `저장했어요. 길 ${failed}곳은 계산하지 못해 직선으로 보여요.` : '저장했어요. 학생 화면에는 늦어도 15초 안에 바뀌어요.' })
    } catch (e) {
      const f = e as ApiFail
      if (f.code === 'conflict') {
        const latest = await fetchTrip(id, true, token).catch(() => null)
        setConflict(latest)
      } else if (f.status === 401) {
        setToken(id, null)
        setTok(null)
        setAuth('need')
      } else setSaveMsg({ ok: false, text: f.message ?? '저장하지 못했어요.' })
    } finally {
      setSaving(null)
    }
  }

  if (loadErr)
    return (
      <div className="screen">
        <TopBar title="여행 고치기" back={() => navigate('/')} />
        <main className="lone">
          <div className="lone__card">
            <h1 className="lone__title">안내를 불러오지 못했어요</h1>
            <p className="lone__text">{loadErr}</p>
          </div>
        </main>
      </div>
    )

  if (auth === 'need')
    return (
      <div className="screen">
        <TopBar title="여행 고치기" back={() => navigate(`/t/${id}`)} />
        <UnlockForm
          id={id}
          title={server?.doc.title ?? null}
          trip={server ? { startDate: server.doc.startDate, nights: server.doc.nights } : null}
          onOpen={(t) => {
            setTok(t)
            setAuth('ok')
          }}
        />
      </div>
    )

  if (auth === 'checking' || !server || !draft || !d || !normalized) return <div className="boot" aria-busy="true" />

  const dayIdx = tab.kind === 'day' ? tab.i : -1
  const day = dayIdx >= 0 ? draft.days[dayIdx] : null
  const previewPage = (openStop && d.pageByKey.get(stopKey(openStop))) || (dayIdx >= 0 ? d.pageByKey.get(`day-${dayIdx + 1}`) : null) || d.pages[0]

  // 지도 찾기 기준: 고르는 일정의 앞 장소, 없으면 여행의 아무 장소
  const anyPlace = d.stopPages.find((p) => p.stop.place)?.stop.place?.coords as LngLat | undefined
  const nearFor = (s: Stop): LngLat | null => {
    const page = d.pageByKey.get(stopKey(s.id))
    const from = page?.type === 'stop' ? (page.from?.stop.place?.coords as LngLat | undefined) : undefined
    return from ?? anyPlace ?? null
  }

  const setStop = (di: number, s: Stop) => update((doc) => ({ ...doc, days: doc.days.map((dd, i) => (i === di ? { ...dd, stops: dd.stops.map((x) => (x.id === s.id ? s : x)) } : dd)) }))
  const addStop = (di: number) => {
    const stops = orderStops(draft, di, draft.days[di].stops)
    const last = stops[stops.length - 1]
    const base = last?.end ?? last?.time
    const time = base ? `${String(Math.min(23, Number(base.slice(0, 2)) + (last?.end ? 0 : 1))).padStart(2, '0')}:${base.slice(3)}` : '09:00'
    const s: Stop = { id: newId(), time, title: '새 일정', kind: 'activity', ...(last?.place ? { leg: { mode: 'bus' as const } } : {}) }
    update((doc) => ({ ...doc, days: doc.days.map((dd, i) => (i === di ? { ...dd, stops: [...dd.stops, s] } : dd)) }))
    setOpenStop(s.id)
  }
  const removeStop = (di: number, sid: string) => {
    if (!window.confirm('이 일정을 지울까요? 학생이 이미 이 장소에 느낀 점을 썼다면 그 글은 모을 때 빠져요.')) return
    update((doc) => ({ ...doc, days: doc.days.map((dd, i) => (i === di ? { ...dd, stops: dd.stops.filter((x) => x.id !== sid) } : dd)) }))
    setOpenStop(null)
  }
  const moveStop = (from: number, to: number, sid: string) => {
    if (from === to) return
    update((doc) => {
      const s = doc.days[from].stops.find((x) => x.id === sid)!
      return { ...doc, days: doc.days.map((dd, i) => (i === from ? { ...dd, stops: dd.stops.filter((x) => x.id !== sid) } : i === to ? { ...dd, stops: [...dd.stops, s] } : dd)) }
    })
    setTab({ kind: 'day', i: to })
  }
  const setNights = (n: number) => {
    const lost = draft.days.slice(n + 1).reduce((k, dd) => k + dd.stops.length, 0)
    if (lost && !window.confirm(`${n + 2}일차부터 일정 ${lost}개가 지워져요. 줄일까요?`)) return
    update((doc) => resizeDays(doc, n))
    if (tab.kind === 'day' && tab.i > n) setTab({ kind: 'day', i: n })
  }

  const tabs: { t: Tab; label: string; sub?: string }[] = [
    { t: { kind: 'info' }, label: '여행 정보' },
    { t: { kind: 'before' }, label: '출발 전' },
    ...draft.days.map((dd, i) => ({ t: { kind: 'day', i } as Tab, label: `${i + 1}일차`, sub: `${dateLabel(addDays(draft.startDate, i))} · ${dd.stops.length}개` })),
    { t: { kind: 'after' }, label: '다녀와서' },
    { t: { kind: 'notices' }, label: '공지', sub: draft.announcements.length ? `${draft.announcements.length}개` : undefined },
  ]

  return (
    <div className="editor">
      <TopBar title={<span className="editor__title">{draft.title || '제목 없는 여행'}</span>} back={() => navigate(`/t/${id}`)}>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSheet('share')} aria-label="학생·보호자에게 나눠 주기">
          <Icon name="qr" size="1.05rem" /> <span className="hide-sm">나눠 주기</span>
        </button>
        <button type="button" className="icon-btn" onClick={() => setSheet('settings')} aria-label="설정">
          <Icon name="settings" />
        </button>
      </TopBar>

      <p className="pii-bar" role="note">
        <Icon name="shield" size="1rem" /> 학생·교사 이름, 휴대전화 번호, 건강 정보, 방·좌석 배정은 넣지 마세요. 링크만 있으면 누구나 봐요.
      </p>
      {pinLocked ? (
        <p className="restore-bar" role="status">
          PIN이 너무 여러 번 틀려 잠겼어요. 이 기기에서는 계속 고칠 수 있지만, 다른 기기에서 열려면 복구 코드로 새 PIN을 정해야 해요. 같은 PIN으로 다시 정해도 돼요.
        </p>
      ) : wrongPins >= 5 ? (
        <p className="restore-bar" role="status">
          최근 이 여행의 PIN이 {wrongPins}번 틀렸어요. 함께 쓰는 선생님이 틀린 게 아니라면 설정에서 PIN을 바꿔 주세요.
        </p>
      ) : null}
      {restored ? (
        <p className="restore-bar" role="status">
          {restored === 'stale' ? '지난번에 저장하지 않은 고침을 이어서 보여 줘요. 그 뒤 다른 기기에서 안내를 저장했으니, 저장할 때 어느 쪽을 남길지 골라 주세요.' : '지난번에 저장하지 않은 고침을 이어서 보여 줘요.'}
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setDraft(server.doc)
              setBaseEtag(server.etag)
              writeStored(`draft:${id}`, null)
              setRestored(false)
            }}
          >
            버리고 저장된 안내로
          </button>
        </p>
      ) : null}

      <div className="editor__grid">
        <nav className="editor__tabs" aria-label="고칠 곳">
          {tabs.map(({ t, label, sub }) => (
            <button key={tabKey(t)} type="button" className="etab" aria-current={tabKey(t) === tabKey(tab) ? 'page' : undefined} onClick={() => (setTab(t), setOpenStop(null))}>
              <span className="etab__label">{label}</span>
              {sub ? <span className="etab__sub mono">{sub}</span> : null}
            </button>
          ))}
        </nav>

        <section className="editor__main">
          {tab.kind === 'info' ? <InfoPanel doc={draft} onChange={(patch) => update((doc) => ({ ...doc, ...patch }))} onNights={setNights} /> : null}
          {tab.kind === 'before' ? <NotesPanel kind="before" doc={draft} onChange={(patch) => update((doc) => ({ ...doc, ...patch }))} /> : null}
          {tab.kind === 'after' ? <NotesPanel kind="after" doc={draft} onChange={(patch) => update((doc) => ({ ...doc, ...patch }))} /> : null}
          {tab.kind === 'notices' ? <NoticesPanel doc={draft} onChange={(announcements) => update((doc) => ({ ...doc, announcements }))} /> : null}
          {day ? (
            <div className="dayed">
              <header className="dayed__head">
                <h2 className="dayed__title">
                  {dayIdx + 1}일차 <span className="mono dayed__date">{dateLabel(addDays(draft.startDate, dayIdx))}</span>
                </h2>
                <input
                  className="input"
                  maxLength={60}
                  placeholder="이날 제목(비우면 장소 이름으로 채워요)"
                  value={day.title ?? ''}
                  onChange={(e) => update((doc) => ({ ...doc, days: doc.days.map((dd, i) => (i === dayIdx ? { ...dd, title: e.target.value || undefined } : dd)) }))}
                  aria-label={`${dayIdx + 1}일차 제목`}
                />
              </header>
              <button type="button" className="btn btn--ghost btn--block map-peek" onClick={() => setMapOpen(!mapOpen)}>
                <Icon name="pin" size="1rem" /> {mapOpen ? '지도 접기' : '지도 보기'}
              </button>
              {day.stops.length ? (
                <ol className="stoplist">
                  {orderStops(draft, dayIdx, day.stops).map((s) => {
                    const open = openStop === s.id
                    const firstPlaced = d.stopPages.find((p) => p.stop.place)?.stop.id === s.id
                    return (
                      <li key={s.id} className="stoplist__item" data-open={open || undefined}>
                        <button type="button" className="stoprow" aria-expanded={open} onClick={() => setOpenStop(open ? null : s.id)}>
                          <span className="stoprow__time mono">
                            {s.time}
                            {s.zone === 'home' || s.dayShift ? (
                              <span className="stoprow__tag">
                                {s.zone === 'home' ? zoneName(draft.homeTz) : ''}
                                {s.zone === 'home' && s.dayShift ? ' ' : ''}
                                {s.dayShift ? `+${s.dayShift}일` : ''}
                              </span>
                            ) : null}
                          </span>
                          <span className="stoprow__icon" aria-hidden="true">
                            <Icon name={KIND_ICON[s.kind]} size="0.95rem" />
                          </span>
                          <span className="stoprow__body">
                            <span className="stoprow__title">{s.title || '활동명 없음'}</span>
                            <span className="stoprow__place">{s.place ? s.place.name : '장소 없음'}</span>
                          </span>
                          {s.reflect?.on ? (
                            <span className="stoprow__badge" title="느낀 점 받음">
                              <Icon name="pen" size="0.85rem" />
                              <span className="sr-only">느낀 점 받음</span>
                            </span>
                          ) : null}
                          <Icon name={open ? 'chevronUp' : 'chevronDown'} size="1rem" />
                        </button>
                        {open ? (
                          <StopForm
                            stop={s}
                            dayIndex={dayIdx}
                            dayCount={draft.days.length}
                            when={draft}
                            near={nearFor(s)}
                            first={firstPlaced}
                            onChange={(ns) => setStop(dayIdx, ns)}
                            onDelete={() => removeStop(dayIdx, s.id)}
                            onMove={(to) => moveStop(dayIdx, to, s.id)}
                          />
                        ) : null}
                      </li>
                    )
                  })}
                </ol>
              ) : (
                <p className="empty-note">아직 이날 일정이 없어요. 아래에서 첫 일정을 넣어 주세요.</p>
              )}
              <button type="button" className="btn btn--primary btn--block" onClick={() => addStop(dayIdx)}>
                <Icon name="plus" size="1.1rem" /> 일정 더하기
              </button>
            </div>
          ) : null}
        </section>

        <aside className="editor__map" data-open={mapOpen || undefined} aria-label="지도 미리 보기">
          <TripMap d={d} page={previewPage} onSelect={(k) => setOpenStop(k.replace(/^s-/, ''))} />
        </aside>
      </div>

      <div className="savebar" role="region" aria-label="저장">
        <p className="savebar__status" aria-live="polite" ref={statusRef} tabIndex={-1}>
          {saving ? (
            <span className="mono">{saving}</span>
          ) : saveMsg ? (
            <span data-bad={!saveMsg.ok || undefined}>{saveMsg.text}</span>
          ) : dirty ? (
            '저장하지 않은 고침이 있어요'
          ) : (
            <>저장된 안내 · {clock(new Date(server.updatedAt), draft.homeTz).time} 저장</>
          )}
        </p>
        <button ref={saveRef} type="button" className="btn btn--primary" disabled={!dirty || !!saving} onClick={() => void save()}>
          <Icon name="check" size="1.1rem" /> 저장
        </button>
      </div>

      {conflict ? (
        <Dialog
          title="다른 선생님이 먼저 고쳤어요"
          onClose={() => setConflict(null)}
          returnTo={() => (saveRef.current && !saveRef.current.disabled ? saveRef.current : statusRef.current)}
          foot={
            <>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setServer(conflict)
                  setDraft(conflict.doc)
                  setBaseEtag(conflict.etag)
                  writeStored(`draft:${id}`, null)
                  setRestored(false)
                  setConflict(null)
                  setSaveMsg({ ok: true, text: '최신 안내를 불러왔어요.' })
                }}
              >
                내 고침 버리고 최신 불러오기
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  setBaseEtag(conflict.etag)
                  void save(conflict.etag)
                }}
              >
                내 고침으로 저장
              </button>
            </>
          }
        >
          <p className="body-text">{clock(new Date(conflict.updatedAt), draft.homeTz).time}에 다른 기기에서 안내를 저장했어요. 내 고침으로 덮어쓸지, 내 고침을 버리고 최신 안내를 불러올지 골라 주세요. 창을 닫으면 지금 고침은 그대로 두고 나중에 정할 수 있어요.</p>
        </Dialog>
      ) : null}

      {sheet === 'share' ? <ShareSheet id={id} doc={server.doc} onClose={() => setSheet(null)} /> : null}
      {sheet === 'settings' && token ? <SettingsSheet id={id} token={token} title={server.doc.title} trip={{ startDate: server.doc.startDate, nights: server.doc.nights }} onToken={setTok} onClose={() => setSheet(null)} /> : null}
    </div>
  )
}

/** 모양이 깨진 초안이면 null(복원하지 않는다) */
function safeNormalize(doc: TripDocT): TripDocT | null {
  try {
    const n = normalizeDoc(doc)
    return Array.isArray(n.days) && typeof n.title === 'string' ? n : null
  } catch {
    return null
  }
}

/** 저장 검사에 걸린 칸이 일정 안에 있으면 그 일정 */
function issueStop(doc: TripDocT, path: PropertyKey[]): { day: number; id: string } | null {
  const [a, day, b, si] = path
  if (a !== 'days' || typeof day !== 'number' || b !== 'stops' || typeof si !== 'number') return null
  const s = doc.days[day]?.stops[si]
  return s ? { day, id: s.id } : null
}

const FIELD: Record<string, string> = {
  title: '활동명',
  time: '시작 시각',
  end: '끝 시각',
  name: '장소 이름',
  address: '주소',
  note: '오는 길 설명',
  minutes: '걸리는 시간',
  body: '안내사항',
  rules: '꼭 지킬 것',
  prompt: '느낀 점 질문',
}

/** 저장 검사에 걸린 칸을 선생님이 찾아갈 수 있는 말로(어느 날 어느 일정의 어느 칸) */
function describeIssue(doc: TripDocT, path: PropertyKey[], code: string): string {
  const ask = (field: string) => (code === 'too_big' ? `「${field}」 칸이 너무 길어요. 줄여 주세요.` : code === 'too_small' ? `「${field}」 칸을 채워 주세요.` : `「${field}」 칸을 확인해 주세요.`)
  const [a, b, c, d, ...rest] = path
  if (a === 'days' && typeof b === 'number') {
    if (c !== 'stops' || typeof d !== 'number') return ask(`${b + 1}일차 제목`)
    const s = doc.days[b]?.stops[d]
    const ORD = ['첫', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열']
    const which = s?.title.trim() ? `「${s.title.trim()}」 일정` : `${ORD[d] ? `${ORD[d]} 번째` : `${d + 1}번째`} 일정`
    const last = [...rest].reverse().find((k) => typeof k === 'string') as string | undefined
    const field = rest[0] === 'meet' ? (last === 'time' ? '모이는 시각' : '다시 모이는 곳') : rest[0] === 'rules' ? '꼭 지킬 것' : FIELD[last ?? ''] ?? '일정'
    return `${b + 1}일차 ${which}의 ${ask(field)}`
  }
  if (a === 'title') return ask('여행 제목')
  if (a === 'startDate') return ask('출발일')
  if (a === 'announcements') return `공지의 ${ask(c === 'body' ? '공지 내용' : '공지 제목')}`
  if (a === 'before') return ask(b === 'checklist' ? '준비물' : '출발 전 안내')
  if (a === 'after') return ask('다녀와서 안내')
  if (a === 'school') return ask('학교 이름')
  if (a === 'summary') return ask('한 줄 소개')
  return '적은 내용을 다시 확인해 주세요.'
}
