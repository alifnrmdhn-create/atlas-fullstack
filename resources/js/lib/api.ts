const API_BASE_URL =
  import.meta.env.VITE_API_URL ??
  import.meta.env.VITE_API_BASE_URL ??
  '/api'

const AUTH_STORAGE_KEY = 'atlas.auth.token'
const AUTH_EXPIRED_EVENT = 'atlas:auth-expired'

const readStoredToken = () => {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage.getItem(AUTH_STORAGE_KEY)
}

let authToken = readStoredToken()

type ApiErrorPayload = {
  error?: string
  details?: unknown
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

function notifyAuthExpired(message: string) {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(
    new CustomEvent(AUTH_EXPIRED_EVENT, {
      detail: { message },
    }),
  )
}

function buildHeaders(init?: RequestInit) {
  const headers = new Headers(init?.headers ?? {})

  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json')
  }

  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`)
  }

  return headers
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: buildHeaders(init),
  })

  if (!response.ok) {
    let payload: ApiErrorPayload | null = null

    try {
      payload = (await response.json()) as ApiErrorPayload
    } catch {
      payload = null
    }

    const message = payload?.error ?? `API request failed (${response.status})`

    if (response.status === 401) {
      notifyAuthExpired(message)
    }

    throw new ApiRequestError(response.status, message, payload?.details)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export const sessionStorage = {
  eventName: AUTH_EXPIRED_EVENT,
  getToken: () => authToken,
  setToken: (token: string) => {
    authToken = token
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(AUTH_STORAGE_KEY, token)
    }
  },
  clear: () => {
    authToken = null
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(AUTH_STORAGE_KEY)
    }
  },
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'DELETE',
      body: body ? JSON.stringify(body) : undefined,
    }),
  // Multipart upload — caller builds the FormData, we attach auth header
  upload: <T>(path: string, formData: FormData) => {
    const headers = new Headers()
    if (authToken) headers.set('Authorization', `Bearer ${authToken}`)
    return fetch(`${API_BASE_URL}${path}`, { method: 'POST', headers, body: formData })
      .then(async (res) => {
        if (!res.ok) {
          const payload = await res.json().catch(() => null) as ApiErrorPayload | null
          const message = payload?.error ?? `Upload failed (${res.status})`
          if (res.status === 401) notifyAuthExpired(message)
          throw new ApiRequestError(res.status, message, payload?.details)
        }
        return res.json() as Promise<T>
      })
  },
}

export const realtime = {
  streamUrl: () => {
    const token = sessionStorage.getToken()
    return token ? `${API_BASE_URL}/realtime/stream?token=${encodeURIComponent(token)}` : null
  },
}

// Field name mapping for human-readable error messages
const FIELD_LABELS: Record<string, string> = {
  name: 'Nama', title: 'Judul', description: 'Deskripsi',
  status: 'Status', priority: 'Prioritas',
  startDate: 'Tanggal Mulai', targetCompletion: 'Target Selesai', dueDate: 'Tenggat',
  programId: 'Program', workstreamId: 'Workstream', phaseId: 'Phase',
  content: 'Konten', type: 'Tipe', note: 'Catatan',
  email: 'Email', password: 'Password',
}

/**
 * Extract a human-readable error message from an ApiRequestError.
 * For Zod validation errors, lists the specific fields that failed.
 */
export function extractErrorMessage(err: unknown, fallback = 'Terjadi kesalahan.'): string {
  if (!(err instanceof ApiRequestError)) {
    return (err as { message?: string })?.message ?? fallback
  }
  // Try to extract Zod fieldErrors from details
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
