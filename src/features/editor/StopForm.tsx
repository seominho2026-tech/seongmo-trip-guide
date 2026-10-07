import { useEffect, useRef, useState } from 'react'
import { Icon, KIND_ICON, LEG_ICON } from '../../components/Icon'
import { DEFAULT_PROMPT, KIND_LABEL, LEG_LABEL, ROUTABLE, TRANSIT, routeFits } from '../../trip/derive'
import { fetchRoute, same } from '../../lib/routing'
import { LEG_MODES, STOP_KINDS, type LegMode, type Stop, type TripDoc } from '../../trip/schema'
import { stopInstant } from '../../trip/order'
import { addDays, clock, dateLabel, zoneName } from '../../lib/time'
import type { LngLat } from '../../lib/geo'
import { PlaceField } from './PlaceField'

/** 일정 하나 고치기: 시각·활동명·종류·장소·오는 길·안내사항·꼭 지킬 것·다시 모이는 곳·느낀 점 */
export function StopForm({
  stop,
  dayIndex,
  dayCount,
  when,
  near,
  from,
  departAt,
  first,
  onChange,
  onDelete,
  onMove,
}: {
  stop: Stop
  dayIndex: number
  dayCount: number
  /** 출발일·여행지·출발지 시간대(날짜 고르기와 시각 미리 보기에 쓴다) */
  when: Pick<TripDoc, 'startDate' | 'tz' | 'homeTz'>
  near: LngLat | null
  /** 바로 앞 장소(오는 길의 출발점)와 그곳을 떠나는 시각(대중교통 시간표용) */
  from: LngLat | null
  departAt: Date | null
  first: boolean
  onChange: (s: Stop) => void
  onDelete: () => void
  onMove: (day: number) => void
}) {
  const set = (patch: Partial<Stop>) => onChange({ ...stop, ...patch })
  const abroad = when.tz !== when.homeTz
  const homeLabel = zoneName(when.homeTz)
  const dayDate = addDays(when.startDate, dayIndex)
  const at = stopInstant(when, dayIndex, stop)
  const showShift = abroad || stop.time < '06:00' || !!stop.dayShift
  const setLeg = (mode: LegMode | null) => {
    if (!mode) {
      const { leg: _drop, ...rest } = stop
      void _drop
      onChange(rest)
      return
    }
    if (stop.leg?.mode === mode) return
    // 수단을 바꾸면 옛 길과 그 길로 맞춰 둔 시간은 버리고 새로 계산한다(비행기·배는 적어 둔 시간을 그대로 둔다)
    const { route: _route, minutes, ...keep } = stop.leg ?? {}
    void _route
    set({ leg: { ...keep, mode, ...(!ROUTABLE.includes(mode) && minutes ? { minutes } : {}) } })
  }
  return (
    <div className="stopf" data-noswipe>
      <div className="field-row field-row--time">
        <label className="field">
          <span className="field__label">시작</span>
          <input className="input mono" type="time" value={stop.time} onChange={(e) => e.target.value && set({ time: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">
            끝 <span className="field__opt">없어도 돼요</span>
          </span>
          <input className="input mono" type="time" value={stop.end ?? ''} onChange={(e) => set({ end: e.target.value || undefined })} />
        </label>
        {showShift ? (
          <label className="field field--date">
            <span className="field__label">날짜</span>
            <select className="input" value={stop.dayShift ?? 0} onChange={(e) => set({ dayShift: Number(e.target.value) === 1 ? 1 : Number(e.target.value) === 2 ? 2 : undefined })}>
              <option value={0}>그날 · {dateLabel(dayDate)}</option>
              <option value={1}>다음 날 · {dateLabel(addDays(dayDate, 1))}</option>
              <option value={2}>이틀 뒤 · {dateLabel(addDays(dayDate, 2))}</option>
            </select>
          </label>
        ) : null}
        {abroad ? (
          <label className="agree agree--inline">
            <input type="checkbox" checked={stop.zone === 'home'} onChange={(e) => set({ zone: e.target.checked ? 'home' : undefined })} />
            <span className="check__box" aria-hidden="true">
              <Icon name="check" size="0.85rem" strokeWidth={2.4} />
            </span>
            <span>{homeLabel} 시각으로 적기</span>
          </label>
        ) : null}
      </div>
      {abroad && at ? (
        <p className="field__hint stopf__when mono">
          {zoneName(when.tz)} {fmtAt(at, when.tz)} · {homeLabel} {fmtAt(at, when.homeTz)}
        </p>
      ) : null}
      {showShift ? <p className="field__hint">자정을 넘긴 새벽 도착이나 날짜가 바뀌는 귀국편은 날짜를 「다음 날」로 골라 주세요.</p> : null}

      <label className="field">
        <span className="field__label">활동명</span>
        <input className="input" maxLength={60} value={stop.title} placeholder="예: 국립경주박물관 관람" onChange={(e) => set({ title: e.target.value })} />
      </label>

      <fieldset className="field">
        <legend className="field__label">종류</legend>
        <div className="chips" role="group">
          {STOP_KINDS.map((k) => (
            <button key={k} type="button" aria-pressed={stop.kind === k} className="chip" data-on={stop.kind === k || undefined} onClick={() => set({ kind: k })}>
              <Icon name={KIND_ICON[k]} size="0.95rem" />
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <span className="field__label">
          장소 <span className="field__opt">넣으면 지도에 찍혀요</span>
        </span>
        <PlaceField place={stop.place} near={near} onChange={(p) => set({ place: p })} />
      </div>

      <fieldset className="field">
        <legend className="field__label">
          {stop.place ? '오는 길' : '이동 수단'} <span className="field__opt">{!stop.place ? '장소를 넣으면 앞 장소에서 오는 길을 지도에 그려요' : first ? '이 여행의 첫 장소예요' : '앞 장소에서 여기까지'}</span>
        </legend>
        <div className="chips" role="group">
          <button type="button" aria-pressed={!stop.leg} className="chip" data-on={!stop.leg || undefined} onClick={() => setLeg(null)}>
            없음
          </button>
          {LEG_MODES.map((m) => (
            <button key={m} type="button" aria-pressed={stop.leg?.mode === m} className="chip" data-on={stop.leg?.mode === m || undefined} onClick={() => setLeg(m)}>
              <Icon name={LEG_ICON[m]} size="0.95rem" />
              {LEG_LABEL[m]}
            </button>
          ))}
        </div>
        {stop.leg ? (
          <div className="field-row">
            <LegTime stop={stop} from={from} departAt={departAt} onChange={onChange} />
            <label className="field">
              <span className="field__hint">한 줄 설명</span>
              <input className="input" maxLength={120} placeholder="예: 정문 앞에 내려요" value={stop.leg.note ?? ''} onChange={(e) => set({ leg: { ...stop.leg!, note: e.target.value || undefined } })} />
            </label>
          </div>
        ) : null}
      </fieldset>

      <label className="field">
        <span className="field__label">안내사항</span>
        <textarea className="input input--area" rows={5} maxLength={3000} placeholder={'할 일과 순서를 적어요. 줄 앞에 「- 」를 붙이면 목록이 돼요.'} value={stop.body ?? ''} onChange={(e) => set({ body: e.target.value || undefined })} />
      </label>

      <label className="field">
        <span className="field__label">
          꼭 지킬 것 <span className="field__opt">한 줄에 하나</span>
        </span>
        <textarea
          className="input input--area"
          rows={3}
          placeholder="예: 두 명 이상 함께 다녀요"
          value={(stop.rules ?? []).join('\n')}
          onChange={(e) => {
            const rules = e.target.value.split('\n').map((l) => l.slice(0, 200))
            set({ rules: rules.some((r) => r.trim()) ? rules : undefined })
          }}
          onBlur={() => set({ rules: (stop.rules ?? []).map((r) => r.trim()).filter(Boolean).slice(0, 20) || undefined })}
        />
      </label>

      <div className="field-row">
        <label className="field">
          <span className="field__label">다시 모이는 곳</span>
          <input className="input" maxLength={80} placeholder="예: 박물관 정문 앞" value={stop.meet?.place ?? ''} onChange={(e) => set({ meet: { ...stop.meet, place: e.target.value || undefined } })} />
        </label>
        <label className="field">
          <span className="field__label">모이는 시각</span>
          <input className="input mono" type="time" value={stop.meet?.time ?? ''} onChange={(e) => set({ meet: { ...stop.meet, time: e.target.value || undefined } })} />
        </label>
      </div>

      <div className="field reflectf">
        <label className="agree">
          <input type="checkbox" checked={!!stop.reflect?.on} onChange={(e) => set({ reflect: e.target.checked ? { on: true, prompt: stop.reflect?.prompt } : undefined })} />
          <span className="check__box" aria-hidden="true">
            <Icon name="check" size="0.9rem" strokeWidth={2.4} />
          </span>
          <span>여기서 학생 느낀 점 받기</span>
        </label>
        {stop.reflect?.on ? (
          <label className="field field--inner">
            <span className="field__hint">학생에게 보여 줄 질문. 비우면 「{DEFAULT_PROMPT}」</span>
            <input className="input" maxLength={140} value={stop.reflect.prompt ?? ''} placeholder={DEFAULT_PROMPT} onChange={(e) => set({ reflect: { on: true, prompt: e.target.value || undefined } })} />
          </label>
        ) : null}
      </div>

      <div className="stopf__foot">
        {dayCount > 1 ? (
          <label className="stopf__move">
            <span>다른 날로</span>
            <select className="input input--sm" value={dayIndex} onChange={(e) => onMove(Number(e.target.value))}>
              {Array.from({ length: dayCount }, (_, i) => (
                <option key={i} value={i}>
                  {i + 1}일차
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span />
        )}
        <button type="button" className="btn btn--danger btn--sm" onClick={onDelete}>
          <Icon name="trash" size="1rem" /> 이 일정 지우기
        </button>
      </div>
    </div>
  )
}

function fmtAt(at: Date, tz: string) {
  const c = clock(at, tz)
  return `${c.m}/${c.d}(${c.weekday}) ${c.time}`
}

const clampMin = (n: number) => Math.max(1, Math.min(1800, Math.round(n)))

/**
 * 걸리는 시간: 걷기·차·대중교통은 앞 장소에서 오는 길을 바로 계산해 보여 주고,
 * 선생님이 5분씩 늘리고 줄이거나 직접 적을 수 있다(직접 적은 시간이 학생 화면에 나간다).
 */
function LegTime({ stop, from, departAt, onChange }: { stop: Stop; from: LngLat | null; departAt: Date | null; onChange: (s: Stop) => void }) {
  const leg = stop.leg!
  const here = (stop.place?.coords as LngLat | undefined) ?? null
  const routable = ROUTABLE.includes(leg.mode)
  const fits = !!(from && here && routeFits(leg.route, from, here))
  const auto = fits ? Math.max(1, Math.round(leg.route!.min)) : null
  const custom = leg.minutes ?? null
  const shown = custom ?? auto
  const [calc, setCalc] = useState<'idle' | 'busy' | 'fail'>('idle')
  const latest = useRef(stop)
  latest.current = stop
  const changeRef = useRef(onChange)
  changeRef.current = onChange
  const sameSpot = !!(from && here && same(from, here))

  // 수단·장소가 정해졌는데 맞는 길이 없으면 잠깐 기다렸다 한 번 계산한다(칩을 여러 번 눌러도 마지막 것만)
  useEffect(() => {
    if (!routable || !from || !here || sameSpot || fits) {
      setCalc('idle')
      return
    }
    let alive = true
    const ctrl = new AbortController()
    setCalc('busy')
    const mode = leg.mode
    const t = window.setTimeout(async () => {
      let r: Awaited<ReturnType<typeof fetchRoute>> = null
      try {
        r = await fetchRoute(mode, from, here, departAt, ctrl.signal)
      } catch {
        r = null
      }
      if (!alive) return
      const cur = latest.current
      const curHere = cur.place?.coords as LngLat | undefined
      if (cur.leg?.mode !== mode || !curHere || curHere[0] !== here[0] || curHere[1] !== here[1]) return
      if (r && r !== 'down') {
        changeRef.current({ ...cur, leg: { ...cur.leg, route: r } })
        setCalc('idle')
      } else setCalc('fail')
    }, 700)
    return () => {
      alive = false
      ctrl.abort()
      window.clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leg.mode, routable, fits, sameSpot, from?.[0], from?.[1], here?.[0], here?.[1]])

  // 자동값과 같아지면 직접 고친 것이 아니라 자동으로 둔다(장소를 옮기면 다시 계산되게)
  const setMinutes = (m: number | undefined) => onChange({ ...stop, leg: { ...leg, minutes: m !== undefined && m === auto ? undefined : m } })
  const step = (d: number) => setMinutes(clampMin((shown ?? 0) + d))
  // 칸에 적는 동안의 글자(지웠다 새로 쓰는 중에 자동값이 끼어들지 않게, 칸을 떠날 때 확정한다)
  const [text, setText] = useState<string | null>(null)
  const commit = () => {
    if (text === null) return
    const n = Number(text)
    setMinutes(text.trim() && Number.isFinite(n) ? clampMin(n) : undefined)
    setText(null)
  }
  const done = TRANSIT.includes(leg.mode)
    ? '대중교통 시간표로 계산했어요. 정류장에서 처음 기다리는 시간은 빠져 있어요.'
    : leg.mode === 'walk'
      ? '걷는 길로 계산했어요. 여럿이 함께 걸으면 더 걸리니 넉넉히 늘려 두세요.'
      : '찻길로 계산했어요. 막히는 길과 타고 내리는 시간은 빠져 있으니 넉넉히 늘려 두세요.'
  const note = !routable
    ? `${LEG_LABEL[leg.mode]}는 자동으로 계산하지 않아요. 직접 적어 주세요.`
    : !stop.place
      ? '장소를 넣으면 앞 장소에서 오는 시간을 자동으로 계산해요.'
      : !from
        ? '앞에 장소가 있는 일정이 없어 계산할 길이 없어요.'
        : sameSpot
          ? '앞 장소와 같은 곳이에요.'
          : calc === 'busy'
            ? '길을 찾고 있어요.'
            : calc === 'fail' && !fits
              ? '자동으로 찾지 못했어요. 직접 적어 주세요.'
              : custom && auto
                ? `자동 계산은 ${auto}분이에요. 학생 화면에는 고친 ${custom}분이 보여요.`
                : auto
                  ? done
                  : ''
  return (
    <div className="field legtime">
      <span className="field__hint" id={`legtime-${stop.id}`}>
        걸리는 시간(분)
      </span>
      <div className="legtime__row">
        <button type="button" className="icon-btn legtime__step" onClick={() => step(-5)} disabled={!shown || shown <= 1} aria-label="5분 줄이기">
          <Icon name="minus" size="1rem" />
        </button>
        <input
          className="input mono legtime__input"
          type="number"
          min={1}
          max={1800}
          inputMode="numeric"
          aria-labelledby={`legtime-${stop.id}`}
          placeholder={calc === 'busy' ? '계산 중' : '분'}
          value={text ?? shown ?? ''}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), commit())}
        />
        <button type="button" className="icon-btn legtime__step" onClick={() => step(5)} aria-label="5분 늘리기">
          <Icon name="plus" size="1rem" />
        </button>
        {custom && auto && custom !== auto ? (
          <button type="button" className="btn btn--ghost btn--sm legtime__reset" onClick={() => setMinutes(undefined)}>
            <Icon name="refresh" size="0.95rem" /> 자동 {auto}분
          </button>
        ) : null}
      </div>
      {note ? (
        <p className="field__hint legtime__note" role="status">
          {note}
        </p>
      ) : null}
    </div>
  )
}
