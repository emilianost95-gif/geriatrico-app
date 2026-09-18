import { guardarAjuste, leerAjuste } from '../db/ajustes'
import { db as dbPorDefecto, type GeriatricoDB } from '../db/database'
import { limpiarRegistro } from '../db/registros'
import type { Paciente, Registro } from '../domain/tipos'
import { combinar } from '../excel/importar/plan'
import { entregarArchivo } from './archivos'
import { hoyISO } from './fechas'
import { esNativo } from './plataforma'
import { claveNombre } from './texto'

/**
 * Copias de seguridad en JSON: guardan TODO tal cual (pacientes, registros y ajustes),
 * así se pueden restaurar sin perder nada.
 */
export interface CopiaSeguridad {
  app: 'registro-geriatrico'
  version: 1
  creada: string
  nombreHogar?: string
  pacientes: Paciente[]
  registros: Registro[]
}

export const CARPETA_COPIAS = 'RegistroGeriatrico'
const COPIAS_A_CONSERVAR = 14

export async function crearCopia(db: GeriatricoDB = dbPorDefecto): Promise<CopiaSeguridad> {
  const [pacientes, registros, nombreHogar] = await Promise.all([
    db.pacientes.toArray(),
    db.registros.toArray(),
    leerAjuste('nombreHogar', db),
  ])
  return { app: 'registro-geriatrico', version: 1, creada: new Date().toISOString(), nombreHogar, pacientes, registros }
}

export async function registrarCopiaHecha(db: GeriatricoDB = dbPorDefecto) {
  await guardarAjuste('ultimaCopia', new Date().toISOString(), db)
}

function nombreArchivoCopia(): string {
  const d = new Date()
  const hora = `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`
  return `registro-geriatrico-copia-${hoyISO()}-${hora}.json`
}

/** Copia manual: descarga (web) o menú compartir (APK). */
export async function descargarCopia(db: GeriatricoDB = dbPorDefecto) {
  const copia = await crearCopia(db)
  const blob = new Blob([JSON.stringify(copia)], { type: 'application/json' })
  await entregarArchivo(blob, nombreArchivoCopia())
  await registrarCopiaHecha(db)
  return copia
}

export class CopiaInvalidaError extends Error {}

/** Revisa que el archivo sea una copia de esta app y la devuelve. */
export function validarCopia(texto: string): CopiaSeguridad {
  let datos: unknown
  try {
    datos = JSON.parse(texto)
  } catch {
    throw new CopiaInvalidaError('El archivo no es una copia de seguridad válida (no se pudo leer).')
  }
  const c = datos as Partial<CopiaSeguridad>
  if (c?.app !== 'registro-geriatrico' || !Array.isArray(c.pacientes) || !Array.isArray(c.registros)) {
    throw new CopiaInvalidaError('Este archivo no es una copia de seguridad del Registro Geriátrico.')
  }
  if (c.version !== 1) throw new CopiaInvalidaError('La copia es de una versión más nueva de la app. Actualizá la app primero.')
  for (const p of c.pacientes) {
    if (typeof p?.nombre !== 'string' || typeof p.id !== 'number') throw new CopiaInvalidaError('La copia tiene pacientes dañados.')
  }
  for (const r of c.registros) {
    if (typeof r?.pacienteId !== 'number' || !/^\d{4}-\d{2}-\d{2}$/.test(String(r.fecha)) || !Array.isArray(r.tomas)) {
      throw new CopiaInvalidaError('La copia tiene registros dañados.')
    }
  }
  return c as CopiaSeguridad
}

export type ModoRestaurar = 'combinar' | 'reemplazar'

export interface ResultadoRestaurar {
  pacientesNuevos: number
  registrosNuevos: number
  registrosCombinados: number
}

/**
 * Restaura una copia.
 * - reemplazar: borra todo y deja los datos exactamente como en la copia.
 * - combinar: suma lo que falta sin borrar nada (útil para juntar dos tablets).
 */
