import { TripDoc, type TripDoc as TripDocT } from '../../trip/schema'
import { addDays, clock } from '../../lib/time'

/** 샘플 여행. 날짜는 늘 앞으로 다가올 수요일(2주 뒤쯤)로 옮겨 'D-14' 처럼 보이게 한다. */
export async function loadSample(): Promise<TripDocT> {
  const res = await fetch('/sample/gyeongju.json')
  const doc = TripDoc.parse(await res.json())
  const today = clock(new Date(), 'Asia/Seoul').ymd
  let start = addDays(today, 14)
  while (new Date(`${start}T00:00:00Z`).getUTCDay() !== 3) start = addDays(start, 1)
  return { ...doc, startDate: start }
}
