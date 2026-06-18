import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth'
import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { auth, db, isFirebaseConfigured } from './firebase'
import type { AppStore, CurrentUser, EntryDraft, LogEntry, Patient, Reminder } from './types'

const guestPatient: Patient = {
  id: 1,
  fullName: 'Paciente Demo',
  condition: 'Dermatitis atopica',
  notes: 'Modo invitado activo. Tus datos reales apareceran al iniciar sesion con Firebase.',
}

const guestReminders: Reminder[] = [
  { id: 101, patientId: 1, title: 'Aplicar crema', detail: 'Rutina de mediodia', done: false },
  { id: 102, patientId: 1, title: 'Hidratacion', detail: 'Tomar 250 ml de agua', done: true },
  { id: 103, patientId: 1, title: 'Limpieza suave', detail: 'Evita fragancias por la noche', done: false },
]

const guestEntries: LogEntry[] = [
  {
    id: 201,
    patientId: 1,
    title: 'Enrojecimiento leve en mejillas',
    date: '2026-06-15',
    status: 'Estable',
    severity: 2,
    pain: 1,
    symptoms: ['Enrojecimiento', 'Resequedad'],
    triggers: ['Clima', 'Estres'],
    notes: 'Mejoro despues de hidratar y descansar.',
  },
  {
    id: 202,
    patientId: 1,
    title: 'Picor nocturno',
    date: '2026-06-13',
    status: 'Brote',
    severity: 4,
    pain: 2,
    symptoms: ['Picor', 'Inflamacion'],
    triggers: ['Falta de sueno'],
    notes: 'Conviene revisar rutina de noche y temperatura ambiental.',
  },
  {
    id: 203,
    patientId: 1,
    title: 'Piel mas calmada',
    date: '2026-06-10',
    status: 'Recuperacion',
    severity: 1,
    pain: 0,
    symptoms: ['Resequedad'],
    triggers: ['Nuevo producto'],
    notes: 'Respuesta positiva despues de simplificar la rutina.',
  },
]

function createNumericId() {
  return Date.now() + Math.floor(Math.random() * 10000)
}

function deriveStatus(severity: number): LogEntry['status'] {
  if (severity >= 4) {
    return 'Brote'
  }

  if (severity <= 1) {
    return 'Recuperacion'
  }

  return 'Estable'
}

function buildEntryTitle(symptoms: string[], severity: number) {
  const firstSymptom = symptoms[0] ?? 'Seguimiento de piel'

  if (severity >= 4) {
    return `${firstSymptom} intenso`
  }

  if (severity <= 1) {
    return `${firstSymptom} en recuperacion`
  }

  return `${firstSymptom} leve`
}

function toCurrentUser(user: User): CurrentUser {
  return {
    id: user.uid,
    username: user.email ?? user.displayName ?? 'Usuario Firebase',
    isStaff: false,
    isSuperuser: false,
  }
}

function buildGuestStore(patientId?: number): AppStore {
  const patient = patientId === guestPatient.id ? guestPatient : guestPatient
  return {
    currentUser: null,
    patients: [guestPatient],
    patient,
    reminders: guestReminders.filter((item) => item.patientId === patient.id),
    entries: guestEntries.filter((item) => item.patientId === patient.id).sort(sortEntries),
  }
}

function ensureFirebaseConfigured() {
  if (!isFirebaseConfigured || !auth || !db) {
    throw new Error('Firebase no esta configurado todavia.')
  }
}

async function waitForAuthReady() {
  if (!auth) {
    return
  }

  const currentAuth = auth

  await new Promise<void>((resolve) => {
    const unsubscribe = onAuthStateChanged(currentAuth, () => {
      unsubscribe()
      resolve()
    })
  })
}

async function requireUser() {
  ensureFirebaseConfigured()
  await waitForAuthReady()

  if (!auth?.currentUser) {
    throw new Error('Debes iniciar sesion para usar esta accion.')
  }

  return auth.currentUser
}

function sortEntries(left: LogEntry, right: LogEntry) {
  return right.date.localeCompare(left.date) || right.id - left.id
}

function sanitizePatient(data: Record<string, unknown>): Patient {
  return {
    id: Number(data.id),
    fullName: String(data.fullName ?? ''),
    condition: String(data.condition ?? ''),
    notes: String(data.notes ?? ''),
  }
}

