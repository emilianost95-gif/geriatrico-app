/**
 * Asistente local ("Preguntale a la app").
 * Entiende preguntas simples en español y responde con los datos del dispositivo.
 * No usa internet ni IA: busca palabras clave, nombres de pacientes y períodos.
 */
import { fechaCorta, sumarDias } from '../lib/fechas'
import { ordenarTomas } from '../lib/tomas'
import { normalizar, similitud } from '../lib/texto'
import { calcularAlertas } from './alertas'
import { DEF_TOMA, fueraDeNormal, type CampoNumericoToma } from './campos'
import type { FechaISO, Paciente, Registro } from './tipos'

export interface DatosAsistente {
  pacientes: Paciente[]
  /** Registros de los últimos ~31 días */
  registros: Registro[]
  /** Última fecha con registro de cada paciente */
  ultimas: Map<number, FechaISO>
  hoy: FechaISO
  ultimaCopia?: string
}

export interface Respuesta {
  texto: string
  lineas?: string[]
  enlaces?: { texto: string; a: string }[]
  /** true cuando lo que se muestra es un aviso importante */
  alerta?: boolean
}

export const SUGERENCIAS = [
  'Resumen de hoy',
  '¿Qué falta cargar?',
  '¿Quién tuvo fiebre esta semana?',
  '¿Quién no comió?',
  'Presión alta esta semana',
  'Alertas',
]

interface Periodo {
  desde: FechaISO
  hasta: FechaISO
  texto: string
}

function leerPeriodo(q: string, hoy: FechaISO, porDefecto: 'hoy' | 'semana' = 'semana'): Periodo {
  if (/\bayer\b/.test(q)) return { desde: sumarDias(hoy, -1), hasta: sumarDias(hoy, -1), texto: 'ayer' }
  if (/\bhoy\b/.test(q)) return { desde: hoy, hasta: hoy, texto: 'hoy' }
  if (/\bmes\b|30 dias/.test(q)) return { desde: sumarDias(hoy, -29), hasta: hoy, texto: 'en los últimos 30 días' }
  if (/semana|7 dias/.test(q) || porDefecto === 'semana') return { desde: sumarDias(hoy, -6), hasta: hoy, texto: 'en los últimos 7 días' }
  return { desde: hoy, hasta: hoy, texto: 'hoy' }
}

const MEDIDAS: { clave: CampoNumericoToma; patron: RegExp }[] = [
  { clave: 'temperatura', patron: /temperatura|fiebre|febril|\btemp\b/ },
  { clave: 'saturacion', patron: /saturaci|oxigeno|\bsat\b/ },
  { clave: 'glucemia', patron: /glucemia|glicemia|azucar|\bhgt\b|glucosa/ },
  { clave: 'frecuenciaCardiaca', patron: /pulso|frecuencia cardiaca|\bfc\b|latidos/ },
  { clave: 'frecuenciaRespiratoria', patron: /respiraci|\bfr\b/ },
  { clave: 'sistolica', patron: /presion|tension|\bpa\b|\bta\b/ },
]

const fmt = (v: number) => String(v).replace('.', ',')
/** 2026-09-16 → 16/09 (en el chat los datos son del último mes) */
const dm = (f: FechaISO) => `${f.slice(8, 10)}/${f.slice(5, 7)}`

/** Busca un paciente nombrado en la pregunta (por nombre, apellido o con errores de tipeo). */
export function buscarPacienteEnTexto(q: string, pacientes: Paciente[]): Paciente | undefined {
  const palabras = q.split(' ').filter((p) => p.length >= 3)
  let mejor: { p: Paciente; puntaje: number } | undefined
  for (const p of pacientes) {
    const partes = normalizar(p.nombre).split(' ').filter((x) => x.length >= 3)
    let puntaje = 0
    for (const parte of partes) {
      const s = Math.max(0, ...palabras.map((w) => similitud(w, parte)))
      if (s >= 0.8) puntaje += s
    }
    if (normalizar(p.nombre) && q.includes(normalizar(p.nombre))) puntaje += 2
    if (puntaje > 0 && (!mejor || puntaje > mejor.puntaje || (puntaje === mejor.puntaje && p.activo && !mejor.p.activo))) {
      mejor = { p, puntaje }
    }
  }
  return mejor?.p
}

