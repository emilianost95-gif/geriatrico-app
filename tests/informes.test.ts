import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Paciente, Registro } from '../src/domain/tipos'
import { crearInformeDias, crearInformePaciente } from '../src/pdf/informes'

const pac = (id: number, nombre: string, extra: Partial<Paciente> = {}): Paciente => ({
  id, nombre, nombreClave: nombre.toLowerCase(), activo: true, creadoEn: 0, actualizadoEn: 0, ...extra,
})

function registros(pacienteId: number, dias: number): Registro[] {
  return Array.from({ length: dias }, (_, i) => {
    const fecha = `2026-09-${String(i + 1).padStart(2, '0')}`
    return {
      id: pacienteId * 100 + i,
      pacienteId,
      fecha,
      creadoEn: 0,
      actualizadoEn: 0,
      tomas: [
        { id: `${i}a`, hora: '08:00', sistolica: 120 + (i % 5) * 8, diastolica: 78 + (i % 3) * 4, frecuenciaCardiaca: 70 + i, temperatura: 36.4 + (i % 4) * 0.5, saturacion: 96 - (i % 6), glucemia: 100 + i * 7 },
        { id: `${i}b`, hora: '20:00', sistolica: 130, diastolica: 85, temperatura: 36.8, nota: i === 3 ? 'Dolor de cabeza, se avisó al médico' : undefined },
      ],
      alimentacion: { estado: i % 4 === 0 ? 'negativa' : 'positiva', comentario: i % 4 === 0 ? 'Rechazó la cena' : undefined },
      diuresis: 'Normal',
      catarsis: i % 2 ? 'Sí, normal' : 'No hizo',
      sueno: 'Durmió bien',
      comportamiento: 'Tranquila, orientada',
      observaciones: i === 5 ? 'Visita de la hija. Se la notó contenta y conversadora durante toda la tarde, pidió volver a caminar mañana.' : undefined,
    }
  })
}

const SALIDA = process.env.PDF_SALIDA

describe('informes PDF', () => {
  it('informe de paciente con tildes, tablas y gráficos', async () => {
    const blob = await crearInformePaciente({
      paciente: pac(1, 'María José Núñez', { habitacion: '4B', documento: '5.123.456-7', fechaNacimiento: '1938-05-03', contacto: 'Laura (hija) 9 1234 5678', notas: 'Diabética. Dieta hiposódica.' }),
      registros: registros(1, 16),
      desde: '2026-09-01',
      hasta: '2026-09-16',
      nombreHogar: 'Residencia Los Aromos',
    })
    const buf = Buffer.from(await blob.arrayBuffer())
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(buf.length).toBeGreaterThan(5000)
    if (SALIDA) writeFileSync(`${SALIDA}/informe-paciente.pdf`, buf)
  })

  it('informe del día con pendientes y alertas', async () => {
    const pacientes = [pac(1, 'María José Núñez', { habitacion: '4B' }), pac(2, 'Luis Soto', { habitacion: '7' }), pac(3, 'Rosa Fernández')]
    const blob = await crearInformeDias({
      pacientes,
      registros: [...registros(1, 16), ...registros(2, 16)].filter((r) => r.fecha === '2026-09-16'),
      desde: '2026-09-16',
      hasta: '2026-09-16',
      nombreHogar: '',
      conPendientes: true,
    })
    const buf = Buffer.from(await blob.arrayBuffer())
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
    if (SALIDA) writeFileSync(`${SALIDA}/informe-dia.pdf`, buf)
  })
})
