/** Quita tildes, pasa a minúsculas, reemplaza signos por espacios y colapsa espacios. */
export function normalizar(texto: unknown): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[º°]/g, ' ')
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/** Clave para comparar nombres: ignora orden de palabras ("Pérez, Juan" = "Juan Perez"). */
const TRATAMIENTOS = new Set(['sr', 'sra', 'srta', 'don', 'dona', 'dr', 'dra'])

export function claveNombre(nombre: string): string {
  const palabras = normalizar(nombre).split(' ').filter(Boolean)
  // "Sra. María González" = "María González"
  while (palabras.length > 2 && TRATAMIENTOS.has(palabras[0])) palabras.shift()
  return palabras.sort().join(' ')
}

/** Nombre prolijo: "  maria   GONZALEZ " → "Maria Gonzalez" */
export function nombrePropio(nombre: string): string {
  return String(nombre)
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('es')
    .replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, letra: string) => sep + letra.toLocaleUpperCase('es'))
}

/** Distancia de Levenshtein (cantidad mínima de letras a cambiar). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

/** Similitud entre 0 y 1 (1 = iguales). */
export function similitud(a: string, b: string): number {
  const max = Math.max(a.length, b.length)
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max
}

export function vacio(v: unknown): boolean {
  return v == null || (typeof v === 'string' && v.trim() === '')
}
