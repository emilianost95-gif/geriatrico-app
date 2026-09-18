import type { Paciente } from '../domain/tipos'
import { claveNombre, nombrePropio } from '../lib/texto'
import { db as dbPorDefecto, type GeriatricoDB } from './database'

export type DatosPaciente = Pick<
  Paciente,
  'nombre' | 'habitacion' | 'documento' | 'fechaNacimiento' | 'contacto' | 'notas'
>

function limpiar(datos: DatosPaciente) {
  const nombre = nombrePropio(datos.nombre)
  if (!nombre) throw new Error('El nombre del paciente es obligatorio.')
  const t = (v?: string) => v?.trim() || undefined
  return {
    nombre,
    nombreClave: claveNombre(nombre),
    habitacion: t(datos.habitacion),
    documento: t(datos.documento),
    fechaNacimiento: t(datos.fechaNacimiento),
    contacto: t(datos.contacto),
    notas: t(datos.notas),
  }
}

/** Busca otro paciente con el mismo nombre (ignorando tildes, mayúsculas y orden). */
export async function buscarMismoNombre(nombre: string, excluirId?: number, db: GeriatricoDB = dbPorDefecto) {
  const lista = await db.pacientes.where('nombreClave').equals(claveNombre(nombre)).toArray()
  return lista.find((p) => p.id !== excluirId)
}

export async function crearPaciente(datos: DatosPaciente, db: GeriatricoDB = dbPorDefecto): Promise<number> {
  const ahora = Date.now()
  const id = await db.pacientes.add({ ...limpiar(datos), activo: true, creadoEn: ahora, actualizadoEn: ahora })
  return id as number
}

export async function actualizarPaciente(id: number, datos: DatosPaciente, db: GeriatricoDB = dbPorDefecto) {
  await db.pacientes.update(id, { ...limpiar(datos), actualizadoEn: Date.now() })
}

export async function cambiarActivo(id: number, activo: boolean, db: GeriatricoDB = dbPorDefecto) {
  await db.pacientes.update(id, { activo, actualizadoEn: Date.now() })
}

/** Borra el paciente y TODOS sus registros. */
export async function eliminarPaciente(id: number, db: GeriatricoDB = dbPorDefecto) {
  await db.transaction('rw', db.pacientes, db.registros, async () => {
    await db.registros.where('pacienteId').equals(id).delete()
    await db.pacientes.delete(id)
  })
}

export async function listarPacientes(db: GeriatricoDB = dbPorDefecto): Promise<Paciente[]> {
  const lista = await db.pacientes.toArray()
  return lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}
