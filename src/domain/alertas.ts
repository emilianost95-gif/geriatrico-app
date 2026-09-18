import { hoyISO, sumarDias } from '../lib/fechas'
import { normalizar } from '../lib/texto'
import { DEF_TOMA, fueraDeNormal, type CampoNumericoToma } from './campos'
import type { FechaISO, Paciente, Registro } from './tipos'

export type Gravedad = 'urgente' | 'atencion' | 'aviso'

export interface Alerta {
  id: string
  pacienteId: number
  gravedad: Gravedad
  titulo: string
  detalle?: string
  fecha?: FechaISO
  hora?: string
}

/**
 * Umbrales "urgentes" pensados para adultos mayores. Son orientativos:
 * sirven para llamar la atención, no reemplazan el criterio médico.
 */
const URGENTE: Record<CampoNumericoToma, (v: number) => boolean> = {
  sistolica: (v) => v >= 180 || v < 90,
  diastolica: (v) => v >= 110 || v < 50,
  frecuenciaCardiaca: (v) => v > 120 || v < 50,
  temperatura: (v) => v >= 38 || v < 35,
  saturacion: (v) => v < 90,
  frecuenciaRespiratoria: (v) => v > 25 || v < 10,
  glucemia: (v) => v < 70 || v > 300,
}

const NOMBRE_CORTO: Record<CampoNumericoToma, string> = {
  sistolica: 'Presión máxima',
  diastolica: 'Presión mínima',
  frecuenciaCardiaca: 'Pulso',
  temperatura: 'Temperatura',
  saturacion: 'Saturación',
  frecuenciaRespiratoria: 'Respiraciones',
  glucemia: 'Glucemia',
}

const fmt = (v: number) => String(v).replace('.', ',')

const esNegativo = (texto?: string) => {
  const n = normalizar(texto ?? '')
  return /^(no\b|no hizo|sin |negativ|ausente|0$)/.test(n)
}

export interface OpcionesAlertas {
  hoy?: FechaISO
  /** Días hacia atrás para revisar signos y alimentación (incluye hoy) */
  diasRevisados?: number
}

/**
 * Calcula las alertas para la pantalla "Hoy".
 * @param registros registros de los últimos días (al menos 3)
 * @param ultimaFecha última fecha con registro de cada paciente
 */
export function calcularAlertas(
  pacientes: Paciente[],
  registros: Registro[],
  ultimaFecha: Map<number, FechaISO>,
  { hoy = hoyISO(), diasRevisados = 2 }: OpcionesAlertas = {},
): Alerta[] {
  const alertas: Alerta[] = []
  const activos = new Map(pacientes.filter((p) => p.activo).map((p) => [p.id!, p]))
  const desde = sumarDias(hoy, -(diasRevisados - 1))
  const recientes = registros.filter((r) => r.fecha >= desde && r.fecha <= hoy && activos.has(r.pacienteId))

  for (const r of recientes) {
    // Signos vitales: se toma el peor valor de cada tipo en el día
    const peores = new Map<CampoNumericoToma, { valor: number; hora?: string; urgente: boolean }>()
    for (const t of r.tomas) {
      for (const campo of Object.keys(DEF_TOMA) as CampoNumericoToma[]) {
        const v = t[campo]
        if (v == null || !fueraDeNormal(campo, v)) continue
        const urgente = URGENTE[campo](v)
        const previo = peores.get(campo)
        if (!previo || (urgente && !previo.urgente)) peores.set(campo, { valor: v, hora: t.hora, urgente })
      }
    }
    for (const [campo, p] of peores) {
      const def = DEF_TOMA[campo]
      alertas.push({
        id: `${r.id}-${campo}`,
        pacienteId: r.pacienteId,
        gravedad: p.urgente ? 'urgente' : 'atencion',
        titulo: `${NOMBRE_CORTO[campo]} ${fmt(p.valor)} ${def.unidad}`,
        detalle: `Normal: ${fmt(def.normal![0])} a ${fmt(def.normal![1])} ${def.unidad}`,
        fecha: r.fecha,
        hora: p.hora,
      })
    }
    if (r.alimentacion.estado === 'negativa') {
      alertas.push({
        id: `${r.id}-alim`,
        pacienteId: r.pacienteId,
        gravedad: 'atencion',
        titulo: 'Alimentación negativa',
        detalle: r.alimentacion.comentario,
        fecha: r.fecha,
      })
    }
  }

  // Varios días seguidos sin catarsis
  const porPaciente = new Map<number, Registro[]>()
  for (const r of registros) {
    if (!activos.has(r.pacienteId) || r.fecha > hoy) continue
    const l = porPaciente.get(r.pacienteId) ?? []
    l.push(r)
    porPaciente.set(r.pacienteId, l)
  }
  for (const [id, lista] of porPaciente) {
    const conCatarsis = lista.filter((r) => r.catarsis).sort((a, b) => b.fecha.localeCompare(a.fecha))
    let seguidos = 0
    for (const r of conCatarsis) {
      if (!esNegativo(r.catarsis)) break
      seguidos++
    }
    if (seguidos >= 3) {
      alertas.push({
        id: `${id}-catarsis`,
        pacienteId: id,
        gravedad: 'atencion',
        titulo: `${seguidos} registros seguidos sin catarsis`,
        detalle: `Último: ${conCatarsis[0].catarsis}`,
        fecha: conCatarsis[0].fecha,
      })
    }
  }

  // Pacientes sin registros recientes
  const limite = sumarDias(hoy, -2)
  for (const [id] of activos) {
    const ultima = ultimaFecha.get(id)
    if (ultima && ultima >= limite) continue
    alertas.push({
      id: `${id}-sin-registro`,
      pacienteId: id,
      gravedad: 'aviso',
      titulo: ultima ? 'Hace más de 2 días sin registros' : 'Todavía no tiene registros',
      fecha: ultima,
    })
  }

  const orden: Record<Gravedad, number> = { urgente: 0, atencion: 1, aviso: 2 }
  return alertas.sort(
    (a, b) =>
      orden[a.gravedad] - orden[b.gravedad] ||
      (b.fecha ?? '').localeCompare(a.fecha ?? '') ||
      (b.hora ?? '').localeCompare(a.hora ?? ''),
  )
}
