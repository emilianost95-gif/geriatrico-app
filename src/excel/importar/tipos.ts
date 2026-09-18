import type { DatosPaciente } from '../../db/pacientes'
import type { Alimentacion, CampoTexto, FechaISO, RegistroNuevo, TomaSignos } from '../../domain/tipos'
import type { ColumnaId } from '../columnas'
import type { Celda } from './parsers'

export interface HojaCruda {
  nombre: string
  /** filas[0] es la fila 1 de Excel */
  filas: Celda[][]
  /** Solo en tablas convertidas: de dónde salió cada fila ("columna C") */
  etiquetasFila?: (string | undefined)[]
}

export interface ColumnaDetectada {
  indice: number
  /** Letra de Excel: A, B, … AA */
  letra: string
  encabezado: string
  id: ColumnaId
  /** Confianza del reconocimiento (0 a 1). 1 = elegido a mano. */
  puntaje: number
  manual?: boolean
  /** Para signos vitales: a qué toma pertenece la columna */
  grupoToma?: string
  horaToma?: string
  nota?: string
}

export type TipoHoja = 'registros' | 'pacientes' | 'omitida'

/** Cómo estaba organizada la hoja original */
export type FormatoHoja = 'filas' | 'pacientesEnColumnas' | 'fechasEnColumnas' | 'listaSinTitulos'

export interface HojaAnalizada {
  nombre: string
  tipo: TipoHoja
  motivo?: string
  /** Índice (0) de la fila de encabezados */
  filaEncabezado: number
  columnas: ColumnaDetectada[]
  fechaPorDefecto?: FechaISO
  pacientePorDefecto?: string
  filasConDatos: number
  filasRellenadas: number
  formato: FormatoHoja
  /** Pacientes encontrados como títulos dentro de la hoja ("PACIENTE: X") */
  pacientesPorTitulo: string[]
  /** La persona eligió no importar esta hoja */
  omitidaPorUsuario?: boolean
  filasEjemplo: number
}

export type NivelProblema = 'error' | 'aviso' | 'info'

export interface Problema {
  nivel: NivelProblema
  hoja: string
  /** Número de fila como se ve en Excel */
  fila?: number
  /** En tablas convertidas, reemplaza a la fila ("columna C") */
  ubicacion?: string
  mensaje: string
}

export interface RegistroImportado {
  clave: string
  pacienteClave: string
  pacienteNombre: string
  fecha: FechaISO
  tomas: TomaSignos[]
  textos: Partial<Record<CampoTexto, string>>
  alimentacion: Alimentacion
  origen: { hoja: string; fila: number; ubicacion?: string }[]
}

export interface PacienteImportado {
  clave: string
  nombre: string
  /** Vino de una lista de pacientes (se crea aunque no tenga registros) */
  enLista?: boolean
  datos: Partial<DatosPaciente>
  cantidadRegistros: number
}

export interface Lectura {
  hojas: HojaAnalizada[]
  registros: RegistroImportado[]
  pacientes: PacienteImportado[]
  problemas: Problema[]
}

/** Correcciones manuales de columnas: { [hoja]: { [índiceColumna]: ColumnaId } } */
export type AjustesColumnas = Record<string, Record<number, ColumnaId>>

export type ModoImportacion = 'actualizar' | 'reemplazar' | 'soloNuevos'

export interface AsignacionPaciente {
  clave: string
  nombre: string
  /** Qué hacer con este nombre */
  accion: 'existente' | 'nuevo' | 'omitir'
  pacienteId?: number
  /** Cómo se decidió automáticamente */
  sugerencia: 'exacto' | 'parecido' | 'nuevo'
  similitud?: number
  cantidadRegistros: number
}

export type EstadoItem = 'nuevo' | 'actualiza' | 'sinCambios' | 'omitido'

export interface ItemPlan {
  importado: RegistroImportado
  estado: EstadoItem
  /** Registro final a guardar (pacienteId se resuelve al aplicar si el paciente es nuevo) */
  resultado?: RegistroNuevo
  existenteId?: number
  cambios: string[]
}

export interface Plan {
  modo: ModoImportacion
  items: ItemPlan[]
  totales: Record<EstadoItem, number> & { pacientesNuevos: number; pacientesActualizados: number }
}

export interface ResultadoImportacion {
  pacientesCreados: number
  pacientesActualizados: number
  registrosCreados: number
  registrosActualizados: number
  sinCambios: number
  omitidos: number
}