function sanitizeReminder(data: Record<string, unknown>): Reminder {
  return {
    id: Number(data.id),
    patientId: Number(data.patientId),
    title: String(data.title ?? ''),
    detail: String(data.detail ?? ''),
    done: Boolean(data.done),
  }
}

function sanitizeEntry(data: Record<string, unknown>): LogEntry {
  const severity = Number(data.severity ?? 0)
  const symptoms = Array.isArray(data.symptoms) ? data.symptoms.map(String) : []
  const triggers = Array.isArray(data.triggers) ? data.triggers.map(String) : []

  return {
    id: Number(data.id),
    patientId: Number(data.patientId),
    title: String(data.title ?? buildEntryTitle(symptoms, severity)),
    date: String(data.date ?? ''),
    status: (data.status as LogEntry['status']) ?? deriveStatus(severity),
    severity,
    pain: Number(data.pain ?? 0),
    symptoms,
    triggers,
    notes: String(data.notes ?? ''),
  }
}

async function findSingleDocument(collectionName: string, field: string, value: string | number, ownerId: string) {
  ensureFirebaseConfigured()

  const snapshot = await getDocs(
    query(
      collection(db!, collectionName),
      where('ownerId', '==', ownerId),
      where(field, '==', value),
    ),
  )

  return snapshot.docs[0] ?? null
}

async function listPatients(ownerId: string) {
  ensureFirebaseConfigured()
  const snapshot = await getDocs(query(collection(db!, 'patients'), where('ownerId', '==', ownerId)))
  return snapshot.docs.map((item) => sanitizePatient(item.data())).sort((left, right) => left.id - right.id)
}

async function listReminders(ownerId: string, patientId: number) {
  ensureFirebaseConfigured()
  const snapshot = await getDocs(
    query(
      collection(db!, 'reminders'),
      where('ownerId', '==', ownerId),
      where('patientId', '==', patientId),
    ),
  )

  return snapshot.docs
    .map((item) => sanitizeReminder(item.data()))
    .sort((left, right) => left.id - right.id)
}

async function listEntries(ownerId: string, patientId: number) {
  ensureFirebaseConfigured()
  const snapshot = await getDocs(
    query(
      collection(db!, 'entries'),
      where('ownerId', '==', ownerId),
      where('patientId', '==', patientId),
    ),
  )

  return snapshot.docs
    .map((item) => sanitizeEntry(item.data()))
    .sort(sortEntries)
}

async function createStarterReminders(ownerId: string, patientId: number) {
  ensureFirebaseConfigured()

  const templates = [
    { title: 'Aplicar crema', detail: 'Rutina de mediodia' },
    { title: 'Hidratacion', detail: 'Tomar 250 ml de agua' },
    { title: 'Limpieza suave', detail: 'Evita fragancias por la noche' },
  ]

  await Promise.all(
    templates.map((template) =>
      addDoc(collection(db!, 'reminders'), {
        id: createNumericId(),
        ownerId,
        patientId,
        title: template.title,
        detail: template.detail,
        done: false,
        createdAt: Date.now(),
      }),
    ),
  )
}

export async function getBootstrapData(patientId?: number) {
  if (!isFirebaseConfigured) {
    return buildGuestStore(patientId)
  }

  await waitForAuthReady()

  if (!auth?.currentUser) {
    return buildGuestStore(patientId)
  }

  const ownerId = auth.currentUser.uid
  const patients = await listPatients(ownerId)

  if (patients.length === 0) {
    const seeded = await createPatient({
      fullName: auth.currentUser.displayName || 'Mi seguimiento',
      condition: 'Rosacea / dermatitis',
      notes: 'Perfil inicial creado automaticamente en Firebase.',
    })

    return getBootstrapData(seeded.id)
  }

  const activePatient = patients.find((item) => item.id === patientId) ?? patients[0]
  const [reminders, entries] = await Promise.all([
    listReminders(ownerId, activePatient.id),
    listEntries(ownerId, activePatient.id),
  ])

  return {
    currentUser: toCurrentUser(auth.currentUser),
    patients,
    patient: activePatient,
    reminders,
    entries,
  }
}