function valorTexto(clave: CampoNumericoToma, t: Registro['tomas'][number]): string | undefined {
  if (clave === 'sistolica') {
    if (t.sistolica == null && t.diastolica == null) return undefined
    return `${t.sistolica ?? '?'}/${t.diastolica ?? '?'} mmHg`
  }
  const v = t[clave]
  return v == null ? undefined : `${fmt(v)} ${DEF_TOMA[clave].unidad}`
}

function estadoPaciente(p: Paciente, d: DatosAsistente, medida?: CampoNumericoToma): Respuesta {
  const propios = d.registros.filter((r) => r.pacienteId === p.id).sort((a, b) => a.fecha.localeCompare(b.fecha))
  const enlaces = [
    { texto: 'Ver historial y gráficos', a: `/pacientes/${p.id}` },
    { texto: 'Cargar registro de hoy', a: `/registro?paciente=${p.id}&fecha=${d.hoy}` },
  ]
  const ultima = d.ultimas.get(p.id!)
  if (propios.length === 0) {
    return {
      texto: ultima
        ? `${p.nombre} no tiene registros en el último mes. El último es del ${fechaCorta(ultima)}.`
        : `${p.nombre} todavía no tiene registros.`,
      enlaces,
    }
  }

  if (medida) {
    const valores = propios.flatMap((r) =>
      ordenarTomas(r.tomas)
        .map((t) => ({ r, t, txt: valorTexto(medida, t), fuera: fueraDeNormal(medida, t[medida]) || (medida === 'sistolica' && fueraDeNormal('diastolica', t.diastolica)) }))
        .filter((x) => x.txt),
    )
    const ult = valores.slice(-8)
    const nombreMedida = medida === 'sistolica' ? 'Presión' : DEF_TOMA[medida].formulario
    if (ult.length === 0) return { texto: `No hay mediciones de ${nombreMedida.toLowerCase()} de ${p.nombre} en el último mes.`, enlaces }
    return {
      texto: `${nombreMedida} de ${p.nombre} (últimas ${ult.length} mediciones):`,
      lineas: ult.reverse().map((x) => `${dm(x.r.fecha)}${x.t.hora ? ` ${x.t.hora}` : ''}: ${x.txt}${x.fuera ? '  ⚠ fuera de lo normal' : ''}`),
      enlaces,
    }
  }

  const r = propios[propios.length - 1]
  const lineas: string[] = []
  const t = ordenarTomas(r.tomas).at(-1)
  if (t) {
    const partes = (Object.keys(DEF_TOMA) as CampoNumericoToma[])
      .filter((k) => k !== 'diastolica' && valorTexto(k, t))
      .map((k) => `${k === 'sistolica' ? 'Presión' : DEF_TOMA[k].formulario} ${valorTexto(k, t)}${fueraDeNormal(k, t[k]) ? ' ⚠' : ''}`)
    if (partes.length) lineas.push(`Últimos signos${t.hora ? ` (${t.hora})` : ''}: ${partes.join(' · ')}`)
  }
  if (r.alimentacion.estado) {
    lineas.push(`Alimentación: ${r.alimentacion.estado === 'positiva' ? 'Positiva' : 'Negativa'}${r.alimentacion.comentario ? ` (${r.alimentacion.comentario})` : ''}`)
  }
  for (const [k, etiqueta] of [['sueno', 'Sueño'], ['comportamiento', 'Comportamiento'], ['diuresis', 'Diuresis'], ['catarsis', 'Catarsis'], ['observaciones', 'Observaciones']] as const) {
    if (r[k]) lineas.push(`${etiqueta}: ${r[k]}`)
  }
  const alertas = calcularAlertas([p], d.registros, d.ultimas, { hoy: d.hoy }).filter((a) => a.gravedad !== 'aviso')
  if (alertas.length) lineas.push(`Para revisar: ${alertas.map((a) => a.titulo).join(', ')}`)
  const semana = propios.filter((x) => x.fecha >= sumarDias(d.hoy, -6)).length
  lineas.push(`Registros en los últimos 7 días: ${semana}`)
  const cuando = r.fecha === d.hoy ? 'hoy' : r.fecha === sumarDias(d.hoy, -1) ? 'ayer' : `el ${dm(r.fecha)}`
  return {
    texto: `${p.nombre}${p.habitacion ? ` (hab. ${p.habitacion})` : ''}: último registro ${cuando}.`,
    lineas,
    enlaces,
    alerta: alertas.some((a) => a.gravedad === 'urgente'),
  }
}

