import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { prepararDemo } from '../src/demo/modoDemo'
import { dbDemo, dbReal } from '../src/db/database'
import { calcularAlertas } from '../src/domain/alertas'
import type { FechaISO } from '../src/domain/tipos'

const HOY = '2026-09-18'

describe('modo demostración', () => {
  it('arma un hogar completo sin tocar la base real', async () => {
    await dbReal.open()
    await dbReal.pacientes.add({ nombre: 'Real', nombreClave: 'real', activo: true, creadoEn: 0, actualizadoEn: 0 })

    await prepararDemo(HOY)
    expect(await dbDemo.pacientes.count()).toBe(9)
    const registros = await dbDemo.registros.toArray()
    expect(registros.length).toBeGreaterThan(150)
    expect(registros.every((r) => r.fecha <= HOY)).toBe(true)
    expect(await dbDemo.ajustes.get('nombreHogar')).toMatchObject({ valor: 'Residencia Las Camelias (demo)' })

    // la base real quedó intacta
    expect(await dbReal.pacientes.count()).toBe(1)
    expect(await dbReal.registros.count()).toBe(0)
  })

  it('deja alertas y pendientes para que la demostración muestre algo', async () => {
    await prepararDemo(HOY)
    const pacientes = await dbDemo.pacientes.toArray()
    const registros = await dbDemo.registros.toArray()
    const ultimas = new Map<number, FechaISO>()
    for (const r of registros) if (!ultimas.has(r.pacienteId) || r.fecha > ultimas.get(r.pacienteId)!) ultimas.set(r.pacienteId, r.fecha)

    const alertas = calcularAlertas(pacientes, registros, ultimas, { hoy: HOY })
    expect(alertas.some((a) => a.gravedad === 'urgente')).toBe(true)
    const sinRegistroHoy = pacientes.filter((p) => ultimas.get(p.id!) !== HOY)
    expect(sinRegistroHoy).toHaveLength(1)
  })

  it('volver a prepararla no duplica datos', async () => {
    await prepararDemo(HOY)
    const antes = await dbDemo.registros.count()
    await prepararDemo(HOY)
    expect(await dbDemo.registros.count()).toBe(antes)
    expect(await dbDemo.pacientes.count()).toBe(9)
  })
})
