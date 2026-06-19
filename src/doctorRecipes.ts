import type { DoctorRecipe } from './types'

type DoctorRecipeDraft = {
  title: string
  category: DoctorRecipe['category']
  instructions: string
  schedule: string
}

function getDoctorRecipesStorageKey(userId: string | null) {
  return `dermatips-doctor-recipes-${userId ?? 'guest'}`
}

export const doctorRecipeTemplates: Array<DoctorRecipeDraft> = [
  {
    title: 'Rutina AM de barrera',
    category: 'Rutina AM',
    instructions:
      'Limpieza suave, crema hidratante con barrera y protector solar. Evitar exfoliantes o cambios bruscos mientras haya sensibilidad.',
    schedule: 'Manana',
  },
  {
    title: 'Rutina PM reparadora',
    category: 'Rutina PM',
    instructions:
      'Limpieza suave nocturna, crema reparadora y observacion de picor o enrojecimiento antes de dormir.',
    schedule: 'Noche',
  },
  {
    title: 'Plan para brote activo',
    category: 'Brote activo',
    instructions:
      'Reducir friccion, evitar calor excesivo, simplificar rutina y registrar detonantes del dia. Recomendar control medico si escala rapido.',
    schedule: 'Todo el dia',
  },
  {
    title: 'Mantenimiento de piel estable',
    category: 'Mantenimiento',
    instructions:
      'Mantener rutina corta, hidratacion constante, protector solar y seguimiento de cambios leves para prevenir recaidas.',
    schedule: 'Diario',
  },
]

export function loadDoctorRecipes(userId: string | null, patientId: number) {
  if (typeof window === 'undefined') {
    return [] as DoctorRecipe[]
  }

  const storageKey = getDoctorRecipesStorageKey(userId)

  try {
    const raw = window.localStorage.getItem(storageKey)
    const recipes = raw ? (JSON.parse(raw) as DoctorRecipe[]) : []
    return recipes.filter((recipe) => recipe.patientId === patientId)
  } catch {
    return []
  }
}

export function saveDoctorRecipe(userId: string | null, patientId: number, draft: DoctorRecipeDraft) {
  if (typeof window === 'undefined') {
    return [] as DoctorRecipe[]
  }

  const storageKey = getDoctorRecipesStorageKey(userId)
  const nextRecipe: DoctorRecipe = {
    id: `recipe-${Date.now()}-${Math.round(Math.random() * 1000)}`,
    patientId,
    title: draft.title.trim(),
    category: draft.category,
    instructions: draft.instructions.trim(),
    schedule: draft.schedule.trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  try {
    const raw = window.localStorage.getItem(storageKey)
    const current = raw ? (JSON.parse(raw) as DoctorRecipe[]) : []
    const next = [nextRecipe, ...current]
    window.localStorage.setItem(storageKey, JSON.stringify(next))
    return next.filter((recipe) => recipe.patientId === patientId)
  } catch {
    return [nextRecipe]
  }
}

export function deleteDoctorRecipe(userId: string | null, patientId: number, recipeId: string) {
  if (typeof window === 'undefined') {
    return [] as DoctorRecipe[]
  }

  const storageKey = getDoctorRecipesStorageKey(userId)

  try {
    const raw = window.localStorage.getItem(storageKey)
    const current = raw ? (JSON.parse(raw) as DoctorRecipe[]) : []
    const next = current.filter((recipe) => recipe.id !== recipeId)
    window.localStorage.setItem(storageKey, JSON.stringify(next))
    return next.filter((recipe) => recipe.patientId === patientId)
  } catch {
    return []
  }
}
