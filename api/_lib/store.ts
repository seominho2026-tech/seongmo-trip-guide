/**
 * 저장소. 배포본은 Vercel Blob(비공개), 내 컴퓨터 개발 서버는 .data/ 폴더, 시험은 메모리를 쓴다.
 * 세 가지 모두 같은 약속을 지킨다.
 *  - get: 없으면 null. 있으면 본문과 ETag.
 *  - put: ifMatch 를 주면 그 ETag 일 때만 쓴다(아니면 PreconditionFailed). create 면 없을 때만 쓴다.
 * 이 약속 덕분에 여러 선생님이 동시에 고쳐도, 누가 PIN 을 동시에 여러 번 넣어도 숫자가 꼬이지 않는다.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, writeFile, rename } from 'node:fs/promises'
import path from 'node:path'

export class PreconditionFailed extends Error {
  constructor() {
    super('precondition failed')
  }
}

export type Stored = { body: string; etag: string }

export interface Store {
  /** fresh: 캐시를 거치지 않고 원본에서 읽는다(쓰기 직전 판단·편집기 최신 읽기) */
  get(key: string, opts?: { fresh?: boolean }): Promise<Stored | null>
  /** create: 없을 때만 쓴다. ifMatch: 그 ETag 일 때만 쓴다. 둘 다 없으면 덮어쓴다. */
  put(key: string, body: string, opts?: { ifMatch?: string; create?: boolean }): Promise<{ etag: string }>
  del(keys: string[]): Promise<void>
  list(prefix: string): Promise<string[]>
  /** 이름과 마지막으로 쓴 시각(정리 작업이 파일을 열지 않고 오래된 것을 고르게) */
  entries(prefix: string): Promise<{ key: string; at: number }[]>
}