function fueraDeRango(medida: CampoNumericoToma, q: string, d: DatosAsistente): Respuesta {
  const per = leerPeriodo(q, d.hoy)
  const quiereAlto = /alt|fiebre|febril|subi/.test(q)
  const quiereBajo = /baj/.test(q)
  const def = DEF_TOMA[medida]
  const nombres = new Map(d.pacientes.map((p) => [p.id!, p.nombre]))
  const hallazgos: string[] = []
  const ids = new Set<number>()
  for (const r of d.registros) {
    if (r.fecha < per.desde || r.fecha > per.hasta || !nombres.has(r.pacienteId)) continue
    for (const t of ordenarTomas(r.tomas)) {
      const claves: CampoNumericoToma[] = medida === 'sistolica' ? ['sistolica', 'diastolica'] : [medida]
      const fuera = claves.some((k) => {
        const v = t[k]
        const n = DEF_TOMA[k].normal
        if (v == null || !n) return false
        const umbralFiebre = medida === 'temperatura' && /fiebre|febril/.test(q) ? 37.5 : n[1]
        if (quiereAlto && !quiereBajo) return medida === 'temperatura' ? v >= umbralFiebre : v > n[1]
        if (quiereBajo && !quiereAlto) return v < n[0]
        return fueraDeNormal(k, v)
      })
      if (fuera) {
        ids.add(r.pacienteId)
        hallazgos.push(`${nombres.get(r.pacienteId)} · ${dm(r.fecha)}${t.hora ? ` ${t.hora}` : ''}: ${valorTexto(medida, t)}`)
      }
    }
  }
  const nombreMedida = medida === 'sistolica' ? 'presión' : /fiebre|febril/.test(q) ? 'fiebre' : def.formulario.toLowerCase()
  const sentido = /fiebre|febril/.test(q) ? '' : quiereAlto && !quiereBajo ? ' alta' : quiereBajo && !quiereAlto ? ' baja' : ' fuera de lo normal'
  if (hallazgos.length === 0) return { texto: `Nadie tuvo ${nombreMedida}${sentido} ${per.texto}. 👍` }
  return {
    texto: `${ids.size} ${ids.size === 1 ? 'paciente tuvo' : 'pacientes tuvieron'} ${nombreMedida}${sentido} ${per.texto}:`,
    lineas: hallazgos.slice(0, 20).concat(hallazgos.length > 20 ? [`…y ${hallazgos.length - 20} mediciones más`] : []),
    alerta: true,
  }
}

function pendientes(d: DatosAsistente): Respuesta {
  const activos = d.pacientes.filter((p) => p.activo)
  const faltan = activos.filter((p) => d.ultimas.get(p.id!) !== d.hoy)
  if (activos.length === 0) return { texto: 'Todavía no hay pacientes cargados.', enlaces: [{ texto: 'Agregar paciente', a: '/pacientes/nuevo' }] }
  if (faltan.length === 0) return { texto: `¡Listo! Los ${activos.length} pacientes tienen su registro de hoy. 🎉` }
  return {
    texto: `Falta cargar hoy a ${faltan.length} de ${activos.length} pacientes:`,
    lineas: faltan.map((p) => `${p.nombre}${p.habitacion ? ` (hab. ${p.habitacion})` : ''}`),
    enlaces: [{ texto: 'Hacer una ronda de signos', a: '/ronda' }],
  }
}

