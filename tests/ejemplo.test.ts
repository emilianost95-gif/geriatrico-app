import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analizarLibro } from '../src/excel/importar/analizar'
import { leerArchivo } from '../src/excel/importar/leer'

describe('ejemplos/ejemplo-importacion.xlsx', () => {
  it('se interpreta completo', async () => {
    const buf = readFileSync('ejemplos/ejemplo-importacion.xlsx')
    const datos = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
    const l = analizarLibro(await leerArchivo(datos, 'ejemplo-importacion.xlsx'), {}, '2026-09-16')

    expect(l.hojas.map((h) => h.tipo)).toEqual(['registros', 'registros', 'pacientes'])
    expect(l.pacientes.map((p) => p.nombre)).toEqual(['Juan Carlos Pérez', 'Luis Soto', 'María González', 'Rosa Fernández'])
    expect(l.registros).toHaveLength(6)
    expect(l.problemas.filter((p) => p.nivel === 'error')).toEqual([])

    const juan = l.registros.find((r) => r.fecha === '2026-09-14' && r.pacienteNombre === 'Juan Carlos Pérez')!
    expect(juan.tomas.map((t) => t.hora)).toEqual(['08:00', '14:00', '20:00'])
    const rosa = l.registros.find((r) => r.pacienteNombre === 'Rosa Fernández')!
    expect(rosa.fecha).toBe('2026-09-14')
    expect(rosa.tomas).toHaveLength(3)
  })
})
