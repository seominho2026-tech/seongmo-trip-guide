/**
 * 아이콘 한 벌. 화면의 기호는 모두 여기서 그린다(이모지·문자 기호 금지).
 *
 * 규격: viewBox 24×24, 선만(fill 없음), stroke = currentColor, 굵기 1.8, 끝은 둥글게.
 * 그림은 viewBox 가운데(12,12)에 맞춰 그렸다. 크기는 rem 이라 글자 확대를 따라간다.
 */
import type { SVGProps } from 'react'

const PATHS = {
  chevronLeft: <path d="m14.5 5.5-6.5 6.5 6.5 6.5" />,
  chevronRight: <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
  chevronDown: <path d="m5.5 9.5 6.5 6.5 6.5-6.5" />,
  close: (
    <>
      <path d="m6 6 12 12" />
      <path d="m18 6-12 12" />
    </>
  ),
  bus: (
    <>
      <rect x="5" y="3.5" width="14" height="15" rx="2.5" />
      <path d="M5 12.5h14M5 8h14" />
      <path d="M8 18.5v2M16 18.5v2" />
      <circle cx="8.5" cy="15.5" r="0.6" fill="currentColor" />
      <circle cx="15.5" cy="15.5" r="0.6" fill="currentColor" />
    </>
  ),
  walk: (
    <>
      <circle cx="13" cy="4.5" r="1.8" />
      <path d="m10.5 21 2-6 2.5 2.5V21" />
      <path d="M8 12.5 10.5 9l3 .5 2.5 3.5 2 .5" />
      <path d="m10.5 9-1 4.5 3 1.5" />
    </>
  ),
  plane: <path d="M10.2 20.5 12 14.8l-5 1.7-1.3-1.3 5.6-4.5L5 6.4l1.5-1.5 7.4 3.1 3.6-3.7a1.8 1.8 0 0 1 2.6 2.6l-3.7 3.6 3.1 7.4-1.5 1.5-4.3-6.3-4.5 5.6z" />,
  boat: (
    <>
      <path d="M4 15.5h16l-2.2 4H6.2z" />
      <path d="M6.5 15.5v-5h11v5" />
      <path d="M9.5 10.5v-3h5v3" />
      <path d="M12 7.5v-3" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  flag: (
    <>
      <path d="M6 21V4" />
      <path d="M6 4.5h10.5l-2 4 2 4H6" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.8 21 19.5H3z" />
      <path d="M12 10v4.2" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" />
    </>
  ),
  bulb: (
    <>
      <path d="M9 17.5h6M10 20.5h4" />
      <path d="M12 3.5a5.5 5.5 0 0 0-3.2 10c.6.5 1 1.2 1 2V17h4.4v-1.5c0-.8.4-1.5 1-2A5.5 5.5 0 0 0 12 3.5z" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  photo: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="m20.5 15.5-4.8-4.5L6 19" />
    </>
  ),
  expand: (
    <>
      <path d="M4.5 9.5v-5h5M19.5 9.5v-5h-5M4.5 14.5v5h5M19.5 14.5v5h-5" />
    </>
  ),
  collapse: (
    <>
      <path d="M9.5 4.5v5h-5M14.5 4.5v5h5M9.5 19.5v-5h-5M14.5 19.5v-5h5" />
    </>
  ),
  menu: <path d="M4.5 7h15M4.5 12h15M4.5 17h15" />,
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.8 20.5a7.2 7.2 0 0 1 14.4 0" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.3" />
      <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
      <path d="M15 5.5a3.3 3.3 0 0 1 0 6.3M17 14.2a5.5 5.5 0 0 1 3.5 5.3" />
    </>
  ),
  bed: (
    <>
      <path d="M3.5 18.5V6M3.5 14h17v4.5M20.5 14v-2.5a3 3 0 0 0-3-3H11V14" />
      <circle cx="7" cy="11" r="1.8" />
    </>
  ),
  meal: (
    <>
      <path d="M7 3.5v7.5M4.5 3.5V8a2.5 2.5 0 0 0 5 0V3.5M7 11v9.5" />
      <path d="M17 20.5V3.5c-2.2 1.2-3.3 3.6-3.3 7.5H17" />
    </>
  ),
  campus: (
    <>
      <path d="M3.5 9 12 4.5 20.5 9z" />
      <path d="M5.5 9v8M9.8 9v8M14.2 9v8M18.5 9v8" />
      <path d="M3.5 19.5h17" />
    </>
  ),
  lecture: (
    <>
      <rect x="3.5" y="4.5" width="17" height="11" rx="1.5" />
      <path d="M8 20l4-4.5 4 4.5" />
    </>
  ),
  museum: (
    <>
      <path d="M12 3.5 20.5 8h-17z" />
      <path d="M5.5 8v9.5M10 8v9.5M14 8v9.5M18.5 8v9.5" />
      <path d="M3.5 20.5h17M4.5 17.5h15" />
    </>
  ),
  bag: (
    <>
      <path d="M5 8h14l-1.2 12.5H6.2z" />
      <path d="M9 10V6.5a3 3 0 0 1 6 0V10" />
    </>
  ),
  phone: <path d="M8.6 4.5 6.3 4a1.8 1.8 0 0 0-2 1.5c-.6 7.5 6.7 14.8 14.2 14.2a1.8 1.8 0 0 0 1.5-2l-.5-2.3a1.5 1.5 0 0 0-1.7-1.2l-2.3.5a12 12 0 0 1-4.9-4.9l.5-2.3a1.5 1.5 0 0 0-1.2-1.7z" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2" />
      <path d="M15.5 8.5V6A2 2 0 0 0 13.5 4H6A2 2 0 0 0 4 6v7.5a2 2 0 0 0 2 2h2.5" />
    </>
  ),
  share: (
    <>
      <path d="M12 15V4M8 7.5 12 4l4 3.5" />
      <path d="M8 11H6.5A2 2 0 0 0 4.5 13v5.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V13a2 2 0 0 0-2-2H16" />
    </>
  ),
  external: (
    <>
      <path d="M13.5 4.5h6v6M19.5 4.5l-8 8" />
      <path d="M17.5 14v4a2 2 0 0 1-2 2h-9.5a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2h4" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="15" rx="2" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </>
  ),
  locate: (
    <>
      <circle cx="12" cy="12" r="6.5" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
    </>
  ),
  list: (
    <>
      <path d="M9 7h11M9 12h11M9 17h11" />
      <circle cx="4.8" cy="7" r="0.9" fill="currentColor" />
      <circle cx="4.8" cy="12" r="0.9" fill="currentColor" />
      <circle cx="4.8" cy="17" r="0.9" fill="currentColor" />
    </>
  ),
  pen: (
    <>
      <path d="M15.5 4.8 19.2 8.5 8.5 19.2 4 20l.8-4.5z" />
      <path d="m13.5 6.8 3.7 3.7" />
    </>
  ),
  seat: (
    <>
      <path d="M7 4.5h6a2 2 0 0 1 2 2v7H7z" />
      <path d="M5 13.5h12a2 2 0 0 1 2 2v1.5H5z" />
      <path d="M7 17v3M17 17v3" />
    </>
  ),
  star: <path d="m12 4 2.4 5 5.3.6-3.9 3.6 1 5.3L12 15.9l-4.8 2.6 1-5.3-3.9-3.6 5.3-.6z" />,
  megaphone: (
    <>
      <path d="M4.5 9.5H8L15 5v14l-7-4.5H4.5z" />
      <path d="M18 9a4 4 0 0 1 0 6" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 6.75h15" />
      <path d="M9.5 6.75v-2h5v2" />
      <path d="m6.5 6.75 1 12.5h9l1-12.5" />
      <path d="M10.5 10.75v5M13.5 10.75v5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.8" r="0.6" fill="currentColor" />
    </>
  ),
  document: (
    <>
      <path d="M13.5 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z" />
      <path d="M13.5 3.5V9H19M8.5 13h7M8.5 16.5h5" />
    </>
  ),
  wallet: (
    <>
      <rect x="3.5" y="6" width="17" height="13.5" rx="2.5" />
      <path d="M3.5 10h17M15.5 14.5h2" />
    </>
  ),
  shirt: <path d="M8.5 4.5 4 7l1.8 4 2.2-1v10.5h8V10l2.2 1L20 7l-4.5-2.5a3.5 3.5 0 0 1-7 0z" />,
  shield: (
    <>
      <path d="M12 3.5 19 6v5.5c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </>
  ),
  battery: (
    <>
      <rect x="3.5" y="7.5" width="15" height="9" rx="2" />
      <path d="M20.5 10.5v3" />
      <path d="M7 10.5v3M10 10.5v3" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.4 2.3 3.6 5.2 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.2-3.6-8.5S9.6 5.8 12 3.5z" />
    </>
  ),
  arrowRight: <path d="M4.5 12h14.5M13.5 6.5 19 12l-5.5 5.5" />,
  download: (
    <>
      <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
      <path d="M4.5 19.5h15" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  // 정류장 표지(가로 10 · 세로 17, 가운데 12,12)
  transit: (
    <>
      <rect x="7" y="3.5" width="10" height="7.5" rx="1.75" />
      <path d="M9.75 7.25h4.5M12 11v9.5M9.25 20.5h5.5" />
    </>
  ),
  chevronUp: <path d="m5.5 15.25 6.5-6.5 6.5 6.5" />,
  qr: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <path d="M14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5zM14 19.5h1M19.5 14v1" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15.5v-11M7.5 9 12 4.5 16.5 9" />
      <path d="M4.5 19.5h15" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  train: (
    <>
      <rect x="6" y="3.5" width="12" height="14" rx="3" />
      <path d="M6 11h12M9.5 14.5h.01M14.5 14.5h.01" />
      <path d="m8.5 20.5 1.5-3M15.5 20.5l-1.5-3" />
    </>
  ),
  subway: (
    <>
      <rect x="5.5" y="3.5" width="13" height="14" rx="2.5" />
      <path d="M5.5 10.5h13M9 14.5h.01M15 14.5h.01" />
      <path d="m8 20.5 2-3M16 20.5l-2-3" />
    </>
  ),
  car: (
    <>
      <path d="M4 15.5v-3.2l1.8-4.6A2 2 0 0 1 7.7 6.5h8.6a2 2 0 0 1 1.9 1.2l1.8 4.6v3.2z" />
      <path d="M4 12.5h16M7.5 15.5v2M16.5 15.5v2" />
    </>
  ),
  home: (
    <>
      <path d="M4.5 10.5 12 4.5l7.5 6V19.5h-15z" />
      <path d="M10 19.5v-5h4v5" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  key: (
    <>
      <circle cx="7.5" cy="12" r="3.5" />
      <path d="M11 12h9M17 12v3M20 12v2.5" />
    </>
  ),
  print: (
    <>
      <path d="M7 8.5V4h10v4.5" />
      <rect x="4" y="8.5" width="16" height="7.5" rx="2" />
      <path d="M7 13.5h10V20H7z" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15.2 8.8-1.9 4.5-4.5 1.9 1.9-4.5z" />
    </>
  ),
  logout: (
    <>
      <path d="M13.5 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h7" />
      <path d="M10 12h10M16.5 8.5 20 12l-3.5 3.5" />
    </>
  ),
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = '1.25rem', strokeWidth = 1.8, label, ...rest }: { name: IconName; size?: number | string; strokeWidth?: number; label?: string } & Omit<SVGProps<SVGSVGElement>, 'children'>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
      className="icon"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  )
}

/** 일정 종류별 아이콘 */
export const KIND_ICON: Record<string, IconName> = {
  activity: 'compass',
  meal: 'meal',
  lodging: 'bed',
  move: 'bus',
  etc: 'info',
}

export const LEG_ICON: Record<string, IconName> = { bus: 'bus', walk: 'walk', transit: 'transit', subway: 'subway', train: 'train', car: 'car', flight: 'plane', boat: 'boat' }
