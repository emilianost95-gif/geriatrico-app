import Dexie, { type EntityTable } from 'dexie'
import type { Paciente, Registro } from '../domain/tipos'

/** Preferencias y estado de la app (nombre del hogar, última copia de seguridad…) */
export interface Ajuste {
  clave: string
  valor: unknown
}

export class GeriatricoDB extends Dexie {
  pacientes!: EntityTable<Paciente, 'id'>
  registros!: EntityTable<Registro, 'id'>
  ajustes!: EntityTable<Ajuste, 'clave'>

  constructor(nombre = 'geriatrico') {
    super(nombre)
    // Índices: solo los campos por los que se busca u ordena.
    // &[pacienteId+fecha] → un único registro por paciente por día.
    this.version(1).stores({
      pacientes: '++id, nombreClave, nombre, activo',
      registros: '++id, &[pacienteId+fecha], pacienteId, fecha',
    })
    // v2: tabla de ajustes (no cambia los datos existentes)
    this.version(2).stores({
      ajustes: 'clave',
    })
  }
}

const real = new GeriatricoDB()
/** Base aparte para el modo demo: nunca se mezcla con los datos reales */
const demo = new GeriatricoDB('geriatrico-demo')
let activa: GeriatricoDB = real

/**
 * `db` apunta siempre a la base activa (la real o la de demostración).
 * Es un proxy para que todos los módulos sigan importando `db` sin enterarse del cambio.
 */
export const db = new Proxy({} as GeriatricoDB, {
  get: (_, clave: string | symbol) => {
    const v = (activa as unknown as Record<string | symbol, unknown>)[clave]
    return typeof v === 'function' ? v.bind(activa) : v
  },
  set: (_, clave: string | symbol, valor: unknown) => {
    ;(activa as unknown as Record<string | symbol, unknown>)[clave] = valor
    return true
  },
}) as GeriatricoDB

export const dbReal = real
export const dbDemo = demo
export const enDemo = () => activa === demo
/** Cambia la base activa. La app se vuelve a dibujar desde App.tsx. */
export function usarBase(cual: 'real' | 'demo') {
  activa = cual === 'demo' ? demo : real
}

/**
 * Pide al navegador que no borre los datos aunque falte espacio.
 * Devuelve true si quedó persistente.
 */
export async function pedirAlmacenamientoPersistente(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
