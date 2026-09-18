import { describe, expect, it } from 'vitest'
import { reconocerEncabezado, horaDeEncabezado } from '../src/excel/columnas'
import {
  parsearAlimentacion,
  parsearFecha,
  parsearHora,
  parsearPresion,
  parsearSigno,
  parsearSignosTexto,
} from '../src/excel/importar/parsers'
import { claveNombre, nombrePropio } from '../src/lib/texto'

describe('reconocer encabezados', () => {
  const casos: [string, string][] = [
    ['Nombre', 'paciente'],
    ['Paciente', 'paciente'],
    ['Nombre del paciente', 'paciente'],
    ['NOMBRE Y APELLIDO', 'paciente'],
    ['Apellido', 'apellido'],
    ['Fecha', 'fecha'],
    ['Día', 'fecha'],
    ['P.A.', 'presion'],
    ['PA (mmHg)', 'presion'],
    ['Tensión arterial', 'presion'],
    ['T.A. mañana', 'presion'],
    ['F.C.', 'frecuenciaCardiaca'],
    ['Pulso', 'frecuenciaCardiaca'],
    ['Temp °C', 'temperatura'],
    ['T°', 'temperatura'],
    ['Temperatrua', 'temperatura'],
    ['SatO2 %', 'saturacion'],
    ['SpO2', 'saturacion'],
    ['HGT', 'glucemia'],
    ['Glicemia (mg/dl)', 'glucemia'],
    ['Control de leucemia', 'laboratorio'],
    ['Zonda SV', 'sondaVesical'],
    ['S.V.', 'sondaVesical'],
    ['SNG', 'sng'],
    ['Sonda nasogástrica', 'sng'],
    ['Diuresis', 'diuresis'],
    ['Deposiciones', 'catarsis'],
    ['Catarsis', 'catarsis'],
    ['Curaciones', 'curaciones'],
    ['Obs.', 'observaciones'],
    ['Obsevaciones', 'observaciones'],
    ['Alimentación', 'alimentacion'],
    ['Comentario alimentación', 'alimentacionComentario'],
    ['Rotación', 'rotacion'],
    ['Cambios de posición', 'rotacion'],
    ['Ejercicio', 'ejercicio'],
    ['Control del sueño', 'sueno'],
    ['Comportamiento psíquico', 'comportamiento'],
    ['Estado de ánimo', 'comportamiento'],
    ['Signos vitales', 'signosTexto'],
    ['Hora', 'hora'],
    ['Hab.', 'habitacion'],
    ['RUT', 'documento'],
    ['PA 8:00', 'presion'],
  ]
  it.each(casos)('"%s" → %s', (texto, esperado) => {
    expect(reconocerEncabezado(texto).id).toBe(esperado)
  })

  it('no reconoce columnas sin relación', () => {
    expect(reconocerEncabezado('Enfermera de turno').puntaje).toBeLessThan(0.7)
    expect(reconocerEncabezado('Firma').puntaje).toBeLessThan(0.7)
  })

  it('saca la hora del encabezado', () => {
    expect(horaDeEncabezado('PA 8:00')).toBe('08:00')
    expect(horaDeEncabezado('Temp 20 hs')).toBe('20:00')
    expect(horaDeEncabezado('SatO2')).toBeUndefined()
  })
})

describe('nombres', () => {
  it('compara sin tildes ni orden', () => {
    expect(claveNombre('Pérez, Juan')).toBe(claveNombre('juan  PEREZ'))
  })
  it('pone mayúsculas', () => {
    expect(nombrePropio('  maría   josé GONZÁLEZ ')).toBe('María José González')
  })
})

describe('fechas', () => {
  it.each([
    ['16/09/2026', '2026-09-16'],
    ['16-9-26', '2026-09-16'],
    ['16.09.2026', '2026-09-16'],
    ['2026-09-16', '2026-09-16'],
    ['16 de septiembre de 2026', '2026-09-16'],
    ['miércoles 16 sep 2026', '2026-09-16'],
  ])('%s', (texto, iso) => {
    expect(parsearFecha(texto).valor).toBe(iso)
  })
  it('fecha de Excel (Date UTC)', () => {
    expect(parsearFecha(new Date(Date.UTC(2026, 8, 16))).valor).toBe('2026-09-16')
  })
  it('número de serie', () => {
    expect(parsearFecha(46281).valor).toBe('2026-09-16')
  })
  it('sin año usa el año indicado y avisa', () => {
    const p = parsearFecha('16/09', 2026)
    expect(p.valor).toBe('2026-09-16')
    expect(p.aviso).toBeTruthy()
  })
  it('formato mes/día se detecta', () => {
    expect(parsearFecha('09/16/2026').valor).toBe('2026-09-16')
  })
  it('error en fechas imposibles', () => {
    expect(parsearFecha('31/02/2026').error).toBeTruthy()
    expect(parsearFecha('ayer').error).toBeTruthy()
  })
})