/** W/"abc" → "abc" */
export const strongEtag = (etag: string) => etag.replace(/^W\//, '')

const etagOf = (body: string) => '"' + createHash('sha256').update(body).digest('hex').slice(0, 32) + '"'

export class MemoryStore implements Store {
  data = new Map<string, Stored>()
  at = new Map<string, number>()
  /** clock: 시험에서 시계를 돌릴 수 있게 */
  constructor(private clock: () => number = Date.now) {}
  async get(key: string) {
    return this.data.get(key) ?? null
  }
  async put(key: string, body: string, opts: { ifMatch?: string; create?: boolean } = {}) {
    const cur = this.data.get(key)
    if (opts.create && cur) throw new PreconditionFailed()
    if (opts.ifMatch && cur?.etag !== opts.ifMatch) throw new PreconditionFailed()
    const etag = etagOf(body + ':' + Date.now() + Math.random())
    this.data.set(key, { body, etag })
    this.at.set(key, this.clock())
    return { etag }
  }
  async del(keys: string[]) {
    for (const k of keys) {
      this.data.delete(k)
      this.at.delete(k)
    }
  }
  async list(prefix: string) {
    return [...this.data.keys()].filter((k) => k.startsWith(prefix)).sort()
  }
  async entries(prefix: string) {
    return (await this.list(prefix)).map((key) => ({ key, at: this.at.get(key) ?? 0 }))
  }
}

/** 개발 서버용: 레포 안 .data/ 폴더(.gitignore). 한 프로세스에서만 쓰므로 간단한 잠금으로 충분하다. */
export class FileStore implements Store {
  private lock: Promise<unknown> = Promise.resolve()
  constructor(private root: string) {}
  private file(key: string) {
    if (key.includes('..')) throw new Error('bad key')
    return path.join(this.root, key)
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lock.then(fn, fn)
    this.lock = run.catch(() => undefined)
    return run
  }
  async get(key: string) {
    try {
      const body = await readFile(this.file(key), 'utf8')
      return { body, etag: etagOf(body) }
    } catch {
      return null
    }
  }
  put(key: string, body: string, opts: { ifMatch?: string; create?: boolean } = {}) {
    return this.serial(async () => {
      const cur = await this.get(key)
      if (opts.create && cur) throw new PreconditionFailed()
      if (opts.ifMatch && cur?.etag !== opts.ifMatch) throw new PreconditionFailed()
      const f = this.file(key)
      await mkdir(path.dirname(f), { recursive: true })
      await writeFile(f + '.tmp', body)
      await rename(f + '.tmp', f)
      return { etag: etagOf(body) }
    })
  }
  async del(keys: string[]) {
    for (const k of keys) await rm(this.file(k), { force: true })
  }
  async list(prefix: string) {
    const out: string[] = []
    const walk = async (dir: string) => {
      let names: string[] = []
      try {
        names = await readdir(dir)
      } catch {
        return
      }
      for (const n of names) {
        const p = path.join(dir, n)
        const rel = path.relative(this.root, p).split(path.sep).join('/')
        if (n.endsWith('.tmp')) continue
        try {
          await readdir(p)
          await walk(p)
        } catch {
          if (rel.startsWith(prefix)) out.push(rel)
        }
      }
    }
    await walk(this.root)
    return out.sort()
  }
  async entries(prefix: string) {
    const { stat } = await import('node:fs/promises')
    const keys = await this.list(prefix)
    return Promise.all(keys.map(async (key) => ({ key, at: (await stat(this.file(key)).catch(() => null))?.mtimeMs ?? 0 })))
  }
}

/** 배포본: Vercel Blob 비공개 저장소. 함수는 OIDC 로 붙으므로 고정 열쇠가 필요 없다. */
export class BlobStore implements Store {
  async get(key: string, opts: { fresh?: boolean } = {}) {
    const { get } = await import('@vercel/blob')
    // 학생이 보는 안내는 CDN 캐시를 거쳐 읽는다(저장소 읽기 횟수를 아낀다). 쓰기 판단은 늘 원본으로.
    const r = await get(key, { access: 'private', useCache: !opts.fresh })
    if (!r || r.statusCode !== 200) return null
    const body = await new Response(r.stream).text()
    // 읽을 때 저장소 앞단이 내용을 압축해 보내면 ETag 앞에 W/(약한 태그)가 붙는다. 쓸 때 받은 태그와 같게 비교하도록 뗀다
    // (안 떼면 선생님이 두 번째로 저장할 때 늘 '다른 선생님이 먼저 고쳤어요'가 뜬다, 운영 실측).
    return { body, etag: strongEtag(r.blob.etag) }
  }
  async put(key: string, body: string, opts: { ifMatch?: string; create?: boolean } = {}) {
    const { put, BlobPreconditionFailedError } = await import('@vercel/blob')
    try {
      const r = await put(key, body, {
        access: 'private',
        contentType: 'application/json; charset=utf-8',
        addRandomSuffix: false,
        allowOverwrite: !opts.create,
        ...(opts.ifMatch ? { ifMatch: opts.ifMatch } : {}),
        cacheControlMaxAge: 60,
      })
      return { etag: strongEtag(r.etag) }
    } catch (e) {
      if (e instanceof BlobPreconditionFailedError) throw new PreconditionFailed()
      // 이미 있는 이름에 create 로 쓰면 '이미 있다' 오류가 난다
      if (opts.create && /exist/i.test(String((e as Error)?.message))) throw new PreconditionFailed()
      throw e
    }
  }
  async del(keys: string[]) {
    if (!keys.length) return
    const { del } = await import('@vercel/blob')
    for (let i = 0; i < keys.length; i += 500) await del(keys.slice(i, i + 500))
  }
  async list(prefix: string) {
    return (await this.entries(prefix)).map((e) => e.key)
  }
  async entries(prefix: string) {
    const { list } = await import('@vercel/blob')
    const out: { key: string; at: number }[] = []
    let cursor: string | undefined
    do {
      const r = await list({ prefix, cursor, limit: 1000 })
      out.push(...r.blobs.map((b) => ({ key: b.pathname, at: new Date(b.uploadedAt).getTime() })))
      cursor = r.hasMore ? r.cursor : undefined
    } while (cursor)
    return out.sort((a, b) => a.key.localeCompare(b.key))
  }
}

let shared: Store | null = null

/** 배포 함수의 저장소(함수 인스턴스마다 하나). 개발 서버는 vite.config.ts 가 FileStore 를 직접 넘긴다. */
export function defaultStore(): Store {
  if (shared) return shared
  shared = process.env.VERCEL || process.env.BLOB_READ_WRITE_TOKEN ? new BlobStore() : new MemoryStore()
  return shared
}

export function setStoreForTests(s: Store | null) {
  shared = s
}
