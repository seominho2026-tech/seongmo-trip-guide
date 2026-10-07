// 랜딩 샘플 여행(가상 학교의 경주 2박 3일)을 만든다. 장소는 실제 공공장소를 Nominatim 으로 찾고, 길은 OSRM 으로 한 번 계산한다.
// 실행: node --network-family-autoselection-attempt-timeout=2000 scripts/make-sample.mjs  → public/sample/gyeongju.json
// 공개 서버라 초당 한 번 넘게 부르지 않는다.
import fs from 'node:fs'
const UA = 'dorms-trip-guide sample builder (https://trip.dorms.school)'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// 이미 만든 샘플이 있으면 장소 좌표와 길을 그대로 쓴다(새로 생긴 구간만 부른다). 장 id 는 고정이라 장을 끼워 넣어도 기존 장이 그대로다.
const OUT = 'public/sample/gyeongju.json'
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null
const placeCache = new Map()
const routeCache = new Map()
const routeKey = (mode, a, b) => `${mode}|${a.join(',')}|${b.join(',')}`
for (const d of prev?.days ?? []) {
  for (const s of d.stops) {
    if (s.place) placeCache.set(s.place.name, s.place.coords)
    if (s.leg?.route) routeCache.set(routeKey(s.leg.mode, s.leg.route.from, s.leg.route.to), s.leg.route)
  }
}

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
  P[k] = { name, address, coords: placeCache.get(name) ?? (await geo(q)) }
  console.log(placeCache.has(name) ? '그대로' : '찾음', k, P[k].coords.join(','))
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
    notes:
      '출발 전에 꼭 읽어 주세요. 바뀌는 내용이 생기면 이 안내 페이지에 바로 고쳐 둘게요.\n\n- 첫날 07:30까지 학교 운동장에 모이세요. 버스는 07:50에 떠나요.\n- 둘째 날은 하루에 1만 보 넘게 걸으니 길들인 운동화를 신고 오세요.\n- 멀미가 있으면 출발 30분 전에 멀미약을 먹어 두세요.\n- 앞자리가 필요하면 담임 선생님께 미리 말씀드리세요.\n- 사흘 내내 반별·조별로 움직여요. 조장은 장소를 옮길 때마다 조원 수를 세어 담임 선생님께 알려 주세요.\n- 숙소에서는 22:00에 방마다 인원을 확인하고 23:00에 불을 꺼요.\n- 비상시 연락 방법은 담임 선생님이 학급 단체방에 안내할 거예요.\n\n식사는 모두 준비돼 있어요. 용돈 쓸 일은 둘째 날 황리단길 자유 시간뿐이라 3만 원 안쪽이면 넉넉해요. 먹는 약이 있으면 출발 전에 담임 선생님께 미리 알려 주세요.',
    checklist: [
      '학생증',
      '길들인 운동화',
      '겉옷(아침저녁에 쌀쌀해요)',
      '갈아입을 옷 2벌과 잠옷',
      '세면도구(칫솔·치약·수건)',
      '개인 물병',
      '휴대폰 충전기와 보조 배터리',
      '하루 동안 멜 작은 가방',
      '접는 우산이나 우비',
      '상비약(멀미약 등)',
      '필기도구와 작은 수첩',
      '용돈(3만 원 안쪽)',
    ],
  },
  after: {
    notes:
      '다녀와서 일주일 안에 「내 느낀 점 저장」 버튼을 눌러 파일을 받고, 그 파일을 클래스룸 과제에 올려 주세요.\n\n- 장소마다 쓴 느낀 점이 파일 하나에 모두 담겨요.\n- 못 쓴 곳이 있으면 지금 써도 돼요. 그날 본 것을 떠올리며 두세 문장만 써도 충분해요.\n\n담임 선생님이 파일을 모아 학교생활기록부를 쓸 때 참고해요.',
  },
  announcements: [
    { id: 'smpnotice01', title: '집합 시간 안내', body: '첫날 07:30까지 학교 운동장에 모이세요. 늦을 것 같으면 담임 선생님께 먼저 연락하세요.', audience: 'all', popup: true, updatedAt: '2026-10-06T00:00:00.000Z' },
    { id: 'smpnotice02', title: '숙소 생활 약속', body: '방 배정은 숙소에 도착하면 담임 선생님이 알려 줄 거예요.\n\n- 22:00 방별 인원 확인, 23:00 불 끄기\n- 다른 방에 드나들지 않기\n- 밤에 숙소 밖으로 나가지 않기', audience: 'students', popup: true, updatedAt: '2026-10-06T00:00:00.000Z' },
    { id: 'smpnotice03', title: '보호자 안내', body: '셋째 날 17:00쯤 학교에 도착할 예정이에요. 교통 상황에 따라 늦어질 수 있으니 도착 30분 전에 학급 단체방으로 알려 드릴게요.', audience: 'guardians', popup: true, updatedAt: '2026-10-06T00:00:00.000Z' },
  ],
  days: [
    {
      title: '신라의 수도를 걷다',
      stops: [
        {
          id: 'smp0001x', time: '07:30', end: '07:50', title: '학교 운동장 집합', kind: 'move',
          body: '반별로 줄을 서면 담임 선생님이 인원을 확인해요. 버스는 07:50에 떠나요.\n\n- 1·2반은 1호차, 3·4반은 2호차에 타세요.\n- 큰 짐은 버스 아래 짐칸에 싣고 하루 동안 쓸 작은 가방만 들고 타세요.\n- 경주까지는 버스로 4시간쯤 걸리고, 가는 길에 휴게소에 한 번 들러요.',
          rules: ['07:30까지 도착하세요. 늦을 것 같으면 담임 선생님께 먼저 연락하세요', '버스 안에서는 안전띠를 매고 달리는 동안 자리에서 일어나지 마세요'],
          meet: { place: '학교 운동장 국기 게양대 앞', time: '07:30' },
        },
        {
          id: 'smp0002x', time: '12:00', end: '13:00', title: '점심 · 교촌마을', kind: 'meal', place: P.gyochon,
          leg: { mode: 'bus', minutes: 230, note: '학교에서 출발해 휴게소에 한 번 들러요' },
          body: '교촌마을 앞 식당에서 반별로 점심을 먹어요. 메뉴는 쌈밥 정식이에요.\n\n- 식당 자리는 반마다 정해져 있으니 담임 선생님을 따라 들어가세요.\n- 다 먹고 시간이 남으면 한옥 골목을 둘러봐도 돼요. 경주향교와 최부자댁이 가까이 있어요.',
          rules: ['못 먹는 음식이 있으면 식당에 들어가기 전에 담임 선생님께 말씀드리세요', '골목을 둘러보더라도 13:00까지 식당 앞으로 돌아오세요'],
          meet: { place: '식당 앞', time: '13:00' },
        },
        {
          id: 'smp0003x', time: '13:20', end: '14:50', title: '국립경주박물관', kind: 'activity', place: P.museum, leg: { mode: 'bus' },
          body: '신라 천 년의 유물을 한곳에서 볼 수 있는 박물관이에요. 반별로 해설을 듣고 나서 조별로 관람해요.\n\n- 신라역사관에서 시작해 신라미술관, 월지관 순서로 돌아요.\n- 야외에 걸린 성덕대왕신종 앞에서 반 단체 사진을 찍어요.\n- 마음에 드는 유물 하나를 골라 이름과 고른 이유를 수첩에 적어 오세요.',
          rules: ['전시실 안에서는 뛰지 말고 작은 목소리로 이야기하세요', '플래시를 켜고 사진을 찍지 마세요', '유물과 진열장을 손으로 만지지 마세요'],
          meet: { place: '박물관 정문 앞 광장', time: '14:50' },
          reflect: { on: true, prompt: '가장 오래 들여다본 유물은 무엇인가요? 왜 그 유물에 눈길이 갔나요?' },
        },
        {
          id: 'smp0004x', time: '15:10', end: '15:45', title: '첨성대', kind: 'activity', place: P.cheom, leg: { mode: 'bus' },
          body: '신라 선덕여왕 때 세운 천문대로 알려진 곳이에요. 동양에서 손꼽히게 오래된 천문대예요.\n\n- 둘레를 한 바퀴 걸으며 돌이 몇 단으로 쌓였는지 세어 보세요.\n- 가운데 네모난 창이 어느 높이에 났는지도 눈여겨보세요.\n- 대릉원까지는 걸어서 15분쯤이라 다 같이 걸어가요.',
          rules: ['울타리 안으로 들어가거나 돌에 올라가지 마세요'],
          reflect: { on: true, prompt: '첨성대가 무엇에 쓰였을지 내 생각을 적어 보세요.' },
        },
        {
          id: 'smp0005x', time: '16:00', end: '17:00', title: '대릉원', kind: 'activity', place: P.daereung, leg: { mode: 'walk', note: '반별로 줄지어 걸어요' },
          body: '신라 왕과 귀족의 큰 무덤 20여 기가 모여 있는 곳이에요. 그중 천마총은 무덤 안에 들어가 볼 수 있어요.\n\n- 천마총 안에서 돌무지덧널무덤이 어떻게 쌓였는지 살펴보세요.\n- 천마총이라는 이름은 이 무덤에서 나온 천마도에서 왔어요. 천마도는 하늘을 나는 말을 그린 그림이에요.\n- 17:00까지 대릉원 정문 앞 버스로 돌아오세요.',
          rules: ['무덤 위에 올라가지 마세요', '천마총 안은 좁으니 앞사람과 거리를 두고 천천히 움직이세요'],
          meet: { place: '대릉원 정문 앞 버스', time: '17:00' },
        },
        {
          id: 'smp0006x', time: '17:40', title: '숙소 도착 · 저녁', kind: 'lodging', place: P.bomun, leg: { mode: 'bus' },
          body: '보문관광단지 안 숙소에 짐을 풀어요. 방 배정은 그때 담임 선생님이 알려 줄 거예요.\n\n- 방에 들어가면 비상구 위치부터 확인하세요.\n- 방에 망가진 물건이 있으면 바로 담임 선생님께 알려 주세요.\n- 18:30에 1층 식당에 모여 저녁을 먹어요.\n- 식사가 끝나면 19:15에 로비에 모여 동궁과 월지로 출발해요.',
          rules: ['다른 반 방에 드나들지 마세요', '지갑과 휴대폰은 늘 몸에 지니세요'],
          meet: { place: '숙소 1층 로비', time: '19:15' },
        },
        {
          id: 'smp0007x', time: '19:30', end: '20:40', title: '동궁과 월지 야경', kind: 'activity', place: P.donggung, leg: { mode: 'bus' },
          body: '신라 왕궁의 별궁 터예요. 밤에 조명이 켜지면 연못에 전각이 비쳐 낮과 전혀 다른 모습이 돼요.\n\n- 연못을 따라 한 바퀴 천천히 걸어요. 30~40분쯤 걸려요.\n- 연못 건너편 전각이 한눈에 들어오는 곳에서 사진을 찍어 보세요.\n- 20:40에 정문 앞으로 모여 숙소로 돌아가요.',
          rules: ['어두우니 두 명 이상 함께 다니세요', '연못가 난간 밖으로 나가지 마세요', '관람객이 많으니 큰 소리를 내지 마세요'],
          meet: { place: '동궁과 월지 정문 앞', time: '20:40' },
          reflect: { on: true, prompt: '밤에 본 동궁과 월지는 낮에 본 유적과 어떻게 달랐나요?' },
        },
        {
          id: 'smp0101x', time: '21:00', title: '숙소 복귀 · 방별 인원 확인', kind: 'lodging', place: P.bomun, leg: { mode: 'bus' },
          body: '숙소로 돌아와 씻고 쉬어요. 내일은 아침 일찍 불국사로 가요.\n\n- 22:00에 담임 선생님이 방마다 인원을 확인하니 그 시간에는 자기 방에 있어야 해요.\n- 23:00에 불을 꺼요. 휴대폰은 충전해 두고 일찍 자세요.\n- 몸이 안 좋으면 밤이라도 바로 담임 선생님께 연락하세요.',
          rules: ['밤에 숙소 밖으로 나가지 마세요', '다른 방에 드나들지 마세요'],
        },
      ],
    },
    {
      title: '불국사와 석굴암',
      stops: [
        {
          id: 'smp0008x', time: '07:30', end: '08:20', title: '아침 식사', kind: 'meal', place: P.bomun,
          body: '1층 식당에서 아침을 먹어요. 오늘 밤도 같은 숙소에서 자니 큰 짐은 방에 두고 나오세요.\n\n- 작은 가방에 물, 겉옷, 보조 배터리를 챙기세요.\n- 오늘은 많이 걸으니 아침을 든든히 먹어 두세요.',
          meet: { place: '숙소 앞 자기 호차 버스', time: '08:20' },
        },
        {
          id: 'smp0009x', time: '08:40', end: '10:40', title: '불국사', kind: 'activity', place: P.bulguk, leg: { mode: 'bus' },
          body: '1995년 석굴암과 함께 유네스코 세계유산이 된 절이에요. 해설사 선생님을 따라 반별로 관람해요.\n\n- 일주문으로 들어가 청운교·백운교 앞에서 반 단체 사진을 찍어요.\n- 대웅전 앞마당에서 다보탑과 석가탑을 나란히 놓고 비교해 보세요.\n- 극락전 현판 뒤에 숨은 돼지 조각도 찾아보세요.',
          rules: ['절 안에서는 조용히 다니고 법당 안은 밖에서 들여다보기만 하세요', '탑과 석축에 올라가거나 기대지 마세요', '청운교·백운교는 막혀 있으니 앞에서 사진만 찍으세요'],
          meet: { place: '불국사 일주문 앞', time: '10:40' },
          reflect: { on: true, prompt: '다보탑과 석가탑을 나란히 보며 무엇이 다르게 느껴졌나요?' },
        },
        {
          id: 'smp0010x', time: '11:00', end: '12:00', title: '석굴암', kind: 'activity', place: P.seokguram, leg: { mode: 'bus' },
          body: '토함산 중턱에 돌을 쌓아 만든 석굴 사원이에요. 주차장에서 석굴까지 숲길을 20분쯤 걸어 올라가요.\n\n- 석굴 앞 유리벽까지 반별로 차례대로 들어가 본존불을 봐요.\n- 기다리는 동안 토함산 아래를 내려다보세요. 날이 맑으면 멀리 동해가 보여요.',
          rules: ['석굴 안에서는 사진을 찍지 마세요', '숲길은 비탈이 있으니 뛰지 말고 오른쪽으로 걸으세요'],
          meet: { place: '석굴암 주차장 자기 호차 버스', time: '12:00' },
          reflect: { on: true, prompt: '석굴암 본존불을 마주했을 때의 느낌을 적어 보세요.' },
        },
        {
          id: 'smp0011x', time: '12:40', end: '15:30', title: '경주엑스포대공원', kind: 'activity', place: P.expo, leg: { mode: 'bus' },
          body: '공원 안 식당에서 점심을 먹고 반별로 전시관을 둘러봐요.\n\n- 경주타워는 황룡사 9층 목탑 모양을 새겨 넣은 건물이에요. 전망대에 오르면 경주 시내가 한눈에 보여요.\n- 전시관을 도는 순서는 반마다 달라서 입구에서 담임 선생님이 알려 줄 거예요.\n- 15:30까지 공원 정문 앞으로 모이세요.',
          rules: ['공원이 넓으니 조별로 움직이고, 조장은 30분마다 인원을 세어 주세요'],
          meet: { place: '경주엑스포대공원 정문 앞', time: '15:30' },
        },
        {
          id: 'smp0012x', time: '16:00', end: '17:30', title: '황리단길 자유 시간', kind: 'activity', place: P.hwangri, leg: { mode: 'bus' },
          body: '한옥 골목에 가게와 카페가 모여 있는 거리예요. 조별로 자유롭게 다녀요.\n\n- 흩어지기 전에 조원끼리 연락 방법을 확인해 두세요.\n- 사 먹고 남은 쓰레기는 들고 다니다 쓰레기통에 버리세요.\n- 17:30까지 대릉원 정문 옆 버스 주차장으로 모이세요.',
          rules: ['두 명 이상 함께 다니고 혼자 떨어지지 마세요', '17:30까지 모이세요. 늦을 것 같으면 담임 선생님께 먼저 연락하세요', '큰길을 건널 때는 신호를 지키세요'],
          meet: { place: '대릉원 정문 옆 버스 주차장', time: '17:30' },
        },
        {
          id: 'smp0013x', time: '18:00', title: '숙소 · 저녁 · 반별 모임', kind: 'lodging', place: P.bomun, leg: { mode: 'bus' },
          body: '숙소로 돌아와 저녁을 먹은 뒤 19:30부터 반별 모임을 해요.\n\n- 반별 모임에서는 오늘 본 곳 가운데 하나를 골라 이야기를 나눠요.\n- 22:00 방별 인원 확인과 23:00 불 끄기는 어제와 같아요.\n- 내일 아침에 퇴실하니 자기 전에 짐을 미리 싸 두세요.',
          rules: ['밤에 숙소 밖으로 나가지 마세요', '다른 방에 드나들지 마세요'],
          meet: { place: '숙소 1층 세미나실', time: '19:30' },
        },
      ],
    },
    {
      title: '양동마을과 귀가',
      stops: [
        {
          id: 'smp0014x', time: '07:30', end: '08:30', title: '아침 식사 · 퇴실', kind: 'meal', place: P.bomun,
          body: '아침을 먹고 방을 정리한 뒤 짐을 모두 챙겨 퇴실해요.\n\n- 나서기 전에 충전기, 옷걸이에 건 옷, 욕실 세면도구를 다시 확인하세요.\n- 방 카드는 담임 선생님께 돌려드리세요.\n- 08:30까지 큰 짐을 버스 짐칸에 싣고 자리에 앉으세요.',
          rules: ['쓰레기는 봉투 하나에 모아 두세요', '두고 온 물건은 다시 찾기 어려우니 퇴실 전에 한 번 더 확인하세요'],
          meet: { place: '숙소 앞 자기 호차 버스', time: '08:30' },
        },
        {
          id: 'smp0015x', time: '09:30', end: '11:30', title: '양동마을', kind: 'activity', place: P.yangdong, leg: { mode: 'bus' },
          body: '2010년 하회마을과 함께 유네스코 세계유산이 된 양반 마을이에요. 지금도 사람들이 살고 있어요. 해설사 선생님을 따라 반별로 돌아봐요.\n\n- 마을 입구 안내판에서 집 이름과 위치를 먼저 확인하세요.\n- 언덕 위 기와집과 아래쪽 초가집이 어떻게 자리 잡았는지 살펴보세요.',
          rules: ['사람이 사는 집이니 문이 닫힌 집에는 들어가지 마세요', '마당이나 방 안을 들여다보거나 사진을 찍지 마세요', '마을 안에서는 작은 목소리로 이야기하세요'],
          meet: { place: '양동마을 입구 주차장', time: '11:30' },
          reflect: { on: true, prompt: '옛사람들의 집과 마을에서 지금 우리 동네와 닮은 점이나 다른 점을 찾아보세요.' },
        },
        {
          id: 'smp0016x', time: '12:00', end: '13:00', title: '점심 · 휴게소', kind: 'meal',
          leg: { mode: 'bus', minutes: 30 },
          body: '학교로 가는 길에 휴게소에 들러 반별로 점심을 먹어요.\n\n- 점심값은 미리 냈어요. 버스에서 내릴 때 담임 선생님께 식권을 받으세요.\n- 화장실에 꼭 다녀오고 13:00까지 버스에 타세요.',
          rules: ['휴게소 주차장은 차가 많이 다니니 버스 사이로 다니지 마세요'],
          meet: { place: '휴게소 앞 자기 호차 버스', time: '13:00' },
        },
        {
          id: 'smp0017x', time: '17:00', title: '학교 도착 · 해산', kind: 'move',
          leg: { mode: 'bus', minutes: 240, note: '휴게소에서 학교까지' },
          body: '학교 운동장에 도착하면 반별로 인원을 확인하고 해산해요.\n\n- 도착 시각은 교통 상황에 따라 바뀔 수 있어요. 담임 선생님이 학급 단체방으로 알려 줄 거예요.\n- 버스에서 내리기 전에 자리 밑과 짐칸에 두고 내리는 물건이 없는지 확인하세요.\n- 다녀와서 일주일 안에 「내 느낀 점 저장」으로 받은 파일을 클래스룸 과제에 올려 주세요.',
          rules: ['인원 확인이 끝나기 전에 먼저 집에 가지 마세요'],
        },
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
        const r = routeCache.get(routeKey(s.leg.mode, last, s.place.coords)) ?? (await route(s.leg.mode, last, s.place.coords))
        if (r) s.leg.route = r
        console.log('길', s.title, r ? `${r.km}km ${r.min}분 점 ${r.coords.length}` : '실패')
      }
    }
    last = s.place.coords
  }
}
fs.mkdirSync('public/sample', { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(doc) + '\n')
console.log('저장', fs.statSync(OUT).size, 'bytes')
