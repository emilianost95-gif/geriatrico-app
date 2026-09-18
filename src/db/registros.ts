import { CAMPOS_TEXTO } from '../domain/campos'
import type { FechaISO, Registro, RegistroNuevo } from '../domain/tipos'
import { ordenarTomas, tomaSinDatos } from '../lib/tomas'
import { db as dbPorDefecto, type GeriatricoDB } from './database'

export class RegistroDuplicadoError extends Error {
  constructor() {
    super('Ya existe un registro de este paciente para ese día.')
  }
}

/** Saca tomas vacías, recorta textos y deja undefined lo que está en blanco. */
export function limpiarRegistro(r: RegistroNuevo): RegistroNuevo {
  const limpio: RegistroNuevo = {
    pacienteId: r.pacienteId,
    fecha: r.fecha,
    tomas: ordenarTomas(r.tomas.filter((t) => !tomaSinDatos(t)).map((t) => ({ ...t, nota: t.nota?.trim() || undefined }))),
    alimentacion: {
      estado: r.alimentacion?.estado ?? '',
      comentario: r.alimentacion?.comentario?.trim() || undefined,
    },
  }
  for (const c of CAMPOS_TEXTO) {
    const v = r[c.clave]?.trim()
    if (v) limpio[c.clave] = v
  }
  return limpio
}

export function registroVacio(r: RegistroNuevo): boolean {
  const l = limpiarRegistro(r)
  return (
    l.tomas.length === 0 &&
    !l.alimentacion.estado &&
    !l.alimentacion.comentario &&
    CAMPOS_TEXTO.every((c) => !l[c.clave])
  )
}

export async function obtenerRegistro(pacienteId: number, fecha: FechaISO, db: GeriatricoDB = dbPorDefecto) {
  return db.registros.where('[pacienteId+fecha]').equals([pacienteId, fecha]).first()
}

/**
 * Guarda un registro. Si viene `id` lo actualiza; si no, crea uno nuevo.
 * Nunca permite dos registros del mismo paciente el mismo día.
 */
export async function guardarRegistro(
  datos: RegistroNuevo & { id?: number },
  db: GeriatricoDB = dbPorDefecto,
): Promise<number> {
  if (!datos.pacienteId) throw new Error('Elegí un paciente.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha)) throw new Error('La fecha no es válida.')
  const limpio = limpiarRegistro(datos)
  const ahora = Date.now()

  return db.transaction('rw', db.registros, async () => {
    const existente = await obtenerRegistro(limpio.pacienteId, limpio.fecha, db)
    if (datos.id != null) {
      if (existente && existente.id !== datos.id) throw new RegistroDuplicadoError()
      const anterior = await db.registros.get(datos.id)
      // put() reemplaza el objeto entero: así se borran campos que quedaron vacíos
      await db.registros.put({ ...limpio, id: datos.id, creadoEn: anterior?.creadoEn ?? ahora, actualizadoEn: ahora })
      return datos.id
    }
    if (existente) throw new RegistroDuplicadoError()
    return (await db.registros.add({ ...limpio, creadoEn: ahora, actualizadoEn: ahora })) as number
  })
}

export async function eliminarRegistro(id: number, db: GeriatricoDB = dbPorDefecto) {
  await db.registros.delete(id)
}

export interface FiltroRegistros {
  pacienteId?: number
  /** Varios pacientes (si viene, tiene prioridad sobre pacienteId) */
  pacienteIds?: number[]
  desde?: FechaISO
  hasta?: FechaISO
}

/** Registros filtrados, del más nuevo al más viejo. */
export async function consultarRegistros(f: FiltroRegistros = {}, db: GeriatricoDB = dbPorDefecto): Promise<Registro[]> {
  const desde = f.desde || '0000-01-01'
  const hasta = f.hasta || '9999-12-31'
  let lista: Registro[]
  if (f.pacienteIds) {
    if (f.pacienteIds.length === 0) return []
    const ids = new Set(f.pacienteIds)
    lista = await db.registros
      .where('fecha')
      .between(desde, hasta, true, true)
      .filter((r) => ids.has(r.pacienteId))
      .toArray()
  } else if (f.pacienteId != null) {
    lista = await db.registros
      .where('[pacienteId+fecha]')
      .between([f.pacienteId, desde], [f.pacienteId, hasta], true, true)
      .toArray()
  } else {
    lista = await db.registros.where('fecha').between(desde, hasta, true, true).toArray()
  }
  return lista.sort((a, b) => b.fecha.localeCompare(a.fecha) || a.pacienteId - b.pacienteId)
}
