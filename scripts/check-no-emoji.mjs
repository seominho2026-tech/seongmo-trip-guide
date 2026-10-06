// 화면에 그려지는 이모지·문자 기호와 긴 줄표(—)를 막는다. 아이콘은 src/components/Icon.tsx 의 SVG 만 쓴다.
// 주석 줄과 `emoji-guard-ok` 표시가 있는 줄(문자를 SVG 로 바꾸는 코드)은 건너뛴다. 샘플 여행 글도 검사한다.
import { readdir, readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

const ROOT = new URL('../', import.meta.url)
const ALLOWED = new Set([...'·…×'])
const banned = (ch) => {
  const o = ch.codePointAt(0)
  if (ALLOWED.has(ch)) return false
  return (o >= 0x1f000 && o <= 0x1faff) || (o >= 0x2600 && o <= 0x27bf) || (o >= 0x2b00 && o <= 0x2bff) || (o >= 0x25a0 && o <= 0x25ff) || (o >= 0x2190 && o <= 0x21ff) || o === 0xfe0f || o === 0x2014
}
async function walk(dir, exts) {
  const out = []
  for (const e of await readdir(new URL(dir, ROOT), { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walk(p, exts)))
    else if (exts.includes(extname(e.name))) out.push(p)
  }
  return out
}
const fails = []
const files = [...(await walk('src', ['.ts', '.tsx'])), ...(await walk('api', ['.ts'])), 'index.html']
for (const f of files) {
  const lines = (await readFile(new URL(f, ROOT), 'utf8')).split('\n')
  lines.forEach((line, i) => {
    const t = line.trim()
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || line.includes('emoji-guard-ok')) return
    const hits = [...line].filter(banned)
    if (hits.length) fails.push(`${f}:${i + 1}: [${hits.join('')}]`)
  })
}
// 샘플 여행: 화살표(→)는 화면에서 SVG 로 바뀌므로 허용, 나머지는 같은 규칙
const sample = await readFile(new URL('public/sample/gyeongju.json', ROOT), 'utf8')
const sampleHits = [...sample].filter((c) => c !== '→' && banned(c))
if (sampleHits.length) fails.push(`public/sample/gyeongju.json: [${[...new Set(sampleHits)].join('')}]`)
if (fails.length) {
  console.error('화면 기호·긴 줄표 금지:\n' + fails.join('\n'))
  process.exit(1)
}
console.log(`emoji guard OK (${files.length} files)`)
