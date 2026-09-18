import { describe, expect, it } from 'vitest'
import { calcularAlertas } from '../src/domain/alertas'
import type { Paciente, Registro } from '../src/domain/tipos'

const pac = (id: number, nombre: string, activo = true): Paciente => ({ id, nombre, nombreClave: nombre.toLowerCase(), activo, creadoEn: 0, actualizadoEn: 0 })
const reg = (id: number, pacienteId: number, fecha: string, extra: Partial<Registro> = {}): Registro => ({
  id, pacienteId, fecha, tomas: [], alimentacion: { estado: '' }, creadoEn: 0, actualizadoEn: 0, ...extra,
})
const HOY = '2026-09-16'

describe('alertas de la pantalla Hoy', () => {
  it('clasifica signos vitales, alimentación, catarsis y días sin registro', () => {
    const pacientes = [pac(1, 'Ana'), pac(2, 'Luis'), pac(3, 'Rosa'), pac(4, 'Pedro', false), pac(5, 'Nora')]
    const registros = [
      reg(1, 1, HOY, { tomas: [
        { id: 'a', hora: '08:00', temperatura: 37.8, saturacion: 95 },
        { id: 'b', hora: '20:00', temperatura: 38.5, saturacion: 88 },
      ] }),
      reg(2, 2, '2026-09-15', { alimentacion: { estado: 'negativa', comentario: 'rechazó la cena' }, catarsis: 'No hizo' }),
      reg(3, 2, '2026-09-14', { catarsis: 'No' }),
      reg(4, 2, '2026-09-13', { catarsis: 'no hizo' }),
      reg(5, 2, '2026-09-12', { catarsis: 'Sí, normal' }),
      reg(6, 3, '2026-09-10', { tomas: [{ id: 'c', sistolica: 200 }] }),
      reg(7, 4, HOY, { tomas: [{ id: 'd', sistolica: 200 }] }),
      reg(8, 5, HOY, { tomas: [{ id: 'e', hora: '09:00', sistolica: 150, diastolica: 85, glucemia: 110 }] }),
    ]
    const ultimas = new Map([[1, HOY], [2, '2026-09-15'], [3, '2026-09-10'], [4, HOY], [5, HOY]])
    const a = calcularAlertas(pacientes, registros, ultimas, { hoy: HOY })
    const resumen = a.map((x) => `${x.gravedad}:${x.pacienteId}:${x.titulo}`)
    expect(resumen).toEqual([
      'urgente:1:Temperatura 38,5 °C',
      'urgente:1:Saturación 88 %',
      'atencion:5:Presión máxima 150 mmHg',
      'atencion:2:Alimentación negativa',
      'atencion:2:3 registros seguidos sin catarsis',
      'aviso:3:Hace más de 2 días sin registros',
    ])
    // El paciente de alta (4) no genera alertas; lo viejo (día 10) tampoco
    expect(a.some((x) => x.pacienteId === 4)).toBe(false)
    expect(a.find((x) => x.titulo.startsWith('Temperatura'))?.hora).toBe('20:00')
  })

  it('sin datos no inventa alertas de signos', () => {
    expect(calcularAlertas([pac(1, 'Ana')], [reg(1, 1, HOY)], new Map([[1, HOY]]), { hoy: HOY })).toEqual([])
  })
})
