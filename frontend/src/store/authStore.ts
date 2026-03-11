import { create } from 'zustand'

interface User {
  username: string
  fullname: string
  groups: string[]
}

interface AuthStore {
  token: string | null
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  mustChangePassword: boolean

  login: (username: string, password: string) => Promise<boolean>
  logout: () => void
  checkAuth: () => Promise<void>
  clearError: () => void
  clearMustChangePassword: () => void
}

const STORAGE_KEY = 'nasos_auth_token'

export const useAuthStore = create<AuthStore>((set, get) => ({
  token: localStorage.getItem(STORAGE_KEY),
  user: null,
  isAuthenticated: false,
  isLoading: true, // Start loading until checkAuth completes
  error: null,
  mustChangePassword: false,

  login: async (username: string, password: string): Promise<boolean> => {
    set({ error: null, isLoading: true })
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: 'Login failed' }))
        set({ error: data.detail || 'Invalid credentials', isLoading: false })
        return false
      }

      const data = await res.json()
      localStorage.setItem(STORAGE_KEY, data.access_token)
      set({
        token: data.access_token,
        user: data.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
        mustChangePassword: !!data.must_change_password,
      })
      return true
    } catch {
      set({ error: 'Network error — cannot reach server', isLoading: false })
      return false
    }
  },

  logout: () => {
    localStorage.removeItem(STORAGE_KEY)
    set({
      token: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      mustChangePassword: false,
    })
  },

  checkAuth: async () => {
    const token = get().token
    if (!token) {
      set({ isAuthenticated: false, isLoading: false })
      return
    }

    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.ok) {
        const user = await res.json()
        set({
          user,
          isAuthenticated: true,
          isLoading: false,
          mustChangePassword: !!user.must_change_password,
        })
      } else {
        // Token expired or invalid
        localStorage.removeItem(STORAGE_KEY)
        set({ token: null, user: null, isAuthenticated: false, isLoading: false, mustChangePassword: false })
      }
    } catch {
      // Server unreachable — keep token, retry later
      set({ isLoading: false })
    }
  },

  clearError: () => set({ error: null }),

  clearMustChangePassword: () => set({ mustChangePassword: false }),
}))
