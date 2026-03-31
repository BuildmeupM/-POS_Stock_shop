import axios from 'axios'

function getApiBaseUrl(): string {
  // 1. Explicit env var takes priority
  const raw = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL
  const envUrl = raw ? raw.replace(/\/+$/, '') : ''
  if (envUrl && envUrl.startsWith('http')) {
    return envUrl.endsWith('/api') ? envUrl : `${envUrl}/api`
  }

  // 2. Use Vite proxy (same-origin /api) — works for both localhost and LAN
  //    Because vite.config has proxy for /api -> backend
  return '/api'
}

const api = axios.create({
  baseURL: getApiBaseUrl(),
  headers: { 'Content-Type': 'application/json' },
})

// Attach token from sessionStorage
api.interceptors.request.use((config) => {
  try {
    const authStorage = sessionStorage.getItem('auth-storage')
    if (authStorage) {
      const parsed = JSON.parse(authStorage)
      const token = parsed?.state?.token
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
    }
  } catch {}
  return config
})

// Handle 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      sessionStorage.removeItem('auth-storage')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api
