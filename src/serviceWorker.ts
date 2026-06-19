import type { Page } from './types'

export type ReminderNotificationPayload = {
  id: string
  title: string
  body: string
  page: Page
  date?: string
}

export function isSystemNotificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator
}

export function getSystemNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isSystemNotificationSupported()) {
    return 'unsupported'
  }

  return window.Notification.permission
}

export async function requestSystemNotificationPermission() {
  if (!isSystemNotificationSupported()) {
    return 'unsupported' as const
  }

  return window.Notification.requestPermission()
}

export async function registerAppServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null
  }

  try {
    return await navigator.serviceWorker.register('/sw.js')
  } catch {
    return null
  }
}

function buildNotificationUrl(page: Page, date?: string) {
  const url = new URL('/', window.location.origin)
  url.searchParams.set('page', page)

  if (date) {
    url.searchParams.set('date', date)
  }

  return `${url.pathname}${url.search}`
}

export async function showReminderNotification(payload: ReminderNotificationPayload) {
  if (!isSystemNotificationSupported() || window.Notification.permission !== 'granted') {
    return false
  }

  const registration = await navigator.serviceWorker.ready

  await registration.showNotification(payload.title, {
    body: payload.body,
    tag: payload.id,
    badge: '/favicon.svg',
    icon: '/favicon.svg',
    data: {
      page: payload.page,
      date: payload.date,
      url: buildNotificationUrl(payload.page, payload.date),
    },
  })

  return true
}
