import { useEffect, useState, useCallback, useMemo } from 'react'
import axios from 'axios'
import './App.css'

const API = 'http://localhost:8000/api'

// ============ ТИПЫ ============
type Animal = {
  id: number
  tag_number: string
  chip_number: string | null
  name: string | null
  sex: string
  birth_date: string | null
  breed: string
  color: string | null
  mother_id: number | null
  father_id: number | null
  group_id: number | null
  status: string
  notes: string | null
}

type Group = {
  id: number
  name: string
  description: string | null
}

type Vaccine = {
  id: number
  name: string
  disease: string
  manufacturer: string | null
  dose_ml: string | null
}

type Vaccination = {
  id: number
  animal_id: number
  vaccine_id: number
  planned_date: string
  actual_date: string | null
  is_done: boolean
  vet_name: string | null
  dose_used: string | null
  notes: string | null
}

type Dashboard = {
  total_active: number
  upcoming_7_days: number
  overdue: number
}

type Tab = 'dashboard' | 'animals' | 'calendar'

// ============ УТИЛИТЫ ============
function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function daysUntil(iso: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(iso)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function animalAge(birthDate: string | null): string {
  if (!birthDate) return '—'
  const birth = new Date(birthDate)
  const now = new Date()
  const months =
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth())
  if (months < 1) return 'меньше месяца'
  if (months < 12) return `${months} мес.`
  const years = Math.floor(months / 12)
  const restMonths = months % 12
  return restMonths ? `${years} г. ${restMonths} мес.` : `${years} г.`
}

// Парсит ошибки от API: возвращает общее сообщение + ошибки по полям
function parseApiError(err: any): {
  general: string
  fields: Record<string, string>
} {
  if (!err?.response) {
    return {
      general:
        'Нет соединения с сервером. Проверьте, запущен ли backend на порту 8000.',
      fields: {},
    }
  }

  const data = err.response.data
  const status = err.response.status

  // Кастомный формат от backend: {detail: {message, errors}}
  if (data?.detail && typeof data.detail === 'object') {
    return {
      general: data.detail.message || 'Проверьте поля формы',
      fields: data.detail.errors || {},
    }
  }

  // 422 от Pydantic handler: {detail: "...", errors: {...}}
  if (data?.errors && typeof data.errors === 'object') {
    return {
      general: data.detail || 'Проверьте поля формы',
      fields: data.errors,
    }
  }

  // HTTPException со строкой
  if (typeof data?.detail === 'string') {
    return { general: data.detail, fields: {} }
  }

  if (status === 404) return { general: 'Не найдено', fields: {} }
  if (status >= 500)
    return { general: 'Ошибка сервера. Попробуйте позже.', fields: {} }

  return { general: 'Неизвестная ошибка', fields: {} }
}

