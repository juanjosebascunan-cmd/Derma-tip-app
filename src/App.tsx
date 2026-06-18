import { startTransition, type FormEvent } from 'react'
import { useEffect, useState } from 'react'
import {
  createEntry,
  createPatient,
  deletePatient,
  downloadPatientExport,
  getBootstrapData,
  login,
  logout,
  updatePatient,
  updateReminder,
} from './api'
import './App.css'
import flareFigureA from './assets/flare-figure-a.png'
import flareFigureB from './assets/flare-figure-b.png'
import bellIcon from './assets/bell-icon.svg'
import brandMark from './assets/brand-mark.svg'
import profileAvatar from './assets/profile-avatar.png'
import skincarePortrait from './assets/skincare-portrait.png'
import type { CurrentUser, EntryDraft, LogEntry, Page, Patient, Reminder } from './types'

type PatientForm = {
  fullName: string
  condition: string
  notes: string
}

type AuthForm = {
  username: string
  password: string
}

const appToday = new Date('2026-06-15T12:00:00')
const calendarMonth = new Date(appToday.getFullYear(), appToday.getMonth(), 1)

const triggerOptions = ['Estres', 'Clima', 'Nuevo producto', 'Alergenos', 'Dieta', 'Falta de sueno']
const symptomOptions = ['Picor', 'Enrojecimiento', 'Ardor', 'Resequedad', 'Descamacion', 'Inflamacion']

const emptyDraft: EntryDraft = {
  patientId: 1,
  date: toInputDate(appToday),
  severity: 3,
  pain: 2,
  symptoms: ['Enrojecimiento'],
  triggers: ['Estres'],
  notes: '',
}

const emptyPatientForm: PatientForm = {
  fullName: '',
  condition: '',
  notes: '',
}

const emptyAuthForm: AuthForm = {
  username: '',
  password: '',
}

function toInputDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function toReadableDate(value: string) {
  const date = new Date(`${value}T12:00:00`)
  return new Intl.DateTimeFormat('es-CL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function buildCalendarDays(selectedDate: string, logs: LogEntry[]) {
  const year = new Date(`${selectedDate}T12:00:00`).getFullYear()
  const month = new Date(`${selectedDate}T12:00:00`).getMonth()
  const firstDay = new Date(year, month, 1)
  const totalDays = new Date(year, month + 1, 0).getDate()
  const offset = firstDay.getDay()
  const items: Array<{ key: string; day?: number; level?: 'none' | 'low' | 'medium' | 'high' }> = []

  for (let index = 0; index < offset; index += 1) {
    items.push({ key: `blank-${index}` })
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const key = toInputDate(new Date(year, month, day))
    const dayLogs = logs.filter((entry) => entry.date === key)
    const topSeverity = dayLogs.reduce((max, entry) => Math.max(max, entry.severity), 0)
    const level = topSeverity >= 4 ? 'high' : topSeverity >= 2 ? 'medium' : topSeverity >= 1 ? 'low' : 'none'
    items.push({ key, day, level })
  }

  return items
}

function countActiveDays(logs: LogEntry[]) {
  return new Set(logs.map((entry) => entry.date)).size
}

function getTriggerStats(logs: LogEntry[]) {
  const counts = new Map<string, number>()

  logs.forEach((entry) => {
    entry.triggers.forEach((trigger) => {
      counts.set(trigger, (counts.get(trigger) ?? 0) + 1)
    })
  })

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
}

function toPatientForm(patient: Patient | null): PatientForm {
  if (!patient) {
    return emptyPatientForm
  }

  return {
    fullName: patient.fullName,
    condition: patient.condition,
    notes: patient.notes,
  }
}

function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const [selectedDate, setSelectedDate] = useState(toInputDate(appToday))
  const [draft, setDraft] = useState<EntryDraft>(emptyDraft)
  const [patientCreateDraft, setPatientCreateDraft] = useState<PatientForm>(emptyPatientForm)
  const [patientEditDraft, setPatientEditDraft] = useState<PatientForm>(emptyPatientForm)
  const [authDraft, setAuthDraft] = useState<AuthForm>(emptyAuthForm)
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [patients, setPatients] = useState<Patient[]>([])
  const [patient, setPatient] = useState<Patient | null>(null)
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isCreatingPatient, setIsCreatingPatient] = useState(false)
  const [isUpdatingPatient, setIsUpdatingPatient] = useState(false)
  const [isDeletingPatient, setIsDeletingPatient] = useState(false)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const isGuestMode = !currentUser

  async function loadData(patientId?: number) {
    try {
      setIsLoading(true)
      const store = await getBootstrapData(patientId)
      setCurrentUser(store.currentUser)
      setPatients(store.patients)
      setPatient(store.patient)
      setPatientEditDraft(toPatientForm(store.patient))
      setReminders(store.reminders)
      setEntries(store.entries)
      setDraft((current) => ({ ...current, patientId: store.patient.id }))
      setSelectedDate(store.entries[0]?.date ?? toInputDate(appToday))
      setErrorMessage('')
    } catch {
      setErrorMessage('No pude cargar los datos. Revisa tu configuracion de Firebase o tu conexion.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const todaysEntries = entries.filter((entry) => entry.date === toInputDate(appToday))
  const selectedEntries = entries.filter((entry) => entry.date === selectedDate)
  const latestEntry = entries[0]
  const flareUps = entries.filter((entry) => entry.status === 'Brote').length
  const recoveryScore = Math.max(58, 100 - flareUps * 7 + reminders.filter((item) => item.done).length * 4)
  const consistency = `${countActiveDays(entries)}/30`
  const triggerStats = getTriggerStats(entries)
  const calendarDays = buildCalendarDays(selectedDate, entries)
  const summaryBars = [
    { day: 'L', value: 38 },
    { day: 'M', value: 56 },
    { day: 'M', value: 42 },
    { day: 'J', value: 64 },
    { day: 'V', value: 31 },
    { day: 'S', value: 26 },
    { day: 'D', value: 48 },
  ]

  async function handlePatientChange(nextPatientId: number) {
    await loadData(nextPatientId)
  }

  async function toggleReminder(reminderId: number) {
    if (isGuestMode) {
      setErrorMessage('Inicia sesion para guardar recordatorios y datos propios.')
      setPage('profile')
      return
    }

    const currentReminder = reminders.find((item) => item.id === reminderId)

    if (!currentReminder) {
      return
    }

    const nextDone = !currentReminder.done

    setReminders((current) =>
      current.map((item) => (item.id === reminderId ? { ...item, done: nextDone } : item)),
    )

    try {
      const updated = await updateReminder(reminderId, nextDone)
      setReminders((current) => current.map((item) => (item.id === reminderId ? updated : item)))
      setErrorMessage('')
    } catch {
      setReminders((current) =>
        current.map((item) => (item.id === reminderId ? { ...item, done: currentReminder.done } : item)),
      )
      setErrorMessage('No pude guardar el cambio del recordatorio.')
    }
  }

  function toggleDraftValue(field: 'symptoms' | 'triggers', value: string) {
    setDraft((current) => {
      const items = current[field]
      const exists = items.includes(value)
      const next = exists ? items.filter((item) => item !== value) : [...items, value]
      return {
        ...current,
        [field]: next.length > 0 ? next : [value],
      }
    })
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isGuestMode) {
      setErrorMessage('Inicia sesion para guardar registros en tu cuenta.')
      setPage('profile')
      return
    }

    try {
      setIsSaving(true)
      const savedEntry = await createEntry(draft)
      setEntries((current) => [savedEntry, ...current].sort((left, right) => right.date.localeCompare(left.date)))
      setSelectedDate(savedEntry.date)
      setDraft((current) => ({ ...emptyDraft, patientId: current.patientId }))
      setErrorMessage('')

      startTransition(() => {
        setPage('history')
      })
    } catch {
      setErrorMessage('No pude guardar el registro. Intenta de nuevo.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleCreatePatient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isGuestMode) {
      setErrorMessage('Inicia sesion para crear pacientes privados.')
      return
    }

    try {
      setIsCreatingPatient(true)
      const created = await createPatient(patientCreateDraft)
      setPatientCreateDraft(emptyPatientForm)
      await loadData(created.id)
      setPage('dashboard')
      setErrorMessage('')
    } catch {
      setErrorMessage('No pude crear el paciente. Revisa los datos e intenta de nuevo.')
    } finally {
      setIsCreatingPatient(false)
    }
  }

  async function handleUpdatePatient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isGuestMode) {
      setErrorMessage('Inicia sesion para editar pacientes.')
      return
    }

    if (!patient) {
      return
    }

    try {
      setIsUpdatingPatient(true)
      const updated = await updatePatient(patient.id, patientEditDraft)
      await loadData(updated.id)
      setErrorMessage('')
    } catch {
      setErrorMessage('No pude actualizar el paciente. Intenta de nuevo.')
    } finally {
      setIsUpdatingPatient(false)
    }
  }

  async function handleDeletePatient() {
    if (isGuestMode) {
      setErrorMessage('Inicia sesion para eliminar pacientes.')
      return
    }

    if (!patient) {
      return
    }

    if (!window.confirm(`Eliminar a ${patient.fullName}? Se borraran tambien sus registros.`)) {
      return
    }

    try {
      setIsDeletingPatient(true)
      await deletePatient(patient.id)
      await loadData()
      setErrorMessage('')
    } catch {
      setErrorMessage('No pude eliminar el paciente. Debe quedar al menos uno disponible.')
    } finally {
      setIsDeletingPatient(false)
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      setIsAuthenticating(true)
      await login(authDraft)
      setAuthDraft(emptyAuthForm)
      await loadData()
      setErrorMessage('')
    } catch {
      setErrorMessage('No pude iniciar sesion. Revisa usuario y contrasena.')
    } finally {
      setIsAuthenticating(false)
    }
  }

  async function handleLogout() {
    try {
      setIsAuthenticating(true)
      await logout()
      await loadData()
      setErrorMessage('')
    } catch {
      setErrorMessage('No pude cerrar sesion ahora mismo.')
    } finally {
      setIsAuthenticating(false)
    }
  }

  function handleExport() {
    if (!patient) {
      setErrorMessage('No hay un paciente activo para exportar.')
      return
    }

    downloadPatientExport(
      patient,
      entries.filter((entry) => entry.patientId === patient.id),
    )
  }

  return (
    <main className="app-shell">
      <section className="phone-frame">
        <header className="topbar">
          <div className="brand">
            <div className="avatar" aria-hidden="true">
              <img alt="" src={brandMark} />
            </div>
            <div className="brand-copy">
              <span className="brand-mark">D&amp;T</span>
              <p className="eyebrow">Tu companera de seguimiento</p>
              <h1>DermaTips</h1>
            </div>
          </div>
          <button className="icon-button" type="button" aria-label="Notificaciones">
            <img alt="" src={bellIcon} />
          </button>
        </header>

        <section className="screen-content">
          {errorMessage ? <div className="app-alert">{errorMessage}</div> : null}
          {isLoading ? <div className="app-alert subtle">Sincronizando datos del seguimiento...</div> : null}

          {page === 'dashboard' ? (
            <>
              <section className="panel patient-switcher">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Paciente activo</p>
                    <h3>{patient?.fullName ?? 'Cargando paciente'}</h3>
                  </div>
                </div>
                <div className="patient-selector">
                  <label className="field">
                    <span>Elegir paciente</span>
                    <select
                      value={patient?.id ?? ''}
                      onChange={(event) => void handlePatientChange(Number(event.target.value))}
                    >
                      {patients.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.fullName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="patient-quick-info">
                    <strong>{patient?.condition ?? 'Sin condicion'}</strong>
                    <p>{patient?.notes ?? 'Todavia no hay notas para este paciente.'}</p>
                  </div>
                </div>
              </section>

              <section className="hero-card">
                <div className="hero-illustration">
                  <img alt="Rutina de cuidado facial" src={skincarePortrait} />
                </div>
                <div className="hero-copy">
                  <p className="eyebrow">Estado actual</p>
                  <div className="hero-heading">
                    <h2>
                      {latestEntry?.status === 'Brote' ? 'Atencion suave hoy' : 'Tu piel se ve calmada'}
                    </h2>
                    <div className="status-badge" aria-hidden="true">
                      {latestEntry?.status === 'Brote' ? ':(' : ':)'}
                    </div>
                  </div>
                  <p>
                    {latestEntry?.status === 'Brote'
                      ? 'Detectamos actividad reciente. Registra sintomas para encontrar patrones.'
                      : `Hoy tienes ${todaysEntries.length} registro${todaysEntries.length === 1 ? '' : 's'} y varios dias con mejor control.`}
                  </p>
                  <div className="hero-soft-points">
                    <span>Calma</span>
                    <span>Rutina</span>
                    <span>Seguimiento</span>
                  </div>
                </div>
              </section>

              <section className="quick-actions" aria-label="Accesos rapidos">
                <button
                  className="action-card primary-action"
                  disabled={isGuestMode}
                  type="button"
                  onClick={() => setPage('add')}
                >
                  <span className="action-icon">+</span>
                  <strong>{isGuestMode ? 'Inicia sesion para registrar' : 'Registrar brote'}</strong>
                  <small>
                    {isGuestMode
                      ? 'Tus registros privados y persistentes se activan al iniciar sesion.'
                      : 'Anota sintomas, dolor y detonantes en menos de un minuto.'}
                  </small>
                </button>
                <button
                  className="action-card secondary-action"
                  type="button"
                  onClick={() => setPage('calendar')}
                >
                  <span className="action-icon">C</span>
                  <strong>Ver calendario</strong>
                  <small>Revisa si las crisis se repiten por fecha o rutina.</small>
                </button>
              </section>

              <section className="content-grid">
                <article className="panel">
                  <div className="panel-header">
                    <h3>Recordatorios</h3>
                    <button type="button" onClick={() => setPage('profile')}>
                      Ajustes
                    </button>
                  </div>
                  <div className="stack-list">
                    {reminders.map((item) => (
                      <button
                        className={`reminder-row ${item.done ? 'is-done' : ''}`}
                        disabled={isGuestMode}
                        key={item.id}
                        type="button"
                        onClick={() => void toggleReminder(item.id)}
                      >
                        <div>
                          <strong>{item.title}</strong>
                          <p>{item.detail}</p>
                        </div>
                        <span>{item.done ? 'Listo' : 'Pendiente'}</span>
                      </button>
                    ))}
                  </div>
                </article>

                <article className="panel">
                  <div className="panel-header">
                    <h3>Resumen 7 dias</h3>
                    <button type="button" onClick={() => setPage('history')}>
                      Analisis
                    </button>
                  </div>
                  <div className="chart-card" aria-label="Grafico de actividad semanal">
                    {summaryBars.map((bar, index) => (
                      <div className="chart-bar-group" key={`${bar.day}-${index}`}>
                        <div className="chart-bar" style={{ height: `${bar.value}px` }} />
                        <span>{bar.day}</span>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="panel">
                  <div className="panel-header">
                    <h3>Posibles detonantes</h3>
                    <button type="button" onClick={() => setPage('add')}>
                      Editar
                    </button>
                  </div>
                  <div className="tag-list">
                    {triggerStats.map(([trigger]) => (
                      <span className="tag" key={trigger}>
                        {trigger}
                      </span>
                    ))}
                  </div>
                </article>

                <article className="panel tip-panel">
                  <p className="tip-label">Consejo del dia</p>
                  <h3>Tu registro debe ayudar, no agobiar</h3>
                  <p>
                    Si estas cansado o con dolor, deja una nota corta y vuelve despues. La constancia vale
                    mas que la perfeccion.
                  </p>
                  <button type="button" onClick={() => setPage('profile')}>
                    Ver recomendacion
                  </button>
                </article>

                <article className="panel full-width">
                  <div className="panel-header">
                    <h3>Ultimos registros</h3>
                    <button type="button" onClick={() => setPage('history')}>
                      Historial
                    </button>
                  </div>
                  <div className="stack-list">
                    {entries.slice(0, 3).map((entry) => (
                      <article className="log-row" key={entry.id}>
                        <div
                          className={`log-thumb severity-${entry.severity >= 4 ? 'high' : entry.severity >= 2 ? 'medium' : 'low'}`}
                        />
                        <div className="log-copy">
                          <strong>{entry.title}</strong>
                          <p>{toReadableDate(entry.date)}</p>
                          <div className="tag-list compact-tags">
                            {entry.symptoms.slice(0, 2).map((tag) => (
                              <span className="tag" key={tag}>
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </article>
              </section>
            </>
          ) : null}

          {page === 'calendar' ? (
            <section className="content-grid single-column">
              <article className="panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Calendario</p>
                    <h3>
                      {new Intl.DateTimeFormat('es-CL', {
                        month: 'long',
                        year: 'numeric',
                      }).format(calendarMonth)}
                    </h3>
                  </div>
                  <button type="button" onClick={() => setSelectedDate(toInputDate(appToday))}>
                    Hoy
                  </button>
                </div>
                <div className="calendar-grid calendar-labels">
                  {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((label, index) => (
                    <span key={`${label}-${index}`}>{label}</span>
                  ))}
                </div>
                <div className="calendar-grid">
                  {calendarDays.map((item) =>
                    item.day ? (
                      <button
                        className={`calendar-day level-${item.level} ${item.key === selectedDate ? 'selected' : ''}`}
                        key={item.key}
                        type="button"
                        onClick={() => setSelectedDate(item.key)}
                      >
                        {item.day}
                      </button>
                    ) : (
                      <span className="calendar-blank" key={item.key} />
                    ),
                  )}
                </div>
                <div className="legend">
                  <span>
                    <i className="dot low" />
                    Leve
                  </span>
                  <span>
                    <i className="dot medium" />
                    Media
                  </span>
                  <span>
                    <i className="dot high" />
                    Alta
                  </span>
                </div>
              </article>

              <article className="panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Detalle del dia</p>
                    <h3>{toReadableDate(selectedDate)}</h3>
                  </div>
                  <button type="button" onClick={() => setPage('add')}>
                    Agregar
                  </button>
                </div>

                {selectedEntries.length > 0 ? (
                  <div className="stack-list">
                    {selectedEntries.map((entry) => (
                      <article className="detail-card" key={entry.id}>
                        <div className="detail-heading">
                          <strong>{entry.title}</strong>
                          <span className={`pill status-${entry.status.toLowerCase()}`}>{entry.status}</span>
                        </div>
                        <div className="metrics-inline">
                          <span>Picor: {entry.severity}/5</span>
                          <span>Dolor: {entry.pain}/5</span>
                        </div>
                        <div className="tag-list compact-tags">
                          {entry.symptoms.map((symptom) => (
                            <span className="tag" key={symptom}>
                              {symptom}
                            </span>
                          ))}
                        </div>
                        <div className="tag-list compact-tags">
                          {entry.triggers.map((trigger) => (
                            <span className="tag soft-tag" key={trigger}>
                              {trigger}
                            </span>
                          ))}
                        </div>
                        <p>{entry.notes}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <strong>Sin registro para este dia</strong>
                    <p>Puedes usar esta fecha para anotar como estuvo la piel y detectar patrones.</p>
                  </div>
                )}
              </article>
            </section>
          ) : null}

          {page === 'add' ? (
            <section className="content-grid single-column">
              <form className="entry-form" onSubmit={(event) => void handleSave(event)}>
                {isGuestMode ? (
                  <div className="app-alert subtle">
                    Inicia sesion para guardar registros en tiempo real y vincularlos a tu cuenta.
                  </div>
                ) : null}

                <article className="panel">
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow">Registrar brote</p>
                      <h3>Documento rapido del dia</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDraft({ ...emptyDraft, patientId: patient?.id ?? 1 })
                        setPage('dashboard')
                      }}
                    >
                      Cancelar
                    </button>
                  </div>

                  <div className="active-patient-chip">
                    <strong>Paciente:</strong>
                    <span>{patient?.fullName ?? 'Sin paciente seleccionado'}</span>
                  </div>

                  <label className="field">
                    <span>Fecha</span>
                    <input
                      type="date"
                      value={draft.date}
                      onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))}
                    />
                  </label>

                  <div className="field">
                    <div className="field-row">
                      <span>Intensidad del picor</span>
                      <strong>{draft.severity}</strong>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="5"
                      value={draft.severity}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, severity: Number(event.target.value) }))
                      }
                    />
                  </div>

                  <div className="field">
                    <div className="field-row">
                      <span>Nivel de dolor o ardor</span>
                      <strong>{draft.pain}</strong>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="5"
                      value={draft.pain}
                      onChange={(event) => setDraft((current) => ({ ...current, pain: Number(event.target.value) }))}
                    />
                  </div>
                </article>

                <article className="panel">
                  <div className="panel-header">
                    <h3>Sintomas</h3>
                    <span className="helper-text">Toca para marcar</span>
                  </div>
                  <div className="tag-list">
                    {symptomOptions.map((symptom) => (
                      <button
                        className={`tag tag-button ${draft.symptoms.includes(symptom) ? 'selected' : ''}`}
                        key={symptom}
                        type="button"
                        onClick={() => toggleDraftValue('symptoms', symptom)}
                      >
                        {symptom}
                      </button>
                    ))}
                  </div>
                </article>

                <article className="panel">
                  <div className="panel-header">
                    <h3>Posibles detonantes</h3>
                    <span className="helper-text">Seleccion multiple</span>
                  </div>
                  <div className="tag-list">
                    {triggerOptions.map((trigger) => (
                      <button
                        className={`tag tag-button ${draft.triggers.includes(trigger) ? 'selected' : ''}`}
                        key={trigger}
                        type="button"
                        onClick={() => toggleDraftValue('triggers', trigger)}
                      >
                        {trigger}
                      </button>
                    ))}
                  </div>
                </article>

                <article className="panel">
                  <div className="panel-header">
                    <h3>Evidencia visual</h3>
                    <span className="helper-text">Preview para la V1</span>
                  </div>
                  <div className="upload-placeholder">
                    <div className="upload-box">Subir foto</div>
                    <div className="photo-preview" />
                  </div>
                </article>

                <article className="panel">
                  <div className="panel-header">
                    <h3>Notas adicionales</h3>
                    <span className="helper-text">Opcional</span>
                  </div>
                  <label className="field">
                    <textarea
                      rows={5}
                      value={draft.notes}
                      placeholder="Escribe aqui como se sintio la piel, que comio, el clima o algo que quieras recordar..."
                      onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                    />
                  </label>
                </article>

                <button className="primary-submit" disabled={isSaving || isGuestMode} type="submit">
                  {isGuestMode ? 'Inicia sesion para guardar' : isSaving ? 'Guardando...' : 'Guardar registro'}
                </button>
              </form>
            </section>
          ) : null}

          {page === 'history' ? (
            <section className="content-grid single-column">
              <article className="panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Health Journey</p>
                    <h3>Tu progreso reciente</h3>
                  </div>
                  <button type="button" onClick={() => setPage('calendar')}>
                    Ver calendario
                  </button>
                </div>
                <div className="stats-grid">
                  <div className="stat-card emphasis">
                    <span>Frecuencia de brotes</span>
                    <strong>{flareUps}</strong>
                    <small>ultimos registros</small>
                  </div>
                  <div className="stat-card accent">
                    <span>Recovery score</span>
                    <strong>{recoveryScore}%</strong>
                    <small>segun rutina y sintomas</small>
                  </div>
                  <div className="stat-card soft">
                    <span>Consistencia</span>
                    <strong>{consistency}</strong>
                    <small>dias registrados este mes</small>
                  </div>
                </div>
                <div className="history-visual">
                  <img alt="Ilustracion sobre brotes en la piel" src={flareFigureA} />
                </div>
              </article>

              <article className="panel">
                <div className="panel-header">
                  <h3>Top detonantes</h3>
                  <span className="helper-text">Detectados por frecuencia</span>
                </div>
                <div className="stack-list">
                  {triggerStats.map(([trigger, count]) => (
                    <div className="trigger-bar" key={trigger}>
                      <div className="trigger-bar-copy">
                        <strong>{trigger}</strong>
                        <span>{count} registros</span>
                      </div>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${Math.min(100, count * 18)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="panel">
                <div className="panel-header">
                  <h3>Todos los registros</h3>
                  <button type="button" onClick={() => setPage('add')}>
                    Nuevo
                  </button>
                </div>
                <div className="stack-list">
                  {entries.map((entry) => (
                    <article className="history-card" key={entry.id}>
                      <div className="detail-heading">
                        <div>
                          <strong>{entry.title}</strong>
                          <p>{toReadableDate(entry.date)}</p>
                        </div>
                        <span className={`pill status-${entry.status.toLowerCase()}`}>{entry.status}</span>
                      </div>
                      <div className="metrics-inline">
                        <span>Intensidad {entry.severity}/5</span>
                        <span>Dolor {entry.pain}/5</span>
                      </div>
                      <div className="tag-list compact-tags">
                        {entry.symptoms.map((symptom) => (
                          <span className="tag" key={symptom}>
                            {symptom}
                          </span>
                        ))}
                      </div>
                      <div className="tag-list compact-tags">
                        {entry.triggers.map((trigger) => (
                          <span className="tag soft-tag" key={trigger}>
                            {trigger}
                          </span>
                        ))}
                      </div>
                      <p>{entry.notes}</p>
                    </article>
                  ))}
                </div>
              </article>
            </section>
          ) : null}

          {page === 'profile' ? (
            <section className="content-grid single-column">
              <article className="panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Sesion</p>
                    <h3>{currentUser ? `Conectado como ${currentUser.username}` : 'Iniciar sesion'}</h3>
                  </div>
                </div>

                {currentUser ? (
                  <div className="auth-card">
                    <p>
                      Rol actual:
                      {' '}
                      {currentUser.isSuperuser ? 'Superusuario' : currentUser.isStaff ? 'Staff' : 'Usuario'}
                    </p>
                    <button className="secondary-button" disabled={isAuthenticating} type="button" onClick={() => void handleLogout()}>
                      {isAuthenticating ? 'Cerrando...' : 'Cerrar sesion'}
                    </button>
                  </div>
                ) : (
                  <form className="patient-form" onSubmit={(event) => void handleLogin(event)}>
                    <label className="field">
                      <span>Correo electronico</span>
                      <input
                        type="email"
                        value={authDraft.username}
                        onChange={(event) => setAuthDraft((current) => ({ ...current, username: event.target.value }))}
                        placeholder="tu-correo@ejemplo.com"
                      />
                    </label>
                    <label className="field">
                      <span>Contrasena</span>
                      <input
                        type="password"
                        value={authDraft.password}
                        onChange={(event) => setAuthDraft((current) => ({ ...current, password: event.target.value }))}
                      />
                    </label>
                    <button className="secondary-button" disabled={isAuthenticating} type="submit">
                      {isAuthenticating ? 'Entrando...' : 'Iniciar sesion'}
                    </button>
                  </form>
                )}
              </article>

              <article className="panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Paciente activo</p>
                    <h3>{patient?.fullName ?? 'Sin paciente'}</h3>
                  </div>
                </div>
                <div className="profile-hero">
                  <div className="profile-hero-copy">
                    <p className="eyebrow">Cuidado diario</p>
                    <h3>Una rutina amable tambien es parte del tratamiento</h3>
                    <p>
                      Usa este espacio para registrar avances, entender detonantes y darle contexto a
                      tu evolucion.
                    </p>
                  </div>
                  <div className="profile-hero-art">
                    <img alt="Ilustracion de seguimiento de brotes" src={flareFigureB} />
                  </div>
                </div>
                <div className="profile-stack">
                  <div className="profile-card">
                    <strong>Objetivo actual</strong>
                    <p>Reducir episodios intensos y registrar sintomas antes de que escalen.</p>
                  </div>
                  <div className="profile-card">
                    <strong>Medicacion / cuidado</strong>
                    <p>Crema barrera 2 veces al dia, limpieza suave y seguimiento de detonantes.</p>
                  </div>
                  <div className="profile-card">
                    <strong>Recordatorios activos</strong>
                    <p>{reminders.filter((item) => !item.done).length} pendientes para hoy.</p>
                  </div>
                  <div className="profile-card">
                    <strong>Paciente actual</strong>
                    <p>{patient ? `${patient.fullName} - ${patient.condition}` : 'Cargando perfil...'}</p>
                  </div>
                </div>
              </article>

              <article className="panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Gestion de pacientes</p>
                    <h3>Editar paciente activo</h3>
                  </div>
                </div>
                {isGuestMode ? (
                  <div className="locked-note">
                    Inicia sesion para editar, eliminar y administrar pacientes propios.
                  </div>
                ) : (
                  <form className="patient-form" onSubmit={(event) => void handleUpdatePatient(event)}>
                    <label className="field">
                      <span>Nombre completo</span>
                      <input
                        type="text"
                        value={patientEditDraft.fullName}
                        onChange={(event) =>
                          setPatientEditDraft((current) => ({ ...current, fullName: event.target.value }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Condicion principal</span>
                      <input
                        type="text"
                        value={patientEditDraft.condition}
                        onChange={(event) =>
                          setPatientEditDraft((current) => ({ ...current, condition: event.target.value }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Notas</span>
                      <textarea
                        rows={4}
                        value={patientEditDraft.notes}
                        onChange={(event) =>
                          setPatientEditDraft((current) => ({ ...current, notes: event.target.value }))
                        }
                      />
                    </label>
                    <div className="action-row">
                      <button className="secondary-button" disabled={isUpdatingPatient || !patient} type="submit">
                        {isUpdatingPatient ? 'Guardando...' : 'Guardar cambios'}
                      </button>
                      <button
                        className="danger-button"
                        disabled={isDeletingPatient || !patient}
                        type="button"
                        onClick={() => void handleDeletePatient()}
                      >
                        {isDeletingPatient ? 'Eliminando...' : 'Eliminar paciente'}
                      </button>
                    </div>
                  </form>
                )}
              </article>

              <article className="panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Nuevo paciente</p>
                    <h3>Crear desde la app</h3>
                  </div>
                </div>
                {isGuestMode ? (
                  <div className="locked-note">
                    Crea pacientes nuevos despues de iniciar sesion para que queden guardados en tu cuenta.
                  </div>
                ) : (
                  <form className="patient-form" onSubmit={(event) => void handleCreatePatient(event)}>
                    <label className="field">
                      <span>Nombre completo</span>
                      <input
                        type="text"
                        value={patientCreateDraft.fullName}
                        onChange={(event) =>
                          setPatientCreateDraft((current) => ({ ...current, fullName: event.target.value }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Condicion principal</span>
                      <input
                        type="text"
                        value={patientCreateDraft.condition}
                        onChange={(event) =>
                          setPatientCreateDraft((current) => ({ ...current, condition: event.target.value }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Notas</span>
                      <textarea
                        rows={4}
                        value={patientCreateDraft.notes}
                        onChange={(event) =>
                          setPatientCreateDraft((current) => ({ ...current, notes: event.target.value }))
                        }
                      />
                    </label>
                    <button className="secondary-button" disabled={isCreatingPatient} type="submit">
                      {isCreatingPatient ? 'Creando...' : 'Crear paciente'}
                    </button>
                  </form>
                )}
              </article>

              <article className="panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Pacientes</p>
                    <h3>Lista disponible</h3>
                  </div>
                </div>
                <div className="patient-list">
                  {patients.map((item) => (
                    <button
                      className={`patient-card ${patient?.id === item.id ? 'active' : ''}`}
                      key={item.id}
                      type="button"
                      onClick={() => void handlePatientChange(item.id)}
                    >
                      <strong>{item.fullName}</strong>
                      <p>{item.condition}</p>
                    </button>
                  ))}
                </div>
              </article>

              <article className="panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Exportacion</p>
                    <h3>Descargar informacion del paciente</h3>
                  </div>
                </div>
                <div className="export-card">
                  {isGuestMode ? (
                    <p>Inicia sesion para descargar un CSV privado con tus pacientes y sus registros.</p>
                  ) : (
                    <>
                      <p>
                        Descarga un archivo CSV compatible con Excel con el perfil del paciente y todos sus
                        registros guardados.
                      </p>
                      <button className="secondary-button" type="button" onClick={handleExport}>
                        Descargar CSV
                      </button>
                    </>
                  )}
                </div>
              </article>
            </section>
          ) : null}
        </section>

        <nav className="bottom-nav" aria-label="Navegacion principal">
          <button
            className={`nav-item ${page === 'dashboard' ? 'active' : ''}`}
            type="button"
            onClick={() => setPage('dashboard')}
          >
            Inicio
          </button>
          <button
            className={`nav-item ${page === 'calendar' ? 'active' : ''}`}
            type="button"
            onClick={() => setPage('calendar')}
          >
            Calendario
          </button>
          <button
            className="nav-item nav-cta"
            type="button"
            aria-label="Agregar registro"
            onClick={() => setPage('add')}
          >
            +
          </button>
          <button
            className={`nav-item ${page === 'history' ? 'active' : ''}`}
            type="button"
            onClick={() => setPage('history')}
          >
            Historial
          </button>
          <button
            className={`nav-item ${page === 'profile' ? 'active' : ''}`}
            type="button"
            onClick={() => setPage('profile')}
          >
            <span className="nav-profile-icon" aria-hidden="true">
              <img alt="" src={profileAvatar} />
            </span>
            Perfil
          </button>
        </nav>
      </section>
    </main>
  )
}

export default App
