import { limpiarRegistro } from '../../db/registros'
import { CAMPOS_TEXTO, ETIQUETA_CAMPO } from '../../domain/campos'
import type { Paciente, Registro, RegistroNuevo } from '../../domain/tipos'
import { similitud } from '../../lib/texto'
import { huellaToma } from '../../lib/tomas'
import { fusionarImportados, unirTomas } from './analizar'
import type {
  AsignacionPaciente,
  EstadoItem,
  ItemPlan,
  Lectura,
  ModoImportacion,
  PacienteImportado,
  Plan,
  RegistroImportado,
} from './tipos'

const UMBRAL_PARECIDO = 0.8

/**
 * Para cada nombre del Excel, busca el paciente que ya existe en la app:
 *  - exacto: mismo nombre sin importar tildes, mayúsculas ni el orden (Pérez Juan = Juan Perez)
 *  - parecido: errores de tipeo o un nombre de más ("Juan Perez" ~ "Juan Carlos Pérez")
 *  - nuevo: no se parece a ninguno
 */
export function sugerirPacientes(importados: PacienteImportado[], existentes: Paciente[]): AsignacionPaciente[] {
  return importados.map((imp) => {
    const base = { clave: imp.clave, nombre: imp.nombre, cantidadRegistros: imp.cantidadRegistros }
    const exacto = existentes.find((p) => p.nombreClave === imp.clave)
    if (exacto) return { ...base, accion: 'existente', pacienteId: exacto.id, sugerencia: 'exacto', similitud: 1 }

    let mejor: { p: Paciente; s: number } | undefined
    const palabrasImp = imp.clave.split(' ')
    for (const p of existentes) {
      let s = similitud(imp.clave, p.nombreClave)
      // Un nombre contiene todas las palabras del otro (y al menos 2)
      const palabrasP = p.nombreClave.split(' ')
      const [chico, grande] = palabrasImp.length <= palabrasP.length ? [palabrasImp, palabrasP] : [palabrasP, palabrasImp]
      if (chico.length >= 2 && chico.every((w) => grande.includes(w))) s = Math.max(s, 0.85)
      if (!mejor || s > mejor.s) mejor = { p, s }
    }
    if (mejor && mejor.s >= UMBRAL_PARECIDO) {
      return { ...base, accion: 'existente', pacienteId: mejor.p.id, sugerencia: 'parecido', similitud: mejor.s }
    }
    return { ...base, accion: 'nuevo', sugerencia: 'nuevo' }
  })
}

/** Nombres nuevos del Excel que se parecen entre sí (posibles errores de tipeo). */
export function nombresNuevosParecidos(asignaciones: AsignacionPaciente[]): [string, string][] {
  const nuevos = asignaciones.filter((a) => a.accion === 'nuevo')
  const pares: [string, string][] = []
  for (let i = 0; i < nuevos.length; i++) {
    for (let j = i + 1; j < nuevos.length; j++) {
      if (similitud(nuevos[i].clave, nuevos[j].clave) >= UMBRAL_PARECIDO) pares.push([nuevos[i].nombre, nuevos[j].nombre])
    }
  }
  return pares
}

export function aRegistroNuevo(imp: RegistroImportado, pacienteId: number): RegistroNuevo {
  return limpiarRegistro({
    pacienteId,
    fecha: imp.fecha,
    tomas: imp.tomas,
    alimentacion: imp.alimentacion,
    ...imp.textos,
  })
}

/** Firma comparable de un registro (sin ids ni fechas de edición). */
function firma(r: RegistroNuevo): string {
  const l = limpiarRegistro(r)
  return JSON.stringify({
    ...l,
    tomas: l.tomas.map((t) => `${huellaToma(t)}|${t.nota ?? ''}`),
  })
}

/** Combina: los valores del Excel pisan a los de la app solo si no están vacíos; las tomas se suman sin repetir. */
export function combinar(existente: RegistroNuevo, nuevo: RegistroNuevo): RegistroNuevo {
  const r: RegistroNuevo = {
    ...existente,
    tomas: unirTomas(existente.tomas, nuevo.tomas),
    alimentacion: {
      estado: nuevo.alimentacion.estado || existente.alimentacion.estado,
      comentario: nuevo.alimentacion.comentario || existente.alimentacion.comentario,
    },
  }
  for (const c of CAMPOS_TEXTO) {
    if (nuevo[c.clave]) r[c.clave] = nuevo[c.clave]
  }
  return limpiarRegistro(r)
}

