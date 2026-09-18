import 'fake-indexeddb/auto'
import ExcelJS from 'exceljs'
import { beforeEach, describe, expect, it } from 'vitest'
import { GeriatricoDB } from '../src/db/database'
import { crearPaciente } from '../src/db/pacientes'
import { consultarRegistros, guardarRegistro, obtenerRegistro } from '../src/db/registros'
import { crearLibro, crearPlantilla } from '../src/excel/exportar'
import { analizarLibro } from '../src/excel/importar/analizar'
import { aplicarImportacion, prepararPlan } from '../src/excel/importar/aplicar'
import { hojasDesdeWorkbook, leerArchivo } from '../src/excel/importar/leer'
import { sugerirPacientes } from '../src/excel/importar/plan'
import type { HojaCruda } from '../src/excel/importar/tipos'

const HOY = '2026-09-16'
let db: GeriatricoDB
let n = 0

beforeEach(async () => {
  db = new GeriatricoDB(`test-${n++}`)
  await db.open()
})

async function importar(hojas: HojaCruda[], modo: 'actualizar' | 'reemplazar' | 'soloNuevos' = 'actualizar') {
  const lectura = analizarLibro(hojas, {}, HOY)
  const asignaciones = sugerirPacientes(lectura.pacientes, await db.pacientes.toArray())
  const plan = await prepararPlan(lectura, asignaciones, modo, db)
  const resultado = await aplicarImportacion(lectura, asignaciones, plan, db)
  return { lectura, asignaciones, plan, resultado }
}

describe('planilla desordenada', () => {
  const hoja: HojaCruda = {
    nombre: 'Hoja1',
    filas: [
      ['CONTROL DE ENFERMERÍA — Residencia Los Aromos', null, null],
      [null],
      ['Obs.', 'Apellido y Nombre', 'Día', 'T.A.', 'Pulso', 'Temp', 'SatO2', 'HGT', 'Diuresis', 'Deposiciones', 'Alimentación', 'Firma'],
      ['Tranquila', 'González, María', '15/09/2026', '120/80', 72, '36,5', 96, 110, 'Normal', 'Sí', 'Positiva - comió todo', 'Ana'],
      [null, null, null, '130/85', 80, 36.9, 95, null, null, null, null, 'Ana'],
      ['Tos leve', 'Pérez Juan', null, '12/8', '68 lpm', 365, 0.93, null, 'Escasa', 'No', 'NEG', 'Ana'],
      ['', 'maria gonzalez', '16/09/2026', null, null, null, null, 'no se tomó', null, null, null, null],
      [null, 'Nombre de alguien', '31/02/2026', '120/80'],
      [null, null, null, null],
    ],
  }

  it('detecta encabezado, columnas y agrupa por paciente/día', () => {
    const l = analizarLibro([hoja], {}, HOY)
    const h = l.hojas[0]
    expect(h.tipo).toBe('registros')
    expect(h.filaEncabezado).toBe(2)
    const ids = Object.fromEntries(h.columnas.map((c) => [c.encabezado, c.id]))
    expect(ids).toMatchObject({
      'Obs.': 'observaciones', 'Apellido y Nombre': 'paciente', 'Día': 'fecha', 'T.A.': 'presion',
      Pulso: 'frecuenciaCardiaca', Temp: 'temperatura', SatO2: 'saturacion', HGT: 'glucemia',
      Diuresis: 'diuresis', Deposiciones: 'catarsis', 'Alimentación': 'alimentacion', Firma: 'ignorar',
    })

    expect(l.pacientes.map((p) => p.nombre)).toEqual(['María González', 'Pérez Juan'])
    expect(l.registros).toHaveLength(3)

    const maria15 = l.registros.find((r) => r.fecha === '2026-09-15' && r.pacienteNombre === 'María González')!
    expect(maria15.tomas).toHaveLength(2)
    expect(maria15.tomas[0]).toMatchObject({ sistolica: 120, diastolica: 80, frecuenciaCardiaca: 72, temperatura: 36.5, saturacion: 96, glucemia: 110 })
    expect(maria15.tomas[1]).toMatchObject({ sistolica: 130, temperatura: 36.9 })
    expect(maria15.textos).toMatchObject({ observaciones: 'Tranquila', diuresis: 'Normal', catarsis: 'Sí' })
    expect(maria15.alimentacion).toEqual({ estado: 'positiva', comentario: 'comió todo' })

    // Juan hereda la fecha de arriba (celda combinada / vacía)
    const juan = l.registros.find((r) => r.pacienteNombre === 'Pérez Juan')!
    expect(juan.fecha).toBe('2026-09-15')
    expect(juan.tomas[0]).toMatchObject({ sistolica: 120, diastolica: 80, frecuenciaCardiaca: 68, temperatura: 36.5, saturacion: 93 })
    expect(juan.alimentacion.estado).toBe('negativa')

    // "maria gonzalez" es la misma persona (sin tildes, otro orden)
    const maria16 = l.registros.find((r) => r.fecha === '2026-09-16')!
    expect(maria16.pacienteClave).toBe(maria15.pacienteClave)
    expect(maria16.tomas[0].nota).toBe('Gluc: no se tomó')

    // Fecha imposible → error y se salta
    expect(l.problemas.some((p) => p.nivel === 'error' && p.fila === 8)).toBe(true)
    expect(l.problemas.some((p) => p.mensaje.includes('12/8'))).toBe(true)
  })

  it('importa, y al reimportar no duplica', async () => {
    const r1 = await importar([hoja])
    expect(r1.resultado).toMatchObject({ pacientesCreados: 2, registrosCreados: 3 })
    const r2 = await importar([hoja])
    expect(r2.resultado).toMatchObject({ pacientesCreados: 0, registrosCreados: 0, registrosActualizados: 0, sinCambios: 3 })
    expect(await db.registros.count()).toBe(3)
    expect((await db.pacientes.toArray()).map((p) => p.nombre).sort()).toEqual(['María González', 'Pérez Juan'])
  })
})

