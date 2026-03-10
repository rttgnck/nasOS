const BASE_URL = ''

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  })

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
    del: <T>(path: string) => api<T>(path, { method: 'DELETE' }),
  }
}
