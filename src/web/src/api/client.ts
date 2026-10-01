/** Thin fetch client: same-origin cookies, CSRF header on unsafe methods, RFC 9457 problems as ApiError. */

export class ApiError extends Error {
  readonly status: number
  readonly type: string | undefined
  readonly retryAfterSeconds: number | undefined
  readonly errors: Record<string, string[]> | undefined

  constructor(status: number, problem: Partial<Problem> = {}, retryAfterSeconds?: number) {
    super(problem.title ?? `HTTP ${status}`)
    this.status = status
    this.type = problem.type
    this.errors = problem.errors
    this.retryAfterSeconds = retryAfterSeconds ?? problem.retryAfterSeconds
  }
}

interface Problem {
  type: string
  title: string
  status: number
  errors: Record<string, string[]>
  retryAfterSeconds: number
}

const CSRF_COOKIE = 'XSRF-TOKEN'
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function readCookie(name: string): string | undefined {
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1)
}

let csrfPromise: Promise<void> | null = null

/** Fetches a CSRF token bound to the current identity. Call again after sign-out. */
export function refreshCsrf(): Promise<void> {
  csrfPromise = fetch('/api/auth/csrf', { credentials: 'same-origin' }).then(() => undefined)
  return csrfPromise
}

async function ensureCsrf() {
  if (readCookie(CSRF_COOKIE)) return
  await (csrfPromise ?? refreshCsrf())
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const method = init.method ?? 'GET'
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'
  if (UNSAFE.has(method)) {
    await ensureCsrf()
    const token = readCookie(CSRF_COOKIE)
    if (token) headers['X-XSRF-TOKEN'] = decodeURIComponent(token)
  }

  const res = await fetch(path, {
    method,
    headers,
    credentials: 'same-origin',
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal,
  })

  if (res.status === 204) return undefined as T
  const isJson = res.headers.get('content-type')?.includes('json') ?? false
  const payload: unknown = isJson ? await res.json() : undefined
  if (!res.ok) {
    const retry = Number(res.headers.get('Retry-After'))
    throw new ApiError(res.status, (payload ?? {}) as Partial<Problem>, Number.isFinite(retry) && retry > 0 ? retry : undefined)
  }
  return payload as T
}
