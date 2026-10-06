// 랜딩 샘플 여행(가상 학교의 경주 2박 3일)을 만든다. 장소는 실제 공공장소를 Nominatim 으로 찾고, 길은 OSRM 으로 한 번 계산한다.
// 실행: node --network-family-autoselection-attempt-timeout=2000 scripts/make-sample.mjs  → public/sample/gyeongju.json
// 공개 서버라 초당 한 번 넘게 부르지 않는다.
import fs from 'node:fs'
const UA = 'dorms-trip-guide sample builder (https://trip.dorms.school)'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let n = 0
const id = () => 'smp' + String(++n).padStart(4, '0') + 'x'

async function geo(q) {
  await sleep(1100)
  const r = await fetch(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q, format: 'jsonv2', limit: '1', 'accept-language': 'ko' })}`, { headers: { 'User-Agent': UA } })
  const j = await r.json()
  if (!j[0]) throw new Error('못 찾음: ' + q)
  return [Math.round(Number(j[0].lon) * 1e6) / 1e6, Math.round(Number(j[0].lat) * 1e6) / 1e6]
}

function simplify(points, tol = 0.00015) {
  if (points.length <= 2) return points
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    const [x1, y1] = points[a], [x2, y2] = points[b]
    let max = 0, idx = -1
    for (let i = a + 1; i < b; i++) {
      const [x, y] = points[i]
      const dx = x2 - x1, dy = y2 - y1
      const t = dx || dy ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy))) : 0
      const d = Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
      if (d > max) { max = d; idx = i }
    }
    if (max > tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]) }
  }
  return points.filter((_, i) => keep[i]).map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5])
}

async function route(mode, a, b) {
  const base = mode === 'walk' ? 'https://routing.openstreetmap.de/routed-foot/route/v1/driving' : 'https://router.project-osrm.org/route/v1/driving'
  for (let attempt = 0; attempt < 4; attempt++) {
    await sleep(1100 * (attempt + 1))
    try {
      const r = await fetch(`${base}/${a[0]},${a[1]};${b[0]},${b[1]}?overview=full&geometries=geojson`, { headers: { 'User-Agent': UA } })
      const j = await r.json()
      const x = j.routes?.[0]
      if (!x) return undefined
      return { coords: simplify(x.geometry.coordinates), km: Math.round((x.distance / 1000) * 10) / 10, min: Math.round(x.duration / 60), from: a, to: b }
    } catch (e) {
      console.warn('다시 시도', attempt + 1, e.code ?? e.message)
    }
  }
  return undefined
}

const P = {}
const places = {
  gyochon: ['경주향교', '경주 교촌마을', '경상북도 경주시 교촌안길'],
  museum: ['국립경주박물관', '국립경주박물관', '경상북도 경주시 일정로 186'],
  cheom: ['경주 첨성대', '첨성대', '경상북도 경주시 인왕동'],
  daereung: ['대릉원', '대릉원', '경상북도 경주시 황남동'],
  bomun: ['보문관광단지', '보문관광단지 숙소', '경상북도 경주시 보문로'],
  donggung: ['동궁과 월지', '동궁과 월지', '경상북도 경주시 원화로 102'],
  bulguk: ['불국사', '불국사', '경상북도 경주시 불국로 385'],
  seokguram: ['석굴암', '석굴암', '경상북도 경주시 불국로 873-243'],
  expo: ['경주엑스포대공원', '경주엑스포대공원', '경상북도 경주시 경감로 614'],
  hwangri: ['황리단길', '황리단길', '경상북도 경주시 포석로 일대'],
  yangdong: ['경주 양동마을', '경주 양동마을', '경상북도 경주시 강동면 양동마을길'],
}
for (const [k, [q, name, address]] of Object.entries(places)) {
  P[k] = { name, address, coords: await geo(q) }
  console.log('찾음', k, P[k].coords.join(','))
}

const doc = {
  v: 1,
  title: '경주 2박 3일 수학여행',
  school: '도름고등학교 2학년 (샘플)',
  summary: '신라 천 년의 역사를 걸으며 박물관·유적·마을을 직접 보고 느끼는 2박 3일이에요.',
  startDate: '2026-11-04',
  nights: 2,
  tz: 'Asia/Seoul',
  homeTz: 'Asia/Seoul',
  studentIdDigits: 4,
  before: {
    notes: '출발 전에 꼭 읽어 주세요.\n\n- 첫날 07:30까지 학교 운동장에 모여요.\n- 둘째 날은 많이 걸어요. 편한 운동화를 신어요.\n- 멀미약은 출발 30분 전에 먹어요.\n- 비상 연락은 담임 선생님이 학급 단체방으로 안내해요.',
    checklist: ['학생증', '편한 운동화', '겉옷(밤에 쌀쌀해요)', '개인 물병', '휴대폰 충전기와 보조 배터리', '상비약(멀미약 등)', '필기도구'],
  },
  after: { notes: '다녀와서 일주일 안에 「내 느낀 점 저장」으로 파일을 받아 클래스룸 과제에 올려 주세요.\n\n담임 선생님이 모아 학교생활기록부 기록에 참고해요.' },
  announcements: [{ id: 'smpnotice01', title: '집합 시간 안내', body: '첫날 07:30까지 학교 운동장에 모여요. 늦을 것 같으면 담임 선생님께 먼저 알려 주세요.', audience: 'all', popup: true, updatedAt: '2026-10-06T00:00:00.000Z' }],
  days: [
    {
      title: '신라의 수도를 걷다',
      stops: [
        { id: id(), time: '07:30', end: '08:00', title: '학교 운동장 집합', kind: 'move', body: '반별로 줄을 서고 담임 선생님이 인원을 확인해요.\n\n- 1·2반은 1호차, 3·4반은 2호차에 타요.', rules: ['07:30까지 도착해요', '버스 안에서는 안전띠를 매요'], meet: { place: '학교 운동장 국기 게양대 앞', time: '07:30' } },
        { id: id(), time: '12:00', end: '13:00', title: '점심 · 교촌마을', kind: 'meal', place: P.gyochon, leg: { mode: 'bus', minutes: 230, note: '학교에서 경주까지, 중간에 휴게소에 한 번 들러요' }, body: '경주 교동 한옥 마을에서 반별로 점심을 먹어요.' },
        { id: id(), time: '13:20', end: '14:50', title: '국립경주박물관', kind: 'activity', place: P.museum, leg: { mode: 'bus' }, body: '신라역사관 → 신라미술관 → 월지관 순서로 돌아봐요.\n\n- 성덕대왕신종 앞에서 반 사진을 찍어요.', rules: ['전시실 안에서는 사진 찍기 전에 안내문을 확인해요', '유물을 만지지 않아요'], meet: { place: '박물관 정문 앞 광장', time: '14:50' }, reflect: { on: true, prompt: '가장 오래 들여다본 유물과 그 까닭은 무엇인가요?' } },
        { id: id(), time: '15:10', end: '16:00', title: '첨성대', kind: 'activity', place: P.cheom, leg: { mode: 'bus' }, body: '동양에서 가장 오래된 천문대로 알려진 곳이에요. 둘레를 한 바퀴 걸으며 돌의 층수를 세어 봐요.', reflect: { on: true, prompt: '첨성대가 무엇에 쓰였을지 내 생각을 적어 보세요.' } },
        { id: id(), time: '16:00', end: '17:00', title: '대릉원', kind: 'activity', place: P.daereung, leg: { mode: 'walk' }, body: '천마총 안에 들어가 무덤의 짜임을 살펴봐요.' },
        { id: id(), time: '17:40', title: '숙소 도착 · 저녁', kind: 'lodging', place: P.bomun, leg: { mode: 'bus' }, body: '방 배정은 숙소에 도착해서 알려 줘요. 짐을 풀고 18:30에 식당으로 모여요.' },
        { id: id(), time: '19:30', end: '20:40', title: '동궁과 월지 야경', kind: 'activity', place: P.donggung, leg: { mode: 'bus' }, body: '연못에 비친 전각을 보며 천천히 한 바퀴 걸어요.', rules: ['어두우니 친구와 함께 다녀요'], meet: { place: '동궁과 월지 정문 앞', time: '20:40' }, reflect: { on: true, prompt: '밤에 본 동궁과 월지는 낮에 본 유적과 어떻게 달랐나요?' } },
      ],
    },
    {
      title: '불국사와 석굴암',
      stops: [
        { id: id(), time: '07:30', end: '08:20', title: '아침 식사', kind: 'meal', place: P.bomun },
        { id: id(), time: '08:40', end: '10:40', title: '불국사', kind: 'activity', place: P.bulguk, leg: { mode: 'bus' }, body: '청운교·백운교를 지나 대웅전, 다보탑과 석가탑을 차례로 봐요.', rules: ['절 안에서는 조용히 다녀요'], meet: { place: '불국사 일주문 앞', time: '10:40' }, reflect: { on: true, prompt: '다보탑과 석가탑을 나란히 보며 무엇이 다르게 느껴졌나요?' } },
        { id: id(), time: '11:00', end: '12:00', title: '석굴암', kind: 'activity', place: P.seokguram, leg: { mode: 'bus' }, body: '주차장에서 석굴까지 20분쯤 걸어 올라가요.', reflect: { on: true, prompt: '석굴암 본존불을 마주했을 때의 느낌을 적어 보세요.' } },
        { id: id(), time: '12:40', end: '15:30', title: '경주엑스포대공원', kind: 'activity', place: P.expo, leg: { mode: 'bus' }, body: '점심을 먹고 경주타워와 전시관을 돌아봐요.' },
        { id: id(), time: '16:00', end: '17:30', title: '황리단길 자유 시간', kind: 'activity', place: P.hwangri, leg: { mode: 'bus' }, rules: ['두 명 이상 함께 다녀요', '17:30까지 꼭 모여요'], meet: { place: '대릉원 정문 옆 버스 주차장', time: '17:30' } },
        { id: id(), time: '18:00', title: '숙소 · 저녁', kind: 'lodging', place: P.bomun, leg: { mode: 'bus' } },
      ],
    },
    {
      title: '양동마을과 귀가',
      stops: [
        { id: id(), time: '07:30', end: '08:30', title: '아침 식사 · 퇴실', kind: 'meal', place: P.bomun, body: '방을 정리하고 짐을 모두 챙겨 버스에 실어요.' },
        { id: id(), time: '09:30', end: '11:30', title: '양동마을', kind: 'activity', place: P.yangdong, leg: { mode: 'bus' }, body: '유네스코 세계유산으로 지정된 양반 마을이에요. 해설사 선생님을 따라 마을을 돌아봐요.', reflect: { on: true, prompt: '옛사람들의 집과 마을에서 지금 우리 동네와 닮은 점이나 다른 점을 찾아보세요.' } },
        { id: id(), time: '12:00', end: '13:00', title: '점심', kind: 'meal', body: '휴게소에서 반별로 점심을 먹어요.' },
        { id: id(), time: '17:00', title: '학교 도착 · 해산', kind: 'move', body: '도착 시각은 길 상황에 따라 바뀔 수 있어요. 담임 선생님이 학급 단체방으로 알려 줘요.' },
      ],
    },
  ],
}

// 오는 길 계산(버스·걷기)
let last = null
for (const d of doc.days) {
  for (const s of d.stops) {
    if (!s.place) continue
    if (last && s.leg && ['bus', 'walk', 'car'].includes(s.leg.mode)) {
      const same = Math.hypot((last[0] - s.place.coords[0]) * 88, (last[1] - s.place.coords[1]) * 111) < 0.15
      if (!same) {
        const r = await route(s.leg.mode, last, s.place.coords)
        if (r) s.leg.route = r
        console.log('길', s.title, r ? `${r.km}km ${r.min}분 점 ${r.coords.length}` : '실패')
      }
    }
    last = s.place.coords
  }
}
fs.mkdirSync('public/sample', { recursive: true })
fs.writeFileSync('public/sample/gyeongju.json', JSON.stringify(doc) + '\n')
console.log('저장', fs.statSync('public/sample/gyeongju.json').size, 'bytes')
