import type { WeatherSnapshot } from './types'

type OpenMeteoForecastResponse = {
  current?: {
    temperature_2m: number
    apparent_temperature: number
    relative_humidity_2m: number
    precipitation: number
    weather_code: number
    wind_speed_10m: number
  }
  daily?: {
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    uv_index_max: number[]
  }
}

type OpenMeteoGeocodingResponse = {
  results?: Array<{
    id: number
    name: string
    country?: string
    admin1?: string
    latitude: number
    longitude: number
  }>
}

export type WeatherLocationCandidate = {
  label: string
  latitude: number
  longitude: number
}

function toLocationLabel(name: string, admin1?: string, country?: string) {
  return [name, admin1, country].filter(Boolean).join(', ')
}

export async function searchWeatherLocations(query: string) {
  const trimmedQuery = query.trim()

  if (trimmedQuery.length < 2) {
    return []
  }

  const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
  url.searchParams.set('name', trimmedQuery)
  url.searchParams.set('count', '5')
  url.searchParams.set('language', 'es')

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error('weather/search-failed')
  }

  const payload = (await response.json()) as OpenMeteoGeocodingResponse

  return (payload.results ?? []).map((item) => ({
    label: toLocationLabel(item.name, item.admin1, item.country),
    latitude: item.latitude,
    longitude: item.longitude,
  }))
}

export async function fetchWeatherSnapshot(location: WeatherLocationCandidate) {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(location.latitude))
  url.searchParams.set('longitude', String(location.longitude))
  url.searchParams.set(
    'current',
    'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m',
  )
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,uv_index_max')
  url.searchParams.set('forecast_days', '1')
  url.searchParams.set('timezone', 'auto')

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error('weather/fetch-failed')
  }

  const payload = (await response.json()) as OpenMeteoForecastResponse

  if (!payload.current || !payload.daily) {
    throw new Error('weather/incomplete-response')
  }

  const snapshot: WeatherSnapshot = {
    locationLabel: location.label,
    latitude: location.latitude,
    longitude: location.longitude,
    temperature: payload.current.temperature_2m,
    apparentTemperature: payload.current.apparent_temperature,
    humidity: payload.current.relative_humidity_2m,
    precipitation: payload.current.precipitation,
    windSpeed: payload.current.wind_speed_10m,
    weatherCode: payload.current.weather_code,
    uvIndexMax: payload.daily.uv_index_max?.[0] ?? 0,
    temperatureMax: payload.daily.temperature_2m_max?.[0] ?? payload.current.temperature_2m,
    temperatureMin: payload.daily.temperature_2m_min?.[0] ?? payload.current.temperature_2m,
    fetchedAt: new Date().toISOString(),
  }

  return snapshot
}

export function getWeatherLabel(code: number) {
  if (code === 0) {
    return 'Despejado'
  }

  if ([1, 2].includes(code)) {
    return 'Parcialmente nublado'
  }

  if (code === 3) {
    return 'Nublado'
  }

  if ([45, 48].includes(code)) {
    return 'Neblina'
  }

  if ([51, 53, 55, 56, 57].includes(code)) {
    return 'Llovizna'
  }

  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return 'Lluvia'
  }

  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return 'Nieve'
  }

  if ([95, 96, 99].includes(code)) {
    return 'Tormenta'
  }

  return 'Variable'
}

export function buildWeatherSkinAdvice(weather: WeatherSnapshot) {
  if (weather.temperature <= 10) {
    return 'Hace frio. Refuerza crema barrera, evita agua muy caliente y protege mejillas y manos.'
  }

  if (weather.uvIndexMax >= 7) {
    return 'UV alto hoy. Protector solar y reaplicacion son clave, especialmente si la piel esta sensible.'
  }

  if (weather.humidity <= 35) {
    return 'El ambiente viene seco. Conviene hidratar mas y evitar limpiadores agresivos.'
  }

  if (weather.precipitation > 0) {
    return 'Hay precipitacion o humedad activa. Mantén la piel limpia y seca si notas roce o incomodidad.'
  }

  if (weather.windSpeed >= 24) {
    return 'Hay bastante viento. Protege la barrera cutanea antes de salir para evitar irritacion.'
  }

  if (weather.apparentTemperature >= 28) {
    return 'Se siente calor. Evita sobrecalentamiento, sudor prolongado y productos pesados.'
  }

  return 'Condiciones relativamente amables hoy. Mantén una rutina simple y observa cualquier cambio leve.'
}