describe('otros formatos', () => {
  it('una hoja por paciente, columnas por turno y fecha en el título', () => {
    const l = analizarLibro([
      {
        nombre: 'Rosa Fernández',
        filas: [
          ['Planilla del 10/09/2026'],
          ['Hora', 'PA mañana', 'PA tarde', 'Temp mañana', 'Temp tarde', 'Sueño'],
          ['08:00', '110/70', '125/80', 36.2, 36.8, 'Durmió bien'],
        ],
      },
    ], {}, HOY)
    expect(l.hojas[0].pacientePorDefecto).toBe('Rosa Fernández')
    expect(l.hojas[0].fechaPorDefecto).toBe('2026-09-10')
    const r = l.registros[0]
    expect(r.fecha).toBe('2026-09-10')
    expect(r.tomas).toHaveLength(2)
    expect(r.tomas.find((t) => t.sistolica === 110)?.temperatura).toBe(36.2)
    expect(r.tomas.find((t) => t.sistolica === 125)?.temperatura).toBe(36.8)
    expect(r.textos.sueno).toBe('Durmió bien')
  })

  it('columnas Nombre y Apellido separadas + lista de pacientes', () => {
    const l = analizarLibro([
      { nombre: 'Pacientes', filas: [['Nombre', 'Apellido', 'Hab.', 'RUT'], ['Luis', 'Soto', '12', '12.345.678-9']] },
      { nombre: 'Datos', filas: [['Fecha', 'Nombre', 'Apellido', 'Diuresis', 'SNG'], ['16/09/2026', 'luis', 'SOTO', 'Normal', 'No usa']] },
    ], {}, HOY)
    expect(l.hojas.map((h) => h.tipo)).toEqual(['pacientes', 'registros'])
    expect(l.pacientes).toHaveLength(1)
    expect(l.pacientes[0].datos).toEqual({ habitacion: '12', documento: '12.345.678-9' })
    expect(l.registros[0].textos).toEqual({ diuresis: 'Normal', sng: 'No usa' })
  })

  it('ajuste manual de columnas', () => {
    const hojas = [{ nombre: 'X', filas: [['Fecha', 'Paciente', 'Col rara'], ['16/09/2026', 'Ana', 'algo']] }]
    expect(analizarLibro(hojas, {}, HOY).registros).toHaveLength(0)
    const l = analizarLibro(hojas, { X: { 2: 'curaciones' } }, HOY)
    expect(l.registros[0].textos.curaciones).toBe('algo')
  })

  it('omite hojas sin datos reconocibles', () => {
    const l = analizarLibro([{ nombre: 'Notas', filas: [['hola', 'chau'], ['x', 'y']] }], {}, HOY)
    expect(l.hojas[0].tipo).toBe('omitida')
    expect(l.registros).toHaveLength(0)
  })
})

