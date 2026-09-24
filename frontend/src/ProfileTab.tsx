import { useState, useEffect } from 'react'
import {
  User as UserIcon,
  Home,
  Key,
  Users,
  Lock,
  LogOut,
  Copy,
  Share2,
  Check,
  Pencil,
  X,
  AlertCircle,
  CheckCircle2,
  Crown,
  Stethoscope,
  ClipboardList,
  HardHat,
} from 'lucide-react'
import { api } from './api'
import { useAuth } from './AuthContext'
import type { User, Farm } from './AuthContext'

type Section = 'personal' | 'farm' | 'password'

const ROLE_META: Record<
  string,
  { label: string; Icon: React.ComponentType<{ size?: number }> }
> = {
  owner: { label: 'Владелец', Icon: Crown },
  vet: { label: 'Ветеринар', Icon: Stethoscope },
  zootechnik: { label: 'Зоотехник', Icon: ClipboardList },
  worker: { label: 'Работник', Icon: HardHat },
}

export default function ProfileTab() {
  const { user, farm, refreshUser, logout } = useAuth()
  const [section, setSection] = useState<Section | null>(null)

  if (!user || !farm) return null

  const roleMeta = ROLE_META[user.role] || { label: user.role, Icon: UserIcon }
  const RoleIcon = roleMeta.Icon

  return (
    <div>
      <div className="prof-header">
        <div className="prof-avatar">
          {user.full_name?.[0]?.toUpperCase() || '?'}
        </div>
        <div className="prof-headline">
          <h2 className="prof-name">{user.full_name}</h2>
          {user.nickname && (
            <div className="prof-nick">@{user.nickname}</div>
          )}
          <div className="prof-role">
            <RoleIcon size={12} />
            {roleMeta.label}
          </div>
        </div>
      </div>

      <div className="prof-card">
        <div className="prof-card-head">
          <h3>
            <UserIcon size={16} />
            Личные данные
          </h3>
          <button
            className="prof-edit-btn"
            onClick={() =>
              setSection(section === 'personal' ? null : 'personal')
            }
          >
            {section === 'personal' ? (
              <>
                <X size={12} />
                Отмена
              </>
            ) : (
              <>
                <Pencil size={12} />
                Изменить
              </>
            )}
          </button>
        </div>

        {section !== 'personal' && (
          <div className="prof-info">
            <div className="prof-row">
              <span className="prof-label">ФИО</span>
              <span className="prof-value">{user.full_name}</span>
            </div>
            <div className="prof-row">
              <span className="prof-label">Email</span>
              <span className="prof-value">{user.email}</span>
            </div>
            <div className="prof-row">
              <span className="prof-label">Телефон</span>
              <span className="prof-value">{user.phone || '—'}</span>
            </div>
            <div className="prof-row">
              <span className="prof-label">Дата рождения</span>
              <span className="prof-value">
                {user.birth_date
                  ? new Date(user.birth_date).toLocaleDateString('ru-RU')
                  : '—'}
              </span>
            </div>
          </div>
        )}

        {section === 'personal' && (
          <PersonalForm
            user={user}
            onSave={async () => {
              await refreshUser()
              setSection(null)
            }}
            onCancel={() => setSection(null)}
          />
        )}
      </div>

      <div className="prof-card">
        <div className="prof-card-head">
          <h3>
            <Home size={16} />
            Хозяйство
          </h3>
          {user.role === 'owner' && (
            <button
              className="prof-edit-btn"
              onClick={() => setSection(section === 'farm' ? null : 'farm')}
            >
              {section === 'farm' ? (
                <>
                  <X size={12} />
                  Отмена
                </>
              ) : (
                <>
                  <Pencil size={12} />
                  Изменить
                </>
              )}
            </button>
          )}
        </div>

        {section !== 'farm' && (
          <div className="prof-info">
            <div className="prof-row">
              <span className="prof-label">Название</span>
              <span className="prof-value">{farm.name}</span>
            </div>
            <div className="prof-row">
              <span className="prof-label">Регион</span>
              <span className="prof-value">{farm.region || '—'}</span>
            </div>
            <div className="prof-row">
              <span className="prof-label">Район</span>
              <span className="prof-value">{farm.district || '—'}</span>
            </div>
            <div className="prof-row">
              <span className="prof-label">ИНН</span>
              <span className="prof-value">{farm.inn || '—'}</span>
            </div>
          </div>
        )}

        {section === 'farm' && user.role === 'owner' && (
          <FarmForm
            farm={farm}
            onSave={async () => {
              await refreshUser()
              setSection(null)
            }}
            onCancel={() => setSection(null)}
          />
        )}
      </div>

      <InviteCard inviteCode={farm.invite_code} />

      <TeamCard />

      <div className="prof-actions">
        <button
          className="prof-action-btn"
          onClick={() =>
            setSection(section === 'password' ? null : 'password')
          }
        >
          <Lock size={16} />
          {section === 'password' ? 'Отмена' : 'Сменить пароль'}
        </button>

        {section === 'password' && (
          <ChangePasswordForm onSave={() => setSection(null)} />
        )}

        <button className="prof-action-btn danger" onClick={logout}>
          <LogOut size={16} />
          Выйти из аккаунта
        </button>
      </div>
    </div>
  )
}