function describirCambios(antes: RegistroNuevo, despues: RegistroNuevo): string[] {
  const cambios: string[] = []
  const hAntes = new Set(antes.tomas.map(huellaToma))
  const nuevas = despues.tomas.filter((t) => !hAntes.has(huellaToma(t))).length
  const hDespues = new Set(despues.tomas.map(huellaToma))
  const quitadas = antes.tomas.filter((t) => !hDespues.has(huellaToma(t))).length
  if (nuevas) cambios.push(`+${nuevas} ${nuevas === 1 ? 'toma' : 'tomas'} de signos`)
  if (quitadas) cambios.push(`−${quitadas} ${quitadas === 1 ? 'toma' : 'tomas'} de signos`)
  if (antes.alimentacion.estado !== despues.alimentacion.estado || (antes.alimentacion.comentario ?? '') !== (despues.alimentacion.comentario ?? '')) {
    cambios.push('Alimentación')
  }
  for (const c of CAMPOS_TEXTO) {
    if ((antes[c.clave] ?? '') !== (despues[c.clave] ?? '')) cambios.push(ETIQUETA_CAMPO[c.clave])
  }
  return cambios
}

export const claveExistente = (pacienteId: number, fecha: string) => `${pacienteId}|${fecha}`

/**
 * Decide qué pasa con cada registro del Excel.
 * @param existentes registros ya guardados, indexados con claveExistente()
 */
export function construirPlan(
  lectura: Lectura,
  asignaciones: AsignacionPaciente[],
  existentes: Map<string, Registro>,
  modo: ModoImportacion,
  pacientesExistentes: Paciente[] = [],
): Plan {
  const porClave = new Map(asignaciones.map((a) => [a.clave, a]))
  const idDe = (imp: RegistroImportado) => {
    const asig = porClave.get(imp.pacienteClave)
    return asig?.accion === 'existente' && asig.pacienteId != null ? asig.pacienteId : -1
  }
  // Si dos nombres del Excel se asignaron al mismo paciente, sus registros del mismo día se juntan
  const agrupados = new Map<string, RegistroImportado>()
  const omitidos: RegistroImportado[] = []
  for (const imp of lectura.registros) {
    if (porClave.get(imp.pacienteClave)?.accion === 'omitir') {
      omitidos.push(imp)
      continue
    }
    const id = idDe(imp)
    const k = id > 0 ? claveExistente(id, imp.fecha) : imp.clave
    const previo = agrupados.get(k)
    agrupados.set(k, previo ? fusionarImportados(previo, imp) : imp)
  }

  const items: ItemPlan[] = [...agrupados.values()].map((imp) => {
    const pacienteId = idDe(imp)
    const nuevo = aRegistroNuevo(imp, pacienteId)
    const previo = pacienteId > 0 ? existentes.get(claveExistente(pacienteId, imp.fecha)) : undefined

    if (!previo) {
      return { importado: imp, estado: 'nuevo', resultado: nuevo, cambios: [] }
    }
    if (modo === 'soloNuevos') {
      return { importado: imp, estado: 'omitido', existenteId: previo.id, cambios: ['Ya existe (se deja como está)'] }
    }
    const base = limpiarRegistro(previo)
    const resultado = modo === 'reemplazar' ? nuevo : combinar(base, nuevo)
    if (firma(resultado) === firma(base)) {
      return { importado: imp, estado: 'sinCambios', existenteId: previo.id, cambios: [] }
    }
    return {
      importado: imp,
      estado: 'actualiza',
      resultado,
      existenteId: previo.id,
      cambios: describirCambios(base, resultado),
    }
  })

  for (const imp of omitidos) {
    items.push({ importado: imp, estado: 'omitido', cambios: ['Paciente marcado para no importar'] })
  }

  const totales = { nuevo: 0, actualiza: 0, sinCambios: 0, omitido: 0 } as Record<EstadoItem, number>
  for (const it of items) totales[it.estado]++
  const pacientesNuevos = asignaciones.filter((a) => a.accion === 'nuevo').length
  // Pacientes existentes a los que el Excel les completa datos (habitación, documento…)
  const datosPorClave = new Map(lectura.pacientes.map((p) => [p.clave, p.datos]))
  const pacientesActualizados = asignaciones.filter((a) => {
    if (a.accion !== 'existente') return false
    const actual = pacientesExistentes.find((p) => p.id === a.pacienteId)
    const datos = datosPorClave.get(a.clave) ?? {}
    return !!actual && Object.entries(datos).some(([k, v]) => v && !actual[k as keyof typeof datos])
  }).length
  return { modo, items, totales: { ...totales, pacientesNuevos, pacientesActualizados } }
}
