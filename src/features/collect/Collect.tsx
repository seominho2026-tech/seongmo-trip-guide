import { useMemo, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { navigate } from '../../lib/router'
import { useTripDoc, LoadScreen } from '../../app/TripLoader'
import { derive, DEFAULT_PROMPT, reflectStops } from '../../trip/derive'
import { collect } from '../../lib/collect'
import { salpeemWorkbook } from '../../lib/salpeem'
import { giveFile, safeName } from '../../lib/download'
import { TopBar } from '../editor/TopBar'
import type { TripDoc } from '../../trip/schema'

type In = { name: string; text: string }

/** 선생님 '느낀 점 모으기': 학생 파일 여러 개 → 살핌 설문 양식 엑셀 하나. 모두 이 기기 안에서 처리하고 서버로 보내지 않는다. */
export default function Collect({ id }: { id: string }) {
  const { state } = useTripDoc(id)
  return <LoadScreen state={state}>{(data) => <CollectBody id={id} doc={data.doc} />}</LoadScreen>
}

function CollectBody({ id, doc }: { id: string; doc: TripDoc }) {
  const d = useMemo(() => derive(doc), [doc])
  const [files, setFiles] = useState<In[]>([])
  const [over, setOver] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const result = useMemo(() => collect(d, id, files), [d, id, files])
  const questions = reflectStops(d)
  const writtenRows = result.students.filter((s) => s.answers.size)

  const add = async (list: FileList | File[]) => {
    const picked: In[] = []
    let skipped = 0
    for (const f of Array.from(list)) {
      if (!/\.txt$/i.test(f.name) || f.size > 500_000) {
        skipped++
        continue
      }
      picked.push({ name: f.name, text: await f.text() })
    }
    setFiles((prev) => {
      const names = new Set(picked.map((p) => p.name))
      return [...prev.filter((p) => !names.has(p.name)), ...picked]
    })
    setMsg(skipped ? `${skipped}개는 느낀 점 파일(.txt)이 아니거나 너무 커서 뺐어요.` : null)
  }

  const download = async () => {
    const blob = await salpeemWorkbook(d, result)
    await giveFile(blob, `${safeName(doc.title)}_느낀점_살핌양식.xlsx`)
  }

  return (
    <div className="screen">
      <TopBar title="느낀 점 모으기" back={() => navigate(`/t/${id}`)} />
      <main className="screen__body">
        <div className="collect">
          <header className="collect__head">
            <h2 className="panel__title">{doc.title}</h2>
            <p className="body-text">
              학생들이 「내 느낀 점 저장」으로 낸 파일(학번_이름_느낀점.txt)을 한꺼번에 끌어다 놓아 주세요. 살핌 설문에 바로 올릴 수 있는 엑셀 파일 하나로 만들어요. 파일은 이 컴퓨터 안에서만 읽고 서버로 보내지 않아요.
            </p>
          </header>

          <div
            className="drop"
            data-over={over || undefined}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setOver(false)
              void add(e.dataTransfer.files)
            }}
          >
            <Icon name="upload" size="1.8rem" />
            <p className="drop__text">여기에 파일을 끌어다 놓거나</p>
            <button type="button" className="btn btn--primary" onClick={() => inputRef.current?.click()}>
              파일 고르기
            </button>
            <p className="fineprint">여러 개를 한 번에 골라도 돼요. 클래스룸에서 「모두 다운로드」로 받은 폴더를 풀어 그 안의 파일을 모두 고르면 돼요.</p>
            <input
              ref={inputRef}
              type="file"
              accept=".txt,text/plain"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) void add(e.target.files)
                e.target.value = ''
              }}
            />
          </div>
          {msg ? <p className="field__hint" data-bad>{msg}</p> : null}

          {files.length ? (
            <>
              <div className="collect__sum">
                <p>
                  파일 <span className="mono">{files.length}</span>개 · 학생 <span className="mono">{result.students.length}</span>명 · 느낀 점 받는 곳 <span className="mono">{questions.length}</span>곳
                </p>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setFiles([])}>
                  모두 비우기
                </button>
              </div>
              <div className="table-wrap" data-noswipe>
                <table className="ctable">
                  <thead>
                    <tr>
                      <th scope="col">학번</th>
                      <th scope="col">이름</th>
                      <th scope="col">쓴 곳</th>
                      <th scope="col">확인할 것</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.students.map((s) => (
                      <tr key={s.no + s.file} data-warn={s.warnings.length || undefined}>
                        <td className="mono">{s.no}</td>
                        <td>{s.name}</td>
                        <td className="mono">
                          {s.answers.size}/{questions.length}
                        </td>
                        <td className="ctable__warn">{s.warnings.length ? s.warnings.join(' ') : ''}</td>
                      </tr>
                    ))}
                    {result.skipped.map((s) => (
                      <tr key={s.file} data-skip>
                        <td colSpan={3}>{s.file}</td>
                        <td className="ctable__warn">뺐어요: {s.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" className="btn btn--primary btn--block btn--lg" disabled={!writtenRows.length} onClick={() => void download()}>
                <Icon name="download" size="1.15rem" /> 살핌 양식 엑셀 받기
              </button>
            </>
          ) : null}

          <section className="collect__how">
            <h3 className="settings__h">살핌에 올리기</h3>
            <ol className="steps">
              <li>살핌 설정에서 학번 체계를 {doc.studentIdDigits === 4 ? '4자리(학년 1·반 1·번호 2)' : '5자리(학년 1·반 2·번호 2)'}로 두고 학생 명단을 등록해요. 학번과 이름이 명단과 둘 다 맞아야 들어가요.</li>
              <li>살핌 「설문」에서 저장 폴더(예: 진로활동)를 고르고 「새 설문 추가」로 받은 엑셀을 올려요.</li>
              <li>학생마다 생기부 문장 초안이 만들어져요. 확인하고 고친 뒤 보내요.</li>
            </ol>
            <p className="fineprint">엑셀 첫 시트 「설문응답」은 살핌 양식(학번·이름·장소별 질문)이고, 둘째 시트 「모아 보기」는 학생·장소마다 한 줄씩 읽기 좋게 모은 것이에요.</p>
            {questions.length ? (
              <details className="collect__qs">
                <summary>
                  <Icon name="chevronDown" size="1rem" /> 느낀 점 받는 곳 {questions.length}곳 보기
                </summary>
                <ol>
                  {questions.map((q) => (
                    <li key={q.key}>
                      <span className="mono">{q.dayN}일차</span> {q.stop.place?.name ?? q.stop.title} · {q.stop.reflect?.prompt?.trim() || DEFAULT_PROMPT}
                    </li>
                  ))}
                </ol>
              </details>
            ) : (
              <p className="callout">이 여행에는 느낀 점을 받는 곳이 없어요. 편집 화면의 일정에서 「여기서 학생 느낀 점 받기」를 켜 주세요.</p>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
