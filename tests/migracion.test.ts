import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { GeriatricoDB } from '../src/db/database'
import { crearPaciente } from '../src/db/pacientes'
import { analizarLibro, separarNombreYHabitacion } from '../src/excel/importar/analizar'
import { aplicarImportacion, prepararPlan } from '../src/excel/importar/aplicar'
import { sugerirPacientes } from '../src/excel/importar/plan'
import { buscarMesAnio } from '../src/excel/importar/transponer'
import type { HojaCruda } from '../src/excel/importar/tipos'

const HOY = '2026-09-16'
let db: GeriatricoDB
let n = 0
beforeEach(async () => {
  db = new GeriatricoDB(`mig-${n++}`)
  await db.open()
})

async function importar(hojas: HojaCruda[], omitidas: string[] = []) {
  const lectura = analizarLibro(hojas, {}, { hoy: HOY, omitidas })
  const asignaciones = sugerirPacientes(lectura.pacientes, await db.pacientes.toArray())
  const plan = await prepararPlan(lectura, asignaciones, 'actualizar', db)
  const resultado = await aplicarImportacion(lectura, asignaciones, plan, db)
  return { lectura, plan, resultado }
}

const resumen = (hojas: HojaCruda[]) => {
  const l = analizarLibro(hojas, {}, HOY)
  return {
    tipos: l.hojas.map((h) => h.tipo),
    pacientes: l.pacientes.map((p) => p.nombre),
    registros: l.registros.map((r) => `${r.fecha} ${r.pacienteNombre} ${r.tomas.length}`),
    errores: l.problemas.filter((p) => p.nivel === 'error'),
    lectura: l,
  }
}

