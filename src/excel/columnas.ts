import { ETIQUETA_CAMPO } from '../domain/campos'
import type { CampoTexto } from '../domain/tipos'
import { normalizar, similitud } from '../lib/texto'

/**
 * Todo lo que una columna de Excel puede significar para la app.
 */
export type ColumnaId =
  | 'fecha'
  | 'paciente'
  | 'apellido'
  | 'hora'
  | 'presion'
  | 'sistolica'
  | 'diastolica'
  | 'frecuenciaCardiaca'
  | 'temperatura'
  | 'saturacion'
  | 'frecuenciaRespiratoria'
  | 'glucemia'
  | 'notaToma'
  | 'signosTexto'
  | CampoTexto
  | 'alimentacion'
  | 'alimentacionComentario'
  | 'habitacion'
  | 'documento'
  | 'fechaNacimiento'
  | 'contacto'
  | 'notasPaciente'
  | 'ignorar'

export type GrupoColumna = 'clave' | 'toma' | 'registro' | 'paciente' | 'otro'

export interface DefColumna {
  id: ColumnaId
  etiqueta: string
  grupo: GrupoColumna
  /** Formas en que puede venir escrito el encabezado (se comparan normalizadas). */
  sinonimos: string[]
}

export const COLUMNAS: DefColumna[] = [
  { id: 'fecha', etiqueta: 'Fecha', grupo: 'clave', sinonimos: ['fecha', 'dia', 'fecha del registro', 'fecha registro', 'fecha de control', 'fecha control', 'date', 'f registro'] },
  {
    id: 'paciente', etiqueta: 'Nombre del paciente', grupo: 'clave',
    sinonimos: ['paciente', 'nombre', 'nombres', 'nombre del paciente', 'nombre paciente', 'nombre de paciente', 'residente', 'nombre del residente', 'nombre y apellido', 'nombres y apellidos', 'apellido y nombre', 'apellidos y nombres', 'nombre completo', 'adulto mayor', 'interno', 'interna', 'pacientes'],
  },
  { id: 'apellido', etiqueta: 'Apellido', grupo: 'clave', sinonimos: ['apellido', 'apellidos', 'apellido paterno'] },
  { id: 'hora', etiqueta: 'Hora', grupo: 'toma', sinonimos: ['hora', 'horario', 'hora toma', 'hora de toma', 'hora del control', 'hora control', 'hr', 'hs', 'hrs'] },
  { id: 'presion', etiqueta: 'Presión arterial (ej. 120/80)', grupo: 'toma', sinonimos: ['presion arterial', 'pa', 'ta', 'tension arterial', 'presion', 'tension', 'p arterial', 'pres arterial', 'control de presion'] },
  { id: 'sistolica', etiqueta: 'Presión sistólica (máxima)', grupo: 'toma', sinonimos: ['sistolica', 'pas', 'presion sistolica', 'pa sistolica', 'maxima', 'presion maxima', 'pa maxima', 'ps'] },
  { id: 'diastolica', etiqueta: 'Presión diastólica (mínima)', grupo: 'toma', sinonimos: ['diastolica', 'pad', 'presion diastolica', 'pa diastolica', 'minima', 'presion minima', 'pa minima', 'pd'] },
  { id: 'frecuenciaCardiaca', etiqueta: 'Frecuencia cardíaca', grupo: 'toma', sinonimos: ['frecuencia cardiaca', 'fc', 'pulso', 'ppm', 'latidos', 'frec cardiaca', 'f cardiaca', 'pulsaciones'] },
  { id: 'temperatura', etiqueta: 'Temperatura', grupo: 'toma', sinonimos: ['temperatura', 'temp', 't', 'tax', 'temperatura axilar', 'temp axilar', 'control de temperatura'] },
  { id: 'saturacion', etiqueta: 'Saturación O2', grupo: 'toma', sinonimos: ['saturacion', 'sat', 'sato2', 'sat o2', 'spo2', 'sp o2', 'saturacion de oxigeno', 'saturacion o2', 'oximetria', 'o2', 'sat 02', 'sato 2'] },
  { id: 'frecuenciaRespiratoria', etiqueta: 'Frecuencia respiratoria', grupo: 'toma', sinonimos: ['frecuencia respiratoria', 'fr', 'respiraciones', 'frec respiratoria', 'f respiratoria', 'resp'] },
  { id: 'glucemia', etiqueta: 'Glucemia', grupo: 'toma', sinonimos: ['glucemia', 'hgt', 'glicemia', 'glucosa', 'dextro', 'dextrostix', 'hemoglucotest', 'azucar', 'glucemia capilar', 'control de glucemia', 'control glucemia', 'hemoglucotest hgt'] },
  { id: 'notaToma', etiqueta: 'Nota de la toma', grupo: 'toma', sinonimos: ['nota', 'nota toma', 'nota de la toma', 'comentario toma', 'obs toma'] },
  { id: 'signosTexto', etiqueta: 'Signos vitales (texto)', grupo: 'toma', sinonimos: ['signos vitales', 'control de signos vitales', 'control signos vitales', 'ssvv', 'csv', 'signos', 'sv resumen', 'constantes vitales', 'controles'] },
  { id: 'laboratorio', etiqueta: 'Laboratorio', grupo: 'registro', sinonimos: ['laboratorio', 'lab', 'control de leucemia', 'leucemia', 'control leucemia', 'valores de laboratorio', 'analisis', 'examenes', 'hemograma', 'laboratorios'] },
  { id: 'sondaVesical', etiqueta: 'Sonda vesical', grupo: 'registro', sinonimos: ['sonda vesical', 'zonda sv', 'sonda sv', 'sv', 'zonda vesical', 'sonda foley', 'foley', 'zonda', 'sonda'] },
  { id: 'diuresis', etiqueta: 'Diuresis', grupo: 'registro', sinonimos: ['diuresis', 'orina', 'miccion', 'micciones', 'diuresis orina'] },
  { id: 'catarsis', etiqueta: 'Catarsis', grupo: 'registro', sinonimos: ['catarsis', 'deposiciones', 'deposicion', 'evacuacion', 'evacuaciones', 'heces', 'catarsis deposiciones'] },
  { id: 'sng', etiqueta: 'SNG', grupo: 'registro', sinonimos: ['sng', 'sonda nasogastrica', 'zonda nasogastrica', 'sonda ng', 'nasogastrica', 'zonda sng', 'sonda sng'] },
  { id: 'curaciones', etiqueta: 'Curaciones', grupo: 'registro', sinonimos: ['curaciones', 'curacion', 'heridas', 'escaras', 'curas', 'lesiones'] },
  { id: 'alimentacion', etiqueta: 'Alimentación (Positiva/Negativa)', grupo: 'registro', sinonimos: ['alimentacion', 'comida', 'ingesta', 'alimento', 'alimentos', 'dieta', 'alimentacion positiva negativa', 'come', 'alimentacion p n'] },
  { id: 'alimentacionComentario', etiqueta: 'Comentario de alimentación', grupo: 'registro', sinonimos: ['comentario alimentacion', 'alimentacion comentario', 'comentario de alimentacion', 'detalle alimentacion', 'obs alimentacion', 'observacion alimentacion', 'alimentacion detalle', 'alimentacion comentarios'] },
  { id: 'rotacion', etiqueta: 'Rotación', grupo: 'registro', sinonimos: ['rotacion', 'rotaciones', 'cambios de posicion', 'cambio de posicion', 'cambios posturales', 'decubito', 'rotacion decubito'] },
  { id: 'ejercicio', etiqueta: 'Ejercicio', grupo: 'registro', sinonimos: ['ejercicio', 'ejercicios', 'actividad fisica', 'kinesiologia', 'kine', 'deambulacion', 'actividad'] },
  { id: 'sueno', etiqueta: 'Control del sueño', grupo: 'registro', sinonimos: ['sueno', 'control del sueno', 'control de sueno', 'control sueno', 'descanso', 'dormir', 'horas de sueno', 'descanso nocturno'] },
  { id: 'comportamiento', etiqueta: 'Comportamiento psíquico', grupo: 'registro', sinonimos: ['comportamiento psiquico', 'comportamiento', 'estado psiquico', 'conducta', 'estado de animo', 'estado mental', 'psiquico', 'comportamiento psiquiatrico', 'animo'] },
  { id: 'observaciones', etiqueta: 'Observaciones', grupo: 'registro', sinonimos: ['observaciones', 'obs', 'observacion', 'notas', 'comentarios', 'novedades', 'evolucion', 'comentario', 'observaciones generales'] },
  { id: 'habitacion', etiqueta: 'Habitación', grupo: 'paciente', sinonimos: ['habitacion', 'hab', 'cama', 'pieza', 'sala', 'habitacion cama', 'n habitacion'] },
  { id: 'documento', etiqueta: 'Documento (DNI/RUT)', grupo: 'paciente', sinonimos: ['documento', 'dni', 'rut', 'run', 'cedula', 'ci', 'n documento', 'documento de identidad'] },
  { id: 'fechaNacimiento', etiqueta: 'Fecha de nacimiento', grupo: 'paciente', sinonimos: ['fecha de nacimiento', 'fecha nacimiento', 'nacimiento', 'f nac', 'fecha nac', 'f nacimiento', 'nacido'] },
  { id: 'contacto', etiqueta: 'Contacto / familiar', grupo: 'paciente', sinonimos: ['contacto', 'familiar', 'telefono', 'contacto familiar', 'responsable', 'familiar responsable', 'telefono familiar', 'contacto de emergencia'] },
  { id: 'notasPaciente', etiqueta: 'Notas del paciente', grupo: 'paciente', sinonimos: ['notas del paciente', 'notas paciente', 'antecedentes', 'diagnostico', 'patologias'] },
  { id: 'ignorar', etiqueta: '— No importar —', grupo: 'otro', sinonimos: ['id', 'n', 'nro', 'numero', 'activo', 'cantidad de registros', 'registros', 'item'] },
]

