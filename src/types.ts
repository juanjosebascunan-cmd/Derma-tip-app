export type Page = 'dashboard' | 'calendar' | 'add' | 'history' | 'profile'

export type CurrentUser = {
  id: string
  username: string
  isStaff: boolean
  isSuperuser: boolean
}

export type Patient = {
  id: number
  fullName: string
  condition: string
  notes: string
}

export type Reminder = {
  id: number
  patientId: number
  title: string
  detail: string
  done: boolean
}

export type LogEntry = {
  id: number
  patientId: number
  title: string
  date: string
  status: 'Brote' | 'Estable' | 'Recuperacion'
  severity: number
  pain: number
  symptoms: string[]
  triggers: string[]
  notes: string
  photoDataUrl?: string
  photoDriveFileId?: string
  photoDriveWebViewLink?: string
}

export type EntryDraft = {
  patientId: number
  date: string
  severity: number
  pain: number
  symptoms: string[]
  triggers: string[]
  notes: string
  photoDataUrl?: string
}

export type AppStore = {
  currentUser: CurrentUser | null
  patients: Patient[]
  patient: Patient
  reminders: Reminder[]
  entries: LogEntry[]
}
