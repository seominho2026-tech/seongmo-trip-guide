// 배포 보안 정책(vercel.json 의 CSP connect-src)에 코드가 부르는 바깥 주소가 다 들어 있는지 확인한다.
// 개발 서버는 CSP 를 적용하지 않아 빠져도 로컬에서는 멀쩡하고, 배포본에서만 요청이 막힌다.
import fs from 'node:fs'
import path from 'node:path'

// 주소를 변수로 조립하거나 new URL() 로 만들면 못 잡는다. 바깥 주소는 문자열 그대로 적는다.
const DIRS = ['src']
const csp = JSON.parse(fs.readFileSync('vercel.json', 'utf8'))
  .headers.flatMap((h) => h.headers)
  .find((h) => h.key === 'Content-Security-Policy')?.value
if (!csp) throw new Error('vercel.json 에 Content-Security-Policy 가 없어요.')
const connect = (csp.match(/connect-src([^;]*)/)?.[1] ?? '').trim().split(/\s+/)

// 실제로 부르는 파일만 본다: fetch 를 쓰는 파일과 지도(타일·글꼴을 불러온다). 화면 링크만 있는 파일은 뺀다.
const files = DIRS.flatMap((d) => fs.readdirSync(d, { recursive: true }).map((f) => path.join(d, String(f))))
  .filter((f) => /\.(ts|tsx)$/.test(f))
  .filter((f) => f.startsWith(path.join('src', 'features', 'map')) || /\bfetch\(/.test(fs.readFileSync(f, 'utf8')))
const missing = []
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  // 따옴표로 시작하는 주소(실제로 부르는 곳). 링크(href)는 화면에서 여는 것이라 뺀다.
  for (const m of src.matchAll(/(?<!href=)['"`](https:\/\/[a-z0-9.-]+)/g)) {
    if (!connect.includes(m[1])) missing.push(`${f}: ${m[1]}`)
  }
}
if (missing.length) {
  console.error('CSP connect-src 에 없는 주소가 있어요(배포본에서 막혀요):\n' + missing.join('\n'))
  process.exit(1)
}
console.log(`csp guard OK (${files.length} files)`)
