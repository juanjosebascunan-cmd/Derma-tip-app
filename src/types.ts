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

export type WeatherSnapshot = {
  locationLabel: string
  latitude: number
  longitude: number
  temperature: number
  apparentTemperature: number
  humidity: number
  precipitation: number
  windSpeed: number
  weatherCode: number
  uvIndexMax: number
  temperatureMax: number
  temperatureMin: number
  fetchedAt: string
}

export type DoctorRecipe = {
  id: string
  patientId: number
  title: string
  category: 'Rutina AM' | 'Rutina PM' | 'Brote activo' | 'Mantenimiento' | 'Libre'
  instructions: string
  schedule: string
  createdAt: string
  updatedAt: string
}
