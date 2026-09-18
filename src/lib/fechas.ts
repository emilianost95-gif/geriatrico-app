import type { FechaISO } from '../domain/tipos'

const pad = (n: number) => String(n).padStart(2, '0')

export function aISO(d: Date): FechaISO {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function hoyISO(): FechaISO {
  return aISO(new Date())
}

export function horaActual(): string {
  const d = new Date()
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function sumarDias(fecha: FechaISO, dias: number): FechaISO {
  const [y, m, d] = fecha.split('-').map(Number)
  return aISO(new Date(y, m - 1, d + dias))
}

export function isoADate(fecha: FechaISO): Date {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** "16/09/2026" */
export function fechaCorta(fecha: FechaISO): string {
  const [y, m, d] = fecha.split('-')
  return `${d}/${m}/${y}`
}

/** "miércoles 16 de septiembre de 2026" */
export function fechaLarga(fecha: FechaISO): string {
  return isoADate(fecha).toLocaleDateString('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function esFechaValida(y: number, m: number, d: number): boolean {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1) return false
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

export function edad(fechaNacimiento?: FechaISO): number | undefined {
  if (!fechaNacimiento) return undefined
  const n = isoADate(fechaNacimiento)
  const h = new Date()
  let e = h.getFullYear() - n.getFullYear()
  if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) e--
  return e
}
