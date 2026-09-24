import { useState } from 'react'
import { useAuth } from './AuthContext'
import type { UserRole } from './AuthContext'

type Mode = 'welcome' | 'login' | 'register-farm' | 'register-join'

const ROLE_LABELS: Record<UserRole, string> = {
  owner: '👑 Владелец',
  vet: '🩺 Ветеринар',
  zootechnik: '📊 Зоотехник',
  worker: '👷 Работник',
}

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>('welcome')

  return (
    <div className="auth-layout">
      <div className="auth-card">
        {mode === 'welcome' && <Welcome onPick={setMode} />}
        {mode === 'login' && <LoginForm onBack={() => setMode('welcome')} />}
        {mode === 'register-farm' && (
          <RegisterFarmForm onBack={() => setMode('welcome')} />
        )}
        {mode === 'register-join' && (
          <RegisterJoinForm onBack={() => setMode('welcome')} />
        )}
      </div>
    </div>
  )
}

// ============ WELCOME ============
function Welcome({ onPick }: { onPick: (m: Mode) => void }) {
  return (
    <>
      <div className="auth-logo">🐄</div>
      <h1 className="auth-title">Моё поголовье</h1>
      <p className="auth-subtitle">Учёт скота, вакцинаций и финансов</p>

      <div className="auth-actions">
        <button className="auth-btn primary" onClick={() => onPick('login')}>
          Войти
        </button>

        <div className="auth-divider">
          <span>или</span>
        </div>

        <button
          className="auth-btn secondary"
          onClick={() => onPick('register-farm')}
        >
          🏡 Создать хозяйство
        </button>
        <button
          className="auth-btn ghost"
          onClick={() => onPick('register-join')}
        >
          👥 Присоединиться по коду
        </button>
      </div>
    </>
  )
}

// ============ LOGIN ============
function LoginForm({ onBack }: { onBack: () => void }) {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail?.message ||
        err?.response?.data?.detail ||
        'Не удалось войти'
      setError(typeof msg === 'string' ? msg : 'Не удалось войти')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <button type="button" className="auth-back" onClick={onBack}>
        ← Назад
      </button>

      <h2 className="auth-title-sm">Вход</h2>

      {error && <div className="auth-error">{error}</div>}

      <div className="auth-field">
        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="andrey@example.com"
          autoFocus
          required
        />
      </div>

      <div className="auth-field">
        <label>Пароль</label>
        <div className="auth-pass-wrap">
          <input
            type={showPass ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
          <button
            type="button"
            className="auth-eye"
            onClick={() => setShowPass((v) => !v)}
          >
            {showPass ? '🙈' : '👁'}
          </button>
        </div>
      </div>

      <button type="submit" className="auth-btn primary" disabled={loading}>
        {loading ? '⏳ Вход…' : 'Войти'}
      </button>
    </form>
  )
}

