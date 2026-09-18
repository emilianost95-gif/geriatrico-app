import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { guardarAjuste, leerAjuste } from '../src/db/ajustes'
import { GeriatricoDB } from '../src/db/database'
import { crearPaciente } from '../src/db/pacientes'
import { consultarRegistros, guardarRegistro } from '../src/db/registros'
import { crearLibro, crearPlantilla } from '../src/excel/exportar'
import { analizarLibro } from '../src/excel/importar/analizar'
import { leerArchivo } from '../src/excel/importar/leer'
import { crearCopia, CopiaInvalidaError, restaurarCopia, validarCopia } from '../src/lib/copias'

let db: GeriatricoDB
let n = 0
beforeEach(async () => {
  db = new GeriatricoDB(`cop-${n++}`)
  await db.open()
})

async function cargarEjemplo(base: GeriatricoDB) {
  const ana = await crearPaciente({ nombre: 'Ana Díaz', habitacion: '1' }, base)
  const luis = await crearPaciente({ nombre: 'Luis Soto' }, base)
  await guardarRegistro({ pacienteId: ana, fecha: '2026-09-15', tomas: [{ id: 'a', hora: '08:00', sistolica: 120, diastolica: 80 }], alimentacion: { estado: 'positiva' }, diuresis: 'Normal' }, base)
  await guardarRegistro({ pacienteId: luis, fecha: '2026-09-15', tomas: [], alimentacion: { estado: 'negativa' }, observaciones: 'Fiebre' }, base)
  await guardarAjuste('nombreHogar', 'Hogar Los Aromos', base)
  return { ana, luis }
}

describe('copias de seguridad', () => {
  it('copia y restauración exacta (reemplazar)', async () => {
    await cargarEjemplo(db)
    const copia = validarCopia(JSON.stringify(await crearCopia(db)))
    const otra = new GeriatricoDB(`cop-${n++}`)
    await crearPaciente({ nombre: 'Alguien que se borra' }, otra)
    const r = await restaurarCopia(copia, 'reemplazar', otra)
    expect(r).toMatchObject({ pacientesNuevos: 2, registrosNuevos: 2 })
    expect(await otra.pacientes.toArray()).toEqual(await db.pacientes.toArray())
    expect(await otra.registros.toArray()).toEqual(await db.registros.toArray())
    expect(await leerAjuste('nombreHogar', otra)).toBe('Hogar Los Aromos')
  })

  it('combinar dos tablets sin duplicar', async () => {
    await cargarEjemplo(db)
    const copia = await crearCopia(db)
    const otra = new GeriatricoDB(`cop-${n++}`)
    const ana2 = await crearPaciente({ nombre: 'ana diaz' }, otra)
    await guardarRegistro({ pacienteId: ana2, fecha: '2026-09-15', tomas: [{ id: 'z', hora: '20:00', sistolica: 130, diastolica: 85 }], alimentacion: { estado: '' } }, otra)
    const r = await restaurarCopia(copia, 'combinar', otra)
    expect(r).toMatchObject({ pacientesNuevos: 1, registrosNuevos: 1, registrosCombinados: 1 })
    expect(await otra.pacientes.count()).toBe(2)
    const [reg] = await consultarRegistros({ pacienteId: ana2 }, otra)
    expect(reg.tomas.map((t) => t.hora)).toEqual(['08:00', '20:00'])
    expect(reg.diuresis).toBe('Normal')
    // Volver a combinar no cambia nada
    const r2 = await restaurarCopia(copia, 'combinar', otra)
    expect(r2.pacientesNuevos + r2.registrosNuevos).toBe(0)
    const [reg2] = await consultarRegistros({ pacienteId: ana2 }, otra)
    expect(reg2.tomas).toHaveLength(2)
  })

  it('rechaza archivos que no son copias', () => {
    expect(() => validarCopia('hola')).toThrow(CopiaInvalidaError)
    expect(() => validarCopia('{"app":"otra"}')).toThrow(/no es una copia/)
    expect(() => validarCopia(JSON.stringify({ app: 'registro-geriatrico', version: 1, pacientes: [{ nombre: 'x' }], registros: [] }))).toThrow(/dañados/)
  })
})

describe('exportación', () => {
  it('varios pacientes y una hoja por paciente, y se vuelve a importar igual', async () => {
    await cargarEjemplo(db)
    const wb = await crearLibro({
      pacientes: await db.pacientes.toArray(),
      registros: await consultarRegistros({ pacienteIds: (await db.pacientes.toArray()).map((p) => p.id!) }, db),
      descripcionFiltro: '2 pacientes',
      hojaPorPaciente: true,
      nombreHogar: 'Hogar Los Aromos',
    })
    const hojas = await leerArchivo((await wb.xlsx.writeBuffer()) as ArrayBuffer, 'x.xlsx')
    expect(hojas.map((h) => h.nombre)).toEqual(['Registros diarios', 'Signos vitales', 'Pacientes', 'Ana Díaz', 'Luis Soto', 'Información'])
    // Solo las hojas por paciente
    const l = analizarLibro(hojas.filter((h) => h.nombre === 'Ana Díaz' || h.nombre === 'Luis Soto'), {}, '2026-09-16')
    expect(l.registros.map((r) => `${r.pacienteNombre} ${r.fecha}`)).toEqual(['Ana Díaz 2026-09-15', 'Luis Soto 2026-09-15'])
    expect(l.registros[0].tomas[0]).toMatchObject({ hora: '08:00', sistolica: 120 })
    expect(l.registros[1].textos.observaciones).toBe('Fiebre')
    // Todo el libro junto no duplica
    const todo = analizarLibro(hojas, {}, '2026-09-16')
    expect(todo.registros).toHaveLength(2)
    expect(todo.registros[0].tomas).toHaveLength(1)
  })

  it('plantilla de migración con hoja de pacientes', async () => {
    const wb = await crearPlantilla()
    const hojas = await leerArchivo((await wb.xlsx.writeBuffer()) as ArrayBuffer, 'plantilla.xlsx')
    expect(hojas.map((h) => h.nombre)).toEqual(['Pacientes', 'Registros', 'Cómo usar'])
    // Se completa como lo haría la dueña
    hojas[0].filas.push(['Ana Díaz', '1', null, null, null, null], ['Luis Soto', '2', null, null, null, null], ['Rosa Fernández', null, null, null, null, null])
    hojas[1].filas.push(['15/09/2026', 'Ana Díaz', '08:00', '120/80', 70])
    const l = analizarLibro(hojas, {}, '2026-09-16')
    expect(l.pacientes.map((p) => p.nombre)).toEqual(['Ana Díaz', 'Luis Soto', 'Rosa Fernández'])
    expect(l.registros).toHaveLength(1)
    expect(l.hojas.find((h) => h.nombre === 'Cómo usar')?.tipo).toBe('omitida')
  })
})
