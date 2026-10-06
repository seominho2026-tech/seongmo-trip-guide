// 새 아이콘의 그림이 24×24 칸 가운데에 있는지 잰다(좌우·상하 여백 차이). Playwright 로 실제 getBBox 를 쓴다.
import { chromium } from 'playwright'
import fs from 'node:fs'
const src = fs.readFileSync(new URL('../src/components/Icon.tsx', import.meta.url), 'utf8')
const body = src.slice(src.indexOf('const PATHS = {') + 15, src.indexOf('} as const'))
const names = process.argv.slice(2)
const entries = []
for (const n of names) {
  const m = body.match(new RegExp(`\\n  ${n}: ([\\s\\S]*?),\\n  [a-zA-Z]+:|\\n  ${n}: ([\\s\\S]*?),\\n$`))
  if (!m) { console.log('missing', n); continue }
  const jsx = (m[1] ?? m[2]).replace(/^\(\s*<>|<\/>\s*\)$/g, '').replace(/^<>|<\/>$/g, '')
  entries.push([n, jsx.replace(/fill="currentColor"/g, 'fill="#000"')])
}
const b = await chromium.launch()
const p = await b.newPage()
await p.setContent(`<svg xmlns="http://www.w3.org/2000/svg">${entries.map(([n, j]) => `<g id="${n}" fill="none" stroke="#000" stroke-width="1.8">${j}</g>`).join('')}</svg>`)
for (const [n] of entries) {
  const bb = await p.evaluate((id) => { const g = document.getElementById(id); const r = g.getBBox(); return { x: r.x - 0.9, y: r.y - 0.9, w: r.width + 1.8, h: r.height + 1.8 } }, n)
  const dx = (bb.x - (24 - bb.x - bb.w)).toFixed(2), dy = (bb.y - (24 - bb.y - bb.h)).toFixed(2)
  console.log(n.padEnd(10), 'left-right', dx, 'top-bottom', dy, Math.abs(dx) > 1 || Math.abs(dy) > 1 ? 'OFF' : 'ok')
}
await b.close()
