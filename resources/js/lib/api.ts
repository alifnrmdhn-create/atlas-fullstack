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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = path.startsWith('/') ? path : `${API_BASE_URL}${path}`
    const response = await fetch(url, {
        ...init,
        credentials: 'same-origin',
        headers: buildHeaders(init),
    })

    if (!response.ok) {
        let payload: { error?: string; message?: string; errors?: unknown } | null = null
        try {
            payload = await response.json()
        } catch {
            payload = null
        }

        const message = payload?.error ?? payload?.message ?? `Request failed (${response.status})`

        if (response.status === 401 || response.status === 419) {
            // 401 = not authenticated, 419 = CSRF token mismatch / session expired
            // Biarkan caller decide — di Inertia biasanya auto redirect ke /login
            window.dispatchEvent(new CustomEvent('atlas:auth-expired', {
                detail: { message, status: response.status }
            }))
        }

        throw new ApiRequestError(response.status, message, payload?.errors)
    }

    if (response.status === 204) return undefined as T
    return (await response.json()) as T
}

export const api = {
    get:    <T>(path: string) => request<T>(path),
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
        method: 'POST', body: formData,
    }),
}

function envValue(name: string): string | undefined {
    return (import.meta as { env?: Record<string, string | undefined> }).env?.[name]
}

function truthy(value: string | undefined): boolean {
    return ['1', 'true', 'yes', 'on'].includes((value ?? '').toLowerCase())
}

function shouldEnableRealtimeSse(): boolean {
    const flag = envValue('VITE_REALTIME_SSE')
    if (flag !== undefined) return truthy(flag)
    if (typeof window === 'undefined') return true

    return !['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname)
}

export const realtime = {
    enabled: shouldEnableRealtimeSse,
    streamUrl: () => shouldEnableRealtimeSse() ? '/realtime/stream' : '',
}

// Kompatibilitas dengan kode lama yang masih import sessionStorage
// Di Laravel session auth, frontend tidak perlu manage token — hanya stub agar kompat.
export const sessionStorage = {
    eventName: 'atlas:auth-expired',
    getToken: () => null,
    setToken: (_: string) => { /* noop — Laravel handle cookie sendiri */ },
    clear: () => { /* noop */ },
}

// Field labels untuk Zod-style error extraction (kompat dengan kode lama)
const FIELD_LABELS: Record<string, string> = {
    name: 'Nama', title: 'Judul', description: 'Deskripsi',
    status: 'Status', priority: 'Prioritas',
    startDate: 'Tanggal Mulai', targetCompletion: 'Target Selesai', dueDate: 'Tenggat',
    programId: 'Program', workstreamId: 'Workstream', phaseId: 'Phase',
    content: 'Konten', type: 'Tipe', note: 'Catatan',
    email: 'Email', password: 'Password',
}

export function extractErrorMessage(err: unknown, fallback = 'Terjadi kesalahan.'): string {
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
