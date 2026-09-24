import axios from 'axios'

const API_URL = 'http://localhost:8000/api'

// Ключи для localStorage
const TOKEN_KEY = 'vet_token'
const USER_KEY = 'vet_user'
const FARM_KEY = 'vet_farm'

export const api = axios.create({
  baseURL: API_URL,
})

// Автоматически подставляем токен в каждый запрос
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Перехватываем 401 — если токен протух, очищаем и редиректим на вход
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const url = error.config?.url || ''
      // Не редиректим, если это сам логин/регистрация
      if (!url.includes('/auth/login') && !url.includes('/auth/register')) {
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
        localStorage.removeItem(FARM_KEY)
        window.location.reload()
      }
    }
    return Promise.reject(error)
  }
)

// Хелперы для работы с localStorage
export const storage = {
  saveToken: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  getToken: () => localStorage.getItem(TOKEN_KEY),
  saveUser: (user: any) => localStorage.setItem(USER_KEY, JSON.stringify(user)),
  getUser: () => {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  },
  saveFarm: (farm: any) => localStorage.setItem(FARM_KEY, JSON.stringify(farm)),
  getFarm: () => {
    const raw = localStorage.getItem(FARM_KEY)
    return raw ? JSON.parse(raw) : null
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem(FARM_KEY)
  },
}

export { API_URL }