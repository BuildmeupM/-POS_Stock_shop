import axios from 'axios'

function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL
  if (envUrl && envUrl.startsWith('http')) {
    return envUrl.endsWith('/api') ? envUrl : `${envUrl}/api`
  }
  return 'http://localhost:3001/api'
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
