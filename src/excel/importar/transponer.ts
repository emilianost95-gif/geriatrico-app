import { esFechaValida } from '../../lib/fechas'
import { normalizar, vacio } from '../../lib/texto'
import { reconocerEncabezado, type ColumnaId } from '../columnas'
import { celdaATexto, parsearFecha, type Celda } from './parsers'
import type { HojaCruda } from './tipos'

/**
 * Planillas "al revés": los campos van en filas (Presión, Pulso, Temperatura…)
 * y en las columnas van los pacientes (planilla de turno) o los días (control mensual).
 *
 *   Control      | Ana Díaz | Luis Soto          Día  | 1      | 2      | 3
 *   Presión      | 120/80   | 130/85             PA   | 120/80 | 125/80 | …
 *   Pulso        | 70       | 80                 FC   | 70     | 72     | …
 *
 * Se convierten a una tabla normal (una fila por paciente o por día) para que
 * el resto del importador las procese igual que cualquier otra.
 */

const UMBRAL = 0.7
const FILAS_MAX = 80

export type FormatoInvertido = 'pacientesEnColumnas' | 'fechasEnColumnas'

export interface ResultadoTransponer {
  hoja: HojaCruda
  formato: FormatoInvertido
  aviso?: string
}

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, sept: 9, set: 9, oct: 10, nov: 11, dic: 12,
}

/** "Septiembre 2026", "CONTROL MENSUAL SETIEMBRE", "09/2026", "mes: 9-2026" → { mes, anio? } */
export function buscarMesAnio(texto: string): { mes: number; anio?: number } | undefined {
  const n = normalizar(texto)
  for (const palabra of n.split(' ')) {
    const mes = MESES[palabra]
    if (mes && palabra.length >= 4) {
      const anio = n.match(/\b(20\d{2}|19\d{2})\b/)?.[1]
      return { mes, anio: anio ? Number(anio) : undefined }
    }
  }
  const m = String(texto).match(/\b(0?[1-9]|1[0-2])\s*[/-]\s*(20\d{2})\b/)
  if (m) return { mes: Number(m[1]), anio: Number(m[2]) }
  return undefined
}

function idDe(c: Celda): { id: ColumnaId; puntaje: number } {
  if (typeof c !== 'string' || !c.trim()) return { id: 'ignorar', puntaje: 0 }
  return reconocerEncabezado(c)
}

/** ¿El valor de un encabezado de columna parece una fecha o un número de día? */
function pareceFecha(c: Celda): boolean {
  if (c instanceof Date) return true
  if (typeof c === 'number') return (Number.isInteger(c) && c >= 1 && c <= 31) || (c > 20000 && c < 80000)
  const t = celdaATexto(c)
  if (/^\d{1,2}$/.test(t)) return Number(t) >= 1 && Number(t) <= 31
  return !!parsearFecha(t).valor && /\d/.test(t)
}

function pareceNombre(c: Celda): boolean {
  if (typeof c !== 'string') return false
  const t = c.trim()
  return /\p{L}{2,}/u.test(t) && !pareceFecha(t) && t.length <= 60
}

/**
 * Detecta si la hoja tiene los campos en una columna (en vez de en una fila).
 * Devuelve null si la hoja es "normal".
 */