// ============ ГЛАВНЫЙ КОМПОНЕНТ ============
function App() {
  const [tab, setTab] = useState<Tab>('dashboard')

  const [animals, setAnimals] = useState<Animal[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [vaccines, setVaccines] = useState<Vaccine[]>([])
  const [vaccinations, setVaccinations] = useState<Vaccination[]>([])
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)

  const [selectedAnimal, setSelectedAnimal] = useState<Animal | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  const loadAll = useCallback(async () => {
    try {
      const [a, g, v, vac, d] = await Promise.all([
        axios.get<Animal[]>(`${API}/animals`),
        axios.get<Group[]>(`${API}/groups`),
        axios.get<Vaccine[]>(`${API}/vaccines`),
        axios.get<Vaccination[]>(`${API}/vaccinations`),
        axios.get<Dashboard>(`${API}/dashboard`),
      ])
      setAnimals(a.data)
      setGroups(g.data)
      setVaccines(v.data)
      setVaccinations(vac.data)
      setDashboard(d.data)
    } catch (err) {
      console.error('Ошибка загрузки:', err)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const animalsById = useMemo(() => {
    const m: Record<number, Animal> = {}
    animals.forEach((a) => (m[a.id] = a))
    return m
  }, [animals])

  const vaccinesById = useMemo(() => {
    const m: Record<number, Vaccine> = {}
    vaccines.forEach((v) => (m[v.id] = v))
    return m
  }, [vaccines])

  return (
    <div className="app">
      <header className="header">
        <h1>🐄 Моё поголовье</h1>
      </header>

      <nav className="tabs">
        <button
          className={tab === 'dashboard' ? 'active' : ''}
          onClick={() => setTab('dashboard')}
        >
          📊 Сводка
        </button>
        <button
          className={tab === 'animals' ? 'active' : ''}
          onClick={() => setTab('animals')}
        >
          🐄 Поголовье ({animals.length})
        </button>
        <button
          className={tab === 'calendar' ? 'active' : ''}
          onClick={() => setTab('calendar')}
        >
          📅 Календарь ({vaccinations.filter((v) => !v.is_done).length})
        </button>
      </nav>

      {tab === 'dashboard' && (
        <DashboardTab dashboard={dashboard} onReload={loadAll} />
      )}

      {tab === 'animals' && (
        <AnimalsTab
          animals={animals}
          groups={groups}
          onReload={loadAll}
          onSelect={setSelectedAnimal}
          showAddForm={showAddForm}
          setShowAddForm={setShowAddForm}
        />
      )}

      {tab === 'calendar' && (
        <CalendarTab
          vaccinations={vaccinations}
          animalsById={animalsById}
          vaccinesById={vaccinesById}
          onReload={loadAll}
        />
      )}

      {selectedAnimal && (
        <AnimalModal
          animal={selectedAnimal}
          vaccinations={vaccinations.filter(
            (v) => v.animal_id === selectedAnimal.id
          )}
          vaccinesById={vaccinesById}
          onClose={() => setSelectedAnimal(null)}
          onReload={loadAll}
        />
      )}
    </div>
  )
}

// ============ ВКЛАДКА: ДАШБОРД ============
function DashboardTab({
  dashboard,
  onReload,
}: {
  dashboard: Dashboard | null
  onReload: () => void
}) {
  const [upcoming, setUpcoming] = useState<
    (Vaccination & { animal?: Animal; vaccine?: Vaccine })[]
  >([])

  useEffect(() => {
    const load = async () => {
      try {
        const { data: vacs } = await axios.get<Vaccination[]>(
          `${API}/vaccinations?is_done=false`
        )
        const { data: an } = await axios.get<Animal[]>(`${API}/animals`)
        const { data: vc } = await axios.get<Vaccine[]>(`${API}/vaccines`)

        const anMap: Record<number, Animal> = {}
        an.forEach((a) => (anMap[a.id] = a))
        const vcMap: Record<number, Vaccine> = {}
        vc.forEach((v) => (vcMap[v.id] = v))

        const enriched = vacs
          .map((v) => ({
            ...v,
            animal: anMap[v.animal_id],
            vaccine: vcMap[v.vaccine_id],
          }))
          .sort((a, b) => a.planned_date.localeCompare(b.planned_date))
          .slice(0, 10)

        setUpcoming(enriched)
      } catch (err) {
        console.error(err)
      }
    }
    load()
  }, [dashboard])

  return (
    <div className="dashboard">
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value blue">
            {dashboard?.total_active ?? 0}
          </div>
          <div className="stat-label">Активных голов</div>
        </div>
        <div className="stat-card">
          <div className="stat-value orange">
            {dashboard?.upcoming_7_days ?? 0}
          </div>
          <div className="stat-label">На неделе</div>
        </div>
        <div className="stat-card">
          <div className="stat-value red">{dashboard?.overdue ?? 0}</div>
          <div className="stat-label">Просрочено</div>
        </div>
      </div>

      <h2 className="section-title">Ближайшие вакцинации</h2>

      {upcoming.length === 0 && (
        <p className="empty">Нет предстоящих вакцинаций</p>
      )}

      <div className="list">
        {upcoming.map((v) => {
          const days = daysUntil(v.planned_date)
          const urgent = days < 0
          const soon = days >= 0 && days <= 3
          return (
            <div
              key={v.id}
              className={`card ${
                urgent ? 'card-urgent' : soon ? 'card-soon' : ''
              }`}
            >
              <div className="card-title">
                <span className="tag">{v.animal?.tag_number || '—'}</span>
                <span
                  className={`badge ${
                    urgent ? 'badge-red' : soon ? 'badge-orange' : ''
                  }`}
                >
                  {urgent
                    ? `просрочено на ${Math.abs(days)} дн.`
                    : days === 0
                    ? 'сегодня'
                    : days === 1
                    ? 'завтра'
                    : `через ${days} дн.`}
                </span>
              </div>
              <div className="card-meta">
                <span>💉 {v.vaccine?.disease || 'вакцинация'}</span>
                <span>📅 {formatDate(v.planned_date)}</span>
              </div>
            </div>
          )
        })}
      </div>

      <button className="reload-btn" onClick={onReload}>
        🔄 Обновить
      </button>
    </div>
  )
}

// ============ ВКЛАДКА: ПОГОЛОВЬЕ ============
function AnimalsTab({
  animals,
  groups,
  onReload,
  onSelect,
  showAddForm,
  setShowAddForm,
}: {
  animals: Animal[]
  groups: Group[]
  onReload: () => void
  onSelect: (a: Animal) => void
  showAddForm: boolean
  setShowAddForm: (v: boolean) => void
}) {
  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState<number | 'all'>('all')

  const filtered = useMemo(() => {
    let list = animals
    if (groupFilter !== 'all') {
      list = list.filter((a) => a.group_id === groupFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (a) =>
          a.tag_number.toLowerCase().includes(q) ||
          (a.name?.toLowerCase() || '').includes(q)
      )
    }
    return list
  }, [animals, search, groupFilter])

  return (
    <div className="animals-tab">
      <div className="toolbar">
        <input
          className="search-input"
          placeholder="🔍 Поиск по бирке или кличке"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className="add-btn"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? '✕ Отмена' : '+ Добавить'}
        </button>
      </div>

      {groups.length > 0 && (
        <div className="filter-row">
          <button
            className={groupFilter === 'all' ? 'chip active' : 'chip'}
            onClick={() => setGroupFilter('all')}
          >
            Все ({animals.length})
          </button>
          {groups.map((g) => {
            const count = animals.filter((a) => a.group_id === g.id).length
            return (
              <button
                key={g.id}
                className={groupFilter === g.id ? 'chip active' : 'chip'}
                onClick={() => setGroupFilter(g.id)}
              >
                {g.name} ({count})
              </button>
            )
          })}
        </div>
      )}

      {showAddForm && (
        <AddAnimalForm
          groups={groups}
          onCreated={() => {
            setShowAddForm(false)
            onReload()
          }}
        />
      )}

      {filtered.length === 0 && <p className="empty">Животные не найдены</p>}

      <div className="list">
        {filtered.map((a) => (
          <div
            key={a.id}
            className="card clickable"
            onClick={() => onSelect(a)}
          >
            <div className="card-title">
              <span className="tag">{a.tag_number}</span>
              <span className="sex">{a.sex === 'female' ? '♀' : '♂'}</span>
            </div>
            <div className="card-meta">
              <span>🐄 {a.breed}</span>
              <span>🎂 {animalAge(a.birth_date)}</span>
              {a.status !== 'active' && (
                <span className="status-badge">{a.status}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============ ФОРМА ДОБАВЛЕНИЯ ЖИВОТНОГО ============
function AddAnimalForm({
  groups,
  onCreated,
}: {
  groups: Group[]
  onCreated: () => void
}) {
  const [form, setForm] = useState({
    tag_number: '',
    name: '',
    sex: 'female',
    birth_date: '',
    breed: 'Калмыцкая',
    color: '',
    group_id: '',
  })

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [generalError, setGeneralError] = useState('')
  const [saving, setSaving] = useState(false)

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {}

    if (!form.tag_number.trim()) {
      errs.tag_number = 'Укажите номер бирки'
    } else if (form.tag_number.trim().length < 3) {
      errs.tag_number = 'Номер бирки слишком короткий (минимум 3 символа)'
    } else if (form.tag_number.trim().length > 50) {
      errs.tag_number = 'Номер бирки слишком длинный (максимум 50 символов)'
    }

    if (form.birth_date) {
      const d = new Date(form.birth_date)
      const today = new Date()
      today.setHours(23, 59, 59, 999)
      if (d > today) {
        errs.birth_date = 'Дата рождения не может быть в будущем'
      }
      const min = new Date()
      min.setFullYear(min.getFullYear() - 30)
      if (d < min) {
        errs.birth_date = 'Дата рождения более 30 лет назад — проверьте'
      }
    }

    if (form.name && form.name.length > 100) {
      errs.name = 'Кличка слишком длинная (максимум 100 символов)'
    }

    return errs
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setGeneralError('')
    setFieldErrors({})

    const clientErrs = validate()
    if (Object.keys(clientErrs).length > 0) {
      setFieldErrors(clientErrs)
      setGeneralError('Исправьте выделенные поля')
      return
    }

    setSaving(true)
    try {
      await axios.post(`${API}/animals`, {
        tag_number: form.tag_number.trim(),
        name: form.name.trim() || null,
        sex: form.sex,
        birth_date: form.birth_date || null,
        breed: form.breed.trim() || 'Калмыцкая',
        color: form.color.trim() || null,
        group_id: form.group_id ? Number(form.group_id) : null,
      })
      onCreated()
    } catch (err: any) {
      const parsed = parseApiError(err)
      setFieldErrors(parsed.fields)
      setGeneralError(parsed.general)
    } finally {
      setSaving(false)
    }
  }

  const clearField = (field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
    if (generalError) setGeneralError('')
  }

  return (
    <form className="form-card" onSubmit={submit} noValidate>
      <h3>Новое животное</h3>

      {generalError && (
        <div className="form-error">
          <span className="error-icon">⚠️</span>
          <span>{generalError}</span>
        </div>
      )}

      <div className="form-field">
        <label>
          Номер бирки <span className="req">*</span>
        </label>
        <input
          className={fieldErrors.tag_number ? 'has-error' : ''}
          value={form.tag_number}
          onChange={(e) => {
            setForm({ ...form, tag_number: e.target.value })
            clearField('tag_number')
          }}
          placeholder="RU-001-2026"
        />
        {fieldErrors.tag_number && (
          <div className="field-error">{fieldErrors.tag_number}</div>
        )}
      </div>

      <div className="form-field">
        <label>Кличка</label>
        <input
          className={fieldErrors.name ? 'has-error' : ''}
          value={form.name}
          onChange={(e) => {
            setForm({ ...form, name: e.target.value })
            clearField('name')
          }}
          placeholder="Звёздочка"
        />
        {fieldErrors.name && (
          <div className="field-error">{fieldErrors.name}</div>
        )}
      </div>

      <div className="form-row">
        <div className="form-field">
          <label>
            Пол <span className="req">*</span>
          </label>
          <select
            className={fieldErrors.sex ? 'has-error' : ''}
            value={form.sex}
            onChange={(e) => {
              setForm({ ...form, sex: e.target.value })
              clearField('sex')
            }}
          >
            <option value="female">Корова (♀)</option>
            <option value="male">Бык (♂)</option>
          </select>
          {fieldErrors.sex && (
            <div className="field-error">{fieldErrors.sex}</div>
          )}
        </div>

        <div className="form-field">
          <label>Дата рождения</label>
          <input
            type="date"
            className={fieldErrors.birth_date ? 'has-error' : ''}
            value={form.birth_date}
            onChange={(e) => {
              setForm({ ...form, birth_date: e.target.value })
              clearField('birth_date')
            }}
          />
          {fieldErrors.birth_date && (
            <div className="field-error">{fieldErrors.birth_date}</div>
          )}
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label>Порода</label>
          <input
            className={fieldErrors.breed ? 'has-error' : ''}
            value={form.breed}
            onChange={(e) => {
              setForm({ ...form, breed: e.target.value })
              clearField('breed')
            }}
          />
          {fieldErrors.breed && (
            <div className="field-error">{fieldErrors.breed}</div>
          )}
        </div>

        <div className="form-field">
          <label>Масть</label>
          <input
            className={fieldErrors.color ? 'has-error' : ''}
            value={form.color}
            onChange={(e) => {
              setForm({ ...form, color: e.target.value })
              clearField('color')
            }}
            placeholder="Красная"
          />
          {fieldErrors.color && (
            <div className="field-error">{fieldErrors.color}</div>
          )}
        </div>
      </div>

      <div className="form-field">
        <label>Группа</label>
        <select
          className={fieldErrors.group_id ? 'has-error' : ''}
          value={form.group_id}
          onChange={(e) => {
            setForm({ ...form, group_id: e.target.value })
            clearField('group_id')
          }}
        >
          <option value="">— без группы —</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        {fieldErrors.group_id && (
          <div className="field-error">{fieldErrors.group_id}</div>
        )}
      </div>

      <button type="submit" className="submit-btn" disabled={saving}>
        {saving ? '⏳ Сохранение…' : '💾 Сохранить'}
      </button>
    </form>
  )
}

// ============ ВКЛАДКА: КАЛЕНДАРЬ ============
function CalendarTab({
  vaccinations,
  animalsById,
  vaccinesById,
  onReload,
}: {
  vaccinations: Vaccination[]
  animalsById: Record<number, Animal>
  vaccinesById: Record<number, Vaccine>
  onReload: () => void
}) {
  const [filter, setFilter] = useState<'upcoming' | 'done' | 'all'>('upcoming')
  const [completeError, setCompleteError] = useState('')

  const filtered = useMemo(() => {
    let list = [...vaccinations]
    if (filter === 'upcoming') list = list.filter((v) => !v.is_done)
    if (filter === 'done') list = list.filter((v) => v.is_done)
    return list.sort((a, b) => a.planned_date.localeCompare(b.planned_date))
  }, [vaccinations, filter])

  const complete = async (vac: Vaccination) => {
    setCompleteError('')
    const actual = prompt(
      'Дата выполнения (YYYY-MM-DD):',
      new Date().toISOString().slice(0, 10)
    )
    if (!actual) return

    const parsed = new Date(actual)
    if (isNaN(parsed.getTime())) {
      setCompleteError('Неверный формат даты. Используйте YYYY-MM-DD')
      return
    }
    if (parsed > new Date()) {
      setCompleteError('Дата выполнения не может быть в будущем')
      return
    }

    const vet = prompt('ФИО ветеринара (необязательно):') || null

    try {
      await axios.post(`${API}/vaccinations/${vac.id}/complete`, {
        actual_date: actual,
        vet_name: vet,
      })
      onReload()
    } catch (err) {
      const p = parseApiError(err)
      setCompleteError(p.general)
    }
  }

  return (
    <div className="calendar-tab">
      {completeError && (
        <div className="form-error">
          <span className="error-icon">⚠️</span>
          <span>{completeError}</span>
        </div>
      )}

      <div className="filter-row">
        <button
          className={filter === 'upcoming' ? 'chip active' : 'chip'}
          onClick={() => setFilter('upcoming')}
        >
          Предстоящие
        </button>
        <button
          className={filter === 'done' ? 'chip active' : 'chip'}
          onClick={() => setFilter('done')}
        >
          Выполненные
        </button>
        <button
          className={filter === 'all' ? 'chip active' : 'chip'}
          onClick={() => setFilter('all')}
        >
          Все
        </button>
      </div>

      {filtered.length === 0 && <p className="empty">Нет записей</p>}

      <div className="list">
        {filtered.map((v) => {
          const animal = animalsById[v.animal_id]
          const vaccine = vaccinesById[v.vaccine_id]
          const days = daysUntil(v.planned_date)
          const overdue = !v.is_done && days < 0
          const soon = !v.is_done && days >= 0 && days <= 3

          return (
            <div
              key={v.id}
              className={`card ${
                overdue ? 'card-urgent' : soon ? 'card-soon' : ''
              } ${v.is_done ? 'card-done' : ''}`}
            >
              <div className="card-title">
                <span className="tag">
                  {animal?.tag_number || `#${v.animal_id}`}
                </span>
                {v.is_done ? (
                  <span className="badge badge-green">✅ выполнено</span>
                ) : (
                  <span
                    className={`badge ${
                      overdue ? 'badge-red' : soon ? 'badge-orange' : ''
                    }`}
                  >
                    {overdue
                      ? `просрочено на ${Math.abs(days)} дн.`
                      : days === 0
                      ? 'сегодня'
                      : days === 1
                      ? 'завтра'
                      : `через ${days} дн.`}
                  </span>
                )}
              </div>
              <div className="card-meta">
                <span>💉 {vaccine?.disease || 'вакцинация'}</span>
                <span>📅 план: {formatDate(v.planned_date)}</span>
                {v.actual_date && (
                  <span>✅ факт: {formatDate(v.actual_date)}</span>
                )}
                {v.vet_name && <span>👨‍⚕️ {v.vet_name}</span>}
              </div>
              {!v.is_done && (
                <button className="complete-btn" onClick={() => complete(v)}>
                  ✅ Отметить выполненной
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============ МОДАЛКА: КАРТОЧКА ЖИВОТНОГО ============
function AnimalModal({
  animal,
  vaccinations,
  vaccinesById,
  onClose,
  onReload,
}: {
  animal: Animal
  vaccinations: Vaccination[]
  vaccinesById: Record<number, Vaccine>
  onClose: () => void
  onReload: () => void
}) {
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const generate = async () => {
    setError('')
    setGenerating(true)
    try {
      const { data } = await axios.post(
        `${API}/animals/${animal.id}/generate-vaccinations`
      )
      if (data.created === 0) {
        setError('Календарь уже сгенерирован ранее — новых записей нет')
      } else {
        alert(`Создано ${data.created} записей в календаре`)
        onReload()
      }
    } catch (err) {
      const p = parseApiError(err)
      setError(p.general)
    } finally {
      setGenerating(false)
    }
  }

  const sorted = [...vaccinations].sort((a, b) =>
    a.planned_date.localeCompare(b.planned_date)
  )

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🐄 {animal.tag_number}</h2>
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="info-grid">
            <div>
              <span className="label">Кличка</span>
              <span>{animal.name || '—'}</span>
            </div>
            <div>
              <span className="label">Пол</span>
              <span>{animal.sex === 'female' ? '♀ Корова' : '♂ Бык'}</span>
            </div>
            <div>
              <span className="label">Порода</span>
              <span>{animal.breed}</span>
            </div>
            <div>
              <span className="label">Возраст</span>
              <span>{animalAge(animal.birth_date)}</span>
            </div>
            <div>
              <span className="label">Дата рождения</span>
              <span>{formatDate(animal.birth_date)}</span>
            </div>
            <div>
              <span className="label">Масть</span>
              <span>{animal.color || '—'}</span>
            </div>
          </div>

          {error && (
            <div className="form-error" style={{ marginBottom: 12 }}>
              <span className="error-icon">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <button
            className="gen-btn"
            onClick={generate}
            disabled={generating}
          >
            {generating
              ? '⏳ Генерация…'
              : '📅 Сгенерировать календарь вакцинаций'}
          </button>

          <h3 className="section-subtitle">
            Вакцинации ({sorted.length})
          </h3>

          {sorted.length === 0 && (
            <p className="empty-small">
              Календарь пуст. Нажми кнопку выше.
            </p>
          )}

          <div className="vacc-list">
            {sorted.map((v) => (
              <div key={v.id} className="vacc-row">
                <span className="vacc-date">{v.planned_date}</span>
                <span className="vacc-disease">
                  {vaccinesById[v.vaccine_id]?.disease || '—'}
                </span>
                {v.is_done ? (
                  <span className="vacc-status done">✅</span>
                ) : (
                  <span className="vacc-status pending">⏳</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App