export async function restaurarCopia(
  copia: CopiaSeguridad,
  modo: ModoRestaurar,
  db: GeriatricoDB = dbPorDefecto,
): Promise<ResultadoRestaurar> {
  const res: ResultadoRestaurar = { pacientesNuevos: 0, registrosNuevos: 0, registrosCombinados: 0 }
  await db.transaction('rw', db.pacientes, db.registros, db.ajustes, async () => {
    if (modo === 'reemplazar') {
      await db.registros.clear()
      await db.pacientes.clear()
      await db.pacientes.bulkAdd(copia.pacientes)
      await db.registros.bulkAdd(copia.registros)
      res.pacientesNuevos = copia.pacientes.length
      res.registrosNuevos = copia.registros.length
    } else {
      const existentes = await db.pacientes.toArray()
      const porClave = new Map(existentes.map((p) => [p.nombreClave || claveNombre(p.nombre), p.id!]))
      const mapaIds = new Map<number, number>()
      for (const p of copia.pacientes) {
        const clave = p.nombreClave || claveNombre(p.nombre)
        const id = porClave.get(clave)
        if (id != null) {
          mapaIds.set(p.id!, id)
          continue
        }
        const { id: _viejo, ...sinId } = p
        void _viejo
        const nuevo = (await db.pacientes.add({ ...sinId, nombreClave: clave })) as number
        porClave.set(clave, nuevo)
        mapaIds.set(p.id!, nuevo)
        res.pacientesNuevos++
      }
      for (const r of copia.registros) {
        const pacienteId = mapaIds.get(r.pacienteId)
        if (pacienteId == null) continue
        const previo = await db.registros.where('[pacienteId+fecha]').equals([pacienteId, r.fecha]).first()
        const { id: _v, creadoEn, actualizadoEn, ...datos } = r
        void _v
        if (previo) {
          const unido = combinar(limpiarRegistro(previo), limpiarRegistro({ ...datos, pacienteId }))
          await db.registros.put({ ...unido, id: previo.id, creadoEn: previo.creadoEn, actualizadoEn: Date.now() })
          res.registrosCombinados++
        } else {
          await db.registros.add({ ...limpiarRegistro({ ...datos, pacienteId }), creadoEn, actualizadoEn })
          res.registrosNuevos++
        }
      }
    }
    if (copia.nombreHogar && !(await leerAjuste('nombreHogar', db))) await guardarAjuste('nombreHogar', copia.nombreHogar, db)
  })
  return res
}

// ─────────────────────── Copia automática (solo APK) ───────────────────────

export interface CopiaGuardada {
  nombre: string
  ruta: string
  fecha: number
  tamano: number
}

async function fs() {
  return import('@capacitor/filesystem')
}

/**
 * Una vez por día, al abrir la app, guarda una copia en
 * Documentos/RegistroGeriatrico. Esa carpeta NO se borra si se desinstala la app.
 * Devuelve la ruta guardada, null si no hacía falta, o lanza un error.
 */
export async function copiaAutomaticaSiCorresponde(db: GeriatricoDB = dbPorDefecto): Promise<string | null> {
  if (!esNativo) return null
  if (!(await leerAjuste('copiaAutomatica', db))) return null
  const ultima = await leerAjuste('ultimaCopiaAutoArchivo', db)
  const nombre = `copia-${hoyISO()}.json`
  if (ultima.includes(`copia-${hoyISO()}`)) return null
  if ((await db.pacientes.count()) === 0) return null

  const { Filesystem, Directory, Encoding } = await fs()
  try {
    const permiso = await Filesystem.checkPermissions()
    if (permiso.publicStorage !== 'granted') await Filesystem.requestPermissions()
  } catch {
    /* en Android 11+ no hace falta permiso para escribir sus propios archivos */
  }
  const copia = await crearCopia(db)
  const datos = JSON.stringify(copia)
  let ruta = `${CARPETA_COPIAS}/${nombre}`
  const escribir = (path: string) =>
    Filesystem.writeFile({ path, data: datos, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true })
  try {
    await escribir(ruta)
  } catch {
    // Si la app se reinstaló, Android no deja pisar archivos de la instalación anterior
    ruta = `${CARPETA_COPIAS}/${nombre.replace('.json', `-${Date.now()}.json`)}`
    await escribir(ruta)
  }
  await guardarAjuste('ultimaCopiaAutoArchivo', ruta, db)
  await registrarCopiaHecha(db)

  // Conservar solo las últimas copias
  try {
    const lista = await listarCopiasAutomaticas()
    for (const vieja of lista.slice(COPIAS_A_CONSERVAR)) {
      await Filesystem.deleteFile({ path: vieja.ruta, directory: Directory.Documents })
    }
  } catch {
    /* limpiar es opcional */
  }
  return ruta
}

export async function listarCopiasAutomaticas(): Promise<CopiaGuardada[]> {
  if (!esNativo) return []
  const { Filesystem, Directory } = await fs()
  try {
    const { files } = await Filesystem.readdir({ path: CARPETA_COPIAS, directory: Directory.Documents })
    return files
      .filter((f) => f.type === 'file' && f.name.endsWith('.json'))
      .map((f) => ({ nombre: f.name, ruta: `${CARPETA_COPIAS}/${f.name}`, fecha: f.mtime, tamano: f.size }))
      .sort((a, b) => b.nombre.localeCompare(a.nombre))
  } catch {
    return []
  }
}

export async function leerCopiaAutomatica(ruta: string): Promise<CopiaSeguridad> {
  const { Filesystem, Directory, Encoding } = await fs()
  const { data } = await Filesystem.readFile({ path: ruta, directory: Directory.Documents, encoding: Encoding.UTF8 })
  return validarCopia(typeof data === 'string' ? data : await data.text())
}

/** Días desde la última copia (Infinity si nunca se hizo). */
export function diasDesde(iso: string): number {
  if (!iso) return Infinity
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}
