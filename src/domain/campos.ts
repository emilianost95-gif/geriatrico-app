import type { CampoTexto, CampoToma } from './tipos'

/**
 * Definición central de los campos del registro diario.
 * La usan el formulario, el historial, la exportación y la importación,
 * así un cambio acá se refleja en toda la app.
 */
export interface DefCampoTexto {
  clave: CampoTexto
  etiqueta: string
  ayuda?: string
  /** Opciones rápidas: botones que completan el campo con un toque */
  opciones: string[]
  multilinea?: boolean
}

export const CAMPOS_TEXTO: DefCampoTexto[] = [
  {
    clave: 'laboratorio',
    etiqueta: 'Laboratorio',
    ayuda: 'Otros valores de laboratorio (hemograma, orina, etc.)',
    opciones: ['Sin estudios hoy', 'Muestra enviada', 'Resultados normales'],
  },
  {
    clave: 'sondaVesical',
    etiqueta: 'Sonda vesical (SV)',
    opciones: ['No usa', 'Permeable', 'Cambio de sonda', 'Retirada'],
  },
  {
    clave: 'diuresis',
    etiqueta: 'Diuresis',
    ayuda: 'Orina: cantidad, color, pañal…',
    opciones: ['Normal', 'Escasa', 'Abundante', 'Pañal mojado', 'Orina oscura'],
  },
  {
    clave: 'catarsis',
    etiqueta: 'Catarsis',
    ayuda: 'Deposiciones',
    opciones: ['Sí, normal', 'No hizo', 'Líquida', 'Dura', 'Con enema'],
  },
  {
    clave: 'sng',
    etiqueta: 'Sonda nasogástrica (SNG)',
    opciones: ['No usa', 'Permeable', 'Alimentación por SNG', 'Cambio de sonda'],
  },
  {
    clave: 'curaciones',
    etiqueta: 'Curaciones',
    opciones: ['No requiere', 'Curación realizada', 'Escara en evolución', 'Cambio de apósito'],
    multilinea: true,
  },
  {
    clave: 'rotacion',
    etiqueta: 'Rotación',
    ayuda: 'Cambios de posición',
    opciones: ['Cada 2 horas', 'Cada 4 horas', 'Se moviliza solo/a', 'No requiere'],
  },
  {
    clave: 'ejercicio',
    etiqueta: 'Ejercicio',
    opciones: ['Caminó', 'Kinesiología', 'Ejercicios en cama', 'No realizó'],
  },
  {
    clave: 'sueno',
    etiqueta: 'Control del sueño',
    opciones: ['Durmió bien', 'Durmió poco', 'Despertó varias veces', 'Insomnio'],
  },
  {
    clave: 'comportamiento',
    etiqueta: 'Comportamiento psíquico',
    opciones: ['Tranquilo/a', 'Orientado/a', 'Desorientado/a', 'Agitado/a', 'Decaído/a'],
  },
  {
    clave: 'observaciones',
    etiqueta: 'Observaciones',
    opciones: [],
    multilinea: true,
  },
]

export const ETIQUETA_CAMPO: Record<CampoTexto, string> = Object.fromEntries(
  CAMPOS_TEXTO.map((c) => [c.clave, c.etiqueta]),
) as Record<CampoTexto, string>

export type CampoNumericoToma = Exclude<CampoToma, 'hora' | 'nota'>

export interface DefCampoToma {
  clave: CampoNumericoToma
  etiqueta: string
  corta: string
  /** Etiqueta breve para el formulario (entra en celulares) */
  formulario: string
  unidad: string
  min: number
  max: number
  /** Rango considerado normal en adultos mayores (solo para resaltar, no bloquea) */
  normal?: [number, number]
  decimales?: boolean
}

/** Rangos "posibles": fuera de esto casi seguro es un error de tipeo. */
export const CAMPOS_TOMA: DefCampoToma[] = [
  { clave: 'sistolica', formulario: 'Máxima', etiqueta: 'Presión máxima', corta: 'PAS', unidad: 'mmHg', min: 50, max: 260, normal: [90, 140] },
  { clave: 'diastolica', formulario: 'Mínima', etiqueta: 'Presión mínima', corta: 'PAD', unidad: 'mmHg', min: 25, max: 160, normal: [60, 90] },
  { clave: 'frecuenciaCardiaca', formulario: 'Pulso', etiqueta: 'Pulso (FC)', corta: 'FC', unidad: 'lpm', min: 20, max: 250, normal: [60, 100] },
  { clave: 'temperatura', formulario: 'Temperatura', etiqueta: 'Temperatura', corta: 'T°', unidad: '°C', min: 30, max: 45, normal: [35.5, 37.5], decimales: true },
  { clave: 'saturacion', formulario: 'Saturación', etiqueta: 'Saturación O₂', corta: 'SatO₂', unidad: '%', min: 50, max: 100, normal: [92, 100] },
  { clave: 'frecuenciaRespiratoria', formulario: 'Respiración', etiqueta: 'Respiraciones (FR)', corta: 'FR', unidad: 'rpm', min: 5, max: 60, normal: [12, 20] },
  { clave: 'glucemia', formulario: 'Glucemia', etiqueta: 'Glucemia (HGT)', corta: 'Gluc', unidad: 'mg/dL', min: 20, max: 800, normal: [70, 180] },
]

export const DEF_TOMA = Object.fromEntries(CAMPOS_TOMA.map((c) => [c.clave, c])) as Record<CampoNumericoToma, DefCampoToma>

export function fueraDeNormal(clave: CampoNumericoToma, valor: number | undefined): boolean {
  const def = DEF_TOMA[clave]
  if (valor == null || !def.normal) return false
  return valor < def.normal[0] || valor > def.normal[1]
}
