/** Fecha en formato ISO local: "2026-09-16" */
export type FechaISO = string

export interface Paciente {
  id?: number
  nombre: string
  /** Nombre normalizado (sin tildes, minúsculas) para buscar y detectar duplicados */
  nombreClave: string
  habitacion?: string
  documento?: string
  fechaNacimiento?: FechaISO
  contacto?: string
  notas?: string
  activo: boolean
  creadoEn: number
  actualizadoEn: number
}

/** Una toma de signos vitales. Puede haber varias por día. */
export interface TomaSignos {
  /** Identificador local para listas en React y para evitar duplicados al importar */
  id: string
  hora?: string // "08:30"
  sistolica?: number // mmHg
  diastolica?: number // mmHg
  frecuenciaCardiaca?: number // lpm
  temperatura?: number // °C
  saturacion?: number // %
  frecuenciaRespiratoria?: number // rpm
  glucemia?: number // mg/dL
  nota?: string
}

export type EstadoAlimentacion = 'positiva' | 'negativa' | ''

export interface Alimentacion {
  estado: EstadoAlimentacion
  comentario?: string
}

/** Campos de texto libre del registro diario */
export type CampoTexto =
  | 'laboratorio'
  | 'sondaVesical'
  | 'diuresis'
  | 'catarsis'
  | 'sng'
  | 'curaciones'
  | 'rotacion'
  | 'ejercicio'
  | 'sueno'
  | 'comportamiento'
  | 'observaciones'

export type Registro = {
  id?: number
  pacienteId: number
  fecha: FechaISO
  tomas: TomaSignos[]
  alimentacion: Alimentacion
  creadoEn: number
  actualizadoEn: number
} & Partial<Record<CampoTexto, string>>

export type RegistroNuevo = Omit<Registro, 'id' | 'creadoEn' | 'actualizadoEn'>

export type CampoToma = Exclude<keyof TomaSignos, 'id'>