export const DEF_COLUMNA = Object.fromEntries(COLUMNAS.map((c) => [c.id, c])) as Record<ColumnaId, DefColumna>

/** Palabras que no aportan significado en un encabezado. */
const RELLENO = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'en', 'al', 'n', 'nro', 'num'])
/** Unidades que suelen venir en el encabezado: "PA (mmHg)", "Temp °C". */
const UNIDADES = new Set(['mmhg', 'lpm', 'ppm', 'rpm', 'mg', 'dl', 'mgdl', 'c', 'cc', 'ml', 'kg', 'x', 'min', 'porcentaje'])

/** Horas dentro de un encabezado: "PA 8:00", "Temp 20 hs", "FC (08.30)". */
const HORA_EN_ENCABEZADO = /\b([01]?\d|2[0-3])(?:[:.h]([0-5]\d))?\s*(?:hs?|hrs?|horas?)?\b/i

function limpiarEncabezado(texto: string): string {
  return normalizar(texto)
    .split(' ')
    .filter((p) => !RELLENO.has(p) && !UNIDADES.has(p))
    .join(' ')
}

export interface Coincidencia {
  id: ColumnaId
  puntaje: number
}

/** Índice de sinónimos precalculado (incluye los títulos que usa la propia exportación) */
const SINONIMOS = COLUMNAS.flatMap((c) => {
  const formas = [...c.sinonimos]
  if (c.id !== 'ignorar') formas.push(c.etiqueta)
  if (c.id in ETIQUETA_CAMPO) formas.push(ETIQUETA_CAMPO[c.id as CampoTexto])
  return formas.map((s) => ({ id: c.id, crudo: normalizar(s), limpio: limpiarEncabezado(s) }))
})

