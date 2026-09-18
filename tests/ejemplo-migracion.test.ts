import ExcelJS from 'exceljs'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analizarLibro } from '../src/excel/importar/analizar'
import { hojasDesdeWorkbook } from '../src/excel/importar/leer'

describe('ejemplos/ejemplo-migracion.xlsx', () => {
  it('ubica a los 8 residentes y sus registros en todas las hojas', async () => {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(readFileSync('ejemplos/ejemplo-migracion.xlsx') as unknown as ArrayBuffer)
    const l = analizarLibro(hojasDesdeWorkbook(wb), {}, '2026-09-16')
    const nombres = l.pacientes.map((p) => p.nombre).sort()
    expect(nombres).toEqual(['Ana Díaz', 'Elena Morales', 'Héctor Ruiz', 'Luis Soto', 'Olga Castro', 'Ramón Vega', 'Rosa Fernández', 'Teresa Paz'])
    expect(l.pacientes.find((p) => p.nombre === 'Ana Díaz')?.datos.habitacion).toBe('1')
    expect(l.problemas.filter((p) => p.nivel === 'error')).toEqual([])
    const cuenta = (n: string) => l.registros.filter((r) => r.pacienteNombre === n).length
    expect([cuenta('Ana Díaz'), cuenta('Luis Soto'), cuenta('Héctor Ruiz'), cuenta('Teresa Paz'), cuenta('Rosa Fernández')]).toEqual([2, 2, 1, 7, 2])
    const hector = l.registros.find((r) => r.pacienteNombre === 'Héctor Ruiz')!
    expect(hector.tomas[0]).toMatchObject({ sistolica: 140, temperatura: 38.2, saturacion: 91 })
    expect(hector.alimentacion.estado).toBe('negativa')
  })
})
