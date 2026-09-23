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

type GroupUpcoming = {
  disease: string
  vaccine_id: number
  vaccine_name: string
  count: number
  earliest_date: string
  latest_date: string
  overdue_count: number
}

type Tab = 'dashboard' | 'animals' | 'groups' | 'group-vacc' | 'calendar'

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

const PAGE_TITLES: Record<Tab, string> = {
  dashboard: 'Сводка',
  animals: 'Поголовье',
  groups: 'Группы',
  'group-vacc': 'Гуртовая вакцинация',
  calendar: 'Календарь вакцинаций',
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
    return {
      general: data.detail || 'Проверьте поля формы',
      fields: data.errors,
    }
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
            className={`drawer-item ${tab === 'group-vacc' ? 'active' : ''}`}
            onClick={() => goTo('group-vacc')}
          >
            <span className="drawer-item-icon">💉</span>
            <span className="drawer-item-text">Гуртовая вакцинация</span>
          </button>

          <button
            className={`drawer-item ${tab === 'calendar' ? 'active' : ''}`}
            onClick={() => goTo('calendar')}
          >
            <span className="drawer-item-icon">📅</span>
            <span className="drawer-item-text">Календарь</span>
            {overdueCount > 0 ? (
              <span className="drawer-item-badge">{overdueCount}</span>
            ) : (
              <span className="drawer-item-count">{pendingCount}</span>
            )}
          </button>
        </nav>

        <div className="drawer-footer">
          <div className="drawer-footer-title">Экспорт данных</div>
          <a
            className="drawer-export"
            href={`${API}/export/animals.csv`}
            download
          >
            📥 Поголовье CSV
          </a>
          <a
            className="drawer-export"
            href={`${API}/export/vaccinations.csv`}
            download
          >
            📥 Вакцинации CSV
          </a>
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

        {tab === 'group-vacc' && (
          <GroupVaccinationTab
            groups={groups}
            animals={animals}
            onReload={loadAll}
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

  // Активные животные (не падёж, не проданы)
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

  const addAll = async () => {
    if (filteredOut.length === 0) return
    setBusy(true)
    setError('')
    try {
      await axios.post(`${API}/groups/${group.id}/assign`, {
        animal_ids: filteredOut.map((a) => a.id),
        action: 'add',
      })
      onChanged()
    } catch (err) {
      const p = parseApiError(err)
      setError(p.general)
    } finally {
      setBusy(false)
    }
  }

  const addOne = async (id: number) => {
    setBusy(true)
    setError('')
    try {
      await axios.post(`${API}/groups/${group.id}/assign`, {
        animal_ids: [id],
        action: 'add',
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
      await axios.post(`${API}/groups/${group.id}/assign`, {
        animal_ids: [id],
        action: 'remove',
      })
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
      await axios.post(`${API}/groups/${group.id}/assign`, {
        animal_ids: inGroup.map((a) => a.id),
        action: 'remove',
      })
      onChanged()
    } catch (err) {
      const p = parseApiError(err)
      setError(p.general)
    } finally {
      setBusy(false)
    }
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

          <div className="member-columns">
            {/* === Слева: не в гурте === */}
            <div className="member-col">
              <div className="member-col-header">
                <span>
                  Доступные ({filteredOut.length}
                  {search && ` из ${notInGroup.length}`})
                </span>
                {filteredOut.length > 0 && (
                  <button
                    className="mini-add-btn"
                    onClick={addAll}
                    disabled={busy}
                  >
                    ➕ Добавить всех
                  </button>
                )}
              </div>

              <div className="member-list">
                {filteredOut.length === 0 && (
                  <p className="member-empty">
                    {search
                      ? 'Ничего не найдено'
                      : 'Все активные животные уже в этом гурте'}
                  </p>
                )}

                {filteredOut.map((a) => (
                  <div key={a.id} className="member-row">
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
                      title="Добавить в гурт"
                    >
                      ➕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* === Справа: в гурте === */}
            <div className="member-col">
              <div className="member-col-header">
                <span>
                  В гурте ({filteredIn.length}
                  {search && ` из ${inGroup.length}`})
                </span>
                {inGroup.length > 0 && (
                  <button
                    className="mini-add-btn danger"
                    onClick={removeAll}
                    disabled={busy}
                  >
                    ➖ Убрать всех
                  </button>
                )}
              </div>

              <div className="member-list">
                {filteredIn.length === 0 && (
                  <p className="member-empty">
                    {search
                      ? 'Ничего не найдено'
                      : 'В гурте пока нет животных'}
                  </p>
                )}

                {filteredIn.map((a) => (
                  <div key={a.id} className="member-row">
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
                      title="Убрать из гурта"
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

// ============ ВКЛАДКА: ГУРТОВАЯ ВАКЦИНАЦИЯ ============
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
      const { data } = await axios.get<GroupUpcoming[]>(
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
      const { data } = await axios.post(
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
              <li>Нажмите «Отметить всем» — все вакцинации одного типа будут отмечены за раз</li>
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

// ============ ДАШБОРД ============
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
        setUpcoming(
          vacs
            .map((v) => ({
              ...v,
              animal: anMap[v.animal_id],
              vaccine: vcMap[v.vaccine_id],
            }))
            .sort((a, b) => a.planned_date.localeCompare(b.planned_date))
            .slice(0, 10)
        )
      } catch (err) {
        console.error(err)
      }
    }
    load()
  }, [dashboard])

  return (
    <div>
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value blue">{dashboard?.total_active ?? 0}</div>
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
                  👥{' '}
                  {groups.find((g) => g.id === a.group_id)?.name || '—'}
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
        await axios.patch(`${API}/groups/${editGroup.id}`, payload)
      } else {
        await axios.post(`${API}/groups`, payload)
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
      await axios.delete(`${API}/groups/${g.id}`)
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
      await axios.post(`${API}/vaccinations/${vac.id}/complete`, {
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
      await axios.delete(`${API}/vaccinations/${vac.id}`)
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
                <button
                  className="complete-btn"
                  onClick={() => complete(v)}
                >
                  ✅ Отметить выполненной
                </button>
              ) : (
                <button
                  className="delete-mini-btn"
                  onClick={() => remove(v)}
                >
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

  const loadEvents = useCallback(async () => {
    try {
      const { data } = await axios.get<AnimalEvent[]>(
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
      const { data } = await axios.post(
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
      await axios.patch(`${API}/animals/${animal.id}`, {
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
      await axios.delete(`${API}/animals/${animal.id}`)
      onDeleted()
    } catch (err) {
      alert('Не удалось удалить')
    }
  }

  const submitEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await axios.post(`${API}/events`, {
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
      await axios.post(`${API}/vaccinations/${completeVac.id}/complete`, {
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🐄 {animal.tag_number}</h2>
          <div className="modal-header-actions">
            <button className="icon-btn" onClick={printCard}>
              🖨
            </button>
            {mode === 'view' && (
              <button className="icon-btn" onClick={() => setMode('edit')}>
                ✏️
              </button>
            )}
            <button className="close-btn" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        <div className="modal-body">
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

              {error && (
                <div className="form-error">
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
                        v.is_done
                          ? 'vacc-done'
                          : overdue
                          ? 'vacc-overdue'
                          : ''
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
                      ) : (
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
                <button
                  className="mini-add-btn"
                  onClick={() => setShowEventForm(!showEventForm)}
                >
                  {showEventForm ? '✕' : '+ Добавить'}
                </button>
              </h3>

              {showEventForm && (
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