/**
 * Compara un encabezado contra todos los sinónimos y devuelve la mejor opción.
 * Puntajes: 1 exacto · 0.95 exacto sin relleno/unidades · 0.85 contiene la frase
 * · 0.7-0.85 parecido (errores de tipeo) · 0 sin coincidencia.
 */
export function reconocerEncabezado(original: string): Coincidencia {
  // Abreviaturas con puntos: "P.A." → "PA", "F.C." → "FC", "S.V." → "SV"
  const texto = String(original).replace(/\b(\p{L})\.\s?(?=\p{L}\b)/gu, '$1')
  const crudo = normalizar(texto)
  if (!crudo) return { id: 'ignorar', puntaje: 0 }
  // Sacamos la hora del encabezado para reconocer "PA 8:00" como "PA"
  const sinHora = limpiarEncabezado(String(texto).replace(HORA_EN_ENCABEZADO, ' '))
  const limpio = limpiarEncabezado(texto)
  let mejor: Coincidencia = { id: 'ignorar', puntaje: 0 }
  const proponer = (id: ColumnaId, puntaje: number) => {
    if (puntaje > mejor.puntaje) mejor = { id, puntaje }
  }

  for (const s of SINONIMOS) {
    if (!s.limpio) continue
    if (crudo === s.crudo) proponer(s.id, 1)
    else if (limpio === s.limpio || (sinHora && sinHora === s.limpio)) proponer(s.id, 0.95)
    else {
      const palabras = ` ${limpio} `
      // Frases de 2+ palabras o palabras largas contenidas en el encabezado
      if (s.limpio.length >= 4 && palabras.includes(` ${s.limpio} `)) {
        proponer(s.id, 0.8 + Math.min(0.05, s.limpio.length / 400))
      }
      // Errores de tipeo: "Temperatrua", "Obsevaciones"
      if (s.limpio.length >= 5 && limpio.length >= 5) {
        const sim = similitud(limpio, s.limpio)
        if (sim >= 0.8) proponer(s.id, sim * 0.85)
      }
    }
  }
  // Abreviaturas cortas como primera palabra: "PA mañana", "FC tarde"
  if (mejor.puntaje < 0.7) {
    const primera = (sinHora || limpio).split(' ')[0]
    for (const s of SINONIMOS) {
      if (s.limpio.length <= 4 && primera === s.limpio) proponer(s.id, 0.72)
    }
  }
  return mejor
}

