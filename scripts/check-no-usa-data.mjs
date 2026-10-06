// 다른 학교 실제 여행 자료(학교 이름·사이트 이름)가 이 공개 레포에 섞이지 않게 막는다.
// 실제 명단 이름까지 보려면 NAMES_FILE=<한 줄에 이름 하나 파일> 을 주고 실행한다(그 파일은 레포 밖에 둔다).
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = new URL('../', import.meta.url)
const SKIP = new Set(['node_modules', '.git', 'dist', '.data', '.vercel', '.artifacts', '.claude'])
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
// 막을 학교·사이트 이름은 공개 레포에 두지 않는다(해시로 둬도 짧아서 금방 풀린다). 레포 밖 파일에서 읽는다.
// 기본 위치: ~/.config/trip-guide/banned.txt (한 줄에 하나). 파일이 없는 곳(배포 빌드 등)에서는 이름 검사를 건너뛴다.
const BANNED_FILE = process.env.BANNED_FILE || join(homedir(), '.config/trip-guide/banned.txt')
const banned = existsSync(BANNED_FILE) ? (await readFile(BANNED_FILE, 'utf8')).split('\n').map((s) => s.trim().toLowerCase()).filter((s) => s.length >= 3) : []
const hasBanned = (text) => {
  const lower = text.toLowerCase()
  return banned.some((b) => lower.includes(b))
}
const names = process.env.NAMES_FILE ? (await readFile(process.env.NAMES_FILE, 'utf8')).split('\n').map((s) => s.trim()).filter((s) => s.length >= 2) : []
async function walk(dir) {
  const out = []
  for (const e of await readdir(new URL(dir || '.', ROOT), { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue
    const p = dir ? join(dir, e.name) : e.name
    if (e.isDirectory()) out.push(...(await walk(p)))
    else if (/\.(ts|tsx|js|mjs|json|css|html|md|txt)$/.test(e.name)) out.push(p)
  }
  return out
}
const fails = []
for (const f of await walk('')) {
  if (f === 'package-lock.json') continue
  const text = await readFile(new URL(f, ROOT), 'utf8')
  if (hasBanned(text)) fails.push(`${f}: 다른 학교 이름·사이트 이름`)
  for (const n of names) if (text.includes(n)) fails.push(`${f}: 명단 이름`)
}
if (fails.length) {
  console.error('다른 학교 자료가 섞였어요:\n' + fails.join('\n'))
  process.exit(1)
}
console.log(banned.length ? 'no-usa-data guard OK' : 'no-usa-data guard: 금지어 파일이 없어 이름 검사는 건너뜀')
