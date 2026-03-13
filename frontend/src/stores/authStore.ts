import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface Company {
  company_id: string
  company_name: string
  role: string
  logo_url?: string
  is_default?: boolean
}

interface User {
  id: number
  username: string
  fullName: string
  nickName?: string
}

interface AuthState {
  token: string | null
  user: User | null
  companies: Company[]
  activeCompany: Company | null
  _hasHydrated: boolean
  setAuth: (token: string, user: User, companies: Company[], activeCompany: Company | null) => void
  switchCompany: (company: Company, newToken: string) => void
  logout: () => void
  setHasHydrated: (val: boolean) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      companies: [],
      activeCompany: null,
      _hasHydrated: false,
      setAuth: (token, user, companies, activeCompany) =>
        set({ token, user, companies, activeCompany }),
      switchCompany: (company, newToken) =>
        set({ activeCompany: company, token: newToken }),
      logout: () =>
        set({ token: null, user: null, companies: [], activeCompany: null }),
      setHasHydrated: (val) => set({ _hasHydrated: val }),
    }),
    {
      name: 'auth-storage',
      storage: {
        getItem: (name) => {
          const str = sessionStorage.getItem(name)
          return str ? JSON.parse(str) : null
        },
        setItem: (name, value) => sessionStorage.setItem(name, JSON.stringify(value)),
        removeItem: (name) => sessionStorage.removeItem(name),
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
