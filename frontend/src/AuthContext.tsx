import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react'
import { api, storage } from './api'

// ============ Типы ============
export type UserRole = 'owner' | 'vet' | 'zootechnik' | 'worker'

export type User = {
  id: number
  email: string
  full_name: string
  nickname: string | null
  phone: string | null
  birth_date: string | null
  avatar_url: string | null
  role: UserRole
  farm_id: number
  settings: string | null
  created_at: string
  last_login_at: string | null
}

export type Farm = {
  id: number
  name: string
  region: string | null
  district: string | null
  inn: string | null
  invite_code: string
  created_at: string
}

type AuthContextValue = {
  user: User | null
  farm: Farm | null
  loading: boolean
  isAuthenticated: boolean

  // API-методы
  login: (email: string, password: string) => Promise<void>
  registerFarm: (data: RegisterFarmData) => Promise<void>
  registerJoin: (data: RegisterJoinData) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
  updateUser: (user: User) => void
  updateFarm: (farm: Farm) => void
}

export type RegisterFarmData = {
  farm_name: string
  region?: string
  district?: string
  inn?: string
  email: string
  password: string
  full_name: string
  nickname?: string
  phone?: string
  birth_date?: string
}

export type RegisterJoinData = {
  invite_code: string
  role: UserRole
  email: string
  password: string
  full_name: string
  nickname?: string
  phone?: string
  birth_date?: string
}

// ============ Context ============
const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => storage.getUser())
  const [farm, setFarm] = useState<Farm | null>(() => storage.getFarm())
  const [loading, setLoading] = useState(true)

  // При загрузке — проверяем токен и обновляем данные с бэка
  useEffect(() => {
    const init = async () => {
      const token = storage.getToken()
      if (!token) {
        setLoading(false)
        return
      }
      try {
        const { data } = await api.get('/auth/me')
        setUser(data.user)
        setFarm(data.farm)
        storage.saveUser(data.user)
        storage.saveFarm(data.farm)
      } catch (err) {
        // Токен невалиден — чистим
        storage.clear()
        setUser(null)
        setFarm(null)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  const handleAuth = (data: {
    access_token: string
    user: User
    farm: Farm
  }) => {
    storage.saveToken(data.access_token)
    storage.saveUser(data.user)
    storage.saveFarm(data.farm)
    setUser(data.user)
    setFarm(data.farm)
  }

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password })
    handleAuth(data)
  }, [])

  const registerFarm = useCallback(async (payload: RegisterFarmData) => {
    const { data } = await api.post('/auth/register-farm', payload)
    handleAuth(data)
  }, [])

  const registerJoin = useCallback(async (payload: RegisterJoinData) => {
    const { data } = await api.post('/auth/register-join', payload)
    handleAuth(data)
  }, [])

  const logout = useCallback(() => {
    storage.clear()
    setUser(null)
    setFarm(null)
    window.location.reload()
  }, [])

  const refreshUser = useCallback(async () => {
    const { data } = await api.get('/auth/me')
    setUser(data.user)
    setFarm(data.farm)
    storage.saveUser(data.user)
    storage.saveFarm(data.farm)
  }, [])

  const updateUser = useCallback((u: User) => {
    setUser(u)
    storage.saveUser(u)
  }, [])

  const updateFarm = useCallback((f: Farm) => {
    setFarm(f)
    storage.saveFarm(f)
  }, [])

  const value: AuthContextValue = {
    user,
    farm,
    loading,
    isAuthenticated: !!user,
    login,
    registerFarm,
    registerJoin,
    logout,
    refreshUser,
    updateUser,
    updateFarm,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return ctx
}