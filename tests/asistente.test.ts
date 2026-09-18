import { describe, expect, it } from 'vitest'
import { buscarPacienteEnTexto, responder, type DatosAsistente } from '../src/domain/asistente'
import type { Paciente, Registro } from '../src/domain/tipos'
import { normalizar } from '../src/lib/texto'

const HOY = '2026-09-16'
const pac = (id: number, nombre: string, habitacion?: string): Paciente => ({
  id, nombre, nombreClave: normalizar(nombre), habitacion, activo: true, creadoEn: 0, actualizadoEn: 0,
})
const reg = (pacienteId: number, fecha: string, extra: Partial<Registro> = {}): Registro => ({
  pacienteId, fecha, tomas: [], alimentacion: { estado: '' }, creadoEn: 0, actualizadoEn: 0, ...extra,
})

const pacientes = [pac(1, 'María González', '4B'), pac(2, 'Luis Soto', '2'), pac(3, 'Rosa Fernández')]
const registros = [
  reg(1, '2026-09-15', { tomas: [{ id: 'a', hora: '08:00', sistolica: 150, diastolica: 90, temperatura: 36.5 }], alimentacion: { estado: 'positiva' } }),
  reg(1, HOY, { tomas: [{ id: 'b', hora: '08:00', sistolica: 120, diastolica: 80, temperatura: 38.1 }], alimentacion: { estado: 'negativa', comentario: 'no quiso cenar' }, sueno: 'Durmió bien' }),
  reg(2, '2026-09-15', { tomas: [{ id: 'c', hora: '09:00', saturacion: 88, glucemia: 210 }], catarsis: 'No hizo', sueno: 'Insomnio' }),
]
const ultimas = new Map([[1, HOY], [2, '2026-09-15']])
const d: DatosAsistente = { pacientes, registros, ultimas, hoy: HOY }

describe('asistente local', () => {
  it('encuentra al paciente por nombre, apellido o con errores', () => {
    expect(buscarPacienteEnTexto(normalizar('¿Cómo está María?'), pacientes)?.id).toBe(1)
    expect(buscarPacienteEnTexto(normalizar('como anda gonzales'), pacientes)?.id).toBe(1)
    expect(buscarPacienteEnTexto(normalizar('que falta cargar'), pacientes)).toBeUndefined()
  })

  it('estado de un paciente', () => {
    const r = responder('¿Cómo está María?', d)
    expect(r.texto).toMatch(/María González \(hab\. 4B\): último registro hoy/)
    expect(r.lineas?.join('\n')).toMatch(/Temperatura 38,1 °C ⚠/)
    expect(r.lineas?.join('\n')).toMatch(/Alimentación: Negativa \(no quiso cenar\)/)
    expect(r.alerta).toBe(true)
    expect(r.enlaces?.[0].a).toBe('/pacientes/1')
  })

  it('una medida de un paciente', () => {
    const r = responder('presión de maria', d)
    expect(r.lineas).toEqual(['16/09 08:00: 120/80 mmHg', '15/09 08:00: 150/90 mmHg  ⚠ fuera de lo normal'])
  })

  it('fiebre, saturación baja y presión alta', () => {
    expect(responder('¿Quién tuvo fiebre esta semana?', d).lineas).toEqual([expect.stringMatching(/^María González · 16\/09 08:00: 38,1 °C/)])
    expect(responder('saturación baja', d).lineas?.[0]).toMatch(/Luis Soto .* 88 %/)
    expect(responder('presion alta', d).texto).toMatch(/^1 paciente tuvo presión alta/)
    expect(responder('fiebre ayer', d).texto).toMatch(/Nadie/)
  })

  it('pendientes, alertas, alimentación, catarsis, sueño y resumen', () => {
    expect(responder('qué falta cargar', d).lineas).toEqual(['Luis Soto (hab. 2)', 'Rosa Fernández'])
    expect(responder('alertas', d).texto).toMatch(/para revisar/)
    expect(responder('quién no comió', d).lineas).toEqual(['María González · 16/09: no quiso cenar'])
    expect(responder('quien no hizo catarsis', d).lineas).toEqual(['Luis Soto · 15/09: No hizo'])
    expect(responder('quien durmió mal', d).lineas).toEqual(['Luis Soto · 15/09: Insomnio'])
    expect(responder('resumen de hoy', d).lineas).toContain('Pacientes con registro: 1')
    expect(responder('cuantos pacientes hay', d).texto).toBe('Hay 3 pacientes activos.')
    expect(responder('cuando fue la última copia', d).texto).toMatch(/ninguna copia/)
  })

  it('si no entiende, ofrece ejemplos', () => {
    const r = responder('xyzzy', d)
    expect(r.texto).toMatch(/No te entendí/)
    expect(r.lineas?.length).toBeGreaterThan(3)
  })
})
