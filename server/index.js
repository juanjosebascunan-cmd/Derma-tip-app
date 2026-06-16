import express from 'express'
import {
  buildPatientsCsv,
  createEntry,
  getDatabaseFile,
  readPatients,
  readStore,
  updateReminder,
} from './store.js'

const app = express()
const port = 8787

app.use(express.json())

function getStatusLabel(severity) {
  if (severity >= 4) return 'Brote'
  if (severity <= 1) return 'Estable'
  return 'Recuperacion'
}

function getTitleFromDraft(draft) {
  const lead = draft.symptoms?.[0] ?? 'Seguimiento general'
  const zoneHint = draft.triggers?.[0] ? ` con posible detonante: ${draft.triggers[0]}` : ''
  return `${lead}${zoneHint}`
}

app.get('/api/health', (_request, response) => {
  response.json({ ok: true })
})

app.get('/api/bootstrap', (_request, response) => {
  const store = readStore()
  response.json(store)
})

app.get('/api/meta', (_request, response) => {
  response.json({
    storage: 'sqlite',
    databaseFile: getDatabaseFile(),
  })
})

app.get('/api/patients', (_request, response) => {
  response.json(readPatients())
})

app.get('/api/exports/patients.csv', (_request, response) => {
  const csv = buildPatientsCsv()
  response.setHeader('Content-Type', 'text/csv; charset=utf-8')
  response.setHeader('Content-Disposition', 'attachment; filename="dermatip-patients-export.csv"')
  response.send(csv)
})

app.post('/api/entries', (request, response) => {
  const draft = request.body

  if (!draft?.date || !Array.isArray(draft?.symptoms) || draft.symptoms.length === 0) {
    response.status(400).json({ message: 'Invalid entry payload.' })
    return
  }

  const nextEntry = {
    id: `log-${Date.now()}`,
    patientId: draft.patientId,
    title: getTitleFromDraft(draft),
    date: draft.date,
    status: getStatusLabel(Number(draft.severity ?? 0)),
    severity: Number(draft.severity ?? 0),
    pain: Number(draft.pain ?? 0),
    symptoms: draft.symptoms,
    triggers: Array.isArray(draft.triggers) ? draft.triggers : [],
    notes: draft.notes?.trim() || 'Sin notas adicionales.',
  }

  const savedEntry = createEntry(nextEntry)
  response.status(201).json(savedEntry)
})

app.patch('/api/reminders/:id', (request, response) => {
  const { id } = request.params
  const { done } = request.body

  const updatedReminder = updateReminder(id, Boolean(done))

  if (!updatedReminder) {
    response.status(404).json({ message: 'Reminder not found.' })
    return
  }

  response.json(updatedReminder)
})

app.listen(port, () => {
  console.log(`Dermatip backend running on http://127.0.0.1:${port}`)
})