describe('asignación de pacientes', () => {
  it('reconoce nombres parecidos', async () => {
    await crearPaciente({ nombre: 'Juan Carlos Pérez' }, db)
    await crearPaciente({ nombre: 'María González' }, db)
    const existentes = await db.pacientes.toArray()
    const a = sugerirPacientes(
      [
        { clave: 'juan perez', nombre: 'Juan Perez', datos: {}, cantidadRegistros: 1 },
        { clave: 'gonzales maria', nombre: 'Maria Gonzales', datos: {}, cantidadRegistros: 1 },
        { clave: 'pedro ruiz', nombre: 'Pedro Ruiz', datos: {}, cantidadRegistros: 1 },
      ],
      existentes,
    )
    expect(a.map((x) => x.sugerencia)).toEqual(['parecido', 'parecido', 'nuevo'])
  })
})

describe('modos de importación', () => {
  it('actualizar: completa sin borrar; reemplazar: pisa; soloNuevos: no toca', async () => {
    const id = await crearPaciente({ nombre: 'Ana Díaz' }, db)
    await guardarRegistro({
      pacienteId: id, fecha: '2026-09-16',
      tomas: [{ id: 'a', hora: '08:00', sistolica: 120, diastolica: 80 }],
      alimentacion: { estado: 'positiva' },
      diuresis: 'Normal',
    }, db)
    const hojas: HojaCruda[] = [{
      nombre: 'Hoja1',
      filas: [['Fecha', 'Paciente', 'Hora', 'PA', 'Catarsis'], ['16/09/2026', 'Ana Diaz', '20:00', '140/90', 'No hizo']],
    }]

    const solo = await importar(hojas, 'soloNuevos')
    expect(solo.plan.totales.omitido).toBe(1)

    const act = await importar(hojas, 'actualizar')
    expect(act.plan.items[0].cambios).toEqual(['+1 toma de signos', 'Catarsis'])
    let r = (await obtenerRegistro(id, '2026-09-16', db))!
    expect(r.tomas).toHaveLength(2)
    expect(r.diuresis).toBe('Normal')
    expect(r.catarsis).toBe('No hizo')

    await importar(hojas, 'reemplazar')
    r = (await obtenerRegistro(id, '2026-09-16', db))!
    expect(r.tomas).toHaveLength(1)
    expect(r.diuresis).toBeUndefined()
    expect(r.alimentacion.estado).toBe('')
  })
})

