import { mkdirSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dataDir = path.join(__dirname, 'data')
const dbFile = path.join(dataDir, 'dermatip.db')
const legacyJsonFile = path.join(dataDir, 'store.json')
const defaultPatientId = 'patient-1'

const seedPatient = {
  id: defaultPatientId,
  fullName: 'Paciente Dermatip',
  condition: 'Dermatitis atopica / Rosacea',
  notes: 'Seguimiento personal inicial para detectar detonantes, sintomas y progreso diario.',
}

const seedStore = {
  reminders: [
    {
      id: 'water',
      patientId: defaultPatientId,
      title: 'Hidratacion',
      detail: 'Tomar 250 ml de agua ahora',
      done: true,
    },
    {
      id: 'cream',
      patientId: defaultPatientId,
      title: 'Aplicar crema',
      detail: 'Rutina de mediodia',
      done: true,
    },
    {
      id: 'soap',
      patientId: defaultPatientId,
      title: 'Limpieza suave',
      detail: 'Usar producto sin fragancia por la noche',
      done: false,
    },
  ],
  entries: [
    {
      id: 'log-1',
      patientId: defaultPatientId,
      title: 'Enrojecimiento leve en mejillas',
      date: '2026-06-15',
      status: 'Recuperacion',
      severity: 2,
      pain: 1,
      symptoms: ['Enrojecimiento', 'Picor'],
      triggers: ['Estres'],
      notes: 'Mejoro despues de descansar y aplicar crema barrera.',
    },
    {
      id: 'log-2',
      patientId: defaultPatientId,
      title: 'Brote nocturno moderado',
      date: '2026-06-13',
      status: 'Brote',
      severity: 4,
      pain: 3,
      symptoms: ['Picor', 'Inflamacion', 'Resequedad'],
      triggers: ['Clima', 'Falta de sueno'],
      notes: 'Hubo calor durante la tarde y dormi mal.',
    },
    {
      id: 'log-3',
      patientId: defaultPatientId,
      title: 'Dia estable',
      date: '2026-06-10',
      status: 'Estable',
      severity: 1,
      pain: 0,
      symptoms: ['Resequedad'],
      triggers: ['Nuevo producto'],
      notes: 'Sin crisis, solo resequedad ligera en la frente.',
    },
    {
      id: 'log-4',
      patientId: defaultPatientId,
      title: 'Rosacea activa despues de almuerzo',
      date: '2026-06-07',
      status: 'Brote',
      severity: 5,
      pain: 2,
      symptoms: ['Ardor', 'Enrojecimiento'],
      triggers: ['Dieta', 'Estres'],
      notes: 'Senti calor en mejillas y ardor durante una hora.',
    },
  ],
}

mkdirSync(dataDir, { recursive: true })

const database = new DatabaseSync(dbFile)

function parseJsonArray(value) {
  if (!value) {
    return []
  }

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function escapeCsv(value) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

function createSchema() {
  database.exec(`
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      condition_name TEXT NOT NULL,
      notes TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL,
      severity INTEGER NOT NULL,
      pain INTEGER NOT NULL,
      symptoms TEXT NOT NULL,
      triggers TEXT NOT NULL,
      notes TEXT NOT NULL
    );
  `)
}

function ensureColumn(tableName, columnName, definition) {
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all()
  const exists = columns.some((column) => column.name === columnName)

  if (!exists) {
    database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`)
  }
}

function migrateSchema() {
  ensureColumn('reminders', 'patient_id', `TEXT NOT NULL DEFAULT '${defaultPatientId}'`)
  ensureColumn('entries', 'patient_id', `TEXT NOT NULL DEFAULT '${defaultPatientId}'`)
}

function readLegacyStore() {
  if (!existsSync(legacyJsonFile)) {
    return null
  }

  try {
    const file = readFileSync(legacyJsonFile, 'utf8')
    return JSON.parse(file)
  } catch {
    return null
  }
}

function normalizeLegacyReminder(reminder) {
  return {
    ...reminder,
    patientId: reminder.patientId ?? defaultPatientId,
  }
}

function normalizeLegacyEntry(entry) {
  return {
    ...entry,
    patientId: entry.patientId ?? defaultPatientId,
  }
}

function seedFromStore(store) {
  const insertPatient = database.prepare(`
    INSERT OR IGNORE INTO patients (id, full_name, condition_name, notes)
    VALUES (?, ?, ?, ?)
  `)
  const insertReminder = database.prepare(`
    INSERT OR IGNORE INTO reminders (id, patient_id, title, detail, done)
    VALUES (?, ?, ?, ?, ?)
  `)
  const insertEntry = database.prepare(`
    INSERT OR IGNORE INTO entries (id, patient_id, title, date, status, severity, pain, symptoms, triggers, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  database.exec('BEGIN')

  try {
    insertPatient.run(seedPatient.id, seedPatient.fullName, seedPatient.condition, seedPatient.notes)

    for (const reminder of store.reminders ?? []) {
      const normalized = normalizeLegacyReminder(reminder)
      insertReminder.run(
        normalized.id,
        normalized.patientId,
        normalized.title,
        normalized.detail,
        normalized.done ? 1 : 0,
      )
    }

    for (const entry of store.entries ?? []) {
      const normalized = normalizeLegacyEntry(entry)
      insertEntry.run(
        normalized.id,
        normalized.patientId,
        normalized.title,
        normalized.date,
        normalized.status,
        normalized.severity,
        normalized.pain,
        JSON.stringify(normalized.symptoms ?? []),
        JSON.stringify(normalized.triggers ?? []),
        normalized.notes,
      )
    }

    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

function bootstrapData() {
  createSchema()
  migrateSchema()

  const patientCount = Number(database.prepare('SELECT COUNT(*) AS count FROM patients').get()?.count ?? 0)

  if (patientCount === 0) {
    const legacyStore = readLegacyStore()
    seedFromStore(legacyStore ?? seedStore)
  } else {
    database
      .prepare(
        `
          INSERT OR IGNORE INTO patients (id, full_name, condition_name, notes)
          VALUES (?, ?, ?, ?)
        `,
      )
      .run(seedPatient.id, seedPatient.fullName, seedPatient.condition, seedPatient.notes)
  }

  database
    .prepare(`UPDATE reminders SET patient_id = ? WHERE patient_id IS NULL OR patient_id = ''`)
    .run(defaultPatientId)
  database
    .prepare(`UPDATE entries SET patient_id = ? WHERE patient_id IS NULL OR patient_id = ''`)
    .run(defaultPatientId)
}

function mapPatient(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    condition: row.condition_name,
    notes: row.notes,
  }
}

function mapReminder(row) {
  return {
    id: row.id,
    patientId: row.patient_id,
    title: row.title,
    detail: row.detail,
    done: Boolean(row.done),
  }
}

function mapEntry(row) {
  return {
    id: row.id,
    patientId: row.patient_id,
    title: row.title,
    date: row.date,
    status: row.status,
    severity: Number(row.severity),
    pain: Number(row.pain),
    symptoms: parseJsonArray(row.symptoms),
    triggers: parseJsonArray(row.triggers),
    notes: row.notes,
  }
}

bootstrapData()

export function readStore() {
  const patientRow = database
    .prepare(
      `
        SELECT id, full_name, condition_name, notes
        FROM patients
        WHERE id = ?
      `,
    )
    .get(defaultPatientId)
  const reminderRows = database
    .prepare(
      `
        SELECT id, patient_id, title, detail, done
        FROM reminders
        WHERE patient_id = ?
        ORDER BY title ASC
      `,
    )
    .all(defaultPatientId)
  const entryRows = database
    .prepare(
      `
        SELECT id, patient_id, title, date, status, severity, pain, symptoms, triggers, notes
        FROM entries
        WHERE patient_id = ?
        ORDER BY date DESC, id DESC
      `,
    )
    .all(defaultPatientId)

  return {
    patient: mapPatient(patientRow),
    reminders: reminderRows.map(mapReminder),
    entries: entryRows.map(mapEntry),
  }
}

export function createEntry(entry) {
  const normalized = {
    ...entry,
    patientId: entry.patientId ?? defaultPatientId,
  }

  database
    .prepare(
      `
        INSERT INTO entries (id, patient_id, title, date, status, severity, pain, symptoms, triggers, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      normalized.id,
      normalized.patientId,
      normalized.title,
      normalized.date,
      normalized.status,
      normalized.severity,
      normalized.pain,
      JSON.stringify(normalized.symptoms ?? []),
      JSON.stringify(normalized.triggers ?? []),
      normalized.notes,
    )

  return normalized
}

export function updateReminder(reminderId, done) {
  database.prepare('UPDATE reminders SET done = ? WHERE id = ?').run(done ? 1 : 0, reminderId)

  const row = database
    .prepare('SELECT id, patient_id, title, detail, done FROM reminders WHERE id = ?')
    .get(reminderId)

  return row ? mapReminder(row) : null
}

export function readPatients() {
  return database
    .prepare(
      `
        SELECT id, full_name, condition_name, notes
        FROM patients
        ORDER BY full_name ASC
      `,
    )
    .all()
    .map(mapPatient)
}

export function buildPatientsCsv() {
  const rows = database
    .prepare(
      `
        SELECT
          patients.id AS patient_id,
          patients.full_name,
          patients.condition_name,
          patients.notes AS patient_notes,
          entries.id AS entry_id,
          entries.date,
          entries.title,
          entries.status,
          entries.severity,
          entries.pain,
          entries.symptoms,
          entries.triggers,
          entries.notes AS entry_notes
        FROM patients
        LEFT JOIN entries ON entries.patient_id = patients.id
        ORDER BY patients.full_name ASC, entries.date DESC, entries.id DESC
      `,
    )
    .all()

  const header = [
    'patient_id',
    'patient_name',
    'condition',
    'patient_notes',
    'entry_id',
    'date',
    'title',
    'status',
    'severity',
    'pain',
    'symptoms',
    'triggers',
    'entry_notes',
  ]

  const lines = [
    header.join(','),
    ...rows.map((row) =>
      [
        row.patient_id,
        row.full_name,
        row.condition_name,
        row.patient_notes,
        row.entry_id ?? '',
        row.date ?? '',
        row.title ?? '',
        row.status ?? '',
        row.severity ?? '',
        row.pain ?? '',
        parseJsonArray(row.symptoms).join(' | '),
        parseJsonArray(row.triggers).join(' | '),
        row.entry_notes ?? '',
      ]
        .map(escapeCsv)
        .join(','),
    ),
  ]

  return lines.join('\n')
}

export function getDatabaseFile() {
  return dbFile
}