function PersonalForm({
  user,
  onSave,
  onCancel,
}: {
  user: User
  onSave: () => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    full_name: user.full_name || '',
    nickname: user.nickname || '',
    phone: user.phone || '',
    birth_date: user.birth_date || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api.patch('/profile', {
        full_name: form.full_name.trim() || undefined,
        nickname: form.nickname.trim() || null,
        phone: form.phone.trim() || null,
        birth_date: form.birth_date || null,
      })
      onSave()
    } catch (err: any) {
      setError(
        err?.response?.data?.detail?.message ||
          err?.response?.data?.detail ||
          'Ошибка сохранения'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="prof-form">
      {error && (
        <div className="form-error">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      <div className="form-field">
        <label>ФИО</label>
        <input
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
        />
      </div>

      <div className="form-field">
        <label>Никнейм</label>
        <input
          value={form.nickname}
          onChange={(e) => setForm({ ...form, nickname: e.target.value })}
          placeholder="Как к вам обращаться"
        />
      </div>

      <div className="form-row">
        <div className="form-field">
          <label>Телефон</label>
          <input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="+7 999 123-45-67"
          />
        </div>
        <div className="form-field">
          <label>Дата рождения</label>
          <input
            type="date"
            value={form.birth_date}
            onChange={(e) =>
              setForm({ ...form, birth_date: e.target.value })
            }
          />
        </div>
      </div>

      <div className="complete-actions">
        <button type="button" className="btn-cancel" onClick={onCancel}>
          Отмена
        </button>
        <button type="submit" className="btn-save" disabled={saving}>
          {saving ? '…' : 'Сохранить'}
        </button>
      </div>
    </form>
  )
}

function FarmForm({
  farm,
  onSave,
  onCancel,
}: {
  farm: Farm
  onSave: () => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    name: farm.name || '',
    region: farm.region || '',
    district: farm.district || '',
    inn: farm.inn || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api.patch('/farm', {
        name: form.name.trim() || undefined,
        region: form.region.trim() || null,
        district: form.district.trim() || null,
        inn: form.inn.trim() || null,
      })
      onSave()
    } catch (err: any) {
      setError(
        err?.response?.data?.detail?.message ||
          err?.response?.data?.detail ||
          'Ошибка сохранения'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="prof-form">
      {error && (
        <div className="form-error">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      <div className="form-field">
        <label>Название</label>
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </div>

      <div className="form-row">
        <div className="form-field">
          <label>Регион</label>
          <input
            value={form.region}
            onChange={(e) => setForm({ ...form, region: e.target.value })}
            placeholder="Республика Калмыкия"
          />
        </div>
        <div className="form-field">
          <label>Район</label>
          <input
            value={form.district}
            onChange={(e) => setForm({ ...form, district: e.target.value })}
            placeholder="Ики-Бурульский"
          />
        </div>
      </div>

      <div className="form-field">
        <label>ИНН</label>
        <input
          value={form.inn}
          onChange={(e) => setForm({ ...form, inn: e.target.value })}
          placeholder="0812345678"
        />
      </div>

      <div className="complete-actions">
        <button type="button" className="btn-cancel" onClick={onCancel}>
          Отмена
        </button>
        <button type="submit" className="btn-save" disabled={saving}>
          {saving ? '…' : 'Сохранить'}
        </button>
      </div>
    </form>
  )
}

function InviteCard({ inviteCode }: { inviteCode: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      alert('Не удалось скопировать')
    }
  }

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Код приглашения',
          text: `Присоединяйтесь к хозяйству в приложении «Моё поголовье». Код: ${inviteCode}`,
        })
      } catch (err) {
        // отменили — игнор
      }
    } else {
      copy()
    }
  }

  return (
    <div className="prof-card invite-card">
      <div className="prof-card-head">
        <h3>
          <Key size={16} />
          Код приглашения
        </h3>
      </div>

      <div className="invite-code">{inviteCode}</div>

      <p className="invite-hint">
        Отправьте этот код ветеринару или зоотехнику, чтобы они присоединились
        к вашему хозяйству.
      </p>

      <div className="invite-actions">
        <button className="prof-action-btn" onClick={copy}>
          {copied ? (
            <>
              <Check size={16} />
              Скопировано
            </>
          ) : (
            <>
              <Copy size={16} />
              Скопировать
            </>
          )}
        </button>
        <button className="prof-action-btn" onClick={share}>
          <Share2 size={16} />
          Поделиться
        </button>
      </div>
    </div>
  )
}

