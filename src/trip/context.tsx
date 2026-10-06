import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { TripDoc } from './schema'
import { derive, type Derived } from './derive'
import { now } from '../lib/time'
import { useStored } from '../lib/storage'

export type Role = 'student' | 'guardian' | 'teacher'

type TripState = {
  /** 저장된 여행이면 id, 랜딩 샘플이면 null */
  tripId: string | null
  /** 저장 열쇠·느낀 점을 묶는 이름(샘플은 'sample') */
  scope: string
  d: Derived
  doc: TripDoc
  role: Role | null
  setRole: (r: Role | null) => void
  /** 1분마다 갱신되는 현재 시각(?now= 로 바꿔 볼 수 있음) */
  at: Date
  sample: boolean
  updatedAt: string | null
}

const Ctx = createContext<TripState | null>(null)

export function TripProvider({ doc, tripId, updatedAt = null, defaultRole = null, children }: { doc: TripDoc; tripId: string | null; updatedAt?: string | null; defaultRole?: Role | null; children: ReactNode }) {
  const scope = tripId ?? 'sample'
  const [storedRole, setRole] = useStored<Role | null>(`role:${scope}`, null)
  const role = storedRole ?? defaultRole
  const [at, setAt] = useState(now)
  useEffect(() => {
    const id = window.setInterval(() => setAt(now()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  const d = useMemo(() => derive(doc), [doc])
  const value = useMemo<TripState>(() => ({ tripId, scope, d, doc, role, setRole, at, sample: !tripId, updatedAt }), [tripId, scope, d, doc, role, setRole, at, updatedAt])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTrip(): TripState {
  const v = useContext(Ctx)
  if (!v) throw new Error('TripProvider 밖에서 useTrip 을 불렀다')
  return v
}
