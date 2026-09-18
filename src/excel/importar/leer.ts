import type { CellValue, Workbook } from 'exceljs'
import type { Celda } from './parsers'
import type { HojaCruda } from './tipos'

async function cargarExcelJS() {
  const mod = await import('exceljs')
  // En el navegador el módulo viene envuelto en "default"
  return (mod as unknown as { default?: typeof mod }).default ?? mod
}

/** Convierte cualquier valor de ExcelJS (fórmulas, texto enriquecido, links) en un valor simple. */
export function aplanarCelda(v: CellValue): Celda {
  if (v == null) return null
  if (typeof v === 'string') return v.trim() === '' ? null : v
  if (typeof v === 'number' || typeof v === 'boolean' || v instanceof Date) return v
  if (typeof v === 'object') {
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((p) => p.text).join('') || null
    if ('result' in v) return aplanarCelda((v as { result?: CellValue }).result ?? null)
    if ('text' in v) return aplanarCelda((v as { text: CellValue }).text)
    if ('error' in v) return null
  }
  return String(v)
}

export function hojasDesdeWorkbook(wb: Workbook): HojaCruda[] {
  const hojas: HojaCruda[] = []
  wb.eachSheet((ws) => {
    if (ws.state && ws.state !== 'visible') return
    const filas: Celda[][] = []
    // Valores de celdas combinadas: se repite el valor de la celda principal
    const combinadas = new Map<string, Celda>()
    const merges = (ws.model as { merges?: string[] }).merges ?? []
    for (const rango of merges) {
      const [ini, fin] = rango.split(':')
      const a = ws.getCell(ini)
      const b = ws.getCell(fin)
      const valor = aplanarCelda(a.value)
      for (let r = Number(a.row); r <= Number(b.row); r++) {
        for (let c = Number(a.col); c <= Number(b.col); c++) combinadas.set(`${r}:${c}`, valor)
      }
    }
    ws.eachRow({ includeEmpty: true }, (row, nRow) => {
      const fila: Celda[] = []
      row.eachCell({ includeEmpty: true }, (cell, nCol) => {
        const k = `${nRow}:${nCol}`
        fila[nCol - 1] = combinadas.has(k) ? combinadas.get(k)! : aplanarCelda(cell.value)
      })
      for (let i = 0; i < fila.length; i++) if (fila[i] === undefined) fila[i] = null
      filas[nRow - 1] = fila
    })
    for (let i = 0; i < filas.length; i++) filas[i] ??= []
    hojas.push({ nombre: ws.name, filas })
  })
  return hojas
}

function leerCSV(texto: string, nombre: string): Promise<HojaCruda[]> {
  return import('papaparse').then(({ default: Papa }) => {
    const r = Papa.parse<string[]>(texto.replace(/^﻿/, ''), { skipEmptyLines: false })
    const filas = r.data.map((f) => f.map((c) => (c.trim() === '' ? null : c.trim())))
    return [{ nombre: nombre.replace(/\.[^.]+$/, ''), filas }]
  })
}

export class FormatoNoSoportadoError extends Error {}

/** Lee un archivo .xlsx o .csv y devuelve sus hojas como tablas simples. */
export async function leerArchivo(datos: ArrayBuffer, nombreArchivo: string): Promise<HojaCruda[]> {
  const ext = nombreArchivo.toLowerCase().split('.').pop()
  if (ext === 'csv' || ext === 'txt') {
    // Excel en español suele guardar CSV en Windows-1252
    let texto = new TextDecoder('utf-8').decode(datos)
    if (texto.includes('�')) texto = new TextDecoder('windows-1252').decode(datos)
    return leerCSV(texto, nombreArchivo)
  }
  if (ext === 'xls') {
    throw new FormatoNoSoportadoError(
      'Este archivo es del Excel viejo (.xls). Abrilo en Excel y usá "Guardar como" → "Libro de Excel (.xlsx)".',
    )
  }
  if (ext !== 'xlsx' && ext !== 'xlsm') {
    throw new FormatoNoSoportadoError('Solo se pueden importar archivos de Excel (.xlsx) o .csv.')
  }
  const ExcelJS = await cargarExcelJS()
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(datos)
  } catch {
    throw new FormatoNoSoportadoError('No se pudo abrir el archivo. ¿Está dañado o protegido con contraseña?')
  }
  return hojasDesdeWorkbook(wb)
}
