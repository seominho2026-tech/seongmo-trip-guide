// 앱 아이콘 전 세트(favicon.ico 포함)를 한 그림에서 만든다: 주황 바탕에 검은 지도 핀과 점선 길.
// 실행: node scripts/make-icons.mjs  (favicon.ico 는 ImageMagick magick 로 묶는다)
import sharp from 'sharp'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const glyph = (s) => `
  <g transform="translate(${s.x} ${s.y}) scale(${s.k})" fill="none" stroke="#111111" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z" stroke-width="2.1"/>
    <circle cx="12" cy="10" r="2.4" stroke-width="2.1"/>
  </g>`
const svg = (size, { radius, k }) => {
  const g = 24 * k
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="#ed5a14"/>
  ${glyph({ x: (size - g) / 2, y: (size - g) / 2 + size * 0.01, k })}
</svg>`
}
fs.mkdirSync('public/icons', { recursive: true })
const out = async (file, size, opts) => sharp(Buffer.from(svg(size, opts))).png().toFile(file)
await out('public/icons/icon-192.png', 192, { radius: 42, k: 5.2 })
await out('public/icons/icon-512.png', 512, { radius: 112, k: 13.8 })
await out('public/icons/icon-maskable-512.png', 512, { radius: 0, k: 10.5 })
await out('public/icons/apple-touch-icon.png', 180, { radius: 0, k: 4.6 })
for (const s of [16, 32, 48]) await out(`public/icons/fav-${s}.png`, s, { radius: s * 0.22, k: s / 24 * 0.95 })
execFileSync('magick', ['public/icons/fav-16.png', 'public/icons/fav-32.png', 'public/icons/fav-48.png', 'public/favicon.ico'])
for (const s of [16, 32, 48]) fs.rmSync(`public/icons/fav-${s}.png`)
console.log('icons OK')
