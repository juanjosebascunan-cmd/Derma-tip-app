import type { AppStore, CurrentUser, EntryDraft, LogEntry, Patient, Reminder } from './types'

let csrfTokenCache = ''
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

function resolveApiUrl(path: string) {
  return `${apiBaseUrl}${path}`
}

function readCookie(name: string) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : ''
}

async function ensureCsrfToken() {
  csrfTokenCache = readCookie('csrftoken')

  if (csrfTokenCache) {
    return csrfTokenCache
  }

  const response = await fetch(resolveApiUrl('/api/auth/csrf'), {
    credentials: 'include',
  })

  if (!response.ok) {
    throw new Error(`CSRF bootstrap failed: ${response.status}`)
  }

  const data = (await response.json()) as { csrfToken: string }
  csrfTokenCache = data.csrfToken || readCookie('csrftoken')
  return csrfTokenCache
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method?.toUpperCase() ?? 'GET'
  const headers = new Headers(init?.headers ?? {})

  if (!headers.has('Content-Type') && method !== 'GET') {
    headers.set('Content-Type', 'application/json')
  }

  if (method !== 'GET' && method !== 'HEAD') {
    const csrfToken = await ensureCsrfToken()
    headers.set('X-CSRFToken', csrfToken)
  }

  const response = await fetch(resolveApiUrl(path), {
    credentials: 'include',
    ...init,
    headers,
  })

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }

  return (await response.json()) as T
}

export function getBootstrapData(patientId?: number) {
  const query = patientId ? `?patientId=${patientId}` : ''
  return request<AppStore>(`/api/bootstrap${query}`)
}

export function createEntry(entry: EntryDraft) {
  return request<LogEntry>('/api/entries', {
    method: 'POST',
    body: JSON.stringify(entry),
  })
}

export function createPatient(payload: { fullName: string; condition: string; notes: string }) {
  return request<Patient>('/api/patients', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updatePatient(
  patientId: number,
  payload: { fullName: string; condition: string; notes: string },
) {
  return request<Patient>(`/api/patients/${patientId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function deletePatient(patientId: number) {
  return request<{ deletedId: number }>(`/api/patients/${patientId}`, {
    method: 'DELETE',
  })
}

export function updateReminder(reminderId: number, done: boolean) {
  return request<Reminder>(`/api/reminders/${reminderId}`, {
    method: 'PATCH',
    body: JSON.stringify({ done }),
  })
}

export function login(payload: { username: string; password: string }) {
  return request<{ currentUser: CurrentUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function logout() {
  return request<{ ok: boolean }>('/api/auth/logout', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function getCurrentUser() {
  return request<{ currentUser: CurrentUser | null }>('/api/auth/me')
}

export function getPatientExportUrl() {
  return resolveApiUrl('/api/exports/patients.csv')
}
