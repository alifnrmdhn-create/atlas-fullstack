/**
 * API client untuk Laravel + Inertia.
 *
 * Beda dengan versi Express lama:
 *   - Base URL: "/" (bukan "/api")  — Laravel routes di root
 *   - Auth: Laravel session cookie + CSRF (bukan Bearer token)
 *   - CSRF: diambil dari cookie XSRF-TOKEN, dikirim sebagai header X-XSRF-TOKEN
 *   - same-origin: cookie otomatis dibawa — tidak perlu kelola token di localStorage
 *
 * Penggunaan:
 *   - Untuk GET endpoint yang return JSON: api.get<Type>('/programs/123/health')
 *   - Untuk mutation: preferkan Inertia router (`router.post()`) supaya dapat
 *     redirect + flash message. Hanya pakai api.post() untuk XHR yang tetap
 *     butuh JSON response (mis. async auto-save).
 */

const API_BASE_URL = '/'
const DEFAULT_TIMEOUT_MS = 15_000

type ApiRequestInit = RequestInit & {
    timeoutMs?: number
}

function getCookie(name: string): string | null {
    if (typeof document === 'undefined') return null
    const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`))
    return match ? decodeURIComponent(match[1]) : null
}

function getXsrfToken(): string | null {
    return getCookie('XSRF-TOKEN')
}

export class ApiRequestError extends Error {
    status: number
    details?: unknown

    constructor(status: number, message: string, details?: unknown) {
        super(message)
        this.name = 'ApiRequestError'
        this.status = status
        this.details = details
    }
}

function buildHeaders(init?: RequestInit): Headers {
    const headers = new Headers(init?.headers ?? {})

    if (!headers.has('Content-Type') && init?.body && !(init.body instanceof FormData)) {
        headers.set('Content-Type', 'application/json')
    }
    headers.set('Accept', 'application/json')
    headers.set('X-Requested-With', 'XMLHttpRequest')

    const xsrf = getXsrfToken()
    if (xsrf) headers.set('X-XSRF-TOKEN', xsrf)

    return headers
}

async function request<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
    const url = path.startsWith('/') ? path : `${API_BASE_URL}${path}`
    const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...fetchInit } = init
    const controller = new AbortController()
    const timeout = timeoutMs > 0
        ? window.setTimeout(() => controller.abort(), timeoutMs)
        : null
    const abortFromCaller = () => controller.abort()

    if (signal) {
        if (signal.aborted) controller.abort()
        else signal.addEventListener('abort', abortFromCaller, { once: true })
    }

    let response: Response
    try {
        response = await fetch(url, {
            ...fetchInit,
            credentials: 'same-origin',
            headers: buildHeaders(fetchInit),
            signal: controller.signal,
        })
    } catch (error) {
        const timedOut = controller.signal.aborted && !signal?.aborted
        if (timedOut) {
            throw new ApiRequestError(408, `Request timeout setelah ${Math.round(timeoutMs / 1000)} detik: ${path}`)
        }
        throw error
    } finally {
        if (timeout) window.clearTimeout(timeout)
        signal?.removeEventListener('abort', abortFromCaller)
    }

    if (!response.ok) {
        let payload: { error?: string; message?: string; errors?: unknown } | null
        try {
            payload = await response.json()
        } catch {
            payload = null
        }

        const message = payload?.error ?? payload?.message ?? `Request failed (${response.status})`

        if (response.status === 401 || response.status === 419) {
            // 401 = not authenticated, 419 = CSRF token mismatch / session expired
            // Guard: jangan dispatch saat user sudah di /login — kalau tidak,
            // polling yang masih in-flight saat logout akan trigger router.visit
            // berulang ke /login dan bikin form reset terus-menerus.
            const onLoginPage = typeof window !== 'undefined'
                && window.location.pathname.startsWith('/login')
            if (!onLoginPage) {
                window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT, {
                    detail: { message, status: response.status }
                }))
            }
        }

        throw new ApiRequestError(response.status, message, payload?.errors)
    }

    if (response.status === 204) return undefined as T
    return (await response.json()) as T
}

export const api = {
    get:    <T>(path: string, opts?: ApiRequestInit) => request<T>(path, opts),
    post:   <T>(path: string, body?: unknown) => request<T>(path, {
        method: 'POST', body: body ? JSON.stringify(body) : undefined,
    }),
    put:    <T>(path: string, body?: unknown) => request<T>(path, {
        method: 'PUT', body: body ? JSON.stringify(body) : undefined,
    }),
    patch:  <T>(path: string, body?: unknown) => request<T>(path, {
        method: 'PATCH', body: body ? JSON.stringify(body) : undefined,
    }),
    delete: <T>(path: string, body?: unknown) => request<T>(path, {
        method: 'DELETE', body: body ? JSON.stringify(body) : undefined,
    }),
    upload: <T>(path: string, formData: FormData) => request<T>(path, {
        method: 'POST', body: formData, timeoutMs: 120_000,
    }),
}

// Nama event sesi-berakhir — satu sumber untuk dispatcher (di request()) dan
// listener (workspace provider). Dulu dibungkus stub bernama `sessionStorage`
// (sisa era Express token-auth) yang membayangi window.sessionStorage di
// importer-nya — foot-gun yang dihapus audit 2026-06-11.
export const AUTH_EXPIRED_EVENT = 'atlas:auth-expired'

// Field labels untuk Zod-style error extraction (kompat dengan kode lama)
const FIELD_LABELS: Record<string, string> = {
    name: 'Name', title: 'Title', description: 'Description',
    status: 'Status', priority: 'Priority',
    startDate: 'Start Date', targetCompletion: 'Target Completion', dueDate: 'Due Date',
    programId: 'Program', workstreamId: 'Workstream', phaseId: 'Phase',
    content: 'Content', type: 'Type', note: 'Note',
    identifier: 'NIK/User ID', email: 'Email', password: 'Password',
}

export function extractErrorMessage(err: unknown, fallback = 'Something went wrong.'): string {
    if (!(err instanceof ApiRequestError)) {
        return (err as { message?: string })?.message ?? fallback
    }
    const details = err.details as Record<string, string[]> | null | undefined
    if (details && typeof details === 'object') {
        const parts = Object.entries(details)
            .filter(([, msgs]) => Array.isArray(msgs) && msgs.length > 0)
            .map(([field, msgs]) => {
                const label = FIELD_LABELS[field] ?? field
                return `${label}: ${(msgs as string[]).join(', ')}`
            })
        if (parts.length > 0) return parts.join(' • ')
    }
    return err.message || fallback
}
