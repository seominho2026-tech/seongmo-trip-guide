import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { NIGHTS_MAX, newId, type Announcement, type TripDoc } from '../../trip/schema'
import { addDays, dateLabel, ZONES } from '../../lib/time'

const nightsLabel = (n: number) => (n === 0 ? '당일' : `${n}박 ${n + 1}일`)

/** 여행 정보: 제목·학교·소개·출발일·기간·여행지 시간·학번 자릿수 */
export function InfoPanel({ doc, onChange, onNights }: { doc: TripDoc; onChange: (p: Partial<TripDoc>) => void; onNights: (n: number) => void }) {
  const abroad = doc.tz !== doc.homeTz
  return (
    <div className="panel form">
      <h2 className="panel__title">여행 정보</h2>
      <label className="field">
        <span className="field__label">여행 제목</span>
        <input className="input" maxLength={60} value={doc.title} onChange={(e) => onChange({ title: e.target.value })} />
      </label>
      <label className="field">
        <span className="field__label">
          학교·학년 <span className="field__opt">넣지 않아도 돼요</span>
        </span>
        <input className="input" maxLength={40} value={doc.school ?? ''} onChange={(e) => onChange({ school: e.target.value || undefined })} />
      </label>
      <label className="field">
        <span className="field__label">
          한 줄 소개 <span className="field__opt">표지에 보여요</span>
        </span>
        <textarea className="input input--area" rows={2} maxLength={300} value={doc.summary ?? ''} onChange={(e) => onChange({ summary: e.target.value || undefined })} />
      </label>
      <div className="field-row">
        <label className="field">
          <span className="field__label">출발일</span>
          <input className="input mono" type="date" value={doc.startDate} onChange={(e) => e.target.value && onChange({ startDate: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">기간</span>
          <select className="input" value={doc.nights} onChange={(e) => onNights(Number(e.target.value))}>
            {Array.from({ length: NIGHTS_MAX + 1 }, (_, n) => (
              <option key={n} value={n}>
                {nightsLabel(n)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="field__hint">
        {dateLabel(doc.startDate)}부터 {dateLabel(addDays(doc.startDate, doc.nights))}까지
      </p>
      <label className="field">
        <span className="field__label">여행지 시간</span>
        <select className="input" value={abroad ? doc.tz : 'Asia/Seoul'} onChange={(e) => onChange({ tz: e.target.value })}>
          {ZONES.map((z) => (
            <option key={z.tz} value={z.tz}>
              {z.tz === 'Asia/Seoul' ? '국내(한국 시각)' : z.label}
            </option>
          ))}
        </select>
        <span className="field__hint">일정 시각은 여행지 시각으로 적어요. 해외면 보호자 화면에 한국 시각이 함께 보여요.</span>
      </label>
      <fieldset className="field">
        <legend className="field__label">학번 자릿수</legend>
        <div className="seg-group" role="group">
          {([4, 5] as const).map((n) => (
            <button key={n} type="button" aria-pressed={doc.studentIdDigits === n} className="seg" data-on={doc.studentIdDigits === n || undefined} onClick={() => onChange({ studentIdDigits: n })}>
              {n}자리 <span className="mono seg__sub">{n === 4 ? '1103' : '10203'}</span>
            </button>
          ))}
        </div>
        <span className="field__hint">살핌에 등록한 학번 체계와 같게 골라요.</span>
      </fieldset>
    </div>
  )
}

/** 출발 전 안내·준비물, 다녀와서 안내 */
export function NotesPanel({ kind, doc, onChange }: { kind: 'before' | 'after'; doc: TripDoc; onChange: (p: Partial<TripDoc>) => void }) {
  if (kind === 'after')
    return (
      <div className="panel form">
        <h2 className="panel__title">다녀와서</h2>
        <label className="field">
          <span className="field__label">안내</span>
          <textarea className="input input--area" rows={8} maxLength={3000} placeholder="예: 다녀와서 일주일 안에 「내 느낀 점 저장」으로 파일을 받아 클래스룸 과제에 올려 주세요." value={doc.after.notes} onChange={(e) => onChange({ after: { notes: e.target.value } })} />
        </label>
        <p className="field__hint">학생 화면의 이 장에는 「내 느낀 점 저장」 단추가 함께 보여요. 느낀 점을 어디로 낼지(클래스룸 과제 등) 여기에 적어 주세요.</p>
      </div>
    )
  return (
    <div className="panel form">
      <h2 className="panel__title">출발 전</h2>
      <label className="field">
        <span className="field__label">안내</span>
        <textarea className="input input--area" rows={8} maxLength={5000} placeholder={'집합 시간과 장소, 준비할 서류, 지킬 약속을 적어요.\n줄 앞에 「- 」를 붙이면 목록이 돼요.'} value={doc.before.notes} onChange={(e) => onChange({ before: { ...doc.before, notes: e.target.value } })} />
      </label>
      <label className="field">
        <span className="field__label">
          챙길 것 <span className="field__opt">한 줄에 하나, 학생이 체크해요</span>
        </span>
        <textarea
          className="input input--area"
          rows={6}
          placeholder={'학생증\n편한 운동화'}
          value={doc.before.checklist.join('\n')}
          onChange={(e) => onChange({ before: { ...doc.before, checklist: e.target.value.split('\n').map((l) => l.slice(0, 120)).slice(0, 60) } })}
        />
      </label>
    </div>
  )
}

/** 공지: 사이트를 열면 팝업으로 뜬다. 고치면 '다시 보지 않기'를 누른 학생에게도 다시 뜬다. */
export function NoticesPanel({ doc, onChange }: { doc: TripDoc; onChange: (a: Announcement[]) => void }) {
  const [editing, setEditing] = useState<Announcement | null>(null)
  const list = doc.announcements
  const AUD = { all: '학생·보호자 모두', students: '학생만', guardians: '보호자만' } as const
  return (
    <div className="panel form">
      <h2 className="panel__title">공지</h2>
      <p className="field__hint">사이트를 열면 팝업으로 떠요. 학생이 「다시 보지 않기」를 누르면 그 공지는 다시 뜨지 않고, 공지를 고치면 다시 떠요.</p>
      {list.length ? (
        <ul className="notice-list">
          {list.map((n) => (
            <li key={n.id}>
              <div className="notice-list__text">
                <strong>{n.title}</strong>
                <span className="notice-list__meta">
                  {AUD[n.audience]} · {n.popup ? '팝업' : '팝업 안 띄움'}
                </span>
              </div>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(n)}>
                고치기
              </button>
              <button type="button" className="icon-btn icon-btn--sm" aria-label={`「${n.title}」 지우기`} onClick={() => window.confirm('이 공지를 지울까요?') && onChange(list.filter((x) => x.id !== n.id))}>
                <Icon name="trash" size="1.05rem" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {editing ? (
        <div className="notice-edit">
          <label className="field">
            <span className="field__label">제목</span>
            <input className="input" maxLength={60} value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
          </label>
          <label className="field">
            <span className="field__label">내용</span>
            <textarea className="input input--area" rows={5} maxLength={1000} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
          </label>
          <fieldset className="field">
            <legend className="field__label">누구에게</legend>
            <div className="seg-group" role="group">
              {(['all', 'students', 'guardians'] as const).map((a) => (
                <button key={a} type="button" aria-pressed={editing.audience === a} className="seg" data-on={editing.audience === a || undefined} onClick={() => setEditing({ ...editing, audience: a })}>
                  {AUD[a]}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="agree">
            <input type="checkbox" checked={editing.popup} onChange={(e) => setEditing({ ...editing, popup: e.target.checked })} />
            <span className="check__box" aria-hidden="true">
              <Icon name="check" size="0.9rem" strokeWidth={2.4} />
            </span>
            <span>사이트를 열면 팝업으로 띄우기</span>
          </label>
          <div className="btn-row">
            <button type="button" className="btn btn--ghost" onClick={() => setEditing(null)}>
              그만두기
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={!editing.title.trim()}
              onClick={() => {
                const next = { ...editing, updatedAt: new Date().toISOString() }
                onChange(list.some((x) => x.id === next.id) ? list.map((x) => (x.id === next.id ? next : x)) : [next, ...list])
                setEditing(null)
              }}
            >
              공지에 넣기
            </button>
          </div>
          <p className="field__hint">공지에 넣은 뒤 아래 「저장」을 눌러야 학생 화면에 떠요.</p>
        </div>
      ) : (
        <button type="button" className="btn btn--primary btn--block" disabled={list.length >= 30} onClick={() => setEditing({ id: newId(), title: '', body: '', audience: 'all', popup: true, updatedAt: '' })}>
          <Icon name="megaphone" size="1.05rem" /> 공지 쓰기
        </button>
      )}
    </div>
  )
}
