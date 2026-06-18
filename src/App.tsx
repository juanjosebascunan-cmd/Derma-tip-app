import { startTransition, type ChangeEvent, type FormEvent } from 'react'
import { useEffect, useState } from 'react'
import {
  createEntry,
  createPatient,
  deletePatient,
  downloadPatientExport,
  getBootstrapData,
  login,
  loginWithGoogle,
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

type NotificationItem = {
  id: string
  title: string
  body: string
  page: Page
  date?: string
}

type SummaryBar = {
  date: string
  dayLabel: string
  events: number
  severity: number
  value: number
}

type PredictiveInsight = {
  level: 'low' | 'medium' | 'high'
  title: string
  body: string
  reason: string
  actionLabel: string
  actionPage: Page
}

type TriggerSignal = {
  key: string
  label: string
}

const CHILE_TIME_ZONE = 'America/Santiago'

const triggerOptions = [
  'Estres',
  'Clima',
  'Nuevo producto',
  'Alergenos',
  'Dieta',
  'Falta de sueno',
  'Alcohol',
  'Comida',
  'Bebida',
  'Cafeina',
  'Picante',
]
const symptomOptions = ['Picor', 'Enrojecimiento', 'Ardor', 'Resequedad', 'Descamacion', 'Inflamacion']

function createEmptyDraft(patientId = 1): EntryDraft {
  return {
    patientId,
    date: toInputDate(new Date()),
    severity: 3,
    pain: 2,
    symptoms: ['Enrojecimiento'],
    triggers: ['Estres'],
    notes: '',
  }
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

function toInputDate(date: Date, timeZone = CHILE_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const year = parts.find((part) => part.type === 'year')?.value ?? '0000'
  const month = parts.find((part) => part.type === 'month')?.value ?? '01'
  const day = parts.find((part) => part.type === 'day')?.value ?? '01'

  return `${year}-${month}-${day}`
}

function parseInputDate(value: string) {
  return new Date(`${value}T12:00:00`)
}

function toReadableDate(value: string) {
  const date = parseInputDate(value)
  return new Intl.DateTimeFormat('es-CL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function buildCalendarDays(selectedDate: string, logs: LogEntry[]) {
  const selected = parseInputDate(selectedDate)
  const year = selected.getFullYear()
  const month = selected.getMonth()
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

function buildSummaryBars(referenceDate: string, logs: LogEntry[]): SummaryBar[] {
  const baseDate = parseInputDate(referenceDate)
  const dayLabels = ['D', 'L', 'M', 'M', 'J', 'V', 'S']

  return Array.from({ length: 7 }, (_, index) => {
    const dayDate = new Date(baseDate)
    dayDate.setDate(baseDate.getDate() - (6 - index))
    const date = toInputDate(dayDate)
    const dayEntries = logs.filter((entry) => entry.date === date)
    const events = dayEntries.length
    const severity = dayEntries.reduce((max, entry) => Math.max(max, entry.severity), 0)
    const value = events === 0 ? 14 : Math.min(82, 20 + events * 16 + severity * 7)

    return {
      date,
      dayLabel: dayLabels[dayDate.getDay()],
      events,
      severity,
      value,
    }
  })
}

function sanitizeTriggerValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[áàäâ]/g, 'a')
    .replace(/[éèëê]/g, 'e')
    .replace(/[íìïî]/g, 'i')
    .replace(/[óòöô]/g, 'o')
    .replace(/[úùüû]/g, 'u')
    .replace(/ñ/g, 'n')
}

function detectTriggerSignal(trigger?: string): TriggerSignal | null {
  const normalized = sanitizeTriggerValue(trigger ?? '')

  if (!normalized) {
    return null
  }

  if (
    ['clima', 'frio', 'calor', 'humedad', 'invierno', 'temperatura', 'viento', 'sol'].some((term) =>
      normalized.includes(term),
    )
  ) {
    return { key: 'clima', label: 'Clima' }
  }

  if (['estres', 'ansiedad', 'tension', 'nervios', 'agobio'].some((term) => normalized.includes(term))) {
    return { key: 'estres', label: 'Estres' }
  }

  if (
    ['alergen', 'polvo', 'polen', 'moho', 'mascota', 'perfume', 'fragancia'].some((term) =>
      normalized.includes(term),
    )
  ) {
    return { key: 'alergenos', label: 'Alergenos' }
  }

  if (
    ['producto', 'crema', 'serum', 'maquillaje', 'jabon', 'limpiador', 'protector', 'cosmetico'].some((term) =>
      normalized.includes(term),
    )
  ) {
    return { key: 'producto', label: 'Nuevo producto' }
  }

  if (
    ['sueno', 'insomnio', 'desvelo', 'cansancio', 'fatiga', 'dormi poco', 'mal dormir'].some((term) =>
      normalized.includes(term),
    )
  ) {
    return { key: 'sueno', label: 'Falta de sueno' }
  }

  if (
    ['alcohol', 'vino', 'cerveza', 'trago', 'licor', 'whisky', 'ron', 'pisco', 'champagne'].some((term) =>
      normalized.includes(term),
    )
  ) {
    return { key: 'alcohol', label: 'Alcohol' }
  }

  if (
    ['cafeina', 'cafe', 'mate', 'te', 'energetica', 'bebida energetica', 'red bull'].some((term) =>
      normalized.includes(term),
    )
  ) {
    return { key: 'cafeina', label: 'Cafeina' }
  }

  if (['picante', 'aji', 'condimento', 'salsa picante'].some((term) => normalized.includes(term))) {
    return { key: 'picante', label: 'Picante' }
  }

  if (
    ['comida', 'dieta', 'lacteo', 'leche', 'queso', 'gluten', 'azucar', 'marisco', 'fritura', 'chocolate'].some((term) =>
      normalized.includes(term),
    )
  ) {
    return { key: 'comida', label: 'Comida' }
  }

  if (['bebida', 'gaseosa', 'jugo', 'refresco'].some((term) => normalized.includes(term))) {
    return { key: 'bebida', label: 'Bebida' }
  }

  return null
}

function buildTriggerRecommendation(trigger?: string) {
  switch (detectTriggerSignal(trigger)?.key ?? trigger) {
    case 'clima':
    case 'Clima':
      return 'Protege la piel del frio y refuerza la hidratacion antes de salir.'
    case 'estres':
    case 'Estres':
      return 'Combina el registro con pausas cortas para detectar brotes por tension.'
    case 'alergenos':
    case 'Alergenos':
      return 'Revisa exposicion reciente y evita sumar productos nuevos al mismo tiempo.'
    case 'comida':
    case 'Dieta':
    case 'Comida':
      return 'Anota alimentos recientes para ver si se repite el patron en los proximos dias.'
    case 'alcohol':
    case 'Alcohol':
      return 'Anota cantidad y horario del alcohol para ver si coincide con enrojecimiento, calor o picor posterior.'
    case 'bebida':
    case 'Bebida':
    case 'cafeina':
    case 'Cafeina':
      return 'Registra que bebida consumiste y en que cantidad para ver si se relaciona con sensibilidad o deshidratacion.'
    case 'picante':
    case 'Picante':
      return 'Si hubo comida picante, anota cantidad y momento del dia para revisar si se repite el enrojecimiento.'
    case 'producto':
    case 'Nuevo producto':
      return 'Mantén una rutina corta y prueba un cambio por vez.'
    case 'sueno':
    case 'Falta de sueno':
      return 'Prioriza descanso y observa si el picor baja al dia siguiente.'
    default:
      return 'Sigue registrando sintomas y contexto para detectar patrones mas claros.'
  }
}

function buildTriggerSpecificGuidance(trigger?: string) {
  const signal = detectTriggerSignal(trigger)
  const label = signal?.label ?? normalizeTriggerLabel(trigger ?? '')

  switch (signal?.key) {
    case 'alcohol':
      return {
        title: 'Alcohol marcado como posible detonante',
        body: 'Si hoy consumiste alcohol, conviene registrar cantidad y horario. Asi podemos ver si el enrojecimiento o picor aparecen despues.',
        reason: 'Patron sensible a alcohol',
      }
    case 'comida':
      return {
        title: 'Comida bajo observacion',
        body: 'Anota que alimento estuvo presente hoy. El objetivo es detectar si el brote se repite con la misma comida o combinacion.',
        reason: 'Patron alimentario en seguimiento',
      }
    case 'picante':
      return {
        title: 'Picante como posible gatillante',
        body: 'Si notas calor, ardor o rojez tras comida picante, deja el contexto del plato y la hora. Ese detalle ayuda mucho a detectar repeticiones.',
        reason: 'Reaccion posible a comida picante',
      }
    case 'cafeina':
      return {
        title: 'Cafeina en observacion',
        body: 'Cafe, mate o bebidas energeticas pueden coincidir con sensibilidad o peor descanso. Registra cantidad para comparar con tu piel.',
        reason: 'Patron de cafeina detectado',
      }
    case 'bebida':
      return {
        title: 'Bebida marcada en el registro',
        body: 'Si sospechas de una bebida especifica, dejar el detalle hoy ayudara a validar si vuelve a aparecer junto al brote.',
        reason: 'Seguimiento de bebida personalizada',
      }
    case 'clima':
      return {
        title: 'Cambio ambiental en observacion',
        body: 'Hoy conviene reforzar hidratacion y registrar frio, calor o viento. Los cambios ambientales suelen repetir patron en piel sensible.',
        reason: 'Clima como detonante recurrente',
      }
    case 'sueno':
      return {
        title: 'Descanso y piel podrian estar conectados',
        body: 'Si dormiste mal, deja esa nota hoy. Varias crisis se explican mejor cuando cruzamos sintomas con calidad de sueno.',
        reason: 'Sueno como factor de riesgo',
      }
    case 'estres':
      return {
        title: 'Carga emocional detectada',
        body: 'Si hubo tension o ansiedad, agregar esa nota puede ayudar a explicar por que la piel reacciono mas de lo habitual.',
        reason: 'Estres con impacto posible',
      }
    case 'producto':
      return {
        title: 'Nuevo producto bajo revision',
        body: 'Si estrenaste una crema o limpiador, evita sumar mas cambios hoy. Lo ideal es aislar un solo producto por vez.',
        reason: 'Producto nuevo en observacion',
      }
    case 'alergenos':
      return {
        title: 'Posible exposicion a alergeno',
        body: 'Registra si hubo polvo, polen, perfume o contacto similar. Ese contexto ayuda a anticipar brotes repetidos.',
        reason: 'Alergenos detectados en el contexto',
      }
    default:
      return {
        title: label ? `${label} en seguimiento` : 'Detonante en seguimiento',
        body: 'Sigue dejando contexto en tus registros. Mientras mas claro sea el patron, mejores recomendaciones podremos darte.',
        reason: 'Seguimiento personalizado',
      }
  }
}

function buildDraftRealtimeSuggestion(draft: EntryDraft) {
  const primaryTrigger = draft.triggers[0]
  const guidance = buildTriggerSpecificGuidance(primaryTrigger)
  const symptom = draft.symptoms[0] ?? 'sensibilidad'
  const severityNote =
    draft.severity >= 4
      ? ' La intensidad esta alta, asi que vale la pena dejar una nota detallada hoy.'
      : draft.severity <= 1
        ? ' Aunque se vea leve, igual conviene registrarlo para comparar despues.'
        : ''

  return {
    title: guidance.title,
    body: `${guidance.body} Sintoma principal marcado: ${symptom.toLowerCase()}.${severityNote}`,
  }
}

function buildDayInsight(date: string, logs: LogEntry[], reminders: Reminder[]) {
  const dayEntries = logs.filter((entry) => entry.date === date)
  const latestDayEntry = dayEntries[0]

  if (!latestDayEntry) {
    const pendingReminders = reminders.filter((item) => !item.done).length
    return {
      label: 'Actividad del dia',
      title: 'Aun no hay registro para esta fecha',
      description:
        pendingReminders > 0
          ? `Tienes ${pendingReminders} recordatorio${pendingReminders === 1 ? '' : 's'} pendiente${pendingReminders === 1 ? '' : 's'} para empujar el seguimiento.`
          : 'Toca el boton + para registrar sintomas, mejorias o un cambio de rutina.',
    }
  }

  const detectedSymptom = latestDayEntry.symptoms[0] ?? 'sensibilidad'
  const detectedTrigger = latestDayEntry.triggers[0]
  const activeTrigger = detectedTrigger
  const entry = latestDayEntry

  if (latestDayEntry.status === 'Recuperacion') {
    return {
      label: 'Mejoria detectada',
      title: `${detectedSymptom} en descenso`,
      description: 'Mantén la rutina actual y registra que fue lo que ayudó para repetirlo.',
    }
  }

  if (false) {
    return {
      label: 'Recomendacion actual',
      title: 'MantÃ©n estabilidad sin sobrecargar la rutina',
      body: `${buildTriggerRecommendation(activeTrigger)} MantÃ©n la rutina simple y registra cualquier cambio leve.`,
      actionLabel: 'Ver calendario',
      actionPage: 'calendar' as Page,
      actionDate: entry.date,
    }
  }

  if (activeTrigger) {
    return {
      label: 'Recomendacion actual',
      title: 'Manten estabilidad sin sobrecargar la rutina',
      body: `${buildTriggerRecommendation(activeTrigger)} Manten la rutina simple y registra cualquier cambio leve.`,
      actionLabel: 'Ver calendario',
      actionPage: 'calendar' as Page,
      actionDate: entry.date,
    }
  }

  return {
    label: detectedTrigger ? 'Sintoma detectado' : 'Seguimiento activo',
    title: detectedTrigger ? `${detectedSymptom} vinculado a ${detectedTrigger.toLowerCase()}` : detectedSymptom,
    description: buildTriggerRecommendation(detectedTrigger),
  }
}

function getHeroState(entry: LogEntry | undefined, todaysEntries: LogEntry[]) {
  if (!entry) {
    return {
      mood: 'neutral',
      title: 'Aun sin registro para hoy',
      emoji: ':|',
      message: 'Haz un registro rapido para que DermaTips pueda mostrar el estado actual con mas precision.',
      tags: ['Seguimiento', 'Hoy', 'Pendiente'],
    } as const
  }

  if (entry.status === 'Brote') {
    return {
      mood: 'brote',
      title: 'Tu piel necesita calma hoy',
      emoji: ':(',
      message:
        todaysEntries.length > 0
          ? `Detectamos ${todaysEntries.length} registro${todaysEntries.length === 1 ? '' : 's'} hoy con actividad reciente. Conviene observar sintomas y detonantes.`
          : 'Detectamos actividad reciente. Registra sintomas para encontrar patrones.',
      tags: ['Crisis', 'Cuidado', 'Observacion'],
    } as const
  }

  if (entry.status === 'Recuperacion') {
    return {
      mood: 'recovery',
      title: 'Tu piel muestra mejoria',
      emoji: ':)',
      message: 'Se ve una recuperacion en curso. Mantén la rutina que ayudó y sigue registrando avances.',
      tags: ['Mejoria', 'Rutina', 'Constancia'],
    } as const
  }

  return {
    mood: 'stable',
    title: 'Tu piel se ve estable',
    emoji: ':)',
    message:
      todaysEntries.length > 0
        ? `Hoy tienes ${todaysEntries.length} registro${todaysEntries.length === 1 ? '' : 's'} y el seguimiento se ve controlado.`
        : 'No vemos señales de crisis importantes. Mantén tu rutina y sigue observando cambios leves.',
    tags: ['Calma', 'Rutina', 'Seguimiento'],
  } as const
}

function getLoadingHeroState() {
  return {
    mood: 'neutral',
    title: 'Sincronizando estado actual',
    emoji: ':|',
    message: 'Estamos revisando el ultimo registro para mostrar el estado real de la piel.',
    tags: ['Sincronizando', 'Seguimiento', 'Chile'],
  } as const
}

function getDailyRecommendation(
  entry: LogEntry | undefined,
  todayKey: string,
  todaysEntries: LogEntry[],
  reminders: Reminder[],
  triggerStats: Array<[string, number]>,
) {
  const pendingReminders = reminders.filter((item) => !item.done).length
  const topTrigger = triggerStats[0]?.[0] ?? entry?.triggers[0] ?? ''
  const activeTrigger = entry?.triggers[0] ?? topTrigger
  const activeGuidance = buildTriggerSpecificGuidance(activeTrigger)

  if (!entry || todaysEntries.length === 0) {
    return {
      label: 'Recomendacion actual',
      title: 'Primero registra como está la piel hoy',
      body: pendingReminders > 0
        ? `Tienes ${pendingReminders} recordatorio${pendingReminders === 1 ? '' : 's'} pendiente${pendingReminders === 1 ? '' : 's'}. Registra el estado actual para cruzarlo con tu rutina de hoy.`
        : 'Un registro corto hoy le da contexto real al calendario, a los sintomas y a las recomendaciones.',
      actionLabel: 'Registrar hoy',
      actionPage: 'add' as Page,
      actionDate: todayKey,
    }
  }

  if (entry.status === 'Brote') {
    return {
      label: 'Recomendacion actual',
      title: activeGuidance.title,
      body: `${activeGuidance.body} Hoy conviene registrar sintomas con detalle y evitar cambios bruscos de rutina.`,
      actionLabel: 'Ver historial',
      actionPage: 'history' as Page,
    }
  }

  if (entry.status === 'Recuperacion') {
    return {
      label: 'Recomendacion actual',
      title: 'Detecta qué ayudó para repetirlo',
      body: 'La piel muestra mejoria. Aprovecha de dejar una nota sobre productos, clima, descanso o rutina para identificar qué funcionó.',
      actionLabel: 'Abrir registro',
      actionPage: 'add' as Page,
      actionDate: entry.date,
    }
  }

  return {
    label: 'Recomendacion actual',
    title: 'Mantén estabilidad sin sobrecargar la rutina',
    body: activeTrigger
      ? `El seguimiento se ve estable, pero ${topTrigger.toLowerCase()} sigue apareciendo como patron. Mantén la rutina simple y registra cualquier cambio leve.`
      : 'La piel se ve estable. Mantén constancia en la rutina y registra solo cambios relevantes para no sobrecargar el seguimiento.',
    actionLabel: 'Ver calendario',
    actionPage: 'calendar' as Page,
    actionDate: entry.date,
  }
}

function getNotificationStorageKey(userId: string | null) {
  return `dermatips-notifications-${userId ?? 'guest'}`
}

function normalizeTriggerLabel(value: string) {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function differenceInDays(dateA: string, dateB: string) {
  const left = parseInputDate(dateA).getTime()
  const right = parseInputDate(dateB).getTime()
  return Math.round((left - right) / 86400000)
}

function isChileColdSeason(referenceDate: string) {
  const month = parseInputDate(referenceDate).getMonth()
  return month >= 4 && month <= 8
}

function buildPredictiveInsight(
  entries: LogEntry[],
  todayKey: string,
  triggerStats: Array<[string, number]>,
): PredictiveInsight {
  const recentEntries = entries.filter((entry) => differenceInDays(todayKey, entry.date) <= 14)
  const recentFlareUps = recentEntries.filter((entry) => entry.status === 'Brote')
  const latestEntry = entries[0]
  const topTrigger = triggerStats[0]
  const coldSeason = isChileColdSeason(todayKey)
  const triggerGuidance = buildTriggerSpecificGuidance(topTrigger?.[0] ?? latestEntry?.triggers[0])

  if (detectTriggerSignal(topTrigger?.[0])?.key === 'clima' && coldSeason) {
    return {
      level: recentFlareUps.length >= 2 ? 'high' : 'medium',
      title: recentFlareUps.length >= 2 ? 'Riesgo alto por clima frio' : 'Atencion al clima frio',
      description:
        recentFlareUps.length >= 2
          ? 'Tus ultimos brotes se repiten en temporada fria. Refuerza hidratacion, evita agua muy caliente y considera adelantar control si la piel escala rapido.'
          : 'Clima aparece como detonante y estamos en temporada fria de Chile. Hoy conviene proteger barrera cutanea y observar sensibilidad.',
      reason: 'Patron detectado: clima + estacionalidad',
      actionLabel: 'Ver historial',
      actionPage: 'history',
    }
  }

  if (recentFlareUps.length >= 2) {
    return {
      level: 'high',
      title: triggerGuidance.title,
      body: `${triggerGuidance.body} Si este patron se mantiene, puede ser buen momento para contactar a tu medico y revisar tratamiento o detonantes.`,
      reason: `${triggerGuidance.reason} + frecuencia alta en ultimos 14 dias`,
      actionLabel: 'Ver historial',
      actionPage: 'history',
    }
  }

  if (latestEntry?.status === 'Brote') {
    return {
      level: 'medium',
      title: triggerGuidance.title,
      body: `${triggerGuidance.body} Evita sumar muchos cambios el mismo dia hasta estabilizar la piel.`,
      reason: `${triggerGuidance.reason} + ultimo evento en brote`,
      actionLabel: 'Registrar hoy',
      actionPage: 'add',
    }
  }

  if (latestEntry?.status === 'Recuperacion') {
    return {
      level: 'low',
      title: 'Momento util para consolidar mejoria',
      body: 'La piel viene en recuperacion. Mantener constancia y documentar que ayudo puede prevenir la proxima crisis.',
      reason: 'Recuperacion reciente detectada',
      actionLabel: 'Ver calendario',
      actionPage: 'calendar',
    }
  }

  return {
    level: 'low',
    title: 'Riesgo bajo por ahora',
    body: topTrigger
      ? `No vemos una alerta fuerte hoy, pero ${topTrigger[0].toLowerCase()} sigue apareciendo como patron. Mantén observacion ligera.`
      : 'No vemos señales fuertes de crisis hoy. Sigue con tu rutina y registra cambios relevantes.',
    reason: 'Seguimiento estable',
    actionLabel: 'Abrir dashboard',
    actionPage: 'dashboard',
  }
}

function getNotificationSignature(item: NotificationItem) {
  return [item.title, item.body, item.page, item.date ?? ''].join('|')
}

function buildNotificationItems(
  entries: LogEntry[],
  reminders: Reminder[],
  todayKey: string,
  triggerStats: Array<[string, number]>,
  isOffline: boolean,
): NotificationItem[] {
  const items: NotificationItem[] = []
  const pendingReminders = reminders.filter((item) => !item.done)
  const latestEntry = entries[0]
  const todayEntries = entries.filter((entry) => entry.date === todayKey)
  const recoveringEntry = entries.find((entry) => entry.status === 'Recuperacion')
  const topTrigger = triggerStats[0]
  const predictiveInsight = buildPredictiveInsight(entries, todayKey, triggerStats)

  if (isOffline) {
    items.push({
      id: 'offline-mode',
      title: 'Modo offline activo',
      body: 'Las notificaciones siguen usando datos locales. Cuando vuelva internet, la app retomará sincronización.',
      page: 'dashboard',
      date: todayKey,
    })
  }

  if (todayEntries.length === 0) {
    items.push({
      id: 'today-entry',
      title: 'Registro pendiente',
      body: 'Aun no hay un seguimiento para hoy. Registrar el estado actual ayudara al dashboard.',
      page: 'add',
      date: todayKey,
    })
  }

  if (pendingReminders.length > 0) {
    items.push({
      id: 'pending-reminders',
      title: 'Recordatorios activos',
      body: `Tienes ${pendingReminders.length} recordatorio${pendingReminders.length === 1 ? '' : 's'} pendiente${pendingReminders.length === 1 ? '' : 's'} por revisar.`,
      page: 'dashboard',
    })
  }

  if (latestEntry?.status === 'Brote') {
    items.push({
      id: 'latest-flare',
      title: 'Brote reciente',
      body: `Ultimo evento con ${latestEntry.symptoms[0]?.toLowerCase() ?? 'sintomas'} y severidad ${latestEntry.severity}/5.`,
      page: 'history',
      date: latestEntry.date,
    })
  }

  if (recoveringEntry) {
    items.push({
      id: 'recovery',
      title: 'Mejoria detectada',
      body: `Se detecto recuperacion el ${toReadableDate(recoveringEntry.date)}. Puede servir revisar que ayudo.`,
      page: 'history',
      date: recoveringEntry.date,
    })
  }

  if (topTrigger) {
    items.push({
      id: 'top-trigger',
      title: 'Patron detectado',
      body: `${topTrigger[0]} aparece en ${topTrigger[1]} registro${topTrigger[1] === 1 ? '' : 's'} reciente${topTrigger[1] === 1 ? '' : 's'}.`,
      page: 'history',
    })
  }

  if (predictiveInsight.level !== 'low') {
    items.push({
      id: `predictive-${predictiveInsight.level}`,
      title: predictiveInsight.title,
      body: predictiveInsight.body,
      page: predictiveInsight.actionPage,
      date: todayKey,
    })
  }

  if (latestEntry && todayEntries.length > 0) {
    items.push({
      id: 'current-state',
      title: latestEntry.status === 'Brote' ? 'Estado actual sensible' : latestEntry.status === 'Recuperacion' ? 'Estado actual en mejoria' : 'Estado actual estable',
      body:
        latestEntry.status === 'Brote'
          ? `Ultimo registro con severidad ${latestEntry.severity}/5 y ${latestEntry.symptoms[0]?.toLowerCase() ?? 'sintomas'} como señal principal.`
          : latestEntry.status === 'Recuperacion'
            ? 'La piel muestra senales de recuperacion. Mantener constancia puede consolidar la mejoria.'
            : 'No hay alertas fuertes hoy. Mantén la rutina y registra cualquier cambio leve.',
      page: 'dashboard',
      date: latestEntry.date,
    })
  }

  if (items.length === 0) {
    items.push({
      id: 'quiet-day',
      title: 'Seguimiento tranquilo',
      body: 'No hay alertas nuevas por ahora. Puedes revisar el calendario o registrar observaciones leves.',
      page: 'calendar',
      date: todayKey,
    })
  }

  return items.slice(0, 4)
}

function isSameEntryDraft(entry: LogEntry, draft: EntryDraft) {
  return (
    entry.patientId === draft.patientId &&
    entry.date === draft.date &&
    entry.severity === draft.severity &&
    entry.pain === draft.pain &&
    entry.notes === draft.notes &&
    entry.symptoms.join('|') === draft.symptoms.join('|') &&
    entry.triggers.join('|') === draft.triggers.join('|')
  )
}

function countActiveDays(logs: LogEntry[]) {
  return new Set(logs.map((entry) => entry.date)).size
}

function getTriggerStats(logs: LogEntry[]) {
  const counts = new Map<string, number>()

  logs.forEach((entry) => {
    entry.triggers.forEach((trigger) => {
      const groupedTrigger = detectTriggerSignal(trigger)?.label ?? normalizeTriggerLabel(trigger)
      counts.set(groupedTrigger, (counts.get(groupedTrigger) ?? 0) + 1)
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

async function toCompressedImageDataUrl(file: File) {
  const sourceUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('No pude leer la imagen seleccionada.'))
    reader.readAsDataURL(file)
  })

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const nextImage = new Image()
    nextImage.onload = () => resolve(nextImage)
    nextImage.onerror = () => reject(new Error('No pude procesar la imagen seleccionada.'))
    nextImage.src = sourceUrl
  })

  const maxDimension = 900
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('No pude preparar la imagen para subirla.')
  }

  context.drawImage(image, 0, 0, width, height)

  return canvas.toDataURL('image/jpeg', 0.78)
}

function toFriendlyErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') {
    return 'Ocurrio un error inesperado.'
  }

  const code = 'code' in error && typeof error.code === 'string' ? error.code : ''
  const message = 'message' in error && typeof error.message === 'string' ? error.message : ''

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Correo o contrasena incorrectos.'
    case 'auth/invalid-email':
      return 'El correo no tiene un formato valido.'
    case 'auth/operation-not-allowed':
      return 'Email/Password no esta habilitado en Firebase Authentication.'
    case 'auth/too-many-requests':
      return 'Firebase bloqueo temporalmente el acceso por muchos intentos. Espera un momento.'
    case 'auth/network-request-failed':
      return 'No se pudo conectar con Firebase. Revisa tu conexion o la configuracion del proyecto.'
    case 'auth/popup-closed-by-user':
      return 'Cerraste la ventana de Google antes de terminar el inicio de sesion.'
    case 'auth/popup-blocked':
      return 'El navegador bloqueo la ventana emergente de Google. Permite popups e intenta de nuevo.'
    case 'storage/unauthorized':
      return 'Firebase Storage rechazo la subida. Revisa las reglas del bucket.'
    case 'storage/object-not-found':
      return 'No encontre el archivo en Firebase Storage.'
    case 'storage/unknown':
      return 'Firebase Storage no esta listo todavia. Crea el bucket y prueba nuevamente.'
    case 'storage/retry-limit-exceeded':
      return 'La subida de imagen tardo demasiado. Intenta con una foto mas liviana.'
    case 'drive/config-missing':
      return 'Falta configurar Google Drive en el archivo .env.local.'
    case 'drive/access-denied':
      return 'Tu cuenta de Google no tiene permiso para subir archivos a esa carpeta de Drive.'
    case 'drive/folder-not-found':
      return 'No encontre la carpeta configurada de Drive. Revisa el folderId.'
    case 'drive/authorization-timeout':
      return 'La autorizacion de Google Drive se interrumpio o tardo demasiado.'
    case 'drive/unauthorized':
      return 'Google Drive rechazo la autorizacion. Intenta nuevamente.'
    case 'drive/upload-failed':
      return 'No pude subir la imagen a Google Drive.'
    case 'drive/script-load-failed':
      return 'No pude cargar el acceso a Google Drive en este navegador.'
    case 'drive/invalid-image':
      return 'La imagen seleccionada no se pudo convertir para subir a Drive.'
    default:
      return code ? `Firebase devolvio: ${code}` : message || 'Ocurrio un error inesperado.'
  }
}