export async function createEntry(entry: EntryDraft) {
  const user = await requireUser()
  const payload: LogEntry = {
    id: createNumericId(),
    patientId: entry.patientId,
    title: buildEntryTitle(entry.symptoms, entry.severity),
    date: entry.date,
    status: deriveStatus(entry.severity),
    severity: entry.severity,
    pain: entry.pain,
    symptoms: entry.symptoms,
    triggers: entry.triggers,
    notes: entry.notes,
  }

  await addDoc(collection(db!, 'entries'), {
    ...payload,
    ownerId: user.uid,
    createdAt: Date.now(),
  })

  return payload
}

export async function createPatient(payload: { fullName: string; condition: string; notes: string }) {
  const user = await requireUser()
  const patient: Patient = {
    id: createNumericId(),
    fullName: payload.fullName.trim(),
    condition: payload.condition.trim(),
    notes: payload.notes.trim(),
  }

  await addDoc(collection(db!, 'patients'), {
    ...patient,
    ownerId: user.uid,
    createdAt: Date.now(),
  })

  await createStarterReminders(user.uid, patient.id)
  return patient
}

export async function updatePatient(
  patientId: number,
  payload: { fullName: string; condition: string; notes: string },
) {
  const user = await requireUser()
  const patientDoc = await findSingleDocument('patients', 'id', patientId, user.uid)

  if (!patientDoc) {
    throw new Error('Paciente no encontrado.')
  }

  const patient: Patient = {
    id: patientId,
    fullName: payload.fullName.trim(),
    condition: payload.condition.trim(),
    notes: payload.notes.trim(),
  }

  await updateDoc(doc(db!, 'patients', patientDoc.id), patient)
  return patient
}

export async function deletePatient(patientId: number) {
  const user = await requireUser()
  const patientDoc = await findSingleDocument('patients', 'id', patientId, user.uid)

  if (!patientDoc) {
    throw new Error('Paciente no encontrado.')
  }

  const [patientDocs, reminderDocs, entryDocs] = await Promise.all([
    getDocs(query(collection(db!, 'patients'), where('ownerId', '==', user.uid), where('id', '==', patientId))),
    getDocs(
      query(collection(db!, 'reminders'), where('ownerId', '==', user.uid), where('patientId', '==', patientId)),
    ),
    getDocs(query(collection(db!, 'entries'), where('ownerId', '==', user.uid), where('patientId', '==', patientId))),
  ])

  const batch = writeBatch(db!)
  patientDocs.docs.forEach((item) => batch.delete(item.ref))
  reminderDocs.docs.forEach((item) => batch.delete(item.ref))
  entryDocs.docs.forEach((item) => batch.delete(item.ref))
  await batch.commit()

  return { deletedId: patientId }
}

export async function updateReminder(reminderId: number, done: boolean) {
  const user = await requireUser()
  const reminderDoc = await findSingleDocument('reminders', 'id', reminderId, user.uid)

  if (!reminderDoc) {
    throw new Error('Recordatorio no encontrado.')
  }

  await updateDoc(doc(db!, 'reminders', reminderDoc.id), { done })
  return sanitizeReminder({ ...reminderDoc.data(), done })
}

export async function login(payload: { username: string; password: string }) {
  ensureFirebaseConfigured()
  await signInWithEmailAndPassword(auth!, payload.username.trim(), payload.password)
  return { currentUser: toCurrentUser(auth!.currentUser!) }
}

export async function logout() {
  ensureFirebaseConfigured()
  await signOut(auth!)
  return { ok: true }
}

export async function getCurrentUser() {
  if (!isFirebaseConfigured) {
    return { currentUser: null }
  }

  await waitForAuthReady()
  return { currentUser: auth?.currentUser ? toCurrentUser(auth.currentUser) : null }
}

function escapeCsvValue(value: string | number) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

export function downloadPatientExport(patient: Patient, entries: LogEntry[]) {
  const rows = [
    ['Paciente', patient.fullName],
    ['Condicion', patient.condition],
    ['Notas', patient.notes],
    [],
    ['Fecha', 'Titulo', 'Estado', 'Intensidad', 'Dolor', 'Sintomas', 'Detonantes', 'Notas'],
    ...entries.map((entry) => [
      entry.date,
      entry.title,
      entry.status,
      entry.severity,
      entry.pain,
      entry.symptoms.join(' | '),
      entry.triggers.join(' | '),
      entry.notes,
    ]),
  ]

  const csv = rows
    .map((row) => row.map((cell) => escapeCsvValue(cell ?? '')).join(','))
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `dermatips-${patient.fullName.toLowerCase().replace(/\s+/g, '-')}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