describe('horas', () => {
  it.each([
    ['8:30', '08:30'],
    ['08.30', '08:30'],
    ['8hs', '08:00'],
    ['20 hs', '20:00'],
    ['8 pm', '20:00'],
    [0.5, '12:00'],
    [new Date(Date.UTC(1899, 11, 30, 21, 15)), '21:15'],
  ] as const)('%s', (v, esperado) => {
    expect(parsearHora(v as never).valor).toBe(esperado)
  })
})

describe('signos vitales', () => {
  it('presión en distintos formatos', () => {
    expect(parsearPresion('120/80').valor).toEqual({ sistolica: 120, diastolica: 80 })
    expect(parsearPresion('130 - 85 mmHg').valor).toEqual({ sistolica: 130, diastolica: 85 })
    const cm = parsearPresion('12/8')
    expect(cm.valor).toEqual({ sistolica: 120, diastolica: 80 })
    expect(cm.aviso).toMatch(/120\/80/)
  })
  it('corrige temperatura sin coma y saturación en proporción', () => {
    expect(parsearSigno('temperatura', '365').valor).toBe(36.5)
    expect(parsearSigno('temperatura', '36,7 °').valor).toBe(36.7)
    expect(parsearSigno('saturacion', 0.96).valor).toBe(96)
  })
  it('avisa valores fuera de rango', () => {
    const p = parsearSigno('frecuenciaCardiaca', 400)
    expect(p.valor).toBe(400)
    expect(p.aviso).toMatch(/fuera/)
  })
  it('texto libre con separadores (formato de exportación)', () => {
    const r = parsearSignosTexto('08:00 · PA 120/80 · FC 72 · T° 36,5 · SatO2 96% · FR 16 · Gluc 110 · tos leve')
    expect(r.tomas).toHaveLength(1)
    expect(r.tomas[0]).toMatchObject({
      hora: '08:00', sistolica: 120, diastolica: 80, frecuenciaCardiaca: 72,
      temperatura: 36.5, saturacion: 96, frecuenciaRespiratoria: 16, glucemia: 110, nota: 'tos leve',
    })
  })
  it('texto libre escrito a mano', () => {
    const r = parsearSignosTexto('PA 130/85 FC 80 T 36.8 Sat 95\n20hs 12/8 72x\' 36,5° 94%')
    expect(r.tomas).toHaveLength(2)
    expect(r.tomas[0]).toMatchObject({ sistolica: 130, diastolica: 85, frecuenciaCardiaca: 80, temperatura: 36.8, saturacion: 95 })
    expect(r.tomas[1]).toMatchObject({ hora: '20:00', sistolica: 120, diastolica: 80, frecuenciaCardiaca: 72, temperatura: 36.5, saturacion: 94 })
  })
})

describe('alimentación', () => {
  it.each([
    ['Positiva', 'positiva', undefined],
    ['positiva - comió todo', 'positiva', 'comió todo'],
    ['+', 'positiva', undefined],
    ['Sí', 'positiva', undefined],
    ['Comió bien', 'positiva', 'Comió bien'],
    ['Negativa', 'negativa', undefined],
    ['NEG (rechazó el almuerzo)', 'negativa', 'rechazó el almuerzo'],
    ['No', 'negativa', undefined],
    ['Rechaza la cena', 'negativa', 'Rechaza la cena'],
    ['-', 'negativa', undefined],
  ])('"%s"', (texto, estado, comentario) => {
    expect(parsearAlimentacion(texto).valor).toEqual({ estado, comentario })
  })
  it('si no se entiende, lo guarda como comentario y avisa', () => {
    const p = parsearAlimentacion('media porción')
    expect(p.valor).toEqual({ estado: '', comentario: 'media porción' })
    expect(p.aviso).toBeTruthy()
  })
})