function alertasDelDia(d: DatosAsistente): Respuesta {
  const nombres = new Map(d.pacientes.map((p) => [p.id!, p.nombre]))
  const al = calcularAlertas(d.pacientes, d.registros, d.ultimas, { hoy: d.hoy })
  if (al.length === 0) return { texto: 'No hay alertas de hoy ni de ayer. 👍' }
  const urg = al.filter((a) => a.gravedad === 'urgente').length
  return {
    texto: `Hay ${al.length} ${al.length === 1 ? 'cosa' : 'cosas'} para revisar${urg ? ` (${urg} urgentes)` : ''}:`,
    lineas: al.slice(0, 15).map((a) => `${a.gravedad === 'urgente' ? '🔴' : a.gravedad === 'atencion' ? '🟠' : '🔵'} ${nombres.get(a.pacienteId)}: ${a.titulo}`),
    enlaces: [{ texto: 'Ver en la pantalla Hoy', a: '/' }],
    alerta: urg > 0,
  }
}

function resumen(q: string, d: DatosAsistente): Respuesta {
  const per = leerPeriodo(q, d.hoy, /semana|mes|7|30/.test(q) ? 'semana' : 'hoy')
  const regs = d.registros.filter((r) => r.fecha >= per.desde && r.fecha <= per.hasta)
  const activos = d.pacientes.filter((p) => p.activo)
  const tomas = regs.reduce((n, r) => n + r.tomas.length, 0)
  const conRegistro = new Set(regs.map((r) => r.pacienteId)).size
  const negativa = regs.filter((r) => r.alimentacion.estado === 'negativa').length
  let fuera = 0
  for (const r of regs) for (const t of r.tomas) for (const k of Object.keys(DEF_TOMA) as CampoNumericoToma[]) if (fueraDeNormal(k, t[k])) fuera++
  const lineas = [
    `Pacientes activos: ${activos.length}`,
    `Pacientes con registro: ${conRegistro}`,
    `Registros: ${regs.length} · Tomas de signos: ${tomas}`,
    `Valores fuera de lo normal: ${fuera}`,
    `Días con alimentación negativa: ${negativa}`,
  ]
  if (per.texto === 'hoy') {
    const al = calcularAlertas(d.pacientes, d.registros, d.ultimas, { hoy: d.hoy })
    lineas.push(`Alertas para revisar: ${al.length}`)
  }
  return { texto: `Resumen ${per.texto}:`, lineas, enlaces: [{ texto: 'Informe del día (en Hoy)', a: '/' }] }
}

function alimentacion(q: string, d: DatosAsistente): Respuesta {
  const per = leerPeriodo(q, d.hoy)
  const nombres = new Map(d.pacientes.map((p) => [p.id!, p.nombre]))
  const regs = d.registros
    .filter((r) => r.fecha >= per.desde && r.fecha <= per.hasta && r.alimentacion.estado === 'negativa' && nombres.has(r.pacienteId))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
  if (regs.length === 0) return { texto: `Nadie tuvo alimentación negativa ${per.texto}. 👍` }
  return {
    texto: `Alimentación negativa ${per.texto}:`,
    lineas: regs.map((r) => `${nombres.get(r.pacienteId)} · ${dm(r.fecha)}${r.alimentacion.comentario ? `: ${r.alimentacion.comentario}` : ''}`),
    alerta: true,
  }
}

function textoCampo(q: string, d: DatosAsistente, campo: 'catarsis' | 'sueno' | 'comportamiento' | 'curaciones', titulo: string, filtro?: RegExp): Respuesta {
  const per = leerPeriodo(q, d.hoy)
  const nombres = new Map(d.pacientes.map((p) => [p.id!, p.nombre]))
  const regs = d.registros
    .filter((r) => r.fecha >= per.desde && r.fecha <= per.hasta && nombres.has(r.pacienteId) && r[campo] && (!filtro || filtro.test(normalizar(r[campo]))))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
  if (regs.length === 0) return { texto: `No encontré registros de ${titulo.toLowerCase()} ${per.texto}.` }
  return {
    texto: `${titulo} ${per.texto}:`,
    lineas: regs.slice(0, 25).map((r) => `${nombres.get(r.pacienteId)} · ${dm(r.fecha)}: ${r[campo]}`),
  }
}

