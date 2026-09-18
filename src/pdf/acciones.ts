import { leerAjuste } from '../db/ajustes'
import { db } from '../db/database'
import { listarPacientes } from '../db/pacientes'
import { consultarRegistros } from '../db/registros'
import type { FechaISO } from '../domain/tipos'
import { entregarArchivo } from '../lib/archivos'
import { hoyISO } from '../lib/fechas'

const limpiar = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()

/** Informe PDF de un paciente en el período elegido (vacío = todo). */
export async function descargarInformePaciente(pacienteId: number, desde?: FechaISO, hasta?: FechaISO) {
  const [paciente, registros, nombreHogar, { crearInformePaciente }] = await Promise.all([
    db.pacientes.get(pacienteId),
    consultarRegistros({ pacienteId, desde, hasta }),
    leerAjuste('nombreHogar'),
    import('./informes'),
  ])
  if (!paciente) throw new Error('No se encontró el paciente.')
  const blob = await crearInformePaciente({ paciente, registros, desde, hasta, nombreHogar })
  await entregarArchivo(blob, `informe-${limpiar(paciente.nombre)}-${hoyISO()}.pdf`)
}

/** Informe PDF de todos los pacientes (o algunos) por día. */
export async function descargarInformeDias(opciones: { desde: FechaISO; hasta: FechaISO; pacienteIds?: number[]; conPendientes?: boolean }) {
  const [pacientes, registros, nombreHogar, { crearInformeDias }] = await Promise.all([
    listarPacientes(),
    consultarRegistros({ desde: opciones.desde, hasta: opciones.hasta, pacienteIds: opciones.pacienteIds }),
    leerAjuste('nombreHogar'),
    import('./informes'),
  ])
  const blob = await crearInformeDias({ pacientes, registros, nombreHogar, ...opciones })
  const nombre = opciones.desde === opciones.hasta ? `informe-dia-${opciones.desde}.pdf` : `informe-${opciones.desde}-al-${opciones.hasta}.pdf`
  await entregarArchivo(blob, nombre)
}
