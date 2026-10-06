import { Icon, type IconName } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { useTrip, type Role } from '../../trip/context'
import { navigate } from '../../lib/router'
import { reflectStops } from '../../trip/derive'

const ROLES: { id: Role; label: string; sub: string; icon: IconName }[] = [
  { id: 'student', label: '학생', sub: '일정 보고 느낀 점 쓰기', icon: 'user' },
  { id: 'guardian', label: '보호자', sub: '아이 일정 따라가기', icon: 'users' },
  { id: 'teacher', label: '선생님', sub: '안내 고치기·느낀 점 모으기', icon: 'key' },
]

/** 누가 보는지 고르기 + 바로 가기 */
export function MenuSheet({ onJump, onClose }: { onJump: (key: string) => void; onClose: () => void }) {
  const { role, setRole, d, tripId, sample } = useTrip()
  const hasReflect = reflectStops(d).length > 0
  const quick: { key: string; label: string; icon: IconName; show: boolean }[] = [
    { key: 'cover', label: '여행 한눈에 보기', icon: 'calendar', show: true },
    { key: 'before', label: '출발 전에 챙겨요', icon: 'bag', show: d.pageByKey.has('before') },
    { key: 'after', label: role === 'student' && hasReflect ? '내 느낀 점 내기' : '다녀와서', icon: 'pen', show: true },
  ]
  return (
    <Sheet title={role ? '메뉴' : '누가 보나요?'} onClose={onClose}>
      <div className="menu">
        <div className="rolepick" role="group" aria-label="역할">
          {ROLES.map((r) => (
            <button key={r.id} type="button" aria-pressed={role === r.id} className="rolepick__btn" data-on={role === r.id || undefined} onClick={() => setRole(r.id)}>
              <Icon name={r.icon} />
              <span className="rolepick__label">{r.label}</span>
              <span className="rolepick__sub">{r.sub}</span>
            </button>
          ))}
        </div>
        {role === 'teacher' && tripId && !sample ? (
          <section className="whopick">
            <h3 className="whopick__title">선생님</h3>
            <div className="notice-entry">
              <button type="button" className="quick__btn" onClick={() => navigate(`/t/${tripId}/edit`)}>
                <Icon name="pen" />
                안내 고치기
              </button>
              <button type="button" className="quick__btn" onClick={() => navigate(`/t/${tripId}/collect`)}>
                <Icon name="upload" />
                느낀 점 모으기
              </button>
            </div>
            <p className="fineprint">고치려면 여행을 만들 때 정한 PIN이 필요해요.</p>
          </section>
        ) : null}
        {role === 'teacher' && sample ? <p className="fineprint">샘플 여행은 고칠 수 없어요. 첫 화면의 「이 샘플로 시작하기」로 내 여행을 만들면 마음대로 고칠 수 있어요.</p> : null}
        {role ? (
          <>
            <h3 className="menu__h">바로 가기</h3>
            <ul className="quick">
              {quick
                .filter((q) => q.show)
                .map((q) => (
                  <li key={q.key}>
                    <button type="button" className="quick__btn" onClick={() => onJump(q.key)}>
                      <Icon name={q.icon} />
                      {q.label}
                    </button>
                  </li>
                ))}
            </ul>
            <button type="button" className="btn btn--primary btn--block" onClick={onClose}>
              안내 보기
            </button>
          </>
        ) : null}
        <p className="fineprint menu__fine">이 안내는 링크만 있으면 누구나 볼 수 있어요. 느낀 점·학번·이름·체크한 것은 이 휴대폰에만 저장되고 서버로 보내지 않아요.</p>
        <button type="button" className="link-btn" onClick={() => navigate('/')}>
          <Icon name="home" size="1rem" /> 도름스 체험학습 첫 화면
        </button>
      </div>
    </Sheet>
  )
}
