import { db as dbPorDefecto, type GeriatricoDB } from '../../db/database'
import type { Paciente } from '../../domain/tipos'
import { claveExistente, construirPlan } from './plan'
import type { AsignacionPaciente, Lectura, ModoImportacion, Plan, ResultadoImportacion } from './tipos'

/** Carga en memoria los registros existentes de los pacientes involucrados. */
export async function cargarExistentes(asignaciones: AsignacionPaciente[], db: GeriatricoDB = dbPorDefecto) {
  const ids = [...new Set(asignaciones.filter((a) => a.accion === 'existente').map((a) => a.pacienteId!))]
  const registros = ids.length ? await db.registros.where('pacienteId').anyOf(ids).toArray() : []
  return new Map(registros.map((r) => [claveExistente(r.pacienteId, r.fecha), r]))
}

export async function prepararPlan(
  lectura: Lectura,
  asignaciones: AsignacionPaciente[],
  modo: ModoImportacion,
  db: GeriatricoDB = dbPorDefecto,
): Promise<Plan> {
  return construirPlan(lectura, asignaciones, await cargarExistentes(asignaciones, db), modo, await db.pacientes.toArray())
}

/**
 * Guarda todo en una sola transacción: si algo falla, no se guarda nada.
 */
export async function aplicarImportacion(
  lectura: Lectura,
  asignaciones: AsignacionPaciente[],
  plan: Plan,
  db: GeriatricoDB = dbPorDefecto,
): Promise<ResultadoImportacion> {
  const res: ResultadoImportacion = {
    pacientesCreados: 0,
    pacientesActualizados: 0,
    registrosCreados: 0,
    registrosActualizados: 0,
    sinCambios: plan.totales.sinCambios,
    omitidos: plan.totales.omitido,
  }
  const datosPorClave = new Map(lectura.pacientes.map((p) => [p.clave, p]))

  await db.transaction('rw', db.pacientes, db.registros, async () => {
    const ahora = Date.now()
    const idPorClave = new Map<string, number>()

    for (const a of asignaciones) {
      if (a.accion === 'omitir') continue
      const imp = datosPorClave.get(a.clave)
      const datos = imp?.datos ?? {}
      if (a.accion === 'existente' && a.pacienteId != null) {
        idPorClave.set(a.clave, a.pacienteId)
        // Completa datos que el paciente no tenía (no pisa lo cargado en la app)
        const actual = await db.pacientes.get(a.pacienteId)
        if (!actual) throw new Error(`El paciente "${a.nombre}" ya no existe. Volvé a analizar el archivo.`)
        const cambios: Partial<Paciente> = {}
        for (const [k, v] of Object.entries(datos) as [keyof typeof datos, string][]) {
          if (v && !actual[k]) cambios[k] = v
        }
        if (Object.keys(cambios).length) {
          await db.pacientes.update(a.pacienteId, { ...cambios, actualizadoEn: ahora })
          res.pacientesActualizados++
        }
        continue
      }
      // Paciente nuevo: solo se crea si tiene registros o viene de una hoja de pacientes
      const tieneRegistros = plan.items.some((i) => i.importado.pacienteClave === a.clave && i.estado === 'nuevo')
      if (!tieneRegistros && a.cantidadRegistros > 0) continue
      const nombre = a.nombre
      const id = (await db.pacientes.add({
        nombre,
        nombreClave: a.clave,
        habitacion: datos.habitacion,
        documento: datos.documento,
        fechaNacimiento: datos.fechaNacimiento,
        contacto: datos.contacto,
        notas: datos.notas,
        activo: true,
        creadoEn: ahora,
        actualizadoEn: ahora,
      })) as number
      idPorClave.set(a.clave, id)
      res.pacientesCreados++
    }

    for (const item of plan.items) {
      if (!item.resultado) continue
      const pacienteId = idPorClave.get(item.importado.pacienteClave)
      if (pacienteId == null) continue
      const datos = { ...item.resultado, pacienteId }
      if (item.estado === 'actualiza' && item.existenteId != null) {
        const previo = await db.registros.get(item.existenteId)
        await db.registros.put({ ...datos, id: item.existenteId, creadoEn: previo?.creadoEn ?? ahora, actualizadoEn: ahora })
        res.registrosActualizados++
      } else if (item.estado === 'nuevo') {
        await db.registros.add({ ...datos, creadoEn: ahora, actualizadoEn: ahora })
        res.registrosCreados++
      }
    }
  })
  return res
}