// ============ REGISTER FARM ============
function RegisterFarmForm({ onBack }: { onBack: () => void }) {
  const { registerFarm } = useAuth()
  const [form, setForm] = useState({
    farm_name: '',
    region: '',
    district: '',
    inn: '',
    email: '',
    password: '',
    full_name: '',
    nickname: '',
    phone: '',
    birth_date: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [general, setGeneral] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (k: string, v: string) => {
    setForm((prev) => ({ ...prev, [k]: v }))
    if (errors[k]) {
      const n = { ...errors }
      delete n[k]
      setErrors(n)
    }
    if (general) setGeneral('')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})
    setGeneral('')

    const errs: Record<string, string> = {}
    if (!form.farm_name.trim()) errs.farm_name = 'Укажите название'
    if (!form.full_name.trim()) errs.full_name = 'Укажите ФИО'
    if (!form.email.trim()) errs.email = 'Укажите email'
    if (form.password.length < 6) errs.password = 'Минимум 6 символов'

    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      setGeneral('Исправьте выделенные поля')
      return
    }

    setLoading(true)
    try {
      await registerFarm({
        farm_name: form.farm_name.trim(),
        region: form.region.trim() || undefined,
        district: form.district.trim() || undefined,
        inn: form.inn.trim() || undefined,
        email: form.email.trim(),
        password: form.password,
        full_name: form.full_name.trim(),
        nickname: form.nickname.trim() || undefined,
        phone: form.phone.trim() || undefined,
        birth_date: form.birth_date || undefined,
      })
    } catch (err: any) {
      const det = err?.response?.data?.detail
      if (det && typeof det === 'object' && det.errors) {
        setErrors(det.errors)
        setGeneral(det.message || 'Проверьте поля')
      } else {
        setGeneral(typeof det === 'string' ? det : 'Не удалось создать хозяйство')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <button type="button" className="auth-back" onClick={onBack}>
        ← Назад
      </button>

      <h2 className="auth-title-sm">🏡 Новое хозяйство</h2>

      {general && <div className="auth-error">{general}</div>}

      <div className="auth-section">ХОЗЯЙСТВО</div>

      <div className="auth-field">
        <label>
          Название <span className="req">*</span>
        </label>
        <input
          className={errors.farm_name ? 'has-error' : ''}
          value={form.farm_name}
          onChange={(e) => set('farm_name', e.target.value)}
          placeholder="КФХ Звёздочка"
        />
        {errors.farm_name && <div className="field-error">{errors.farm_name}</div>}
      </div>

      <div className="auth-row">
        <div className="auth-field">
          <label>Регион</label>
          <input
            value={form.region}
            onChange={(e) => set('region', e.target.value)}
            placeholder="Республика Калмыкия"
          />
        </div>
        <div className="auth-field">
          <label>Район</label>
          <input
            value={form.district}
            onChange={(e) => set('district', e.target.value)}
            placeholder="Ики-Бурульский"
          />
        </div>
      </div>

      <div className="auth-field">
        <label>ИНН</label>
        <input
          value={form.inn}
          onChange={(e) => set('inn', e.target.value)}
          placeholder="0812345678"
        />
      </div>

      <div className="auth-section">ВЛАДЕЛЕЦ</div>

      <div className="auth-field">
        <label>
          ФИО <span className="req">*</span>
        </label>
        <input
          className={errors.full_name ? 'has-error' : ''}
          value={form.full_name}
          onChange={(e) => set('full_name', e.target.value)}
          placeholder="Санджиев Андрей"
        />
        {errors.full_name && <div className="field-error">{errors.full_name}</div>}
      </div>

      <div className="auth-field">
        <label>
          Email <span className="req">*</span>
        </label>
        <input
          type="email"
          className={errors.email ? 'has-error' : ''}
          value={form.email}
          onChange={(e) => set('email', e.target.value)}
          placeholder="andrey@example.com"
        />
        {errors.email && <div className="field-error">{errors.email}</div>}
      </div>

      <div className="auth-field">
        <label>
          Пароль <span className="req">*</span>
        </label>
        <input
          type="password"
          className={errors.password ? 'has-error' : ''}
          value={form.password}
          onChange={(e) => set('password', e.target.value)}
          placeholder="Минимум 6 символов"
        />
        {errors.password && <div className="field-error">{errors.password}</div>}
      </div>

      <div className="auth-row">
        <div className="auth-field">
          <label>Никнейм</label>
          <input
            value={form.nickname}
            onChange={(e) => set('nickname', e.target.value)}
            placeholder="Андрей"
          />
        </div>
        <div className="auth-field">
          <label>Телефон</label>
          <input
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            placeholder="+7 999 123-45-67"
          />
        </div>
      </div>

      <div className="auth-field">
        <label>Дата рождения</label>
        <input
          type="date"
          value={form.birth_date}
          onChange={(e) => set('birth_date', e.target.value)}
        />
      </div>

      <button type="submit" className="auth-btn primary" disabled={loading}>
        {loading ? '⏳ Создание…' : '🏡 Создать хозяйство'}
      </button>
    </form>
  )
}

// ============ REGISTER JOIN ============
function RegisterJoinForm({ onBack }: { onBack: () => void }) {
  const { registerJoin } = useAuth()
  const [form, setForm] = useState({
    invite_code: '',
    role: 'vet' as UserRole,
    email: '',
    password: '',
    full_name: '',
    nickname: '',
    phone: '',
    birth_date: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [general, setGeneral] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (k: string, v: string) => {
    setForm((prev) => ({ ...prev, [k]: v }))
    if (errors[k]) {
      const n = { ...errors }
      delete n[k]
      setErrors(n)
    }
    if (general) setGeneral('')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})
    setGeneral('')

    const errs: Record<string, string> = {}
    if (!form.invite_code.trim()) errs.invite_code = 'Укажите код'
    if (!form.full_name.trim()) errs.full_name = 'Укажите ФИО'
    if (!form.email.trim()) errs.email = 'Укажите email'
    if (form.password.length < 6) errs.password = 'Минимум 6 символов'

    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      setGeneral('Исправьте выделенные поля')
      return
    }

    setLoading(true)
    try {
      await registerJoin({
        invite_code: form.invite_code.trim().toUpperCase(),
        role: form.role,
        email: form.email.trim(),
        password: form.password,
        full_name: form.full_name.trim(),
        nickname: form.nickname.trim() || undefined,
        phone: form.phone.trim() || undefined,
        birth_date: form.birth_date || undefined,
      })
    } catch (err: any) {
      const det = err?.response?.data?.detail
      if (det && typeof det === 'object' && det.errors) {
        setErrors(det.errors)
        setGeneral(det.message || 'Проверьте поля')
      } else {
        setGeneral(typeof det === 'string' ? det : 'Не удалось присоединиться')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <button type="button" className="auth-back" onClick={onBack}>
        ← Назад
      </button>

      <h2 className="auth-title-sm">👥 Присоединиться</h2>

      {general && <div className="auth-error">{general}</div>}

      <div className="auth-field">
        <label>
          Код приглашения <span className="req">*</span>
        </label>
        <input
          className={`auth-code-input ${errors.invite_code ? 'has-error' : ''}`}
          value={form.invite_code}
          onChange={(e) => set('invite_code', e.target.value.toUpperCase())}
          placeholder="KLMN-4821"
          maxLength={9}
        />
        {errors.invite_code && (
          <div className="field-error">{errors.invite_code}</div>
        )}
        <div className="auth-hint">
          Код можно получить у владельца хозяйства
        </div>
      </div>

      <div className="auth-section">РОЛЬ</div>

      <div className="auth-roles">
        {(Object.keys(ROLE_LABELS) as UserRole[])
          .filter((r) => r !== 'owner')
          .map((role) => (
            <button
              key={role}
              type="button"
              className={`role-btn ${
                form.role === role ? 'active' : ''
              }`}
              onClick={() => setForm({ ...form, role })}
            >
              {ROLE_LABELS[role]}
            </button>
          ))}
      </div>

      <div className="auth-section">О СЕБЕ</div>

      <div className="auth-field">
        <label>
          ФИО <span className="req">*</span>
        </label>
        <input
          className={errors.full_name ? 'has-error' : ''}
          value={form.full_name}
          onChange={(e) => set('full_name', e.target.value)}
          placeholder="Иванов Пётр"
        />
        {errors.full_name && <div className="field-error">{errors.full_name}</div>}
      </div>

      <div className="auth-field">
        <label>
          Email <span className="req">*</span>
        </label>
        <input
          type="email"
          className={errors.email ? 'has-error' : ''}
          value={form.email}
          onChange={(e) => set('email', e.target.value)}
          placeholder="petr@example.com"
        />
        {errors.email && <div className="field-error">{errors.email}</div>}
      </div>

      <div className="auth-field">
        <label>
          Пароль <span className="req">*</span>
        </label>
        <input
          type="password"
          className={errors.password ? 'has-error' : ''}
          value={form.password}
          onChange={(e) => set('password', e.target.value)}
          placeholder="Минимум 6 символов"
        />
        {errors.password && <div className="field-error">{errors.password}</div>}
      </div>

      <div className="auth-row">
        <div className="auth-field">
          <label>Никнейм</label>
          <input
            value={form.nickname}
            onChange={(e) => set('nickname', e.target.value)}
            placeholder="Пётр"
          />
        </div>
        <div className="auth-field">
          <label>Телефон</label>
          <input
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            placeholder="+7 999 765-43-21"
          />
        </div>
      </div>

      <div className="auth-field">
        <label>Дата рождения</label>
        <input
          type="date"
          value={form.birth_date}
          onChange={(e) => set('birth_date', e.target.value)}
        />
      </div>

      <button type="submit" className="auth-btn primary" disabled={loading}>
        {loading ? '⏳ Присоединение…' : '👥 Присоединиться'}
      </button>
    </form>
  )
}