export function transponerSiCorresponde(hoja: HojaCruda, filasHorizontales: number, anioHoy: number): ResultadoTransponer | null {
  const filas = hoja.filas.slice(0, FILAS_MAX)
  // 1. Buscar la columna de etiquetas (entre las 3 primeras)
  let mejor = { col: -1, ids: new Set<ColumnaId>(), filasEtiqueta: [] as number[] }
  for (let col = 0; col < 3; col++) {
    const ids = new Set<ColumnaId>()
    const filasEtiqueta: number[] = []
    filas.forEach((f, r) => {
      const m = idDe(f?.[col] ?? null)
      if (m.puntaje >= UMBRAL && m.id !== 'ignorar') {
        ids.add(m.id)
        filasEtiqueta.push(r)
      }
    })
    if (ids.size > mejor.ids.size) mejor = { col, ids, filasEtiqueta }
  }
  const camposDeDatos = [...mejor.ids].filter((id) => id !== 'fecha' && id !== 'paciente' && id !== 'apellido')
  if (camposDeDatos.length < 2 || mejor.ids.size <= filasHorizontales) return null
  const colEtiq = mejor.col

  // 2. Fila con las "claves" de cada columna (pacientes o días)
  const primeraEtiqueta = mejor.filasEtiqueta[0]
  let filaClaves = mejor.filasEtiqueta.find((r) => {
    const id = idDe(filas[r][colEtiq]).id
    return id === 'fecha' || id === 'paciente'
  })
  if (filaClaves == null) {
    for (let r = primeraEtiqueta - 1; r >= 0; r--) {
      const f = filas[r] ?? []
      if (f.slice(colEtiq + 1).filter((c) => !vacio(c)).length >= 1) {
        filaClaves = r
        break
      }
    }
  }
  if (filaClaves == null) return null
  const claves = hoja.filas[filaClaves] ?? []

  // 3. Columnas de datos: las que tienen clave
  const columnasDatos: number[] = []
  for (let j = colEtiq + 1; j < Math.max(claves.length, ...filas.map((f) => f?.length ?? 0)); j++) {
    if (!vacio(claves[j])) columnasDatos.push(j)
  }
  if (columnasDatos.length === 0) return null

  const idClaves = idDe(claves[colEtiq]).id
  const votosFecha = columnasDatos.filter((j) => pareceFecha(claves[j])).length
  const votosNombre = columnasDatos.filter((j) => pareceNombre(claves[j])).length
  const formato: FormatoInvertido =
    idClaves === 'fecha' || (idClaves !== 'paciente' && votosFecha > votosNombre) ? 'fechasEnColumnas' : 'pacientesEnColumnas'

  // 4. Mes y año para columnas con número de día (1..31)
  const titulos = [hoja.nombre, ...hoja.filas.slice(0, filaClaves).flatMap((f) => (f ?? []).map(celdaATexto))].join(' ')
  const mesAnio = buscarMesAnio(titulos)
  let aviso: string | undefined
  const fechaDeClave = (c: Celda): string | null => {
    if (typeof c === 'number' && Number.isInteger(c) && c >= 1 && c <= 31) c = String(c)
    const t = celdaATexto(c)
    if (/^\d{1,2}$/.test(t)) {
      if (!mesAnio) return null
      const anio = mesAnio.anio ?? anioHoy
      if (!mesAnio.anio) aviso = `No se encontró el año en el título: se usó ${anio}.`
      const d = Number(t)
      if (!esFechaValida(anio, mesAnio.mes, d)) return null
      return `${anio}-${String(mesAnio.mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
    return parsearFecha(c, anioHoy).valor ?? null
  }

  // 5. Armar la tabla normal
  const filasCampos: number[] = []
  hoja.filas.forEach((f, r) => {
    if (r === filaClaves || r < Math.min(filaClaves, primeraEtiqueta)) return
    if (!vacio(f?.[colEtiq])) filasCampos.push(r)
  })
  const claveTitulo = formato === 'fechasEnColumnas' ? 'Fecha' : 'Paciente'
  const encabezado: Celda[] = [claveTitulo, ...filasCampos.map((r) => celdaATexto(hoja.filas[r][colEtiq]))]
  const nuevas: Celda[][] = []
  const etiquetas: (string | undefined)[] = []
  // Títulos originales (para que se detecte la fecha o el paciente del encabezado de la planilla)
  for (let r = 0; r < Math.min(filaClaves, primeraEtiqueta); r++) {
    const texto = (hoja.filas[r] ?? []).map(celdaATexto).filter(Boolean).join(' ')
    if (texto) {
      nuevas.push([texto])
      etiquetas.push(`fila ${r + 1}`)
    }
  }
  nuevas.push(encabezado)
  etiquetas.push(`columna ${letra(colEtiq)}`)
  let sinMes = 0
  for (const j of columnasDatos) {
    let clave: Celda = claves[j]
    if (formato === 'fechasEnColumnas') {
      const f = fechaDeClave(clave)
      if (!f) {
        sinMes++
        continue
      }
      clave = f
    }
    const fila: Celda[] = [clave, ...filasCampos.map((r) => hoja.filas[r]?.[j] ?? null)]
    if (fila.slice(1).every((c) => vacio(c))) continue
    nuevas.push(fila)
    etiquetas.push(`columna ${letra(j)}`)
  }
  if (sinMes) {
    aviso = `${sinMes} columnas tienen solo el número de día y no se encontró el mes en el título ni en el nombre de la hoja. Escribí el mes (ej. "Septiembre 2026") en la primera fila.`
  }
  return {
    formato,
    aviso,
    hoja: { nombre: hoja.nombre, filas: nuevas, etiquetasFila: etiquetas },
  }
}

function letra(i: number): string {
  let s = ''
  let n = i + 1
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/** Hoja sin títulos con una lista de nombres (ej. pestaña "Residentes"). */
export function esListaSinTitulos(hoja: HojaCruda): boolean {
  const n = normalizar(hoja.nombre)
  if (!/(paciente|residente|interno|adulto|abuelo|listado|lista|padron|nomina)/.test(n)) return false
  const col = hoja.filas.map((f) => f?.[0] ?? null).filter((c) => !vacio(c))
  return col.length > 0 && col.filter(pareceNombre).length / col.length >= 0.8
}