describe('exportar → importar (ida y vuelta)', () => {
  it('el archivo exportado se vuelve a importar sin cambios', async () => {
    const id = await crearPaciente({ nombre: 'Elena Ruiz', habitacion: '4B' }, db)
    await guardarRegistro({
      pacienteId: id, fecha: '2026-09-15',
      tomas: [
        { id: '1', hora: '08:00', sistolica: 118, diastolica: 76, frecuenciaCardiaca: 70, temperatura: 36.4, saturacion: 97, frecuenciaRespiratoria: 16, glucemia: 104 },
        { id: '2', hora: '20:00', sistolica: 150, diastolica: 95, temperatura: 37.9, nota: 'con dolor de cabeza; avisé al médico' },
      ],
      alimentacion: { estado: 'negativa', comentario: 'Rechazó la cena' },
      laboratorio: 'Hemograma enviado', sondaVesical: 'No usa', diuresis: 'Normal', catarsis: 'Sí, normal',
      sng: 'No usa', curaciones: 'Escara sacra, curación con apósito', rotacion: 'Cada 2 horas',
      ejercicio: 'Caminó', sueno: 'Durmió poco', comportamiento: 'Desorientada a la tarde',
      observaciones: 'Familia visitó.\nSe controla PA a la noche.',
    }, db)

    const wb = await crearLibro({
      pacientes: await db.pacientes.toArray(),
      registros: await consultarRegistros({}, db),
      descripcionFiltro: 'Todos los datos',
      incluirTodosLosPacientes: true,
    })
    const buffer = await wb.xlsx.writeBuffer()
    const hojas = await leerArchivo(buffer as ArrayBuffer, 'export.xlsx')
    expect(hojas.map((h) => h.nombre)).toEqual(['Registros diarios', 'Signos vitales', 'Pacientes', 'Información'])

    const { lectura, plan } = await importar(hojas)
    expect(lectura.problemas.filter((p) => p.nivel === 'error')).toEqual([])
    expect(lectura.hojas.map((h) => h.tipo)).toEqual(['registros', 'registros', 'pacientes', 'omitida'])
    expect(plan.totales).toMatchObject({ nuevo: 0, actualiza: 0, sinCambios: 1 })

    // En una base vacía se recrea igual
    const otra = new GeriatricoDB(`test-${n++}`)
    const l2 = analizarLibro(hojas, {}, HOY)
    const a2 = sugerirPacientes(l2.pacientes, [])
    const p2 = await prepararPlan(l2, a2, 'actualizar', otra)
    await aplicarImportacion(l2, a2, p2, otra)
    const [pac] = await otra.pacientes.toArray()
    expect(pac).toMatchObject({ nombre: 'Elena Ruiz', habitacion: '4B' })
    const [reg] = await otra.registros.toArray()
    const original = (await db.registros.toArray())[0]
    const sinIds = (r: typeof reg) => ({ ...r, id: 0, pacienteId: 0, creadoEn: 0, actualizadoEn: 0, tomas: r.tomas.map((t) => ({ ...t, id: '' })) })
    expect(sinIds(reg)).toEqual(sinIds(original))
  })

  it('lee celdas combinadas de un .xlsx real', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Septiembre')
    ws.addRow(['Fecha', 'Paciente', 'Hora', 'PA', 'Observaciones'])
    ws.addRow([new Date(Date.UTC(2026, 8, 14)), 'Juan Soto', '08:00', '120/80', 'Bien'])
    ws.addRow([null, null, '14:00', '125/82', null])
    ws.addRow([null, null, '20:00', '118/79', null])
    ws.mergeCells('A2:A4')
    ws.mergeCells('B2:B4')
    ws.mergeCells('E2:E4')
    const hojas = hojasDesdeWorkbook(await new ExcelJS.Workbook().xlsx.load(await wb.xlsx.writeBuffer()))
    const l = analizarLibro(hojas, {}, HOY)
    expect(l.registros).toHaveLength(1)
    expect(l.registros[0].tomas.map((t) => t.hora)).toEqual(['08:00', '14:00', '20:00'])
    expect(l.registros[0].textos.observaciones).toBe('Bien')
  })

  it('la plantilla se genera y sus filas de ejemplo se leen bien', async () => {
    const wb = await crearPlantilla()
    const hojas = await leerArchivo((await wb.xlsx.writeBuffer()) as ArrayBuffer, 'plantilla.xlsx')
    const l = analizarLibro(hojas, {}, '2099-01-01')
    // Las filas de ejemplo se ignoran solas
    expect(l.registros).toHaveLength(0)
    expect(l.hojas.find((h) => h.nombre === 'Registros')?.filasEjemplo).toBe(3)
  })

  it('lee CSV con punto y coma', async () => {
    const csv = 'Fecha;Paciente;Temperatura;Diuresis\n16/09/2026;Ana Díaz;36,6;Normal\n'
    const buf = new TextEncoder().encode(csv).buffer
    const hojas = await leerArchivo(buf as ArrayBuffer, 'datos.csv')
    const l = analizarLibro(hojas, {}, HOY)
    expect(l.registros[0].tomas[0].temperatura).toBe(36.6)
    expect(l.registros[0].pacienteNombre).toBe('Ana Díaz')
  })
})