function TeamCard() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get<User[]>('/farm/users')
        setUsers(data)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="prof-card">
      <div className="prof-card-head">
        <h3>
          <Users size={16} />
          Команда ({users.length})
        </h3>
      </div>

      {loading && <p className="empty-small">Загрузка…</p>}

      {!loading && users.length === 0 && (
        <p className="empty-small">Пока только вы</p>
      )}

      <div className="team-list">
        {users.map((u) => {
          const roleMeta = ROLE_META[u.role] || { label: u.role, Icon: UserIcon }
          const RoleIcon = roleMeta.Icon
          return (
            <div key={u.id} className="team-row">
              <div className="team-avatar">
                {u.full_name?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="team-info">
                <div className="team-name">
                  {u.full_name}
                  {u.nickname && <span className="team-nick"> @{u.nickname}</span>}
                </div>
                <div className="team-role">
                  <RoleIcon size={11} />
                  {roleMeta.label}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ChangePasswordForm({ onSave }: { onSave: () => void }) {
  const [form, setForm] = useState({
    old_password: '',
    new_password: '',
    confirm: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [general, setGeneral] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})
    setGeneral('')
    setSuccess(false)

    const errs: Record<string, string> = {}
    if (!form.old_password) errs.old_password = 'Введите текущий пароль'
    if (form.new_password.length < 6)
      errs.new_password = 'Минимум 6 символов'
    if (form.new_password !== form.confirm)
      errs.confirm = 'Пароли не совпадают'

    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      setGeneral('Исправьте выделенные поля')
      return
    }

    setSaving(true)
    try {
      await api.post('/profile/change-password', {
        old_password: form.old_password,
        new_password: form.new_password,
      })
      setSuccess(true)
      setForm({ old_password: '', new_password: '', confirm: '' })
      setTimeout(() => {
        setSuccess(false)
        onSave()
      }, 1500)
    } catch (err: any) {
      const det = err?.response?.data?.detail
      if (det && typeof det === 'object' && det.errors) {
        setErrors(det.errors)
        setGeneral(det.message || 'Ошибка')
      } else {
        setGeneral(typeof det === 'string' ? det : 'Ошибка смены пароля')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="prof-form">
      {general && (
        <div className="form-error">
          <AlertCircle size={14} />
          <span>{general}</span>
        </div>
      )}
      {success && (
        <div className="gv-success">
          <CheckCircle2 size={16} />
          <span>Пароль изменён</span>
        </div>
      )}

      <div className="form-field">
        <label>Текущий пароль</label>
        <input
          type="password"
          className={errors.old_password ? 'has-error' : ''}
          value={form.old_password}
          onChange={(e) =>
            setForm({ ...form, old_password: e.target.value })
          }
        />
        {errors.old_password && (
          <div className="field-error">{errors.old_password}</div>
        )}
      </div>

      <div className="form-field">
        <label>Новый пароль</label>
        <input
          type="password"
          className={errors.new_password ? 'has-error' : ''}
          value={form.new_password}
          onChange={(e) =>
            setForm({ ...form, new_password: e.target.value })
          }
          placeholder="Минимум 6 символов"
        />
        {errors.new_password && (
          <div className="field-error">{errors.new_password}</div>
        )}
      </div>

      <div className="form-field">
        <label>Повторите новый пароль</label>
        <input
          type="password"
          className={errors.confirm ? 'has-error' : ''}
          value={form.confirm}
          onChange={(e) => setForm({ ...form, confirm: e.target.value })}
        />
        {errors.confirm && (
          <div className="field-error">{errors.confirm}</div>
        )}
      </div>

      <div className="complete-actions">
        <button type="button" className="btn-cancel" onClick={onSave}>
          Отмена
        </button>
        <button type="submit" className="btn-save" disabled={saving}>
          {saving ? '…' : 'Сменить пароль'}
        </button>
      </div>
    </form>
  )
}
