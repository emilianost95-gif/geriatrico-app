import { CAMPOS_TOMA } from '../domain/campos'
import type { TomaSignos } from '../domain/tipos'

export function nuevoId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function tomaVacia(hora?: string): TomaSignos {
  return { id: nuevoId(), hora }
}

/** true si la toma no tiene ningún valor cargado (la hora sola no cuenta). */
export function tomaSinDatos(t: TomaSignos): boolean {
  return CAMPOS_TOMA.every((c) => t[c.clave] == null) && !t.nota?.trim()
}

const num = (n?: number) => (n == null ? '' : String(n).replace('.', ','))

/** "PA 120/80 · FC 72 · T° 36,5 · SatO₂ 96% · FR 16 · Gluc 110" */
export function resumenToma(t: TomaSignos): string {
  const partes: string[] = []
  if (t.sistolica != null || t.diastolica != null) partes.push(`PA ${num(t.sistolica) || '?'}/${num(t.diastolica) || '?'}`)
  if (t.frecuenciaCardiaca != null) partes.push(`FC ${num(t.frecuenciaCardiaca)}`)
  if (t.temperatura != null) partes.push(`T° ${num(t.temperatura)}`)
  if (t.saturacion != null) partes.push(`SatO2 ${num(t.saturacion)}%`)
  if (t.frecuenciaRespiratoria != null) partes.push(`FR ${num(t.frecuenciaRespiratoria)}`)
  if (t.glucemia != null) partes.push(`Gluc ${num(t.glucemia)}`)
  if (t.nota?.trim()) partes.push(t.nota.trim())
  return (t.hora ? `${t.hora} · ` : '') + partes.join(' · ')
}

/** Huella de una toma para detectar duplicados al importar. */
export function huellaToma(t: TomaSignos): string {
  return [t.hora ?? '', ...CAMPOS_TOMA.map((c) => t[c.clave] ?? '')].join('|')
}

export function ordenarTomas(tomas: TomaSignos[]): TomaSignos[] {
  return [...tomas].sort((a, b) => (a.hora ?? '99').localeCompare(b.hora ?? '99'))
}
