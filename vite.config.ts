import { defineConfig, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'

/**
 * 개발 서버에서도 배포본과 같은 서버 코드(api/_lib/http.ts)를 돌린다. 저장은 레포 안 .data/ 폴더.
 * 배포본(Vercel)에서는 api/*.ts 가 함수로 따로 돈다.
 */
function devApi(): Plugin {
  let server: ViteDevServer
  let devStore: import('./api/_lib/store').Store | null = null
  return {
    name: 'dev-api',
    apply: 'serve',
    configureServer(s) {
      server = s
      s.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const manifest = url.pathname.match(/^\/t\/([a-z2-9]{10})\/manifest\.webmanifest$/)
        if (!url.pathname.startsWith('/api/') && !manifest) return next()
        try {
          const mod = (await server.ssrLoadModule('/api/_lib/http.ts')) as typeof import('./api/_lib/http')
          const st = (await server.ssrLoadModule('/api/_lib/store.ts')) as typeof import('./api/_lib/store')
          devStore ??= new st.FileStore(path.resolve(server.config.root, '.data'))
          const ctx = { store: devStore, pepper: 'local-dev-pepper-only-for-this-computer', now: () => Date.now() }
          const chunks: Buffer[] = []
          for await (const c of req) chunks.push(c as Buffer)
          const body = chunks.length ? Buffer.concat(chunks) : undefined
          const headers = new Headers()
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
          headers.set('x-real-ip', req.socket.remoteAddress ?? 'local')
          const target = manifest ? `/api/manifest?id=${manifest[1]}` : url.pathname + url.search
          const request = new Request(new URL(target, `http://${req.headers.host}`), { method: req.method, headers, body: body && req.method !== 'GET' ? body : undefined })
          const handler = target.startsWith('/api/trip') ? mod.handleTrip : target.startsWith('/api/manifest') ? mod.handleManifest : null
          if (!handler) return next()
          const r = await handler(request, ctx)
          res.statusCode = r.status
          r.headers.forEach((v, k) => res.setHeader(k, v))
          res.end(Buffer.from(await r.arrayBuffer()))
        } catch (e) {
          console.error(e)
          res.statusCode = 500
          res.end('dev api error')
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), devApi()],
  worker: { format: 'es' },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: { manualChunks: (id) => (id.includes('node_modules/maplibre-gl') || id.includes('node_modules/@maplibre') ? 'maplibre' : id.includes('node_modules/react') ? 'react' : undefined) },
    },
  },
  // 개발용 저장 폴더(.data: PIN 해시 포함)는 개발 서버가 파일로 내주지 않는다
  server: { port: 5191, strictPort: false, fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.data/**'] } },
})