function App() {
  const todayKey = toInputDate(new Date())
  const [page, setPage] = useState<Page>('dashboard')
  const [selectedDate, setSelectedDate] = useState(todayKey)
  const [draft, setDraft] = useState<EntryDraft>(() => createEmptyDraft())
  const [customTriggerInput, setCustomTriggerInput] = useState('')
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
  const [isPreparingPhoto, setIsPreparingPhoto] = useState(false)
  const [isCreatingPatient, setIsCreatingPatient] = useState(false)
  const [isUpdatingPatient, setIsUpdatingPatient] = useState(false)
  const [isDeletingPatient, setIsDeletingPatient] = useState(false)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [seenNotifications, setSeenNotifications] = useState<Record<string, string>>({})
  const [isOffline, setIsOffline] = useState(() => !window.navigator.onLine)
  const [errorMessage, setErrorMessage] = useState('')
  const isGuestMode = !currentUser
  const isUploadingEvidence = isSaving && Boolean(draft.photoDataUrl)
  const isPhotoBusy = isPreparingPhoto || isUploadingEvidence
  const selectedDateObject = parseInputDate(selectedDate)
  const calendarMonth = new Date(selectedDateObject.getFullYear(), selectedDateObject.getMonth(), 1)
  const chileDateLabel = new Intl.DateTimeFormat('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: CHILE_TIME_ZONE,
  }).format(new Date())
  const chileTimeLabel = new Intl.DateTimeFormat('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: CHILE_TIME_ZONE,
    timeZoneName: 'shortOffset',
  }).format(new Date())

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
      setSelectedDate(store.entries[0]?.date ?? todayKey)
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

  const selectedEntries = entries.filter((entry) => entry.date === selectedDate)
  const latestEntry = entries[0]
  const todaysEntries = entries.filter((entry) => entry.date === todayKey)
  const currentStatusEntry = todaysEntries[0] ?? latestEntry
  const flareUps = entries.filter((entry) => entry.status === 'Brote').length
  const recoveryScore = Math.max(58, 100 - flareUps * 7 + reminders.filter((item) => item.done).length * 4)
  const consistency = `${countActiveDays(entries)}/30`
  const triggerStats = getTriggerStats(entries)
  const calendarDays = buildCalendarDays(selectedDate, entries)
  const summaryBars = buildSummaryBars(todayKey, entries)
  const activeSummaryBar = summaryBars.find((item) => item.date === selectedDate) ?? summaryBars.at(-1)
  const activeDayInsight = buildDayInsight(activeSummaryBar?.date ?? todayKey, entries, reminders)
  const notificationItems = buildNotificationItems(entries, reminders, todayKey, triggerStats, isOffline)
  const unreadNotificationItems = notificationItems.filter(
    (item) => seenNotifications[item.id] !== getNotificationSignature(item),
  )
  const heroState = isLoading ? getLoadingHeroState() : getHeroState(currentStatusEntry, todaysEntries)
  const dailyRecommendation = getDailyRecommendation(currentStatusEntry, todayKey, todaysEntries, reminders, triggerStats)
  const predictiveInsight = buildPredictiveInsight(entries, todayKey, triggerStats)
  const draftRealtimeSuggestion = buildDraftRealtimeSuggestion(draft)

  useEffect(() => {
    function handleOnlineStateChange() {
      setIsOffline(!window.navigator.onLine)
    }

    window.addEventListener('online', handleOnlineStateChange)
    window.addEventListener('offline', handleOnlineStateChange)

    return () => {
      window.removeEventListener('online', handleOnlineStateChange)
      window.removeEventListener('offline', handleOnlineStateChange)
    }
  }, [])

  useEffect(() => {
    const storageKey = getNotificationStorageKey(currentUser?.id ?? null)

    try {
      const saved = window.localStorage.getItem(storageKey)
      setSeenNotifications(saved ? (JSON.parse(saved) as Record<string, string>) : {})
    } catch {
      setSeenNotifications({})
    }
  }, [currentUser?.id])

  useEffect(() => {
    const storageKey = getNotificationStorageKey(currentUser?.id ?? null)

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(seenNotifications))
    } catch {
      // Ignore localStorage issues in limited browsers.
    }
  }, [currentUser?.id, seenNotifications])

  async function handlePatientChange(nextPatientId: number) {
    await loadData(nextPatientId)
  }

  function markNotificationAsSeen(notificationId: string) {
    const item = notificationItems.find((notification) => notification.id === notificationId)

    if (!item) {
      return
    }

    setSeenNotifications((current) => ({
      ...current,
      [notificationId]: getNotificationSignature(item),
    }))
  }

  function markAllNotificationsAsSeen() {
    setSeenNotifications((current) =>
      notificationItems.reduce<Record<string, string>>(
        (next, item) => ({
          ...next,
          [item.id]: getNotificationSignature(item),
        }),
        { ...current },
      ),
    )
  }

  function handleNotificationAction(item: NotificationItem) {
    markNotificationAsSeen(item.id)

    if (item.date) {
      setSelectedDate(item.date)
    }

    setPage(item.page)
    setIsNotificationsOpen(false)
  }

  function handleRecommendationAction() {
    if (dailyRecommendation.actionDate) {
      setSelectedDate(dailyRecommendation.actionDate)
      setDraft((current) => ({ ...current, date: dailyRecommendation.actionDate! }))
    }

    setPage(dailyRecommendation.actionPage)
  }

  function handlePredictiveAction() {
    setSelectedDate(todayKey)
    setDraft((current) => ({ ...current, date: todayKey }))
    setPage(predictiveInsight.actionPage)
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

  function addCustomTrigger() {
    const normalizedTrigger = normalizeTriggerLabel(customTriggerInput)

    if (!normalizedTrigger) {
      return
    }

    setDraft((current) => {
      if (current.triggers.includes(normalizedTrigger)) {
        return current
      }

      return {
        ...current,
        triggers: [...current.triggers, normalizedTrigger],
      }
    })

    setCustomTriggerInput('')
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
      setDraft((current) => createEmptyDraft(current.patientId))
      setCustomTriggerInput('')
      setErrorMessage('')

      startTransition(() => {
        setPage('history')
      })
    } catch (error) {
      try {
        const store = await getBootstrapData(draft.patientId)
        const recoveredEntry = store.entries.find((entry) => isSameEntryDraft(entry, draft))

        if (recoveredEntry) {
          setCurrentUser(store.currentUser)
          setPatients(store.patients)
          setPatient(store.patient)
          setPatientEditDraft(toPatientForm(store.patient))
          setReminders(store.reminders)
          setEntries(store.entries)
          setSelectedDate(recoveredEntry.date)
          setDraft((current) => createEmptyDraft(current.patientId))
          setCustomTriggerInput('')
          setErrorMessage('El registro se guardo bien, pero la sincronizacion demoro un momento.')

          startTransition(() => {
            setPage('history')
          })

          return
        }
      } catch {
        // Ignore fallback sync issues and show the original save error below.
      }

      setErrorMessage(toFriendlyErrorMessage(error) || 'No pude guardar el registro. Intenta de nuevo.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    try {
      setIsPreparingPhoto(true)
      const photoDataUrl = await toCompressedImageDataUrl(file)
      setDraft((current) => ({ ...current, photoDataUrl }))
      setErrorMessage('')
    } catch (error) {
      setErrorMessage(toFriendlyErrorMessage(error))
    } finally {
      setIsPreparingPhoto(false)
      event.target.value = ''
    }
  }

  function removeDraftPhoto() {
    setDraft((current) => ({ ...current, photoDataUrl: undefined }))
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
    } catch (error) {
      setErrorMessage(toFriendlyErrorMessage(error))
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

  async function handleGoogleLogin() {
    try {
      setIsAuthenticating(true)
      await loginWithGoogle()
      await loadData()
      setErrorMessage('')
    } catch (error) {
      setErrorMessage(toFriendlyErrorMessage(error))
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
          <button
            className={`icon-button ${isNotificationsOpen ? 'active' : ''}`}
            type="button"
            aria-label="Notificaciones"
            onClick={() => setIsNotificationsOpen((current) => !current)}
          >
            <img alt="" src={bellIcon} />
            {unreadNotificationItems.length > 0 ? <span className="notification-badge">{unreadNotificationItems.length}</span> : null}
          </button>
        </header>

        <div className="topbar-status">
          <span className="date-state-chip">Chile · {chileDateLabel}</span>
          <span className="date-state-chip subtle">{chileTimeLabel}</span>
          {isOffline ? <span className="date-state-chip offline">Sin internet</span> : null}
        </div>

        {isNotificationsOpen ? (
          <section className="panel notification-sheet">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Eventos</p>
                <h3>Notificaciones del seguimiento</h3>
              </div>
              <div className="notification-actions">
                {unreadNotificationItems.length > 0 ? (
                  <button type="button" onClick={markAllNotificationsAsSeen}>
                    Marcar vistas
                  </button>
                ) : null}
                <button type="button" onClick={() => setIsNotificationsOpen(false)}>
                  Cerrar
                </button>
              </div>
            </div>
            <div className="stack-list">
              {notificationItems.length > 0 ? (
                notificationItems.map((item) => (
                  <button
                    className={`notification-card ${seenNotifications[item.id] === getNotificationSignature(item) ? 'is-seen' : 'is-unread'}`}
                    key={item.id}
                    type="button"
                    onClick={() => handleNotificationAction(item)}
                  >
                    <span className="notification-status">
                      {seenNotifications[item.id] === getNotificationSignature(item) ? 'Vista' : 'Nueva'}
                    </span>
                    <strong>{item.title}</strong>
                    <p>{item.body}</p>
                  </button>
                ))
              ) : (
                <div className="empty-state">
                  <strong>Sin novedades por ahora</strong>
                  <p>Cuando haya brotes, mejorias o recordatorios, apareceran aqui.</p>
                </div>
              )}
            </div>
          </section>
        ) : null}

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

              <section className={`hero-card hero-${heroState.mood}`}>
                <div className="hero-illustration">
                  <img alt="Rutina de cuidado facial" src={skincarePortrait} />
                </div>
                <div className="hero-copy">
                  <p className="eyebrow">Estado actual</p>
                  <div className="hero-heading">
                    <h2>{heroState.title}</h2>
                    <div className={`status-badge mood-${heroState.mood}`} aria-hidden="true">
                      {heroState.emoji}
                    </div>
                  </div>
                  <p>{heroState.message}</p>
                  <div className="hero-soft-points">
                    {heroState.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
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
                    <h3>Actividad 7 dias</h3>
                    <button type="button" onClick={() => setPage('history')}>
                      Analisis
                    </button>
                  </div>
                  <div className="chart-card" aria-label="Grafico de actividad semanal">
                    {summaryBars.map((bar) => (
                      <button
                        className={`chart-bar-group ${bar.date === activeSummaryBar?.date ? 'active' : ''}`}
                        key={bar.date}
                        type="button"
                        onClick={() => {
                          setSelectedDate(bar.date)
                          setPage('calendar')
                        }}
                      >
                        <div className="chart-bar" style={{ height: `${bar.value}px` }} />
                        <span>{bar.dayLabel}</span>
                      </button>
                    ))}
                  </div>
                  <div className="activity-insight-card">
                    <p className="eyebrow">{activeDayInsight.label}</p>
                    <strong>{activeDayInsight.title}</strong>
                    <p>{activeDayInsight.description}</p>
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

                <article className={`panel predictive-panel predictive-${predictiveInsight.level}`}>
                  <p className="tip-label">Lectura predictiva</p>
                  <div className="predictive-header">
                    <h3>{predictiveInsight.title}</h3>
                    <span className={`predictive-pill level-${predictiveInsight.level}`}>
                      {predictiveInsight.level === 'high'
                        ? 'Riesgo alto'
                        : predictiveInsight.level === 'medium'
                          ? 'Riesgo medio'
                          : 'Riesgo bajo'}
                    </span>
                  </div>
                  <p>{predictiveInsight.body}</p>
                  <small>{predictiveInsight.reason}</small>
                  <button type="button" onClick={handlePredictiveAction}>
                    {predictiveInsight.actionLabel}
                  </button>
                </article>

                <article className="panel tip-panel">
                  <p className="tip-label">{dailyRecommendation.label}</p>
                  <h3>{dailyRecommendation.title}</h3>
                  <p>{dailyRecommendation.body}</p>
                  <button type="button" onClick={handleRecommendationAction}>
                    {dailyRecommendation.actionLabel}
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
                        {entry.photoDataUrl ? (
                          <img
                            alt={`Registro visual de ${entry.title}`}
                            className="log-thumb-image"
                            src={entry.photoDataUrl}
                          />
                        ) : (
                          <div
                            className={`log-thumb severity-${entry.severity >= 4 ? 'high' : entry.severity >= 2 ? 'medium' : 'low'}`}
                          />
                        )}
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
                    <p className="helper-text calendar-state">Chile · {chileDateLabel} · {chileTimeLabel}</p>
                  </div>
                  <button type="button" onClick={() => setSelectedDate(todayKey)}>
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
                        setDraft(createEmptyDraft(patient?.id ?? 1))
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
                  <div className="custom-trigger-row">
                    <label className="field custom-trigger-field">
                      <span>Otro detonante</span>
                      <input
                        type="text"
                        value={customTriggerInput}
                        placeholder="Ej: vino tinto, lacteos, mariscos, polvo..."
                        onChange={(event) => setCustomTriggerInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            addCustomTrigger()
                          }
                        }}
                      />
                    </label>
                    <button
                      className="secondary-button custom-trigger-button"
                      disabled={!normalizeTriggerLabel(customTriggerInput)}
                      type="button"
                      onClick={addCustomTrigger}
                    >
                      Agregar
                    </button>
                  </div>
                </article>

                <article className="panel live-suggestion-panel">
                  <p className="tip-label">Sugerencia instantanea</p>
                  <div className="live-suggestion-header">
                    <h3>{draftRealtimeSuggestion.title}</h3>
                    <span className="live-suggestion-pill">En tiempo real</span>
                  </div>
                  <p>{draftRealtimeSuggestion.body}</p>
                </article>

                <article className="panel">
                  <div className="panel-header">
                    <h3>Evidencia visual</h3>
                    <span className="helper-text">
                      {isPreparingPhoto
                        ? 'Preparando imagen...'
                        : isUploadingEvidence
                          ? 'Subiendo evidencia...'
                          : 'Sube una foto de referencia'}
                    </span>
                  </div>
                  <div className="upload-placeholder">
                    <label className={`upload-box ${isPhotoBusy ? 'is-busy' : ''}`} htmlFor="entry-photo-upload">
                      <input
                        accept="image/*"
                        className="upload-input"
                        disabled={isPhotoBusy}
                        id="entry-photo-upload"
                        type="file"
                        onChange={(event) => void handlePhotoChange(event)}
                      />
                      <span>
                        {isPreparingPhoto
                          ? 'Cargando foto...'
                          : isUploadingEvidence
                            ? 'Subiendo a Drive...'
                            : draft.photoDataUrl
                              ? 'Cambiar foto'
                              : 'Subir foto'}
                      </span>
                    </label>
                    <div
                      className={`photo-preview ${draft.photoDataUrl ? 'has-image' : 'is-empty'} ${isPhotoBusy ? 'is-busy' : ''}`}
                    >
                      {isPhotoBusy ? (
                        <div className="photo-loading-indicator" aria-live="polite">
                          <span className="loading-dot" aria-hidden="true" />
                          <strong>{isPreparingPhoto ? 'Procesando imagen' : 'Subiendo evidencia'}</strong>
                          <small>
                            {isPreparingPhoto
                              ? 'Optimizando la foto para que cargue rapido.'
                              : 'Guardando el archivo visual junto al registro.'}
                          </small>
                        </div>
                      ) : null}
                      {draft.photoDataUrl ? (
                        <>
                          <img alt="Preview de evidencia visual" src={draft.photoDataUrl} />
                          <button
                            className="photo-remove-button"
                            disabled={isPhotoBusy}
                            type="button"
                            onClick={removeDraftPhoto}
                          >
                            Quitar
                          </button>
                        </>
                      ) : (
                        <span>La imagen quedara asociada a este registro.</span>
                      )}
                    </div>
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
                      {entry.photoDataUrl ? (
                        <div className="entry-photo-card">
                          <img alt={`Evidencia visual de ${entry.title}`} className="entry-photo" src={entry.photoDataUrl} />
                        </div>
                      ) : null}
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
                  <div className="auth-stack">
                    <button
                      className="secondary-button google-button"
                      disabled={isAuthenticating}
                      type="button"
                      onClick={() => void handleGoogleLogin()}
                    >
                      {isAuthenticating ? 'Conectando...' : 'Continuar con Google'}
                    </button>
                    <p className="helper-text auth-divider">o entra con correo y contrasena</p>
                    <form className="patient-form" onSubmit={(event) => void handleLogin(event)}>
                      <label className="field">
                        <span>Correo electronico</span>
                        <input
                          type="email"
                          value={authDraft.username}
                          onChange={(event) =>
                            setAuthDraft((current) => ({ ...current, username: event.target.value }))
                          }
                          placeholder="tu-correo@ejemplo.com"
                        />
                      </label>
                      <label className="field">
                        <span>Contrasena</span>
                        <input
                          type="password"
                          value={authDraft.password}
                          onChange={(event) =>
                            setAuthDraft((current) => ({ ...current, password: event.target.value }))
                          }
                        />
                      </label>
                      <button className="secondary-button" disabled={isAuthenticating} type="submit">
                        {isAuthenticating ? 'Entrando...' : 'Iniciar sesion'}
                      </button>
                    </form>
                  </div>
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