function ayuda(): Respuesta {
  return {
    texto: 'Puedo responder preguntas sobre los datos cargados en este dispositivo. Por ejemplo:',
    lineas: [
      '"¿Cómo está María?" o solo el nombre del paciente',
      '"Presión de Luis" · "Glucemia de Teresa"',
      '"¿Quién tuvo fiebre ayer?" · "Saturación baja esta semana"',
      '"¿Qué falta cargar?" · "Alertas" · "Resumen de la semana"',
      '"¿Quién no comió?" · "¿Quién no hizo catarsis?" · "¿Quién durmió mal?"',
      '"¿Cuándo fue la última copia?"',
    ],
  }
}

export function responder(pregunta: string, d: DatosAsistente): Respuesta {
  const q = normalizar(pregunta)
  if (!q) return ayuda()
  if (/^(ayuda|hola|que (puedo|podes|sabes)|como funciona)/.test(q)) return ayuda()

  const medida = MEDIDAS.find((m) => m.patron.test(q))?.clave
  const paciente = buscarPacienteEnTexto(q, d.pacientes)
  if (paciente) return estadoPaciente(paciente, d, medida)

  if (/falta|pendiente|sin registro|sin cargar|quien no (se )?(cargo|registr)|cargar/.test(q)) return pendientes(d)
  if (/alerta|revisar|urgente|preocup/.test(q)) return alertasDelDia(d)
  if (/copia|respaldo|backup/.test(q)) {
    const dias = d.ultimaCopia ? Math.floor((Date.parse(`${d.hoy}T12:00:00`) - Date.parse(d.ultimaCopia)) / 86400000) : undefined
    return {
      texto: d.ultimaCopia
        ? `La última copia de seguridad es del ${new Date(d.ultimaCopia).toLocaleDateString('es')}${dias != null && dias > 0 ? ` (hace ${dias} ${dias === 1 ? 'día' : 'días'})` : ' (hoy)'}.`
        : 'Todavía no se hizo ninguna copia de seguridad.',
      enlaces: [{ texto: 'Hacer copia ahora', a: '/excel?tab=copias' }],
      alerta: !d.ultimaCopia || (dias ?? 0) >= 7,
    }
  }
  if (/comi|alimenta|apetito|rechaz/.test(q)) return alimentacion(q, d)
  if (/catarsis|deposici|evacu|constip|estren/.test(q)) return textoCampo(q, d, 'catarsis', 'Catarsis', /\bno\b|constip/.test(q) ? /^no\b|no hizo|ausente|constip/ : undefined)
  if (/durm|sueno|insomn/.test(q)) return textoCampo(q, d, 'sueno', 'Sueño', /mal|poco|insomn|no durm/.test(q) ? /insomn|poco|mal|despert|no durm/ : undefined)
  if (/comport|agitad|desorient|animo|psiqu/.test(q)) return textoCampo(q, d, 'comportamiento', 'Comportamiento', /agitad|desorient|mal/.test(q) ? /agitad|desorient|confus|agresiv|llor/ : undefined)
  if (/curaci|herida|escara|ulcera/.test(q)) return textoCampo(q, d, 'curaciones', 'Curaciones')
  if (medida) return fueraDeRango(medida, q, d)
  if (/cuantos pacientes|cantidad de pacientes/.test(q)) {
    const activos = d.pacientes.filter((p) => p.activo).length
    return { texto: `Hay ${activos} pacientes activos${d.pacientes.length > activos ? ` y ${d.pacientes.length - activos} dados de alta` : ''}.` }
  }
  if (/resumen|como (va|vamos|estamos|esta el dia)|semana|hoy|ayer|mes/.test(q)) return resumen(q, d)

  return {
    texto: 'No te entendí del todo. 🤔 Probá con el nombre de un paciente o con alguna de estas preguntas:',
    lineas: ayuda().lineas,
  }
}
