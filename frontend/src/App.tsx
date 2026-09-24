import { useEffect, useState, useCallback, useMemo } from 'react'
import { api } from './api'
import { useAuth } from './AuthContext'
import AuthScreen from './AuthScreen'
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
  recommended_date: string | null
  planned_date: string
  actual_date: string | null
  is_done: boolean
  vet_name: string | null
  dose_used: string | null
  notes: string | null
}

type AnimalEvent = {
  id: number
  animal_id: number
  event_type: string
  event_date: string
  description: string | null
  created_at: string
}

type Dashboard = {
  total_active: number
  upcoming_7_days: number
  overdue: number
}

type DashboardFull = {
  vaccination: { active: number; upcoming_7: number; overdue: number }
  animals: {
    total: number
    cows: number
    bulls: number
    young: number
    groups: number
  }
  finance_30d: { income: number; expense: number; profit: number }
  events_30d: number
}

type GroupUpcoming = {
  disease: string
  vaccine_id: number
  vaccine_name: string
  count: number
  earliest_date: string
  latest_date: string
  overdue_count: number
}

type Expense = {
  id: number
  category: string
  amount: number
  expense_date: string
  description: string | null
  quantity: string | null
  group_id: number | null
  animal_id: number | null
  created_at: string
}

type Income = {
  id: number
  category: string
  amount: number
  income_date: string
  description: string | null
  weight_kg: number | null
  animal_id: number | null
  created_at: string
}

type FinanceSummary = {
  period: { from: string | null; to: string | null }
  total_expense: number
  total_income: number
  profit: number
  expense_count: number
  income_count: number
  expense_by_category: Record<string, { amount: number; count: number }>
  income_by_category: Record<string, { amount: number; count: number }>
  meat: {
    total_weight_kg: number
    total_income: number
    avg_price_per_kg: number | null
    cost_per_kg: number | null
  }
  active_animals: number
  profit_per_animal: number | null
}

type Tab = 'dashboard' | 'animals' | 'groups' | 'vaccination' | 'finance'

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

function formatMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽'
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

const EVENT_LABELS: Record<string, string> = {
  calving: '🐄 Отёл',
  transfer: '↔️ Перевод',
  sold: '💰 Продан',
  dead: '⚫ Падёж',
  slaughtered: '🔪 Забит',
  other: '📝 Другое',
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Активен',
  sold: 'Продан',
  dead: 'Падёж',
  slaughtered: 'Забит',
}

const EXPENSE_CATEGORIES: Record<string, { label: string; icon: string }> = {
  feed: { label: 'Корм', icon: '🌾' },
  salary: { label: 'Зарплата', icon: '💰' },
  vet: { label: 'Ветеринария', icon: '💉' },
  fuel: { label: 'Бензин / ГСМ', icon: '⛽' },
  utilities: { label: 'Содержание', icon: '🏠' },
  equipment: { label: 'Оборудование', icon: '🔧' },
  taxes: { label: 'Налоги', icon: '📋' },
  other: { label: 'Прочее', icon: '📌' },
}

const INCOME_CATEGORIES: Record<
  string,
  { label: string; icon: string; linksAnimal: boolean; autoStatus?: string }
> = {
  meat: { label: 'Мясо', icon: '🥩', linksAnimal: true, autoStatus: 'Забой' },
  livestock: { label: 'Скот', icon: '🐄', linksAnimal: true, autoStatus: 'Продажа' },
  milk: { label: 'Молоко', icon: '🥛', linksAnimal: true },
  byproducts: { label: 'Субпродукты', icon: '🍖', linksAnimal: false },
  subsidy: { label: 'Субсидии', icon: '🏛', linksAnimal: false },
  other: { label: 'Прочее', icon: '📌', linksAnimal: false },
}

const PAGE_TITLES: Record<Tab, string> = {
  dashboard: 'Сводка',
  animals: 'Поголовье',
  groups: 'Группы',
  vaccination: 'Вакцинация',
  finance: 'Финансы',
}

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
  if (data?.detail && typeof data.detail === 'object') {
    return {
      general: data.detail.message || 'Проверьте поля формы',
      fields: data.detail.errors || {},
    }
  }
  if (data?.errors && typeof data.errors === 'object') {
    return { general: data.detail || 'Проверьте поля формы', fields: data.errors }
  }
  if (typeof data?.detail === 'string') {
    return { general: data.detail, fields: {} }
  }
  if (status === 404) return { general: 'Не найдено', fields: {} }
  if (status >= 500) return { general: 'Ошибка сервера', fields: {} }
  return { general: 'Неизвестная ошибка', fields: {} }
}