describe('migración de muchos pacientes', () => {
  it('lista de residentes con solo el nombre', async () => {
    const hojas = [{ nombre: 'Residentes', filas: [['Nombre'], ['Ana Díaz'], ['Luis Soto'], ['Rosa Fernández']] }]
    expect(resumen(hojas).pacientes).toEqual(['Ana Díaz', 'Luis Soto', 'Rosa Fernández'])
    const { plan, resultado } = await importar(hojas)
    expect(plan.totales.pacientesNuevos).toBe(3)
    expect(resultado.pacientesCreados).toBe(3)
    expect(await db.pacientes.count()).toBe(3)
  })

  it('lista sin títulos en una pestaña "Pacientes"', () => {
    const r = resumen([{ nombre: 'Pacientes', filas: [['Ana Díaz'], ['Luis Soto'], [null], ['Sra. Rosa Fernández']] }])
    expect(r.pacientes).toEqual(['Ana Díaz', 'Luis Soto', 'Rosa Fernández'])
  })

  it('lista con habitación actualiza a los que ya existen', async () => {
    await crearPaciente({ nombre: 'Ana Díaz' }, db)
    const { plan, resultado } = await importar([
      { nombre: 'Hoja1', filas: [['Nombre y apellido', 'Habitación', 'RUT'], ['ana diaz', '1', '5.555.555-5'], ['Luis Soto', '2', '']] },
    ])
    expect(plan.totales).toMatchObject({ pacientesNuevos: 1, pacientesActualizados: 1 })
    expect(resultado).toMatchObject({ pacientesCreados: 1, pacientesActualizados: 1 })
    const ana = (await db.pacientes.toArray()).find((p) => p.nombre === 'Ana Díaz')!
    expect(ana).toMatchObject({ habitacion: '1', documento: '5.555.555-5' })
  })

  it('un bloque por paciente en la misma hoja (no mezcla pacientes)', () => {
    const r = resumen([{ nombre: 'Hoja1', filas: [
      ['PACIENTE: ANA DÍAZ   HAB. 3'], ['Fecha', 'Hora', 'PA', 'FC', 'Temp'],
      ['15/09/2026', '08:00', '120/80', 70, 36.5], ['16/09/2026', '08:00', '125/80', 72, 36.6], [null],
      ['PACIENTE: LUIS SOTO'], ['Fecha', 'Hora', 'PA', 'FC', 'Temp'],
      ['15/09/2026', '09:00', '130/85', 80, 36.9],
    ] }])
    expect(r.errores).toEqual([])
    expect(r.registros).toEqual(['2026-09-15 Ana Díaz 1', '2026-09-15 Luis Soto 1', '2026-09-16 Ana Díaz 1'])
    const luis = r.lectura.registros.find((x) => x.pacienteNombre === 'Luis Soto')!
    expect(luis.tomas[0]).toMatchObject({ hora: '09:00', sistolica: 130 })
  })

  it('bloques con columnas distintas', () => {
    const r = resumen([{ nombre: 'Hoja1', filas: [
      ['Paciente: Ana Díaz'], ['Fecha', 'PA', 'FC'], ['15/09/2026', '120/80', 70],
      ['Paciente: Luis Soto'], ['Fecha', 'Temperatura', 'Diuresis', 'Catarsis'], ['15/09/2026', 37.8, 'Escasa', 'No'],
    ] }])
    const luis = r.lectura.registros.find((x) => x.pacienteNombre === 'Luis Soto')!
    expect(luis.tomas[0].temperatura).toBe(37.8)
    expect(luis.textos).toEqual({ diuresis: 'Escasa', catarsis: 'No' })
  })

  it('nombre del paciente como fila separadora (celda combinada)', () => {
    const r = resumen([{ nombre: 'Hoja1', filas: [
      ['Fecha', 'Hora', 'PA', 'FC', 'Temp', 'Observaciones'],
      ['Ana Díaz', 'Ana Díaz', 'Ana Díaz', 'Ana Díaz', 'Ana Díaz', 'Ana Díaz'],
      ['15/09/2026', '08:00', '120/80', 70, 36.5, 'ok'],
      ['Hab 4 - Luis Soto'],
      ['15/09/2026', '09:00', '130/85', 80, 36.9, null],
      [null, null, null, null, null, 'Se acostó temprano'],
    ] }])
    expect(r.registros).toEqual(['2026-09-15 Ana Díaz 1', '2026-09-15 Luis Soto 1'])
    const luis = r.lectura.registros.find((x) => x.pacienteNombre === 'Luis Soto')!
    expect(luis.textos.observaciones).toBe('Se acostó temprano')
    expect(r.lectura.pacientes.find((p) => p.nombre === 'Luis Soto')?.datos.habitacion).toBe('4')
  })

  it('una hoja por paciente con filas de solo observaciones (no las toma como pacientes)', () => {
    const r = resumen([{ nombre: 'Rosa Fernández', filas: [
      ['Planilla del 14/09/2026'],
      ['Hora', 'PA', 'Observaciones'],
      ['08:00', '110/70', 'Desayunó bien'],
      [null, null, 'Se acostó temprano'],
    ] }])
    expect(r.pacientes).toEqual(['Rosa Fernández'])
    expect(r.registros).toEqual(['2026-09-14 Rosa Fernández 1'])
  })

  it('fecha como fila separadora y pacientes en filas', () => {
    const r = resumen([{ nombre: 'Hoja1', filas: [
      ['Paciente', 'PA', 'FC', 'Diuresis'],
      ['Lunes 15/09/2026'],
      ['Ana Díaz', '120/80', 70, 'Normal'],
      ['Luis Soto', '130/85', 80, 'Escasa'],
      ['Martes 16/09/2026'],
      ['Ana Díaz', '118/78', 68, 'Normal'],
    ] }])
    expect(r.errores).toEqual([])
    expect(r.registros).toEqual(['2026-09-15 Ana Díaz 1', '2026-09-15 Luis Soto 1', '2026-09-16 Ana Díaz 1'])
  })

  it('planilla de turno con los pacientes en columnas', async () => {
    const hojas = [{ nombre: 'Turno 15-09-2026', filas: [
      ['Control', 'Ana Díaz', 'Luis Soto', 'Rosa Fernández'],
      ['Presión arterial', '120/80', '130/85', '110/70'],
      ['Pulso', 70, 80, 66],
      ['Temperatura', 36.5, 36.9, null],
      ['Diuresis', 'Normal', 'Escasa', 'Normal'],
      ['Alimentación', '+', '-', '+'],
      ['Firma', 'Ana', 'Ana', 'Ana'],
    ] }]
    const r = resumen(hojas)
    expect(r.lectura.hojas[0].formato).toBe('pacientesEnColumnas')
    expect(r.registros).toEqual(['2026-09-15 Ana Díaz 1', '2026-09-15 Luis Soto 1', '2026-09-15 Rosa Fernández 1'])
    const luis = r.lectura.registros.find((x) => x.pacienteNombre === 'Luis Soto')!
    expect(luis.tomas[0]).toMatchObject({ sistolica: 130, frecuenciaCardiaca: 80, temperatura: 36.9 })
    expect(luis.alimentacion.estado).toBe('negativa')
    const { resultado } = await importar(hojas)
    expect(resultado).toMatchObject({ pacientesCreados: 3, registrosCreados: 3 })
  })

  it('control mensual con los días en columnas', () => {
    const r = resumen([{ nombre: 'Ana Díaz', filas: [
      ['CONTROL MENSUAL SEPTIEMBRE 2026'],
      ['Día', 1, 2, 3, 4],
      ['PA', '120/80', '125/80', '118/76', null],
      ['FC', 70, 72, 68, null],
      ['HGT', 110, 120, 105, null],
    ] }])
    expect(r.lectura.hojas[0].formato).toBe('fechasEnColumnas')
    expect(r.registros).toEqual(['2026-09-01 Ana Díaz 1', '2026-09-02 Ana Díaz 1', '2026-09-03 Ana Díaz 1'])
    expect(r.lectura.registros[2].tomas[0]).toMatchObject({ sistolica: 118, glucemia: 105 })
  })

  it('días en columnas sin mes: avisa y no inventa fechas', () => {
    const l = analizarLibro([{ nombre: 'Ana Díaz', filas: [['Día', 1, 2], ['PA', '120/80', '125/80'], ['FC', 70, 72]] }], {}, HOY)
    expect(l.registros).toHaveLength(0)
    expect(l.problemas.some((p) => /mes/.test(p.mensaje))).toBe(true)
  })

  it('ignora las filas de ejemplo de la plantilla', () => {
    const r = resumen([{ nombre: 'Registros', filas: [
      ['Fecha', 'Paciente', 'PA'], ['16/09/2026', 'Ejemplo: María González', '120/80'], ['16/09/2026', 'Ana Díaz', '110/70'],
    ] }])
    expect(r.registros).toEqual(['2026-09-16 Ana Díaz 1'])
    expect(r.lectura.hojas[0].filasEjemplo).toBe(1)
  })

  it('se puede elegir no importar una hoja o un paciente', async () => {
    const hojas = [
      { nombre: 'Personal', filas: [['Nombre', 'Teléfono'], ['Enfermera Uno', '123']] },
      { nombre: 'Datos', filas: [['Fecha', 'Paciente', 'PA'], ['16/09/2026', 'Ana Díaz', '110/70'], ['16/09/2026', 'Luis Soto', '120/80']] },
    ]
    const lectura = analizarLibro(hojas, {}, { hoy: HOY, omitidas: ['Personal'] })
    expect(lectura.hojas[0]).toMatchObject({ tipo: 'omitida', omitidaPorUsuario: true })
    const asig = sugerirPacientes(lectura.pacientes, []).map((a) => (a.nombre === 'Luis Soto' ? { ...a, accion: 'omitir' as const } : a))
    const plan = await prepararPlan(lectura, asig, 'actualizar', db)
    expect(plan.totales).toMatchObject({ nuevo: 1, omitido: 1, pacientesNuevos: 1 })
    await aplicarImportacion(lectura, asig, plan, db)
    expect((await db.pacientes.toArray()).map((p) => p.nombre)).toEqual(['Ana Díaz'])
  })
})

describe('ayudas', () => {
  it.each([
    ['Hab. 4B - María González', 'María González', '4B'],
    ['María González (hab 4B)', 'María González', '4B'],
    ['Cama 12: Luis Soto', 'Luis Soto', '12'],
    ['Habitación N° 3 – Rosa Díaz', 'Rosa Díaz', '3'],
    ['Juan Pérez', 'Juan Pérez', undefined],
  ])('%s', (texto, nombre, habitacion) => {
    expect(separarNombreYHabitacion(texto)).toEqual({ nombre, habitacion })
  })
  it('mes y año en títulos', () => {
    expect(buscarMesAnio('CONTROL MENSUAL SETIEMBRE 2026')).toEqual({ mes: 9, anio: 2026 })
    expect(buscarMesAnio('Octubre')).toEqual({ mes: 10, anio: undefined })
    expect(buscarMesAnio('Planilla 09/2026')).toEqual({ mes: 9, anio: 2026 })
    expect(buscarMesAnio('Ana Díaz')).toBeUndefined()
  })
})
