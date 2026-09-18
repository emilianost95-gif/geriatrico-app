import { leerAjuste } from '../db/ajustes'
import { listarPacientes } from '../db/pacientes'
import { consultarRegistros, type FiltroRegistros } from '../db/registros'
import { fechaCorta } from '../lib/fechas'

function describirPeriodo(f: FiltroRegistros): string {
  if (f.desde && f.hasta) return f.desde === f.hasta ? `día ${fechaCorta(f.desde)}` : `del ${fechaCorta(f.desde)} al ${fechaCorta(f.hasta)}`
  if (f.desde) return `desde el ${fechaCorta(f.desde)}`
  if (f.hasta) return `hasta el ${fechaCorta(f.hasta)}`
  return 'todas las fechas'
}

/** "Paciente: Ana Díaz · todas las fechas" / "3 pacientes · del 01/09 al 15/09" */
export function describirFiltro(f: FiltroRegistros, nombres?: string | string[]): string {
  const lista = typeof nombres === 'string' ? [nombres] : (nombres ?? [])
  let quien: string
  if (f.pacienteIds) {
    quien = lista.length === 1 ? `Paciente: ${lista[0]}` : `${f.pacienteIds.length} pacientes`
  } else {
    quien = lista.length === 1 ? `Paciente: ${lista[0]}` : 'Todos los pacientes'
  }
  return `${quien} · ${describirPeriodo(f)}`
}

export interface OpcionesExportar {
  copiaCompleta?: boolean
  hojaPorPaciente?: boolean
}

/**
 * Exporta a Excel los registros que cumplen el filtro y lo descarga (o lo comparte en el APK).
 * Devuelve la cantidad de registros exportados.
 */
export async function exportarAExcel(f: FiltroRegistros, opciones: OpcionesExportar = {}) {
  const [{ crearLibro, descargarLibro, nombreArchivoExport }, pacientes, registros, nombreHogar] = await Promise.all([
    import('./exportar'),
    listarPacientes(),
    consultarRegistros(f),
    leerAjuste('nombreHogar'),
  ])
  const ids = f.pacienteIds ?? (f.pacienteId != null ? [f.pacienteId] : undefined)
  const elegidos = ids ? pacientes.filter((p) => ids.includes(p.id!)) : []
  const descripcion = opciones.copiaCompleta
    ? 'Copia de seguridad completa (todos los datos)'
    : describirFiltro(f, elegidos.map((p) => p.nombre))
  const wb = await crearLibro({
    pacientes: ids && !opciones.copiaCompleta ? elegidos : pacientes,
    registros,
    descripcionFiltro: descripcion,
    incluirTodosLosPacientes: opciones.copiaCompleta || !!ids,
    hojaPorPaciente: opciones.hojaPorPaciente,
    nombreHogar,
  })
  const sufijo = opciones.copiaCompleta
    ? 'copia-completa'
    : elegidos.length === 1
      ? elegidos[0].nombre
      : elegidos.length > 1
        ? `${elegidos.length}-pacientes`
        : 'registros'
  await descargarLibro(wb, nombreArchivoExport(sufijo))
  if (opciones.copiaCompleta) {
    const { registrarCopiaHecha } = await import('../lib/copias')
    await registrarCopiaHecha()
  }
  return registros.length
}

export async function descargarPlantilla() {
  const { crearPlantilla, descargarLibro } = await import('./exportar')
  await descargarLibro(await crearPlantilla(), 'plantilla-migracion-geriatrico.xlsx')
}