// ============ ГЛАВНЫЙ КОМПОНЕНТ ============
function App() {
  const { isAuthenticated, loading, user, farm, logout } = useAuth()

  // === ВСЕ ХУКИ — БЕЗ УСЛОВИЙ, В НАЧАЛЕ ===
  const [tab, setTab] = useState<Tab>('dashboard')
  const [drawerOpen, setDrawerOpen] = useState(false)

  const [animals, setAnimals] = useState<Animal[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [vaccines, setVaccines] = useState<Vaccine[]>([])
  const [vaccinations, setVaccinations] = useState<Vaccination[]>([])
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)

  const [selectedAnimalId, setSelectedAnimalId] = useState<number | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [membershipGroupId, setMembershipGroupId] = useState<number | null>(null)

  const loadAll = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const [a, g, v, vac, d] = await Promise.all([
        api.get<Animal[]>(`${API}/animals`),
        api.get<Group[]>(`${API}/groups`),
        api.get<Vaccine[]>(`${API}/vaccines`),
        api.get<Vaccination[]>(`${API}/vaccinations`),
        api.get<Dashboard>(`${API}/dashboard`),
      ])
      setAnimals(a.data)
      setGroups(g.data)
      setVaccines(v.data)
      setVaccinations(vac.data)
      setDashboard(d.data)
    } catch (err) {
      console.error('Ошибка загрузки:', err)
    }
  }, [isAuthenticated])

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

  const selectedAnimal = selectedAnimalId
    ? animalsById[selectedAnimalId] || null
    : null

  const membershipGroup = membershipGroupId
    ? groups.find((g) => g.id === membershipGroupId) || null
    : null

  const overdueCount = dashboard?.overdue ?? 0
  const pendingCount = vaccinations.filter((v) => !v.is_done).length

  const goTo = (t: Tab) => {
    setTab(t)
    setDrawerOpen(false)
  }

  // === EARLY RETURNS — ПОСЛЕ ВСЕХ ХУКОВ ===

  if (loading) {
    return (
      <div className="auth-layout">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div className="auth-logo">🐄</div>
          <p style={{ color: 'var(--text-secondary)' }}>Загрузка…</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <AuthScreen />
  }

  // === ОСНОВНОЙ RENDER ===

  return (
    <div className="layout">
      <aside className={`drawer ${drawerOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <div className="logo">
            <span className="logo-icon">🐄</span>
            <span className="logo-text">Моё поголовье</span>
          </div>
          <button className="drawer-close" onClick={() => setDrawerOpen(false)}>
            ✕
          </button>
        </div>

        <nav className="drawer-nav">
          <button
            className={`drawer-item ${tab === 'dashboard' ? 'active' : ''}`}
            onClick={() => goTo('dashboard')}
          >
            <span className="drawer-item-icon">📊</span>
            <span className="drawer-item-text">Сводка</span>
          </button>

          <button
            className={`drawer-item ${tab === 'animals' ? 'active' : ''}`}
            onClick={() => goTo('animals')}
          >
            <span className="drawer-item-icon">🐄</span>
            <span className="drawer-item-text">Поголовье</span>
            <span className="drawer-item-count">{animals.length}</span>
          </button>

          <button
            className={`drawer-item ${tab === 'groups' ? 'active' : ''}`}
            onClick={() => goTo('groups')}
          >
            <span className="drawer-item-icon">👥</span>
            <span className="drawer-item-text">Группы</span>
            <span className="drawer-item-count">{groups.length}</span>
          </button>

          <button
            className={`drawer-item ${tab === 'vaccination' ? 'active' : ''}`}
            onClick={() => goTo('vaccination')}
          >
            <span className="drawer-item-icon">💉</span>
            <span className="drawer-item-text">Вакцинация</span>
            {overdueCount > 0 ? (
              <span className="drawer-item-badge">{overdueCount}</span>
            ) : (
              <span className="drawer-item-count">{pendingCount}</span>
            )}
          </button>

          <button
            className={`drawer-item ${tab === 'finance' ? 'active' : ''}`}
            onClick={() => goTo('finance')}
          >
            <span className="drawer-item-icon">💰</span>
            <span className="drawer-item-text">Финансы</span>
          </button>
        </nav>

        <div className="drawer-user">
          <div className="drawer-user-avatar">
            {user?.full_name?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="drawer-user-info">
            <div className="drawer-user-name">
              {user?.nickname || user?.full_name || 'Пользователь'}
            </div>
            <div className="drawer-user-farm">{farm?.name || ''}</div>
          </div>
          <button
            className="drawer-user-logout"
            onClick={logout}
            title="Выйти"
          >
            🚪
          </button>
        </div>
      </aside>

      {drawerOpen && (
        <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />
      )}

      <main className="content">
        <header className="content-header">
          <button className="hamburger" onClick={() => setDrawerOpen(true)}>
            ☰
          </button>
          <h1 className="content-title">{PAGE_TITLES[tab]}</h1>
        </header>

        {tab === 'dashboard' && (
          <DashboardTab dashboard={dashboard} onReload={loadAll} />
        )}

        {tab === 'animals' && (
          <AnimalsTab
            animals={animals}
            groups={groups}
            onReload={loadAll}
            onSelect={(a) => setSelectedAnimalId(a.id)}
            showAddForm={showAddForm}
            setShowAddForm={setShowAddForm}
          />
        )}

        {tab === 'groups' && (
          <GroupsTab
            groups={groups}
            animals={animals}
            onReload={loadAll}
            onManage={(g) => setMembershipGroupId(g.id)}
          />
        )}

        {tab === 'vaccination' && (
          <VaccinationTab
            groups={groups}
            animals={animals}
            vaccinations={vaccinations}
            animalsById={animalsById}
            vaccinesById={vaccinesById}
            onReload={loadAll}
          />
        )}

        {tab === 'finance' && (
          <FinanceTab groups={groups} animals={animals} onReloadAll={loadAll} />
        )}
      </main>

      {selectedAnimal && (
        <AnimalModal
          animal={selectedAnimal}
          groups={groups}
          vaccinations={vaccinations.filter(
            (v) => v.animal_id === selectedAnimal.id
          )}
          vaccinesById={vaccinesById}
          onClose={() => setSelectedAnimalId(null)}
          onReload={loadAll}
          onDeleted={() => {
            setSelectedAnimalId(null)
            loadAll()
          }}
        />
      )}

      {membershipGroup && (
        <GroupMembershipModal
          group={membershipGroup}
          animals={animals}
          onClose={() => setMembershipGroupId(null)}
          onChanged={loadAll}
        />
      )}
    </div>
  )
}

// ============ ВКЛАДКА: ВАКЦИНАЦИЯ ============
function VaccinationTab({
  groups,
  animals,
  vaccinations,
  animalsById,
  vaccinesById,
  onReload,
}: {
  groups: Group[]
  animals: Animal[]
  vaccinations: Vaccination[]
  animalsById: Record<number, Animal>
  vaccinesById: Record<number, Vaccine>
  onReload: () => void
}) {
  const [subTab, setSubTab] = useState<'calendar' | 'group'>('calendar')

  const pendingCount = vaccinations.filter((v) => !v.is_done).length

  return (
    <div>
      <div className="subtabs">
        <button
          className={subTab === 'calendar' ? 'active' : ''}
          onClick={() => setSubTab('calendar')}
        >
          📅 Календарь
          {pendingCount > 0 && (
            <span className="subtab-count">{pendingCount}</span>
          )}
        </button>
        <button
          className={subTab === 'group' ? 'active' : ''}
          onClick={() => setSubTab('group')}
        >
          👥 Гуртовая
        </button>
      </div>

      {subTab === 'calendar' && (
        <CalendarTab
          vaccinations={vaccinations}
          animalsById={animalsById}
          vaccinesById={vaccinesById}
          onReload={onReload}
        />
      )}

      {subTab === 'group' && (
        <GroupVaccinationTab
          groups={groups}
          animals={animals}
          onReload={onReload}
        />
      )}
    </div>
  )
}

// ============ ДАШБОРД ============
function DashboardTab({
  dashboard,
  onReload,
}: {
  dashboard: Dashboard | null
  onReload: () => void
}) {
  const [full, setFull] = useState<DashboardFull | null>(null)
  const [upcoming, setUpcoming] = useState<
    (Vaccination & { animal?: Animal; vaccine?: Vaccine })[]
  >([])
  const [recentEvents, setRecentEvents] = useState<
    (AnimalEvent & { animal?: Animal })[]
  >([])
  const [loading, setLoading] = useState(true)

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    try {
      const [fullRes, vacRes, anRes, vcRes, evRes] = await Promise.all([
        api.get<DashboardFull>(`${API}/dashboard/full`),
        api.get<Vaccination[]>(`${API}/vaccinations?is_done=false`),
        api.get<Animal[]>(`${API}/animals`),
        api.get<Vaccine[]>(`${API}/vaccines`),
        api.get<AnimalEvent[]>(`${API}/events`),
      ])

      setFull(fullRes.data)

      const anMap: Record<number, Animal> = {}
      anRes.data.forEach((a) => (anMap[a.id] = a))
      const vcMap: Record<number, Vaccine> = {}
      vcRes.data.forEach((v) => (vcMap[v.id] = v))

      setUpcoming(
        vacRes.data
          .map((v) => ({
            ...v,
            animal: anMap[v.animal_id],
            vaccine: vcMap[v.vaccine_id],
          }))
          .sort((a, b) => a.planned_date.localeCompare(b.planned_date))
          .slice(0, 7)
      )

      setRecentEvents(
        evRes.data
          .slice(0, 5)
          .map((ev) => ({ ...ev, animal: anMap[ev.animal_id] }))
      )
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard, dashboard])

  if (loading && !full) {
    return <p className="empty">Загрузка…</p>
  }

  return (
    <div>
      <h2 className="section-title">💉 Вакцинация</h2>
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value blue">
            {full?.vaccination.active ?? 0}
          </div>
          <div className="stat-label">Активных голов</div>
        </div>
        <div className="stat-card">
          <div className="stat-value orange">
            {full?.vaccination.upcoming_7 ?? 0}
          </div>
          <div className="stat-label">На неделе</div>
        </div>
        <div className="stat-card">
          <div className="stat-value red">
            {full?.vaccination.overdue ?? 0}
          </div>
          <div className="stat-label">Просрочено</div>
        </div>
      </div>

      <h2 className="section-title">🐄 Поголовье</h2>
      <div className="dash-grid-4">
        <div className="dash-mini">
          <div className="dash-mini-icon">🐄</div>
          <div className="dash-mini-value">{full?.animals.cows ?? 0}</div>
          <div className="dash-mini-label">Коровы</div>
        </div>
        <div className="dash-mini">
          <div className="dash-mini-icon">🐂</div>
          <div className="dash-mini-value">{full?.animals.bulls ?? 0}</div>
          <div className="dash-mini-label">Быки</div>
        </div>
        <div className="dash-mini">
          <div className="dash-mini-icon">🐮</div>
          <div className="dash-mini-value">{full?.animals.young ?? 0}</div>
          <div className="dash-mini-label">Молодняк</div>
        </div>
        <div className="dash-mini">
          <div className="dash-mini-icon">👥</div>
          <div className="dash-mini-value">{full?.animals.groups ?? 0}</div>
          <div className="dash-mini-label">Групп</div>
        </div>
      </div>

      <h2 className="section-title">💰 Финансы за 30 дней</h2>
      <div className="dash-fin-row">
        <div className="dash-fin-card income">
          <div className="dash-fin-label">Доходы</div>
          <div className="dash-fin-value">
            +{formatMoney(full?.finance_30d.income ?? 0)}
          </div>
        </div>
        <div className="dash-fin-card expense">
          <div className="dash-fin-label">Расходы</div>
          <div className="dash-fin-value">
            −{formatMoney(full?.finance_30d.expense ?? 0)}
          </div>
        </div>
        <div
          className={`dash-fin-card profit ${
            (full?.finance_30d.profit ?? 0) >= 0 ? 'positive' : 'negative'
          }`}
        >
          <div className="dash-fin-label">Прибыль</div>
          <div className="dash-fin-value">
            {formatMoney(full?.finance_30d.profit ?? 0)}
          </div>
        </div>
      </div>

      <h2 className="section-title">📅 Ближайшие вакцинации</h2>

      {upcoming.length === 0 ? (
        <p className="empty">Нет предстоящих вакцинаций</p>
      ) : (
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
      )}

      <h2 className="section-title">📝 Последние события</h2>

      {recentEvents.length === 0 ? (
        <p className="empty">Событий пока нет</p>
      ) : (
        <div className="events-list">
          {recentEvents.map((ev) => (
            <div key={ev.id} className="dash-event-row">
              <div className="dash-event-icon">
                {EVENT_LABELS[ev.event_type]?.split(' ')[0] || '📝'}
              </div>
              <div className="dash-event-info">
                <div className="dash-event-title">
                  {EVENT_LABELS[ev.event_type] || ev.event_type}
                  {ev.animal && (
                    <span className="dash-event-tag">
                      {' '}
                      · 🐄 {ev.animal.tag_number}
                    </span>
                  )}
                </div>
                <div className="dash-event-meta">
                  📅 {formatDate(ev.event_date)}
                  {ev.description && ` · ${ev.description}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <button className="reload-btn" onClick={loadDashboard}>
        🔄 Обновить
      </button>
    </div>
  )
}

// ============ ПОГОЛОВЬЕ ============
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
  const [statusFilter, setStatusFilter] = useState<string>('active')

  const filtered = useMemo(() => {
    let list = animals
    if (statusFilter !== 'all') {
      list = list.filter((a) => a.status === statusFilter)
    }
    if (groupFilter !== 'all') {
      list = list.filter((a) => a.group_id === groupFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (a) =>
          a.tag_number.toLowerCase().includes(q) ||
          (a.name?.toLowerCase() || '').includes(q) ||
          (a.chip_number?.toLowerCase() || '').includes(q)
      )
    }
    return list
  }, [animals, search, groupFilter, statusFilter])

  return (
    <div>
      <div className="toolbar">
        <input
          className="search-input"
          placeholder="🔍 Бирка, кличка, чип"
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

      <div className="filter-row">
        {['active', 'all', 'sold', 'dead'].map((s) => (
          <button
            key={s}
            className={statusFilter === s ? 'chip active' : 'chip'}
            onClick={() => setStatusFilter(s)}
          >
            {s === 'active'
              ? 'Активные'
              : s === 'all'
              ? 'Все'
              : s === 'sold'
              ? 'Проданные'
              : 'Падёж'}
          </button>
        ))}
      </div>

      {groups.length > 0 && (
        <div className="filter-row">
          <button
            className={groupFilter === 'all' ? 'chip active' : 'chip'}
            onClick={() => setGroupFilter('all')}
          >
            Все группы
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
              {a.name && <span>🏷 {a.name}</span>}
              <span>🐄 {a.breed}</span>
              <span>🎂 {animalAge(a.birth_date)}</span>
              {a.group_id && (
                <span>
                  👥 {groups.find((g) => g.id === a.group_id)?.name || '—'}
                </span>
              )}
              {a.status !== 'active' && (
                <span className="status-badge">
                  {STATUS_LABELS[a.status] || a.status}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============ ГРУППЫ ============
function GroupsTab({
  groups,
  animals,
  onReload,
  onManage,
}: {
  groups: Group[]
  animals: Animal[]
  onReload: () => void
  onManage: (g: Group) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [editGroup, setEditGroup] = useState<Group | null>(null)
  const [form, setForm] = useState({ name: '', description: '' })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [generalError, setGeneralError] = useState('')
  const [saving, setSaving] = useState(false)

  const openCreate = () => {
    setEditGroup(null)
    setForm({ name: '', description: '' })
    setFieldErrors({})
    setGeneralError('')
    setShowForm(true)
  }

  const openEdit = (g: Group) => {
    setEditGroup(g)
    setForm({ name: g.name, description: g.description || '' })
    setFieldErrors({})
    setGeneralError('')
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditGroup(null)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFieldErrors({})
    setGeneralError('')

    if (!form.name.trim()) {
      setFieldErrors({ name: 'Укажите название группы' })
      setGeneralError('Исправьте выделенные поля')
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
      }
      if (editGroup) {
        await api.patch(`${API}/groups/${editGroup.id}`, payload)
      } else {
        await api.post(`${API}/groups`, payload)
      }
      closeForm()
      onReload()
    } catch (err) {
      const p = parseApiError(err)
      setFieldErrors(p.fields)
      setGeneralError(p.general)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (g: Group) => {
    const count = animals.filter((a) => a.group_id === g.id).length
    if (
      !confirm(
        `Удалить группу «${g.name}»?${
          count ? `\n${count} животных будут без группы.` : ''
        }`
      )
    )
      return
    try {
      await api.delete(`${API}/groups/${g.id}`)
      onReload()
    } catch (err) {
      alert('Не удалось удалить')
    }
  }

  return (
    <div>
      <div className="toolbar">
        <button className="add-btn" onClick={openCreate}>
          + Создать группу
        </button>
      </div>

      {showForm && (
        <form className="form-card" onSubmit={submit} noValidate>
          <h3>{editGroup ? 'Редактировать группу' : 'Новая группа'}</h3>

          {generalError && (
            <div className="form-error">
              <span className="error-icon">⚠️</span>
              <span>{generalError}</span>
            </div>
          )}

          <div className="form-field">
            <label>
              Название <span className="req">*</span>
            </label>
            <input
              className={fieldErrors.name ? 'has-error' : ''}
              value={form.name}
              onChange={(e) => {
                setForm({ ...form, name: e.target.value })
                if (fieldErrors.name) {
                  const n = { ...fieldErrors }
                  delete n.name
                  setFieldErrors(n)
                }
              }}
              placeholder="Гурт №1"
            />
            {fieldErrors.name && (
              <div className="field-error">{fieldErrors.name}</div>
            )}
          </div>

          <div className="form-field">
            <label>Описание</label>
            <input
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="Стельные коровы"
            />
          </div>

          <div className="complete-actions">
            <button
              type="button"
              className="btn-cancel"
              onClick={closeForm}
              disabled={saving}
            >
              Отмена
            </button>
            <button type="submit" className="btn-save" disabled={saving}>
              {saving ? '⏳…' : editGroup ? '💾 Сохранить' : '💾 Создать'}
            </button>
          </div>
        </form>
      )}

      {groups.length === 0 && !showForm && (
        <p className="empty">Групп пока нет — создайте первую</p>
      )}

      <div className="list">
        {groups.map((g) => {
          const count = animals.filter(
            (a) => a.group_id === g.id && a.status === 'active'
          ).length
          return (
            <div key={g.id} className="card group-card">
              <div className="group-card-main">
                <div className="group-name">
                  👥 {g.name}
                  <span className="group-count">{count}</span>
                </div>
                {g.description && (
                  <div className="group-desc">{g.description}</div>
                )}
              </div>
              <div className="group-actions">
                <button
                  className="icon-btn primary"
                  onClick={() => onManage(g)}
                  title="Состав гурта"
                >
                  🐄
                </button>
                <button
                  className="icon-btn"
                  onClick={() => openEdit(g)}
                  title="Редактировать"
                >
                  ✏️
                </button>
                <button
                  className="icon-btn danger"
                  onClick={() => remove(g)}
                  title="Удалить"
                >
                  🗑
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============ ФОРМА ЖИВОТНОГО ============
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
      errs.tag_number = 'Минимум 3 символа'
    } else if (form.tag_number.trim().length > 50) {
      errs.tag_number = 'Максимум 50 символов'
    }
    if (form.birth_date) {
      const d = new Date(form.birth_date)
      const today = new Date()
      today.setHours(23, 59, 59, 999)
      if (d > today) errs.birth_date = 'Дата рождения не может быть в будущем'
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
      await api.post(`${API}/animals`, {
        tag_number: form.tag_number.trim(),
        name: form.name.trim() || null,
        sex: form.sex,
        birth_date: form.birth_date || null,
        breed: form.breed.trim() || 'Калмыцкая',
        color: form.color.trim() || null,
        group_id: form.group_id ? Number(form.group_id) : null,
      })
      onCreated()
    } catch (err) {
      const parsed = parseApiError(err)
      setFieldErrors(parsed.fields)
      setGeneralError(parsed.general)
    } finally {
      setSaving(false)
    }
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
          onChange={(e) => setForm({ ...form, tag_number: e.target.value })}
          placeholder="RU-001-2026"
        />
        {fieldErrors.tag_number && (
          <div className="field-error">{fieldErrors.tag_number}</div>
        )}
      </div>

      <div className="form-row">
        <div className="form-field">
          <label>Кличка</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="form-field">
          <label>
            Пол <span className="req">*</span>
          </label>
          <select
            value={form.sex}
            onChange={(e) => setForm({ ...form, sex: e.target.value })}
          >
            <option value="female">Корова (♀)</option>
            <option value="male">Бык (♂)</option>
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label>Дата рождения</label>
          <input
            type="date"
            className={fieldErrors.birth_date ? 'has-error' : ''}
            value={form.birth_date}
            onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
          />
          {fieldErrors.birth_date && (
            <div className="field-error">{fieldErrors.birth_date}</div>
          )}
        </div>
        <div className="form-field">
          <label>Масть</label>
          <input
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label>Порода</label>
          <input
            value={form.breed}
            onChange={(e) => setForm({ ...form, breed: e.target.value })}
          />
        </div>
        <div className="form-field">
          <label>Группа</label>
          <select
            value={form.group_id}
            onChange={(e) => setForm({ ...form, group_id: e.target.value })}
          >
            <option value="">— без группы —</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button type="submit" className="submit-btn" disabled={saving}>
        {saving ? '⏳ Сохранение…' : '💾 Сохранить'}
      </button>
    </form>
  )
}

// ============ КАЛЕНДАРЬ ============
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

  const filtered = useMemo(() => {
    let list = [...vaccinations]
    if (filter === 'upcoming') list = list.filter((v) => !v.is_done)
    if (filter === 'done') list = list.filter((v) => v.is_done)
    return list.sort((a, b) => a.planned_date.localeCompare(b.planned_date))
  }, [vaccinations, filter])

  const complete = async (vac: Vaccination) => {
    const actual = prompt(
      'Дата выполнения (YYYY-MM-DD):',
      new Date().toISOString().slice(0, 10)
    )
    if (!actual) return
    const vet = prompt('ФИО ветеринара (необязательно):') || null
    try {
      await api.post(`${API}/vaccinations/${vac.id}/complete`, {
        actual_date: actual,
        vet_name: vet,
      })
      onReload()
    } catch (err) {
      alert('Ошибка')
    }
  }

  const remove = async (vac: Vaccination) => {
    if (!confirm('Удалить запись?')) return
    try {
      await api.delete(`${API}/vaccinations/${vac.id}`)
      onReload()
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div>
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
              {!v.is_done ? (
                <button className="complete-btn" onClick={() => complete(v)}>
                  ✅ Отметить выполненной
                </button>
              ) : (
                <button className="delete-mini-btn" onClick={() => remove(v)}>
                  🗑 Удалить
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============ ГУРТОВАЯ ВАКЦИНАЦИЯ ============
function GroupVaccinationTab({
  groups,
  animals,
  onReload,
}: {
  groups: Group[]
  animals: Animal[]
  onReload: () => void
}) {
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
  const [upcoming, setUpcoming] = useState<GroupUpcoming[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedDisease, setExpandedDisease] = useState<string | null>(null)
  const [actualDate, setActualDate] = useState(
    new Date().toISOString().slice(0, 10)
  )
  const [vetName, setVetName] = useState('')
  const [doseUsed, setDoseUsed] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadUpcoming = useCallback(async (gid: number) => {
    setLoading(true)
    setUpcoming([])
    try {
      const { data } = await api.get<GroupUpcoming[]>(
        `${API}/groups/${gid}/upcoming-vaccinations`
      )
      setUpcoming(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedGroupId) {
      loadUpcoming(selectedGroupId)
    }
  }, [selectedGroupId, loadUpcoming])

  const selectedGroup = groups.find((g) => g.id === selectedGroupId)
  const groupAnimals = animals.filter(
    (a) => a.group_id === selectedGroupId && a.status === 'active'
  )

  const submitMass = async (disease: string) => {
    if (!selectedGroupId) return
    if (!actualDate) {
      setError('Укажите дату выполнения')
      return
    }
    setSaving(true)
    setError('')
    setMessage('')

    try {
      const { data } = await api.post(
        `${API}/groups/${selectedGroupId}/complete-vaccinations`,
        {
          disease,
          actual_date: actualDate,
          vet_name: vetName.trim() || null,
          dose_used: doseUsed.trim() || null,
        }
      )
      setMessage(
        `✅ Отмечено ${data.updated} вакцинаций у ${data.animals_count} животных`
      )
      setExpandedDisease(null)
      setVetName('')
      setDoseUsed('')
      loadUpcoming(selectedGroupId)
      onReload()
      setTimeout(() => setMessage(''), 5000)
    } catch (err) {
      const p = parseApiError(err)
      setError(p.general)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="gv-section">
        <div className="gv-section-title">1. Выберите гурт</div>
        {groups.length === 0 ? (
          <p className="empty">
            Сначала создайте группы на вкладке «Группы»
          </p>
        ) : (
          <div className="filter-row">
            {groups.map((g) => {
              const count = animals.filter(
                (a) => a.group_id === g.id && a.status === 'active'
              ).length
              return (
                <button
                  key={g.id}
                  className={`chip ${
                    selectedGroupId === g.id ? 'active' : ''
                  }`}
                  onClick={() => {
                    setSelectedGroupId(g.id)
                    setExpandedDisease(null)
                    setMessage('')
                    setError('')
                  }}
                >
                  {g.name} ({count})
                </button>
              )
            })}
          </div>
        )}
      </div>

      {selectedGroupId && (
        <div className="gv-section">
          <div className="gv-section-title">
            2. Предстоящие вакцинации для «{selectedGroup?.name}»
          </div>

          {loading && <p className="empty-small">Загрузка…</p>}

          {!loading && upcoming.length === 0 && (
            <p className="empty">
              Нет предстоящих вакцинаций. Сгенерируйте календари на вкладке
              «Поголовье».
            </p>
          )}

          {message && (
            <div className="gv-success">
              <span>{message}</span>
            </div>
          )}

          {error && (
            <div className="form-error">
              <span className="error-icon">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <div className="list">
            {upcoming.map((u) => {
              const earliestDays = daysUntil(u.earliest_date)
              const overdue = u.overdue_count > 0
              const soon = !overdue && earliestDays <= 3
              const isExpanded = expandedDisease === u.disease

              return (
                <div
                  key={u.disease}
                  className={`card gv-card ${
                    overdue ? 'card-urgent' : soon ? 'card-soon' : ''
                  }`}
                >
                  <div className="gv-card-header">
                    <div>
                      <div className="gv-card-title">💉 {u.disease}</div>
                      <div className="gv-card-meta">
                        <span>
                          <b>{u.count}</b> голов
                        </span>
                        <span>📅 с {formatDate(u.earliest_date)}</span>
                        {u.earliest_date !== u.latest_date && (
                          <span>по {formatDate(u.latest_date)}</span>
                        )}
                        {overdue && (
                          <span className="gv-overdue">
                            ⚠️ просрочено у {u.overdue_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {!isExpanded && (
                    <button
                      className="gv-mass-btn"
                      onClick={() => {
                        setExpandedDisease(u.disease)
                        setActualDate(new Date().toISOString().slice(0, 10))
                        setVetName('')
                        setDoseUsed('')
                        setError('')
                        setMessage('')
                      }}
                    >
                      ✅ Отметить всем {u.count} головам
                    </button>
                  )}

                  {isExpanded && (
                    <div className="gv-form">
                      <div className="gv-form-title">
                        Массовая отметка: {u.disease}
                      </div>

                      <div className="form-row">
                        <div className="form-field">
                          <label>
                            Дата выполнения <span className="req">*</span>
                          </label>
                          <input
                            type="date"
                            value={actualDate}
                            onChange={(e) => setActualDate(e.target.value)}
                          />
                        </div>

                        <div className="form-field">
                          <label>Ветеринар</label>
                          <input
                            value={vetName}
                            onChange={(e) => setVetName(e.target.value)}
                            placeholder="ФИО"
                          />
                        </div>
                      </div>

                      <div className="form-field">
                        <label>Доза / препарат</label>
                        <input
                          value={doseUsed}
                          onChange={(e) => setDoseUsed(e.target.value)}
                          placeholder="2 мл, серия 12345"
                        />
                      </div>

                      <div className="gv-form-summary">
                        Будет отмечено <b>{u.count}</b> вакцинаций у{' '}
                        <b>{u.count}</b> голов гурта «{selectedGroup?.name}»
                      </div>

                      <div className="complete-actions">
                        <button
                          className="btn-cancel"
                          onClick={() => setExpandedDisease(null)}
                          disabled={saving}
                        >
                          Отмена
                        </button>
                        <button
                          className="btn-save"
                          onClick={() => submitMass(u.disease)}
                          disabled={saving}
                        >
                          {saving
                            ? '⏳ Сохраняю…'
                            : `✅ Отметить всем (${u.count})`}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!selectedGroupId && groups.length > 0 && (
        <div className="gv-hint">
          <div className="gv-hint-icon">💡</div>
          <div>
            <b>Как это работает:</b>
            <ol>
              <li>Выберите гурт сверху</li>
              <li>Увидите список предстоящих вакцинаций для всех животных</li>
              <li>
                Нажмите «Отметить всем» — все вакцинации одного типа будут
                отмечены за раз
              </li>
            </ol>
            <p>
              Всего в выбранном гурте:{' '}
              <b>{groupAnimals.length} активных голов</b>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ============ МОДАЛКА: СОСТАВ ГУРТА ============
function GroupMembershipModal({
  group,
  animals,
  onClose,
  onChanged,
}: {
  group: Group
  animals: Animal[]
  onClose: () => void
  onChanged: () => void
}) {
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [selectedOut, setSelectedOut] = useState<Set<number>>(new Set())
  const [selectedIn, setSelectedIn] = useState<Set<number>>(new Set())

  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dragOverCol, setDragOverCol] = useState<'in' | 'out' | null>(null)

  const active = useMemo(
    () => animals.filter((a) => a.status === 'active'),
    [animals]
  )

  const inGroup = useMemo(
    () => active.filter((a) => a.group_id === group.id),
    [active, group.id]
  )

  const notInGroup = useMemo(
    () =>
      active
        .filter((a) => a.group_id !== group.id)
        .sort((a, b) => a.tag_number.localeCompare(b.tag_number)),
    [active, group.id]
  )

  useEffect(() => {
    setSelectedOut(new Set())
    setSelectedIn(new Set())
  }, [search])

  const filterBySearch = (list: Animal[]) => {
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter(
      (a) =>
        a.tag_number.toLowerCase().includes(q) ||
        (a.name?.toLowerCase() || '').includes(q) ||
        (a.chip_number?.toLowerCase() || '').includes(q)
    )
  }

  const filteredIn = filterBySearch(inGroup)
  const filteredOut = filterBySearch(notInGroup)

  const addOne = async (id: number) => {
    setBusy(true)
    setError('')
    try {
      await api.post(`${API}/groups/${group.id}/assign`, {
        animal_ids: [id],
        action: 'add',
      })
      setSelectedOut((prev) => {
        const n = new Set(prev)
        n.delete(id)
        return n
      })
      onChanged()
    } catch (err) {
      const p = parseApiError(err)
      setError(p.general)
    } finally {
      setBusy(false)
    }
  }

  const removeOne = async (id: number) => {
    setBusy(true)
    setError('')
    try {
      await api.post(`${API}/groups/${group.id}/assign`, {
        animal_ids: [id],
        action: 'remove',
      })
      setSelectedIn((prev) => {
        const n = new Set(prev)
        n.delete(id)
        return n
      })
      onChanged()
    } catch (err) {
      const p = parseApiError(err)
      setError(p.general)
    } finally {
      setBusy(false)
    }
  }

  const addSelected = async () => {
    if (selectedOut.size === 0) return
    setBusy(true)
    setError('')
    try {
      await api.post(`${API}/groups/${group.id}/assign`, {
        animal_ids: Array.from(selectedOut),
        action: 'add',
      })
      setSelectedOut(new Set())
      onChanged()
    } catch (err) {
      const p = parseApiError(err)
      setError(p.general)
    } finally {
      setBusy(false)
    }
  }

  const removeSelected = async () => {
    if (selectedIn.size === 0) return
    setBusy(true)
    setError('')
    try {
      await api.post(`${API}/groups/${group.id}/assign`, {
        animal_ids: Array.from(selectedIn),
        action: 'remove',
      })
      setSelectedIn(new Set())
      onChanged()
    } catch (err) {
      const p = parseApiError(err)
      setError(p.general)
    } finally {
      setBusy(false)
    }
  }

  const addAll = async () => {
    if (filteredOut.length === 0) return
    setBusy(true)
    setError('')
    try {
      await api.post(`${API}/groups/${group.id}/assign`, {
        animal_ids: filteredOut.map((a) => a.id),
        action: 'add',
      })
      setSelectedOut(new Set())
      onChanged()
    } catch (err) {
      const p = parseApiError(err)
      setError(p.general)
    } finally {
      setBusy(false)
    }
  }

  const removeAll = async () => {
    if (inGroup.length === 0) return
    if (!confirm(`Убрать всех ${inGroup.length} животных из «${group.name}»?`))
      return
    setBusy(true)
    setError('')
    try {
      await api.post(`${API}/groups/${group.id}/assign`, {
        animal_ids: inGroup.map((a) => a.id),
        action: 'remove',
      })
      setSelectedIn(new Set())
      onChanged()
    } catch (err) {
      const p = parseApiError(err)
      setError(p.general)
    } finally {
      setBusy(false)
    }
  }

  const toggleSelectOut = (id: number) => {
    setSelectedOut((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const toggleSelectIn = (id: number) => {
    setSelectedIn((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const selectAllOut = () =>
    setSelectedOut(new Set(filteredOut.map((a) => a.id)))
  const selectAllIn = () => setSelectedIn(new Set(filteredIn.map((a) => a.id)))
  const clearSelectionOut = () => setSelectedOut(new Set())
  const clearSelectionIn = () => setSelectedIn(new Set())

  const handleDragStart = (id: number) => setDraggingId(id)
  const handleDragEnd = () => {
    setDraggingId(null)
    setDragOverCol(null)
  }

  const handleDragOver = (col: 'in' | 'out') => (e: React.DragEvent) => {
    e.preventDefault()
    setDragOverCol(col)
  }

  const handleDragLeave = () => setDragOverCol(null)

  const handleDrop = (col: 'in' | 'out') => async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOverCol(null)
    const id = draggingId
    setDraggingId(null)
    if (!id) return
    const animal = active.find((a) => a.id === id)
    if (!animal) return
    if (col === 'in' && animal.group_id === group.id) return
    if (col === 'out' && animal.group_id !== group.id) return
    if (col === 'in') await addOne(id)
    else await removeOne(id)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>👥 {group.name}</h2>
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="member-search-row">
            <input
              className="search-input"
              placeholder="🔍 Бирка, кличка, чип"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {error && (
            <div className="form-error">
              <span className="error-icon">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <div className="member-hint">
            💡 Перетаскивайте карточки между колонками или используйте чекбоксы
            для массовых операций
          </div>

          <div className="member-columns">
            <div
              className={`member-col ${
                dragOverCol === 'out' ? 'drag-over' : ''
              }`}
              onDragOver={handleDragOver('out')}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop('out')}
            >
              <div className="member-col-header">
                <span>
                  Доступные ({filteredOut.length}
                  {search && ` из ${notInGroup.length}`})
                </span>
                <div className="member-col-actions">
                  <button
                    className="mini-add-btn"
                    onClick={
                      selectedOut.size === filteredOut.length &&
                      filteredOut.length > 0
                        ? clearSelectionOut
                        : selectAllOut
                    }
                    disabled={filteredOut.length === 0}
                  >
                    {selectedOut.size === filteredOut.length &&
                    filteredOut.length > 0
                      ? '☐ Снять'
                      : '☑ Все'}
                  </button>
                  {filteredOut.length > 0 && (
                    <button
                      className="mini-add-btn"
                      onClick={addAll}
                      disabled={busy}
                    >
                      ➕ Все
                    </button>
                  )}
                </div>
              </div>

              {selectedOut.size > 0 && (
                <div className="member-selected-bar">
                  <span>
                    <b>{selectedOut.size}</b> выбрано
                  </span>
                  <button
                    className="btn-bulk-add"
                    onClick={addSelected}
                    disabled={busy}
                  >
                    ➕ Добавить
                  </button>
                </div>
              )}

              <div className="member-list">
                {filteredOut.length === 0 && (
                  <p className="member-empty">
                    {search
                      ? 'Ничего не найдено'
                      : 'Все активные животные уже в этом гурте'}
                  </p>
                )}

                {filteredOut.map((a) => (
                  <div
                    key={a.id}
                    className={`member-row draggable ${
                      draggingId === a.id ? 'dragging' : ''
                    } ${selectedOut.has(a.id) ? 'selected' : ''}`}
                    draggable
                    onDragStart={() => handleDragStart(a.id)}
                    onDragEnd={handleDragEnd}
                  >
                    <input
                      type="checkbox"
                      className="member-checkbox"
                      checked={selectedOut.has(a.id)}
                      onChange={() => toggleSelectOut(a.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="member-info">
                      <div className="member-tag">{a.tag_number}</div>
                      <div className="member-meta">
                        {a.name && <span>🏷 {a.name} </span>}
                        {a.sex === 'female' ? '♀' : '♂'}
                        <span> · {animalAge(a.birth_date)}</span>
                      </div>
                    </div>
                    <button
                      className="member-btn add"
                      onClick={() => addOne(a.id)}
                      disabled={busy}
                    >
                      ➕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div
              className={`member-col ${
                dragOverCol === 'in' ? 'drag-over' : ''
              }`}
              onDragOver={handleDragOver('in')}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop('in')}
            >
              <div className="member-col-header">
                <span>
                  В гурте ({filteredIn.length}
                  {search && ` из ${inGroup.length}`})
                </span>
                <div className="member-col-actions">
                  <button
                    className="mini-add-btn"
                    onClick={
                      selectedIn.size === filteredIn.length &&
                      filteredIn.length > 0
                        ? clearSelectionIn
                        : selectAllIn
                    }
                    disabled={filteredIn.length === 0}
                  >
                    {selectedIn.size === filteredIn.length &&
                    filteredIn.length > 0
                      ? '☐ Снять'
                      : '☑ Все'}
                  </button>
                  {inGroup.length > 0 && (
                    <button
                      className="mini-add-btn danger"
                      onClick={removeAll}
                      disabled={busy}
                    >
                      ➖ Все
                    </button>
                  )}
                </div>
              </div>

              {selectedIn.size > 0 && (
                <div className="member-selected-bar">
                  <span>
                    <b>{selectedIn.size}</b> выбрано
                  </span>
                  <button
                    className="btn-bulk-remove"
                    onClick={removeSelected}
                    disabled={busy}
                  >
                    ➖ Убрать
                  </button>
                </div>
              )}

              <div className="member-list">
                {filteredIn.length === 0 && (
                  <p className="member-empty">
                    {search
                      ? 'Ничего не найдено'
                      : 'В гурте пока нет животных'}
                  </p>
                )}

                {filteredIn.map((a) => (
                  <div
                    key={a.id}
                    className={`member-row draggable ${
                      draggingId === a.id ? 'dragging' : ''
                    } ${selectedIn.has(a.id) ? 'selected' : ''}`}
                    draggable
                    onDragStart={() => handleDragStart(a.id)}
                    onDragEnd={handleDragEnd}
                  >
                    <input
                      type="checkbox"
                      className="member-checkbox"
                      checked={selectedIn.has(a.id)}
                      onChange={() => toggleSelectIn(a.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="member-info">
                      <div className="member-tag">{a.tag_number}</div>
                      <div className="member-meta">
                        {a.name && <span>🏷 {a.name} </span>}
                        {a.sex === 'female' ? '♀' : '♂'}
                        <span> · {animalAge(a.birth_date)}</span>
                      </div>
                    </div>
                    <button
                      className="member-btn remove"
                      onClick={() => removeOne(a.id)}
                      disabled={busy}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="member-footer">
            <span>
              Всего в гурте: <b>{inGroup.length}</b> из{' '}
              <b>{active.length}</b> активных
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============ ФИНАНСЫ ============
function FinanceTab({
  groups,
  animals,
  onReloadAll,
}: {
  groups: Group[]
  animals: Animal[]
  onReloadAll: () => void
}) {
  const [summary, setSummary] = useState<FinanceSummary | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [incomes, setIncomes] = useState<Income[]>([])

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [view, setView] = useState<'summary' | 'expenses' | 'incomes'>('summary')

  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [showIncomeForm, setShowIncomeForm] = useState(false)

  const animalsById = useMemo(() => {
    const m: Record<number, Animal> = {}
    animals.forEach((a) => (m[a.id] = a))
    return m
  }, [animals])

  const loadFinance = useCallback(async () => {
    try {
      const params: any = {}
      if (dateFrom) params.date_from = dateFrom
      if (dateTo) params.date_to = dateTo

      const [s, e, i] = await Promise.all([
        api.get<FinanceSummary>(`${API}/finance/summary`, { params }),
        api.get<Expense[]>(`${API}/expenses`, { params }),
        api.get<Income[]>(`${API}/incomes`, { params }),
      ])
      setSummary(s.data)
      setExpenses(e.data)
      setIncomes(i.data)
    } catch (err) {
      console.error(err)
    }
  }, [dateFrom, dateTo])

  useEffect(() => {
    loadFinance()
  }, [loadFinance])

  const quickRange = (days: number) => {
    const to = new Date()
    const from = new Date()
    from.setDate(from.getDate() - days)
    setDateFrom(from.toISOString().slice(0, 10))
    setDateTo(to.toISOString().slice(0, 10))
  }

  const clearRange = () => {
    setDateFrom('')
    setDateTo('')
  }

  const deleteExpense = async (id: number) => {
    if (!confirm('Удалить расход?')) return
    try {
      await api.delete(`${API}/expenses/${id}`)
      loadFinance()
    } catch (err) {
      console.error(err)
    }
  }

  const deleteIncome = async (id: number) => {
    if (!confirm('Удалить доход?')) return
    try {
      await api.delete(`${API}/incomes/${id}`)
      loadFinance()
      onReloadAll()
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div>
      <div className="fin-filters">
        <div className="fin-dates">
          <input
            type="date"
            className="date-input"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <span className="fin-date-sep">—</span>
          <input
            type="date"
            className="date-input"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <div className="fin-quick">
          <button className="chip" onClick={() => quickRange(30)}>
            30 дней
          </button>
          <button className="chip" onClick={() => quickRange(90)}>
            90 дней
          </button>
          <button className="chip" onClick={() => quickRange(365)}>
            Год
          </button>
          {(dateFrom || dateTo) && (
            <button className="chip" onClick={clearRange}>
              ✕ Сброс
            </button>
          )}
        </div>
      </div>

      <div className="filter-row">
        <button
          className={view === 'summary' ? 'chip active' : 'chip'}
          onClick={() => setView('summary')}
        >
          📊 Сводка
        </button>
        <button
          className={view === 'expenses' ? 'chip active' : 'chip'}
          onClick={() => setView('expenses')}
        >
          📉 Расходы ({expenses.length})
        </button>
        <button
          className={view === 'incomes' ? 'chip active' : 'chip'}
          onClick={() => setView('incomes')}
        >
          📈 Доходы ({incomes.length})
        </button>
      </div>

      {view === 'summary' && summary && (
        <>
          <div className="fin-stats">
            <div className="fin-stat income">
              <div className="fin-stat-label">Доходы</div>
              <div className="fin-stat-value">
                {formatMoney(summary.total_income)}
              </div>
              <div className="fin-stat-sub">{summary.income_count} записей</div>
            </div>
            <div className="fin-stat expense">
              <div className="fin-stat-label">Расходы</div>
              <div className="fin-stat-value">
                {formatMoney(summary.total_expense)}
              </div>
              <div className="fin-stat-sub">
                {summary.expense_count} записей
              </div>
            </div>
            <div
              className={`fin-stat profit ${
                summary.profit >= 0 ? 'positive' : 'negative'
              }`}
            >
              <div className="fin-stat-label">Прибыль</div>
              <div className="fin-stat-value">
                {formatMoney(summary.profit)}
              </div>
              <div className="fin-stat-sub">
                {summary.active_animals} голов
              </div>
            </div>
          </div>

          {summary.meat.total_weight_kg > 0 && (
            <div className="fin-meat-block">
              <h3 className="section-title">🥩 Продажа мяса</h3>
              <div className="fin-meat-grid">
                <div className="fin-meat-item">
                  <span className="fin-meat-label">Продано</span>
                  <span className="fin-meat-value">
                    {summary.meat.total_weight_kg.toLocaleString('ru-RU')} кг
                  </span>
                </div>
                <div className="fin-meat-item">
                  <span className="fin-meat-label">Выручка</span>
                  <span className="fin-meat-value">
                    {formatMoney(summary.meat.total_income)}
                  </span>
                </div>
                {summary.meat.avg_price_per_kg !== null && (
                  <div className="fin-meat-item">
                    <span className="fin-meat-label">Средняя цена</span>
                    <span className="fin-meat-value">
                      {formatMoney(summary.meat.avg_price_per_kg)}/кг
                    </span>
                  </div>
                )}
                {summary.meat.cost_per_kg !== null && (
                  <div className="fin-meat-item">
                    <span className="fin-meat-label">Себестоимость</span>
                    <span className="fin-meat-value">
                      {formatMoney(summary.meat.cost_per_kg)}/кг
                    </span>
                  </div>
                )}
              </div>

              {summary.meat.cost_per_kg !== null &&
                summary.meat.avg_price_per_kg !== null && (
                  <div
                    className={`fin-meat-margin ${
                      summary.meat.avg_price_per_kg - summary.meat.cost_per_kg >
                      0
                        ? 'positive'
                        : 'negative'
                    }`}
                  >
                    Маржа с 1 кг:{' '}
                    <b>
                      {formatMoney(
                        summary.meat.avg_price_per_kg -
                          summary.meat.cost_per_kg
                      )}
                    </b>{' '}
                    (
                    {(
                      ((summary.meat.avg_price_per_kg -
                        summary.meat.cost_per_kg) /
                        summary.meat.avg_price_per_kg) *
                      100
                    ).toFixed(1)}
                    %)
                  </div>
                )}
            </div>
          )}

          {summary.profit_per_animal !== null && (
            <div className="fin-per-animal">
              💡 Прибыль на 1 голову:{' '}
              <b>{formatMoney(summary.profit_per_animal)}</b>
            </div>
          )}

          {Object.keys(summary.expense_by_category).length > 0 && (
            <>
              <h3 className="section-title">📉 Расходы по категориям</h3>
              <div className="fin-cats">
                {Object.entries(summary.expense_by_category)
                  .sort((a, b) => b[1].amount - a[1].amount)
                  .map(([key, data]) => {
                    const cat = EXPENSE_CATEGORIES[key] || {
                      label: key,
                      icon: '📌',
                    }
                    const percent = summary.total_expense
                      ? (data.amount / summary.total_expense) * 100
                      : 0
                    return (
                      <div key={key} className="fin-cat">
                        <div className="fin-cat-head">
                          <span className="fin-cat-icon">{cat.icon}</span>
                          <span className="fin-cat-name">{cat.label}</span>
                          <span className="fin-cat-amount">
                            {formatMoney(data.amount)}
                          </span>
                        </div>
                        <div className="fin-cat-bar">
                          <div
                            className="fin-cat-bar-fill expense"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <div className="fin-cat-percent">
                          {percent.toFixed(1)}% · {data.count} записей
                        </div>
                      </div>
                    )
                  })}
              </div>
            </>
          )}

          {Object.keys(summary.income_by_category).length > 0 && (
            <>
              <h3 className="section-title">📈 Доходы по категориям</h3>
              <div className="fin-cats">
                {Object.entries(summary.income_by_category)
                  .sort((a, b) => b[1].amount - a[1].amount)
                  .map(([key, data]) => {
                    const cat = INCOME_CATEGORIES[key] || {
                      label: key,
                      icon: '📌',
                    }
                    const percent = summary.total_income
                      ? (data.amount / summary.total_income) * 100
                      : 0
                    return (
                      <div key={key} className="fin-cat">
                        <div className="fin-cat-head">
                          <span className="fin-cat-icon">{cat.icon}</span>
                          <span className="fin-cat-name">{cat.label}</span>
                          <span className="fin-cat-amount">
                            {formatMoney(data.amount)}
                          </span>
                        </div>
                        <div className="fin-cat-bar">
                          <div
                            className="fin-cat-bar-fill income"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <div className="fin-cat-percent">
                          {percent.toFixed(1)}% · {data.count} записей
                        </div>
                      </div>
                    )
                  })}
              </div>
            </>
          )}

          {summary.expense_count === 0 && summary.income_count === 0 && (
            <p className="empty">
              Пока нет данных. Добавьте расходы и доходы во вкладках ниже.
            </p>
          )}
        </>
      )}

      {view === 'expenses' && (
        <>
          <div className="toolbar">
            <button
              className="add-btn"
              onClick={() => setShowExpenseForm(!showExpenseForm)}
            >
              {showExpenseForm ? '✕ Отмена' : '+ Добавить расход'}
            </button>
          </div>

          {showExpenseForm && (
            <ExpenseForm
              groups={groups}
              onCreated={() => {
                setShowExpenseForm(false)
                loadFinance()
              }}
            />
          )}

          {expenses.length === 0 && !showExpenseForm && (
            <p className="empty">Расходов пока нет</p>
          )}

          <div className="list">
            {expenses.map((e) => {
              const cat = EXPENSE_CATEGORIES[e.category] || {
                label: e.category,
                icon: '📌',
              }
              const group = e.group_id
                ? groups.find((g) => g.id === e.group_id)
                : null
              return (
                <div key={e.id} className="card fin-card">
                  <div className="fin-row">
                    <div className="fin-row-icon expense">{cat.icon}</div>
                    <div className="fin-row-info">
                      <div className="fin-row-title">
                        {cat.label}
                        {e.quantity && (
                          <span className="fin-row-qty"> · {e.quantity}</span>
                        )}
                      </div>
                      <div className="fin-row-meta">
                        <span>📅 {formatDate(e.expense_date)}</span>
                        {group && <span>👥 {group.name}</span>}
                        {e.description && <span>· {e.description}</span>}
                      </div>
                    </div>
                    <div className="fin-row-amount expense">
                      −{formatMoney(e.amount)}
                    </div>
                    <button
                      className="icon-btn danger small"
                      onClick={() => deleteExpense(e.id)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {view === 'incomes' && (
        <>
          <div className="toolbar">
            <button
              className="add-btn"
              onClick={() => setShowIncomeForm(!showIncomeForm)}
            >
              {showIncomeForm ? '✕ Отмена' : '+ Добавить доход'}
            </button>
          </div>

          {showIncomeForm && (
            <IncomeForm
              animals={animals}
              onCreated={() => {
                setShowIncomeForm(false)
                loadFinance()
                onReloadAll()
              }}
            />
          )}

          {incomes.length === 0 && !showIncomeForm && (
            <p className="empty">Доходов пока нет</p>
          )}

          <div className="list">
            {incomes.map((i) => {
              const cat = INCOME_CATEGORIES[i.category] || {
                label: i.category,
                icon: '📌',
              }
              const animal = i.animal_id ? animalsById[i.animal_id] : null
              return (
                <div key={i.id} className="card fin-card">
                  <div className="fin-row">
                    <div className="fin-row-icon income">{cat.icon}</div>
                    <div className="fin-row-info">
                      <div className="fin-row-title">
                        {cat.label}
                        {i.weight_kg && (
                          <span className="fin-row-qty">
                            {' '}
                            · {i.weight_kg} кг
                          </span>
                        )}
                      </div>
                      <div className="fin-row-meta">
                        <span>📅 {formatDate(i.income_date)}</span>
                        {animal && (
                          <span className="fin-animal-link">
                            🐄 {animal.tag_number}
                            {animal.name && ` (${animal.name})`}
                          </span>
                        )}
                        {i.description && <span>· {i.description}</span>}
                      </div>
                    </div>
                    <div className="fin-row-amount income">
                      +{formatMoney(i.amount)}
                    </div>
                    <button
                      className="icon-btn danger small"
                      onClick={() => deleteIncome(i.id)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ============ ФОРМА РАСХОДА ============
function ExpenseForm({
  groups,
  onCreated,
}: {
  groups: Group[]
  onCreated: () => void
}) {
  const [form, setForm] = useState({
    category: 'feed',
    amount: '',
    expense_date: new Date().toISOString().slice(0, 10),
    description: '',
    quantity: '',
    group_id: '',
  })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [generalError, setGeneralError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFieldErrors({})
    setGeneralError('')

    if (!form.amount || Number(form.amount) <= 0) {
      setFieldErrors({ amount: 'Укажите сумму больше нуля' })
      setGeneralError('Исправьте выделенные поля')
      return
    }

    setSaving(true)
    try {
      await api.post(`${API}/expenses`, {
        category: form.category,
        amount: Number(form.amount),
        expense_date: form.expense_date,
        description: form.description.trim() || null,
        quantity: form.quantity.trim() || null,
        group_id: form.group_id ? Number(form.group_id) : null,
      })
      onCreated()
    } catch (err) {
      const p = parseApiError(err)
      setFieldErrors(p.fields)
      setGeneralError(p.general)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="form-card" onSubmit={submit} noValidate>
      <h3>Новый расход</h3>

      {generalError && (
        <div className="form-error">
          <span className="error-icon">⚠️</span>
          <span>{generalError}</span>
        </div>
      )}

      <div className="form-row">
        <div className="form-field">
          <label>
            Категория <span className="req">*</span>
          </label>
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.icon} {v.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label>
            Сумма, ₽ <span className="req">*</span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            className={fieldErrors.amount ? 'has-error' : ''}
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            placeholder="15000"
          />
          {fieldErrors.amount && (
            <div className="field-error">{fieldErrors.amount}</div>
          )}
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label>
            Дата <span className="req">*</span>
          </label>
          <input
            type="date"
            className={fieldErrors.expense_date ? 'has-error' : ''}
            value={form.expense_date}
            onChange={(e) =>
              setForm({ ...form, expense_date: e.target.value })
            }
          />
          {fieldErrors.expense_date && (
            <div className="field-error">{fieldErrors.expense_date}</div>
          )}
        </div>

        <div className="form-field">
          <label>Количество / объём</label>
          <input
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            placeholder="5 тонн, 200 л"
          />
        </div>
      </div>

      <div className="form-field">
        <label>Группа</label>
        <select
          value={form.group_id}
          onChange={(e) => setForm({ ...form, group_id: e.target.value })}
        >
          <option value="">— общий расход —</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <label>Описание</label>
        <input
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Сено на зимовку, бензин для трактора"
        />
      </div>

      <button type="submit" className="submit-btn" disabled={saving}>
        {saving ? '⏳ Сохранение…' : '💾 Сохранить'}
      </button>
    </form>
  )
}

// ============ ФОРМА ДОХОДА ============
function IncomeForm({
  animals,
  onCreated,
}: {
  animals: Animal[]
  onCreated: () => void
}) {
  const [form, setForm] = useState({
    category: 'meat',
    amount: '',
    income_date: new Date().toISOString().slice(0, 10),
    description: '',
    weight_kg: '',
    animal_id: '',
  })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [generalError, setGeneralError] = useState('')
  const [saving, setSaving] = useState(false)
  const [animalSearch, setAnimalSearch] = useState('')

  const cat = INCOME_CATEGORIES[form.category] || INCOME_CATEGORIES.other
  const linksAnimal = cat.linksAnimal

  const availableAnimals = useMemo(() => {
    let list = animals.filter((a) => a.status === 'active')
    if (animalSearch.trim()) {
      const q = animalSearch.toLowerCase()
      list = list.filter(
        (a) =>
          a.tag_number.toLowerCase().includes(q) ||
          (a.name?.toLowerCase() || '').includes(q)
      )
    }
    return list.sort((a, b) => a.tag_number.localeCompare(b.tag_number))
  }, [animals, animalSearch])

  const selectedAnimal = form.animal_id
    ? animals.find((a) => a.id === Number(form.animal_id))
    : null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFieldErrors({})
    setGeneralError('')

    const errs: Record<string, string> = {}
    if (!form.amount || Number(form.amount) <= 0) {
      errs.amount = 'Укажите сумму больше нуля'
    }
    if (
      (form.category === 'meat' || form.category === 'livestock') &&
      !form.animal_id
    ) {
      errs.animal_id = 'Укажите животное'
    }
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs)
      setGeneralError('Исправьте выделенные поля')
      return
    }

    setSaving(true)
    try {
      await api.post(`${API}/incomes`, {
        category: form.category,
        amount: Number(form.amount),
        income_date: form.income_date,
        description: form.description.trim() || null,
        weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
        animal_id: form.animal_id ? Number(form.animal_id) : null,
      })
      onCreated()
    } catch (err) {
      const p = parseApiError(err)
      setFieldErrors(p.fields)
      setGeneralError(p.general)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="form-card" onSubmit={submit} noValidate>
      <h3>Новый доход</h3>

      {generalError && (
        <div className="form-error">
          <span className="error-icon">⚠️</span>
          <span>{generalError}</span>
        </div>
      )}

      <div className="form-row">
        <div className="form-field">
          <label>
            Категория <span className="req">*</span>
          </label>
          <select
            value={form.category}
            onChange={(e) => {
              setForm({ ...form, category: e.target.value, animal_id: '' })
              setAnimalSearch('')
            }}
          >
            {Object.entries(INCOME_CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.icon} {v.label}
                {v.autoStatus ? ` (${v.autoStatus})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label>
            Сумма, ₽ <span className="req">*</span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            className={fieldErrors.amount ? 'has-error' : ''}
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            placeholder="250000"
          />
          {fieldErrors.amount && (
            <div className="field-error">{fieldErrors.amount}</div>
          )}
        </div>
      </div>

      {linksAnimal && (
        <div className="form-field">
          <label>
            Животное
            {(form.category === 'meat' || form.category === 'livestock') && (
              <span className="req">*</span>
            )}
            {cat.autoStatus && (
              <span className="auto-status-hint">
                → авто-статус «{cat.autoStatus}»
              </span>
            )}
          </label>

          {selectedAnimal ? (
            <div className="animal-chip-selected">
              <span className="animal-chip-tag">
                🐄 {selectedAnimal.tag_number}
              </span>
              {selectedAnimal.name && (
                <span className="animal-chip-name">{selectedAnimal.name}</span>
              )}
              <button
                type="button"
                className="animal-chip-remove"
                onClick={() => {
                  setForm({ ...form, animal_id: '' })
                  setAnimalSearch('')
                }}
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="animal-picker">
              <input
                className="search-input"
                placeholder="🔍 Поиск по бирке или кличке"
                value={animalSearch}
                onChange={(e) => setAnimalSearch(e.target.value)}
              />
              <div className="animal-picker-list">
                {availableAnimals.length === 0 && (
                  <p className="animal-picker-empty">
                    {animalSearch
                      ? 'Ничего не найдено'
                      : 'Нет активных животных'}
                  </p>
                )}
                {availableAnimals.slice(0, 30).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="animal-picker-item"
                    onClick={() => {
                      setForm({ ...form, animal_id: String(a.id) })
                      setAnimalSearch('')
                      if (fieldErrors.animal_id) {
                        const n = { ...fieldErrors }
                        delete n.animal_id
                        setFieldErrors(n)
                      }
                    }}
                  >
                    <span className="animal-picker-tag">{a.tag_number}</span>
                    {a.name && (
                      <span className="animal-picker-name">{a.name}</span>
                    )}
                    <span className="animal-picker-meta">
                      {a.sex === 'female' ? '♀' : '♂'} ·{' '}
                      {animalAge(a.birth_date)}
                    </span>
                  </button>
                ))}
                {availableAnimals.length > 30 && (
                  <p className="animal-picker-more">
                    + ещё {availableAnimals.length - 30}. Уточните поиск.
                  </p>
                )}
              </div>
            </div>
          )}

          {fieldErrors.animal_id && (
            <div className="field-error">{fieldErrors.animal_id}</div>
          )}
        </div>
      )}

      <div className="form-row">
        <div className="form-field">
          <label>
            Дата <span className="req">*</span>
          </label>
          <input
            type="date"
            className={fieldErrors.income_date ? 'has-error' : ''}
            value={form.income_date}
            onChange={(e) =>
              setForm({ ...form, income_date: e.target.value })
            }
          />
          {fieldErrors.income_date && (
            <div className="field-error">{fieldErrors.income_date}</div>
          )}
        </div>

        <div className="form-field">
          <label>Вес, кг</label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={form.weight_kg}
            onChange={(e) => setForm({ ...form, weight_kg: e.target.value })}
            placeholder="Для мяса"
          />
        </div>
      </div>

      <div className="form-field">
        <label>Описание</label>
        <input
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Продажа быка, 3 туши"
        />
      </div>

      {(form.category === 'meat' || form.category === 'livestock') && (
        <div className="auto-status-warning">
          ⚠️ При сохранении животное автоматически станет{' '}
          <b>{form.category === 'meat' ? 'Забито' : 'Продано'}</b> и появится
          событие в его карточке.
        </div>
      )}

      <button type="submit" className="submit-btn" disabled={saving}>
        {saving ? '⏳ Сохранение…' : '💾 Сохранить'}
      </button>
    </form>
  )
}

// ============ МОДАЛКА ЖИВОТНОГО ============
function AnimalModal({
  animal,
  groups,
  vaccinations,
  vaccinesById,
  onClose,
  onReload,
  onDeleted,
}: {
  animal: Animal
  groups: Group[]
  vaccinations: Vaccination[]
  vaccinesById: Record<number, Vaccine>
  onClose: () => void
  onReload: () => void
  onDeleted: () => void
}) {
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const [editForm, setEditForm] = useState({
    name: animal.name || '',
    color: animal.color || '',
    group_id: animal.group_id ? String(animal.group_id) : '',
    status: animal.status,
    notes: animal.notes || '',
  })
  const [saving, setSaving] = useState(false)

  const [events, setEvents] = useState<AnimalEvent[]>([])
  const [showEventForm, setShowEventForm] = useState(false)
  const [eventForm, setEventForm] = useState({
    event_type: 'calving',
    event_date: new Date().toISOString().slice(0, 10),
    description: '',
  })

  const [completeVac, setCompleteVac] = useState<Vaccination | null>(null)
  const [actualDate, setActualDate] = useState('')
  const [vetName, setVetName] = useState('')

  const [showSellForm, setShowSellForm] = useState(false)
  const [sellForm, setSellForm] = useState({
    category: 'livestock',
    amount: '',
    income_date: new Date().toISOString().slice(0, 10),
    weight_kg: '',
    description: '',
  })
  const [sellErrors, setSellErrors] = useState<Record<string, string>>({})
  const [sellGeneral, setSellGeneral] = useState('')
  const [selling, setSelling] = useState(false)
  const [sellSuccess, setSellSuccess] = useState('')

  const loadEvents = useCallback(async () => {
    try {
      const { data } = await api.get<AnimalEvent[]>(
        `${API}/animals/${animal.id}/events`
      )
      setEvents(data)
    } catch (err) {
      console.error(err)
    }
  }, [animal.id])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  const generate = async () => {
    setError('')
    setGenerating(true)
    try {
      const { data } = await api.post(
        `${API}/animals/${animal.id}/generate-vaccinations`
      )
      if (data.created === 0) {
        setError('Календарь уже сгенерирован ранее')
      } else {
        onReload()
      }
    } catch (err) {
      const p = parseApiError(err)
      setError(p.general)
    } finally {
      setGenerating(false)
    }
  }

  const saveEdit = async () => {
    setSaving(true)
    try {
      await api.patch(`${API}/animals/${animal.id}`, {
        name: editForm.name.trim() || null,
        color: editForm.color.trim() || null,
        group_id: editForm.group_id ? Number(editForm.group_id) : null,
        status: editForm.status,
        notes: editForm.notes.trim() || null,
      })
      setMode('view')
      onReload()
    } catch (err) {
      alert('Ошибка')
    } finally {
      setSaving(false)
    }
  }

  const deleteAnimal = async () => {
    if (!confirm(`Удалить животное ${animal.tag_number}?`)) return
    try {
      await api.delete(`${API}/animals/${animal.id}`)
      onDeleted()
    } catch (err) {
      alert('Не удалось удалить')
    }
  }

  const submitEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.post(`${API}/events`, {
        animal_id: animal.id,
        event_type: eventForm.event_type,
        event_date: eventForm.event_date,
        description: eventForm.description.trim() || null,
      })
      setShowEventForm(false)
      setEventForm({
        event_type: 'calving',
        event_date: new Date().toISOString().slice(0, 10),
        description: '',
      })
      loadEvents()
      onReload()
    } catch (err) {
      alert('Ошибка')
    }
  }

  const submitComplete = async () => {
    if (!completeVac) return
    if (!actualDate) return
    setSaving(true)
    try {
      await api.post(`${API}/vaccinations/${completeVac.id}/complete`, {
        actual_date: actualDate,
        vet_name: vetName.trim() || null,
      })
      setCompleteVac(null)
      onReload()
    } catch (err) {
      alert('Ошибка')
    } finally {
      setSaving(false)
    }
  }

  const openSellForm = (category: 'livestock' | 'meat') => {
    setSellForm({
      category,
      amount: '',
      income_date: new Date().toISOString().slice(0, 10),
      weight_kg: '',
      description: '',
    })
    setSellErrors({})
    setSellGeneral('')
    setSellSuccess('')
    setShowSellForm(true)
  }

  const submitSell = async (e: React.FormEvent) => {
    e.preventDefault()
    setSellErrors({})
    setSellGeneral('')
    setSellSuccess('')

    const errs: Record<string, string> = {}
    if (!sellForm.amount || Number(sellForm.amount) <= 0) {
      errs.amount = 'Укажите сумму больше нуля'
    }
    if (sellForm.category === 'meat' && !sellForm.weight_kg) {
      errs.weight_kg = 'Укажите вес туши'
    }
    if (Object.keys(errs).length > 0) {
      setSellErrors(errs)
      setSellGeneral('Исправьте выделенные поля')
      return
    }

    setSelling(true)
    try {
      await api.post(`${API}/incomes`, {
        category: sellForm.category,
        amount: Number(sellForm.amount),
        income_date: sellForm.income_date,
        description: sellForm.description.trim() || null,
        weight_kg: sellForm.weight_kg ? Number(sellForm.weight_kg) : null,
        animal_id: animal.id,
      })
      setSellSuccess(
        `✅ Доход ${Number(sellForm.amount).toLocaleString('ru-RU')} ₽ сохранён. Животное в статусе «${
          sellForm.category === 'meat' ? 'Забито' : 'Продано'
        }».`
      )
      setShowSellForm(false)
      loadEvents()
      onReload()
      setTimeout(() => setSellSuccess(''), 5000)
    } catch (err) {
      const p = parseApiError(err)
      setSellErrors(p.fields)
      setSellGeneral(p.general)
    } finally {
      setSelling(false)
    }
  }

  const printCard = () => {
    const sorted = [...vaccinations].sort((a, b) =>
      a.planned_date.localeCompare(b.planned_date)
    )
    const html = `
      <html><head><meta charset="utf-8"><title>Справка ${animal.tag_number}</title>
      <style>
        body { font-family: -apple-system, sans-serif; padding: 30px; color: #1c1c1e; }
        h1 { font-size: 22px; margin-bottom: 6px; }
        h2 { font-size: 16px; margin-top: 20px; margin-bottom: 8px; color: #555; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        td, th { padding: 8px; border-bottom: 1px solid #ddd; text-align: left; font-size: 13px; }
        .label { color: #888; font-size: 12px; }
        .val { font-size: 15px; font-weight: 500; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; margin-top: 12px; }
      </style></head><body>
      <h1>🐄 Ветеринарная справка</h1>
      <div class="label">Животное: ${animal.tag_number}${animal.name ? ` (${animal.name})` : ''}</div>
      <div class="grid">
        <div><div class="label">Пол</div><div class="val">${animal.sex === 'female' ? 'Корова' : 'Бык'}</div></div>
        <div><div class="label">Порода</div><div class="val">${animal.breed}</div></div>
        <div><div class="label">Дата рождения</div><div class="val">${formatDate(animal.birth_date)}</div></div>
        <div><div class="label">Масть</div><div class="val">${animal.color || '—'}</div></div>
      </div>
      <h2>Вакцинации (${sorted.filter(v => v.is_done).length} из ${sorted.length})</h2>
      <table>
        <tr><th>Дата план</th><th>Дата факт</th><th>Заболевание</th><th>Ветеринар</th></tr>
        ${sorted.map(v => `<tr><td>${formatDate(v.planned_date)}</td><td>${v.is_done ? '✅ ' + formatDate(v.actual_date) : '⏳'}</td><td>${vaccinesById[v.vaccine_id]?.disease || '—'}</td><td>${v.vet_name || '—'}</td></tr>`).join('')}
      </table>
      </body></html>
    `
    const w = window.open('', '_blank')
    if (w) {
      w.document.write(html)
      w.document.close()
      setTimeout(() => w.print(), 300)
    }
  }

  const sorted = [...vaccinations].sort((a, b) =>
    a.planned_date.localeCompare(b.planned_date)
  )
  const doneCount = sorted.filter((v) => v.is_done).length
  const isActive = animal.status === 'active'

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🐄 {animal.tag_number}</h2>
          <div className="modal-header-actions">
            {isActive && mode === 'view' && (
              <button
                className="sell-header-btn"
                onClick={() => openSellForm('livestock')}
                title="Продать / Забить"
              >
                💰 Продать
              </button>
            )}
            <button className="icon-btn" onClick={printCard} title="Печать">
              🖨
            </button>
            {mode === 'view' && (
              <button
                className="icon-btn"
                onClick={() => setMode('edit')}
                title="Редактировать"
              >
                ✏️
              </button>
            )}
            <button className="close-btn" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        <div className="modal-body">
          {sellSuccess && (
            <div className="gv-success" style={{ marginBottom: 16 }}>
              <span>{sellSuccess}</span>
            </div>
          )}

          {mode === 'view' && (
            <>
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
                <div>
                  <span className="label">Статус</span>
                  <span>
                    {STATUS_LABELS[animal.status] || animal.status}
                  </span>
                </div>
              </div>

              {showSellForm && (
                <form className="sell-form" onSubmit={submitSell} noValidate>
                  <h4>
                    💰{' '}
                    {sellForm.category === 'meat'
                      ? 'Забой на мясо'
                      : 'Продажа скота'}
                    <button
                      type="button"
                      className="close-x"
                      onClick={() => setShowSellForm(false)}
                    >
                      ✕
                    </button>
                  </h4>

                  <div className="sell-tabs">
                    <button
                      type="button"
                      className={
                        sellForm.category === 'livestock'
                          ? 'sell-tab active'
                          : 'sell-tab'
                      }
                      onClick={() =>
                        setSellForm({
                          ...sellForm,
                          category: 'livestock',
                          weight_kg: '',
                        })
                      }
                    >
                      🐄 Скот
                    </button>
                    <button
                      type="button"
                      className={
                        sellForm.category === 'meat'
                          ? 'sell-tab active'
                          : 'sell-tab'
                      }
                      onClick={() =>
                        setSellForm({ ...sellForm, category: 'meat' })
                      }
                    >
                      🥩 Мясо
                    </button>
                  </div>

                  {sellGeneral && (
                    <div className="form-error">
                      <span className="error-icon">⚠️</span>
                      <span>{sellGeneral}</span>
                    </div>
                  )}

                  <div className="form-row">
                    <div className="form-field">
                      <label>
                        Сумма, ₽ <span className="req">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className={sellErrors.amount ? 'has-error' : ''}
                        value={sellForm.amount}
                        onChange={(e) =>
                          setSellForm({ ...sellForm, amount: e.target.value })
                        }
                        placeholder="150000"
                        autoFocus
                      />
                      {sellErrors.amount && (
                        <div className="field-error">{sellErrors.amount}</div>
                      )}
                    </div>

                    <div className="form-field">
                      <label>
                        Дата <span className="req">*</span>
                      </label>
                      <input
                        type="date"
                        value={sellForm.income_date}
                        onChange={(e) =>
                          setSellForm({
                            ...sellForm,
                            income_date: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>

                  {sellForm.category === 'meat' && (
                    <div className="form-field">
                      <label>
                        Вес туши, кг <span className="req">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        className={sellErrors.weight_kg ? 'has-error' : ''}
                        value={sellForm.weight_kg}
                        onChange={(e) =>
                          setSellForm({
                            ...sellForm,
                            weight_kg: e.target.value,
                          })
                        }
                        placeholder="250"
                      />
                      {sellErrors.weight_kg && (
                        <div className="field-error">
                          {sellErrors.weight_kg}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="form-field">
                    <label>Описание</label>
                    <input
                      value={sellForm.description}
                      onChange={(e) =>
                        setSellForm({
                          ...sellForm,
                          description: e.target.value,
                        })
                      }
                      placeholder="Покупатель, примечания"
                    />
                  </div>

                  <div className="auto-status-warning">
                    ⚠️ Животное автоматически станет{' '}
                    <b>
                      {sellForm.category === 'meat' ? 'Забито' : 'Продано'}
                    </b>{' '}
                    и появится событие в карточке. Доход сохранится в разделе
                    «Финансы».
                  </div>

                  <div className="complete-actions">
                    <button
                      type="button"
                      className="btn-cancel"
                      onClick={() => setShowSellForm(false)}
                      disabled={selling}
                    >
                      Отмена
                    </button>
                    <button
                      type="submit"
                      className="btn-save"
                      disabled={selling}
                    >
                      {selling ? '⏳ Сохраняю…' : '💰 Сохранить продажу'}
                    </button>
                  </div>
                </form>
              )}

              {error && (
                <div className="form-error">
                  <span className="error-icon">⚠️</span>
                  <span>{error}</span>
                </div>
              )}

              {isActive && (
                <button
                  className="gen-btn"
                  onClick={generate}
                  disabled={generating}
                >
                  {generating
                    ? '⏳ Генерация…'
                    : '📅 Сгенерировать календарь вакцинаций'}
                </button>
              )}

              <h3 className="section-subtitle">
                💉 Вакцинации ({doneCount} из {sorted.length})
              </h3>

              {sorted.length === 0 && (
                <p className="empty-small">Календарь пуст</p>
              )}

              <div className="vacc-list">
                {sorted.map((v) => {
                  const days = daysUntil(v.planned_date)
                  const overdue = !v.is_done && days < 0
                  return (
                    <div
                      key={v.id}
                      className={`vacc-row-new ${
                        v.is_done ? 'vacc-done' : overdue ? 'vacc-overdue' : ''
                      }`}
                    >
                      <div className="vacc-main">
                        <div className="vacc-disease-name">
                          {vaccinesById[v.vaccine_id]?.disease || '—'}
                        </div>
                        <div className="vacc-dates">
                          <span className="vacc-date-item">
                            План: <b>{formatDate(v.planned_date)}</b>
                          </span>
                          {v.is_done && v.actual_date && (
                            <span className="vacc-date-item fact">
                              ✅ Факт: <b>{formatDate(v.actual_date)}</b>
                            </span>
                          )}
                        </div>
                      </div>
                      {v.is_done ? (
                        <div className="vacc-status-done">✅</div>
                      ) : isActive ? (
                        <button
                          className="vacc-complete-mini"
                          onClick={() => {
                            setCompleteVac(v)
                            setActualDate(
                              new Date().toISOString().slice(0, 10)
                            )
                            setVetName('')
                          }}
                        >
                          ✓
                        </button>
                      ) : (
                        <div className="vacc-locked">🔒</div>
                      )}
                    </div>
                  )
                })}
              </div>

              {completeVac && (
                <div className="complete-form">
                  <h4>
                    Отметить вакцинацию
                    <button
                      className="close-x"
                      onClick={() => setCompleteVac(null)}
                    >
                      ✕
                    </button>
                  </h4>
                  <div className="complete-vac-name">
                    💉 {vaccinesById[completeVac.vaccine_id]?.disease}
                  </div>

                  <div className="form-field">
                    <label>
                      Дата <span className="req">*</span>
                    </label>
                    <input
                      type="date"
                      value={actualDate}
                      onChange={(e) => setActualDate(e.target.value)}
                    />
                  </div>

                  <div className="form-field">
                    <label>Ветеринар</label>
                    <input
                      value={vetName}
                      onChange={(e) => setVetName(e.target.value)}
                    />
                  </div>

                  <div className="complete-actions">
                    <button
                      className="btn-cancel"
                      onClick={() => setCompleteVac(null)}
                    >
                      Отмена
                    </button>
                    <button
                      className="btn-save"
                      onClick={submitComplete}
                      disabled={saving}
                    >
                      {saving ? '⏳…' : '✅ Сохранить'}
                    </button>
                  </div>
                </div>
              )}

              <h3 className="section-subtitle">
                📝 События ({events.length})
                {isActive ? (
                  <button
                    className="mini-add-btn"
                    onClick={() => setShowEventForm(!showEventForm)}
                  >
                    {showEventForm ? '✕' : '+ Добавить'}
                  </button>
                ) : (
                  <span className="events-locked">🔒 Животное выбыло</span>
                )}
              </h3>

              {!isActive && (
                <div className="events-locked-hint">
                  Животное{' '}
                  <b>
                    {animal.status === 'sold'
                      ? 'продано'
                      : animal.status === 'dead'
                      ? 'пало'
                      : 'забито'}
                  </b>
                  . Новые события добавлять нельзя — только история.
                </div>
              )}

              {isActive && showEventForm && (
                <form className="form-card compact" onSubmit={submitEvent}>
                  <div className="form-row">
                    <div className="form-field">
                      <label>Тип</label>
                      <select
                        value={eventForm.event_type}
                        onChange={(e) =>
                          setEventForm({
                            ...eventForm,
                            event_type: e.target.value,
                          })
                        }
                      >
                        {Object.entries(EVENT_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-field">
                      <label>Дата</label>
                      <input
                        type="date"
                        value={eventForm.event_date}
                        onChange={(e) =>
                          setEventForm({
                            ...eventForm,
                            event_date: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="form-field">
                    <label>Описание</label>
                    <input
                      value={eventForm.description}
                      onChange={(e) =>
                        setEventForm({
                          ...eventForm,
                          description: e.target.value,
                        })
                      }
                    />
                  </div>
                  <button type="submit" className="submit-btn">
                    💾 Сохранить событие
                  </button>
                </form>
              )}

              <div className="events-list">
                {events.map((ev) => (
                  <div key={ev.id} className="event-row">
                    <div className="event-icon">
                      {EVENT_LABELS[ev.event_type]?.split(' ')[0] || '📝'}
                    </div>
                    <div className="event-info">
                      <div className="event-title">
                        {EVENT_LABELS[ev.event_type] || ev.event_type}
                      </div>
                      <div className="event-meta">
                        {formatDate(ev.event_date)}
                        {ev.description && ` · ${ev.description}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="danger-zone">
                <button className="danger-btn" onClick={deleteAnimal}>
                  🗑 Удалить животное
                </button>
              </div>
            </>
          )}

          {mode === 'edit' && (
            <>
              <h3 className="section-subtitle">✏️ Редактирование</h3>

              <div className="form-field">
                <label>Кличка</label>
                <input
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, name: e.target.value })
                  }
                />
              </div>

              <div className="form-row">
                <div className="form-field">
                  <label>Масть</label>
                  <input
                    value={editForm.color}
                    onChange={(e) =>
                      setEditForm({ ...editForm, color: e.target.value })
                    }
                  />
                </div>
                <div className="form-field">
                  <label>Группа</label>
                  <select
                    value={editForm.group_id}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        group_id: e.target.value,
                      })
                    }
                  >
                    <option value="">— без группы —</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-field">
                <label>Статус</label>
                <select
                  value={editForm.status}
                  onChange={(e) =>
                    setEditForm({ ...editForm, status: e.target.value })
                  }
                >
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label>Заметки</label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) =>
                    setEditForm({ ...editForm, notes: e.target.value })
                  }
                  rows={3}
                />
              </div>

              <div className="complete-actions">
                <button
                  className="btn-cancel"
                  onClick={() => setMode('view')}
                >
                  Отмена
                </button>
                <button
                  className="btn-save"
                  onClick={saveEdit}
                  disabled={saving}
                >
                  {saving ? '⏳…' : '💾 Сохранить'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default App