import { useAuthStore } from '../store/authStore'

const BASE_URL = ''

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  // Get token from auth store
  const token = useAuthStore.getState().token

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  }

  // Add auth header if token exists
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  })

  // On 401, clear auth and redirect to login
  if (res.status === 401) {
    useAuthStore.getState().logout()
    throw new Error('Session expired — please log in again')
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(error.detail || res.statusText)
  }

  return res.json()
}

export function useApi() {
  return {
    get: <T>(path: string) => api<T>(path),
    post: <T>(path: string, body?: unknown) =>
      api<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
    put: <T>(path: string, body?: unknown) =>
      api<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
    del: <T>(path: string) => api<T>(path, { method: 'DELETE' }),
  }
}