/** Extrae una hora del encabezado ("PA 8:00" → "08:00"). */
export function horaDeEncabezado(texto: string): string | undefined {
  const t = String(texto)
  // Solo si hay una marca clara de hora (":" o "hs"), para no confundir "Sat O2"
  const m = t.match(/\b([01]?\d|2[0-3])\s*(?:[:.]([0-5]\d)\s*(?:hs?|hrs?)?|(?:hs?|hrs?|horas?)\b)/i)
  if (!m) return undefined
  return `${m[1].padStart(2, '0')}:${m[2] ?? '00'}`
}

/** Momentos del día en el encabezado: "PA mañana", "Temp noche". */
export function turnoDeEncabezado(texto: string): string | undefined {
  const n = ` ${normalizar(texto)} `
  for (const t of ['manana', 'tarde', 'noche', 'madrugada', 'am', 'pm']) {
    if (n.includes(` ${t} `)) return t
  }
  return undefined
}

export function esNombreHojaGenerico(nombre: string): boolean {
  const n = normalizar(nombre)
  return (
    !n ||
    /^(hoja|sheet|tabla|table|libro|planilla|datos|data|registros?|pacientes?|signos vitales|info|informacion|resumen|instrucciones|plantilla|export|importar|general|todos|registros diarios)\s*\d*$/.test(n)
  )
}
