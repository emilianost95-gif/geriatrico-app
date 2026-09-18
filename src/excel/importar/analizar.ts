import { CAMPOS_TEXTO, DEF_TOMA } from '../../domain/campos'
import type { Alimentacion, CampoTexto, FechaISO, TomaSignos } from '../../domain/tipos'
import { hoyISO } from '../../lib/fechas'
import { claveNombre, nombrePropio, normalizar, vacio } from '../../lib/texto'
import { huellaToma, nuevoId, ordenarTomas, tomaSinDatos } from '../../lib/tomas'
import {
  DEF_COLUMNA,
  esNombreHojaGenerico,
  horaDeEncabezado,
  reconocerEncabezado,
  turnoDeEncabezado,
  type ColumnaId,
} from '../columnas'
import {
  buscarFechaEnTexto,
  celdaATexto,
  parsearAlimentacion,
  parsearFecha,
  parsearHora,
  parsearPresion,
  parsearSigno,
  parsearSignosTexto,
  type Celda,
} from './parsers'
import type {
  AjustesColumnas,
  ColumnaDetectada,
  HojaAnalizada,
  HojaCruda,
  Lectura,
  PacienteImportado,
  Problema,
  RegistroImportado,
} from './tipos'
import { esListaSinTitulos, transponerSiCorresponde } from './transponer'

const UMBRAL = 0.7
const FILAS_A_REVISAR = 15
const CAMPOS_REGISTRO = new Set<ColumnaId>(CAMPOS_TEXTO.map((c) => c.clave))
const CAMPOS_PACIENTE = ['habitacion', 'documento', 'fechaNacimiento', 'contacto', 'notasPaciente'] as const
/** Columnas que solo pueden aparecer una vez */
const UNICAS = new Set<ColumnaId>(['fecha', 'paciente', 'apellido', ...CAMPOS_PACIENTE, 'alimentacion'])

export function letraColumna(i: number): string {
  let s = ''
  let n = i + 1
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/** "GONZÁLEZ, María" → "María González" */
export function nombreParaMostrar(nombre: string): string {
  const m = nombre.match(/^\s*([^,]+?)\s*,\s*(.+?)\s*$/)
  return nombrePropio(m ? `${m[2]} ${m[1]}` : nombre)
}

const filaVacia = (fila: Celda[] | undefined) => !fila || fila.every((c) => vacio(c))

// ───────────────────── 1. Encontrar la fila de encabezados ─────────────────────

export function detectarFilaEncabezado(filas: Celda[][]): { fila: number; coincidencias: number; ids: ColumnaId[] } {
  const candidatas: { fila: number; coincidencias: number; ids: ColumnaId[] }[] = []
  for (let r = 0; r < Math.min(FILAS_A_REVISAR, filas.length); r++) {
    const fila = filas[r]
    if (filaVacia(fila)) continue
    // "Paciente: Ana" o "Fecha: 16/09" son títulos con valor, no encabezados
    const textos = fila.filter(
      (c) => typeof c === 'string' && c.trim() && !/:\s*\S/.test(c) && c.length <= 45 && c.trim().split(/\s+/).length <= 6,
    )
    const ids = new Set<ColumnaId>()
    for (const c of textos) {
      const m = reconocerEncabezado(String(c))
      if (m.puntaje >= UMBRAL && m.id !== 'ignorar') ids.add(m.id)
    }
    if (ids.size > 0) candidatas.push({ fila: r, coincidencias: ids.size, ids: [...ids] })
  }
  if (candidatas.length === 0) return { fila: -1, coincidencias: 0, ids: [] }
  const mejor = candidatas.reduce((a, b) => (b.coincidencias > a.coincidencias ? b : a))
  // La primera fila con 2 o más títulos manda (las de abajo pueden ser de otro bloque),
  // salvo que más abajo haya una claramente más completa
  const primera = candidatas.find((c) => c.coincidencias >= 2)
  if (primera && !(mejor.coincidencias >= primera.coincidencias + 3 && mejor.coincidencias >= primera.coincidencias * 2)) {
    return primera
  }
  return mejor
}

// ───────────────────── 2. Decidir qué es cada columna ─────────────────────

export function asignarColumnas(encabezados: Celda[], ajustes: Record<number, ColumnaId> = {}): ColumnaDetectada[] {
  const columnas: ColumnaDetectada[] = []
  encabezados.forEach((c, indice) => {
    const encabezado = celdaATexto(c)
    const manual = ajustes[indice]
    if (!encabezado && !manual) return
    const r = manual ? { id: manual, puntaje: 1 } : reconocerEncabezado(encabezado)
    columnas.push({
      indice,
      letra: letraColumna(indice),
      encabezado: encabezado || `(columna ${letraColumna(indice)} sin título)`,
      id: r.puntaje >= UMBRAL ? r.id : 'ignorar',
      puntaje: r.puntaje,
      manual: !!manual,
      nota: !manual && r.puntaje < UMBRAL ? 'No se reconoció' : undefined,
    })
  })

  // Columnas únicas: se queda la de mayor puntaje (las manuales ganan)
  for (const id of UNICAS) {
    const candidatas = columnas.filter((c) => c.id === id)
    if (candidatas.length < 2) continue
    const ganadora = [...candidatas].sort((a, b) => b.puntaje - a.puntaje || a.indice - b.indice)[0]
    for (const c of candidatas) {
      if (c === ganadora) continue
      c.id = 'ignorar'
      c.nota = `Repetida: se usa la columna ${ganadora.letra} ("${ganadora.encabezado}")`
    }
  }

  // Signos vitales repetidos → varias tomas por fila ("PA mañana", "PA tarde")
  const ocurrencias = new Map<ColumnaId, number>()
  for (const c of columnas) {
    if (DEF_COLUMNA[c.id].grupo !== 'toma' || c.id === 'signosTexto') continue
    const hora = horaDeEncabezado(c.encabezado)
    const turno = turnoDeEncabezado(c.encabezado)
    const n = ocurrencias.get(c.id) ?? 0
    ocurrencias.set(c.id, n + 1)
    c.horaToma = c.id === 'hora' ? undefined : hora
    c.grupoToma = hora ?? turno ?? `#${n}`
  }
  return columnas
}

// ───────────── 3. Buscar fecha / paciente fuera de la tabla (títulos, nombre de hoja) ─────────────

const MESES_SOLOS = /^(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)( \d{2,4})?$/

function contextoHoja(hoja: HojaCruda, filaEncabezado: number) {
  let fecha: FechaISO | undefined
  let paciente: string | undefined
  for (let r = 0; r < filaEncabezado; r++) {
    const fila = hoja.filas[r] ?? []
    fila.forEach((c, i) => {
      if (c instanceof Date && !fecha) fecha = parsearFecha(c).valor
      const t = celdaATexto(c)
      if (!t) return
      fecha ??= buscarFechaEnTexto(t)
      const n = normalizar(t)
      // "Paciente: Juan Pérez"
      const m = t.match(/^\s*(?:paciente|nombre(?: del paciente)?|residente)\s*[:\-–]\s*(.+)$/i)
      if (m && !paciente) paciente = m[1].trim()
      // "Paciente" | "Juan Pérez" en celdas vecinas
      else if (/^(paciente|nombre|nombre del paciente|residente)$/.test(n) && !paciente) {
        const vecino = fila.slice(i + 1).find((v) => !vacio(v))
        if (vecino != null) paciente = celdaATexto(vecino)
      } else if (/^fecha$/.test(n) && !fecha) {
        const vecino = fila.slice(i + 1).find((v) => !vacio(v))
        if (vecino != null) fecha = parsearFecha(vecino).valor
      }
    })
  }
  const nombreHoja = hoja.nombre.trim()
  if (!esNombreHojaGenerico(nombreHoja)) {
    const f = buscarFechaEnTexto(nombreHoja) ?? parsearFecha(nombreHoja).valor
    if (f) fecha ??= f
    else if (/\p{L}{2,}/u.test(nombreHoja) && !MESES_SOLOS.test(normalizar(nombreHoja))) paciente ??= nombreHoja
  }
  return { fecha, paciente }
}

// ───────────────────── 4. Analizar un libro completo ─────────────────────

function unirTexto(anterior: string | undefined, nuevo: string): string {
  if (!anterior) return nuevo
  const partes = anterior.split(' / ')
  return partes.some((p) => normalizar(p) === normalizar(nuevo)) ? anterior : `${anterior} / ${nuevo}`
}

export function unirTomas(base: TomaSignos[], nuevas: TomaSignos[]): TomaSignos[] {
  const porHuella = new Map(base.map((t, i) => [huellaToma(t), i]))
  const resultado = [...base]
  for (const t of nuevas) {
    const h = huellaToma(t)
    const i = porHuella.get(h)
    if (i != null) {
      // Misma toma: si la repetida trae una nota más completa, se queda con esa
      const previa = resultado[i]
      if (t.nota && (!previa.nota || t.nota.length > previa.nota.length)) resultado[i] = { ...previa, nota: t.nota }
      continue
    }
    porHuella.set(h, resultado.length)
    resultado.push(t)
  }
  return ordenarTomas(resultado)
}

function unirAlimentacion(a: Alimentacion, b: Alimentacion): Alimentacion {
  return {
    estado: a.estado || b.estado,
    comentario: b.comentario ? unirTexto(a.comentario, b.comentario) : a.comentario,
  }
}

/** Junta dos registros importados del mismo paciente y día. */
export function fusionarImportados(a: RegistroImportado, b: RegistroImportado): RegistroImportado {
  const textos = { ...a.textos }
  for (const [k, v] of Object.entries(b.textos) as [CampoTexto, string][]) textos[k] = unirTexto(textos[k], v)
  return {
    ...a,
    tomas: unirTomas(a.tomas, b.tomas),
    textos,
    alimentacion: unirAlimentacion(a.alimentacion, b.alimentacion),
    origen: [...a.origen, ...b.origen],
  }
}

// ───────── Filas separadoras: "PACIENTE: ANA DÍAZ", "Hab. 3 - Luis Soto", "Lunes 15/09" ─────────

const TRATAMIENTOS = /^(sr|sra|srta|don|dona|doña|dr|dra)\.?\s+/i

/** "Hab. 4B - María González" / "María González (hab 4B)" → nombre + habitación */
export function separarNombreYHabitacion(texto: string): { nombre: string; habitacion?: string } {
  const t = texto.trim().replace(/\s+/g, ' ')
  const HAB = String.raw`(?:hab(?:itaci[oó]n)?|cama|pieza|sala)\.?\s*(?:n[°º.]?\s*)?`
  let m = t.match(new RegExp(String.raw`^${HAB}([\p{L}\d-]{1,6})\s*[-–:,|]\s*(.+)$`, 'iu'))
  if (m) return { nombre: m[2].trim(), habitacion: m[1] }
  m = t.match(new RegExp(String.raw`^(.+?)(?:\s*[-–,|]\s*|\s*\(\s*|\s+)${HAB}([\p{L}\d-]{1,6})\s*\)?$`, 'iu'))
  if (m) return { nombre: m[1].trim(), habitacion: m[2] }
  return { nombre: t }
}

export function limpiarNombrePaciente(texto: string): string {
  return separarNombreYHabitacion(texto).nombre.replace(TRATAMIENTOS, '').trim()
}

const pareceNombrePersona = (t: string) =>
  /^[\p{L}][\p{L}'’.\s,-]*$/u.test(t) && t.split(/\s+/).filter(Boolean).length >= 2 && t.length <= 60

interface Separador {
  paciente?: string
  habitacion?: string
  fecha?: FechaISO
}

function leerSeparador(
  fila: Celda[],
  columnas: ColumnaDetectada[],
  hayColPaciente: boolean,
  hayColFecha: boolean,
  anio: number,
): Separador | null {
  const noVacias = fila.map((c, i) => [i, c] as const).filter(([, c]) => !vacio(c))
  if (noVacias.length === 0) return null
  const distintos = new Set(noVacias.map(([, c]) => celdaATexto(c)))
  if (distintos.size !== 1) return null
  const [idx, celda] = noVacias[0]
  const t = celdaATexto(celda)
  const combinada = noVacias.length >= 2

  // Con etiqueta explícita
  let m = t.match(/^\s*(?:paciente|residente|nombre(?: y apellidos?| del paciente| completo)?|apellido y nombre)\s*[:\-–]\s*(.+)$/i)
  if (m) {
    const { nombre, habitacion } = separarNombreYHabitacion(m[1])
    return { paciente: nombre, habitacion }
  }
  m = t.match(/^\s*(?:fecha|d[ií]a)\s*[:\-–]\s*(.+)$/i)
  if (m) {
    const f = parsearFecha(m[1].trim(), anio).valor ?? buscarFechaEnTexto(m[1])
    return f ? { fecha: f } : null
  }
  if (celda instanceof Date) return hayColFecha ? null : { fecha: parsearFecha(celda).valor }

  const col = columnas.find((c) => c.indice === idx)
  const idCol = col?.id ?? 'ignorar'
  const esColumnaTexto = CAMPOS_REGISTRO.has(idCol) || idCol === 'alimentacion' || idCol === 'alimentacionComentario' || idCol === 'notaToma'

  // Una fecha sola (sin columna de fecha): agrupa lo que sigue
  if (!hayColFecha && !esColumnaTexto && /\d/.test(t)) {
    const f = buscarFechaEnTexto(t) ?? parsearFecha(t, anio).valor
    if (f) return { fecha: f }
  }

  // Un nombre solo (sin columna de paciente)
  if (!hayColPaciente && (combinada || !esColumnaTexto)) {
    const { nombre, habitacion } = separarNombreYHabitacion(t)
    const reconocido = reconocerEncabezado(nombre).puntaje >= 0.9
    if (!reconocido && pareceNombrePersona(nombre.replace(TRATAMIENTOS, ''))) return { paciente: nombre, habitacion }
  }
  return null
}

// ───────────────────── 5. Analizar un libro completo ─────────────────────

function pareceListaDeNombres(filas: Celda[][], filaEnc: number): boolean {
  const enc = filas[filaEnc] ?? []
  const col = enc.findIndex((c) => typeof c === 'string' && ['paciente', 'apellido'].includes(reconocerEncabezado(c).id))
  if (col < 0) return false
  const valores = filas.slice(filaEnc + 1).map((f) => f?.[col]).filter((c) => !vacio(c))
  if (valores.length === 0) return false
  const nombres = valores.filter((c) => typeof c === 'string' && /^[\p{L}][\p{L}'’.\s,()-]*$/u.test(c.trim()) && c.length <= 60)
  return nombres.length / valores.length >= 0.8
}

const esEjemplo = (nombre: string) => normalizar(nombre).startsWith('ejemplo')

export interface OpcionesAnalisis {
  hoy?: FechaISO
  /** Hojas que la persona eligió no importar */
  omitidas?: string[]
}

export function analizarLibro(hojas: HojaCruda[], ajustes: AjustesColumnas = {}, opciones: FechaISO | OpcionesAnalisis = {}): Lectura {
  const { hoy = hoyISO(), omitidas = [] } = typeof opciones === 'string' ? { hoy: opciones } : opciones
  const problemas: Problema[] = []
  const registros = new Map<string, RegistroImportado>()
  const pacientes = new Map<string, PacienteImportado>()
  const analizadas: HojaAnalizada[] = []
  const anioHoy = Number(hoy.slice(0, 4))

  // Los nombres de una hoja de pacientes (con Nombre y Apellido en orden) son los más prolijos
  const nombreDeLista = new Set<string>()
  const registrarPaciente = (nombreCrudo: string, datos: PacienteImportado['datos'], desdeLista: boolean) => {
    const nombre = limpiarNombrePaciente(nombreCrudo)
    const clave = claveNombre(nombre)
    let p = pacientes.get(clave)
    if (!p) {
      p = { clave, nombre: nombreParaMostrar(nombre), datos: {}, cantidadRegistros: 0 }
      pacientes.set(clave, p)
    }
    if (desdeLista) {
      p.enLista = true
      if (!nombreDeLista.has(clave)) {
        p.nombre = nombreParaMostrar(nombre)
        nombreDeLista.add(clave)
      }
    }
    for (const [k, v] of Object.entries(datos) as [keyof typeof datos, string][]) {
      if (v && !p.datos[k]) p.datos[k] = v
    }
    return p
  }

  for (const hojaOriginal of hojas) {
    const base = {
      nombre: hojaOriginal.nombre, tipo: 'omitida' as const, filaEncabezado: 0, columnas: [],
      filasConDatos: 0, filasRellenadas: 0, formato: 'filas' as const, pacientesPorTitulo: [], filasEjemplo: 0,
    }
    if (hojaOriginal.filas.every(filaVacia)) continue
    if (omitidas.includes(hojaOriginal.nombre)) {
      analizadas.push({ ...base, motivo: 'Elegiste no importar esta hoja', omitidaPorUsuario: true })
      continue
    }

    let hoja = hojaOriginal
    let formato: HojaAnalizada['formato'] = 'filas'
    const ajustesHoja = ajustes[hoja.nombre] ?? {}
    const hayAjustes = Object.keys(ajustesHoja).length > 0
    let enc = detectarFilaEncabezado(hoja.filas)

    // ¿Tabla "al revés" (campos en filas)?
    if (!hayAjustes || hojaOriginal.etiquetasFila) {
      const t = transponerSiCorresponde(hoja, enc.coincidencias, anioHoy)
      if (t) {
        hoja = t.hoja
        formato = t.formato
        enc = detectarFilaEncabezado(hoja.filas)
        if (t.aviso) problemas.push({ nivel: 'aviso', hoja: hoja.nombre, mensaje: t.aviso })
      }
    }
    // ¿Lista de nombres sin títulos?
    if (enc.coincidencias === 0 && esListaSinTitulos(hoja)) {
      hoja = { ...hoja, filas: [['Paciente'], ...hoja.filas.map((f) => [f?.[0] ?? null])] }
      formato = 'listaSinTitulos'
      enc = detectarFilaEncabezado(hoja.filas)
    }

    const ubicar = (r: number): { fila?: number; ubicacion?: string } =>
      hoja.etiquetasFila ? { ubicacion: hoja.etiquetasFila[r] } : { fila: r + 1 }
    const problema = (nivel: Problema['nivel'], mensaje: string, r?: number) =>
      problemas.push({ nivel, hoja: hoja.nombre, mensaje, ...(r != null ? ubicar(r) : {}) })

    // Una sola columna reconocida: vale si es la de nombres y abajo hay nombres de verdad
    const soloNombres =
      enc.coincidencias === 1 &&
      enc.ids.every((id) => id === 'paciente' || id === 'apellido') &&
      pareceListaDeNombres(hoja.filas, enc.fila)
    if (enc.fila < 0 || (enc.coincidencias < 2 && !soloNombres && !hayAjustes)) {
      analizadas.push({ ...base, formato, filaEncabezado: Math.max(enc.fila, 0), motivo: 'No se encontraron títulos de columnas conocidos' })
      continue
    }
    const filaEnc = enc.fila

    let columnas = asignarColumnas(hoja.filas[filaEnc], ajustesHoja)
    const ctx = contextoHoja(hoja, filaEnc)
    const tiene = (id: ColumnaId) => columnas.some((c) => c.id === id)
    const hayColPaciente = tiene('paciente') || tiene('apellido')
    const hayColFecha = tiene('fecha')
    const tieneDatosRegistro = columnas.some(
      (c) => DEF_COLUMNA[c.id].grupo === 'toma' || DEF_COLUMNA[c.id].grupo === 'registro',
    )

    // Separadores dentro de la tabla (se buscan antes para saber si hay pacientes por título)
    const separadores = new Map<number, Separador>()
    for (let r = filaEnc + 1; r < hoja.filas.length; r++) {
      const s = leerSeparador(hoja.filas[r] ?? [], columnas, hayColPaciente, hayColFecha, anioHoy)
      if (s) separadores.set(r, s)
    }
    const pacientesPorTitulo = [...new Set([...separadores.values()].map((s) => s.paciente).filter(Boolean) as string[])]

    const info: HojaAnalizada = {
      ...base,
      formato,
      filaEncabezado: filaEnc,
      columnas,
      fechaPorDefecto: hayColFecha ? undefined : ctx.fecha,
      pacientePorDefecto: hayColPaciente ? undefined : ctx.paciente,
      pacientesPorTitulo,
    }
    analizadas.push(info)
    const hayPaciente = hayColPaciente || !!info.pacientePorDefecto || pacientesPorTitulo.length > 0
    const hayFecha = hayColFecha || !!info.fechaPorDefecto || [...separadores.values()].some((s) => s.fecha)

    if (tieneDatosRegistro && hayPaciente && hayFecha) info.tipo = 'registros'
    else if (hayColPaciente && !tieneDatosRegistro) info.tipo = 'pacientes'
    else {
      info.motivo = !hayPaciente
        ? 'Falta la columna del nombre del paciente'
        : !hayFecha
          ? 'Falta la columna de fecha (o escribí la fecha en el título)'
          : 'No tiene columnas de datos del registro'
      continue
    }

    let ultimaFecha: FechaISO | undefined
    let ultimoPaciente: string | undefined
    const titulo = info.pacientePorDefecto ? separarNombreYHabitacion(info.pacientePorDefecto) : undefined
    let pacienteBloque = titulo?.nombre
    let habitacionBloque = titulo?.habitacion
    let fechaBloque = info.fechaPorDefecto
    const encabezadoTextos = (cols: ColumnaDetectada[]) => cols.map((c) => normalizar(c.encabezado)).join('|')
    let firmaEncabezado = encabezadoTextos(columnas)

    for (let r = filaEnc + 1; r < hoja.filas.length; r++) {
      const fila = hoja.filas[r] ?? []
      if (filaVacia(fila)) continue

      // Separador de bloque: cambia el paciente o la fecha de lo que sigue
      const sep = separadores.get(r)
      if (sep) {
        if (sep.paciente) {
          pacienteBloque = sep.paciente
          habitacionBloque = sep.habitacion
          ultimoPaciente = undefined
          if (info.tipo === 'pacientes' || !tieneDatosRegistro) registrarPaciente(sep.paciente, { habitacion: sep.habitacion }, true)
        }
        if (sep.fecha) {
          fechaBloque = sep.fecha
          ultimaFecha = undefined
        }
        continue
      }

      // Encabezado repetido o de un bloque nuevo con otras columnas
      const encFila = detectarFilaEncabezado([fila])
      if (encFila.coincidencias >= 2 && fila.every((c) => vacio(c) || typeof c === 'string')) {
        const nuevas = asignarColumnas(fila, ajustesHoja)
        const firma = encabezadoTextos(nuevas)
        if (firma !== firmaEncabezado && nuevas.some((c) => c.id !== 'ignorar')) {
          columnas = nuevas
          firmaEncabezado = firma
        }
        continue
      }

      const col = (id: ColumnaId) => {
        const c = columnas.find((x) => x.id === id)
        return c ? (fila[c.indice] ?? null) : null
      }
      const columnasDato = columnas.filter((c) => c.id !== 'ignorar' && c.id !== 'fecha' && c.id !== 'paciente' && c.id !== 'apellido')
      const conDatos = columnasDato.some((c) => !vacio(fila[c.indice]))

      // Paciente
      const nombreCelda = [celdaATexto(col('paciente')), celdaATexto(col('apellido'))].filter(Boolean).join(' ')
      let nombre: string | undefined
      let habitacionFila: string | undefined
      if (nombreCelda) {
        if (/^[\d\s.,-]+$/.test(nombreCelda)) {
          problema('error', `El nombre del paciente "${nombreCelda}" es un número. Se saltó la fila.`, r)
          continue
        }
        const s = separarNombreYHabitacion(nombreCelda)
        nombre = s.nombre
        habitacionFila = s.habitacion
        ultimoPaciente = nombre
      }
      if (nombre && esEjemplo(nombre)) {
        info.filasEjemplo++
        continue
      }

      // Fecha
      let fecha: FechaISO | undefined
      const fechaCelda = col('fecha')
      if (!vacio(fechaCelda)) {
        const p = parsearFecha(fechaCelda, anioHoy)
        if (p.error) {
          problema('error', `${p.error}. Se saltó la fila.`, r)
          continue
        }
        if (p.aviso) problema('aviso', p.aviso, r)
        fecha = p.valor
        ultimaFecha = fecha
      }

      if (info.tipo === 'pacientes') {
        if (!nombre) continue
        const datos = leerDatosPaciente(fila, columnas, problema, r)
        if (habitacionFila && !datos.habitacion) datos.habitacion = habitacionFila
        registrarPaciente(nombre, datos, true)
        info.filasConDatos++
        continue
      }

      // Filas que solo tienen fecha o nombre (títulos de grupo): se recuerdan para las siguientes
      if (!conDatos) {
        if (nombre) {
          const datos = leerDatosPaciente(fila, columnas, problema, r)
          if (Object.keys(datos).length || habitacionFila) {
            registrarPaciente(nombre, { ...datos, habitacion: datos.habitacion ?? habitacionFila }, false)
          }
        }
        continue
      }

      if (!nombre) {
        nombre = ultimoPaciente ?? pacienteBloque
        if (ultimoPaciente) info.filasRellenadas++
      }
      if (!fecha) {
        fecha = ultimaFecha ?? fechaBloque
        if (ultimaFecha) info.filasRellenadas++
      }
      if (!nombre) {
        problema('error', 'Falta el nombre del paciente. Se saltó la fila.', r)
        continue
      }
      if (esEjemplo(nombre)) {
        info.filasEjemplo++
        continue
      }
      if (!fecha) {
        problema('error', 'Falta la fecha. Se saltó la fila.', r)
        continue
      }
      if (fecha > hoy) problema('aviso', `La fecha ${fecha.split('-').reverse().join('/')} es futura.`, r)

      info.filasConDatos++
      const datosPac = leerDatosPaciente(fila, columnas, problema, r)
      const habitacion = datosPac.habitacion ?? habitacionFila ?? (nombre === pacienteBloque ? habitacionBloque : undefined)
      const pac = registrarPaciente(nombre, { ...datosPac, habitacion }, false)
      const clave = `${pac.clave}|${fecha}`
      const origen = hoja.etiquetasFila ? r + 1 : r + 1

      const { tomas, textos, alimentacion } = leerFilaRegistro(fila, columnas, problema, r)
      const nuevo: RegistroImportado = {
        clave,
        pacienteClave: pac.clave,
        pacienteNombre: pac.nombre,
        fecha,
        tomas: unirTomas([], tomas),
        textos,
        alimentacion,
        origen: [{ hoja: hoja.nombre, fila: origen, ubicacion: ubicar(r).ubicacion }],
      }
      const existente = registros.get(clave)
      if (existente) registros.set(clave, fusionarImportados(existente, nuevo))
      else {
        pac.cantidadRegistros++
        registros.set(clave, nuevo)
      }
    }

    // Resumen de la hoja
    if (formato === 'pacientesEnColumnas') problema('info', 'Planilla con los pacientes en columnas: se leyó una columna por paciente.')
    if (formato === 'fechasEnColumnas') problema('info', 'Planilla con los días en columnas: se leyó una columna por día.')
    if (formato === 'listaSinTitulos') problema('info', 'Lista de nombres sin títulos: cada fila es un paciente.')
    if (pacientesPorTitulo.length > 0) {
      problema('info', `Se encontraron ${pacientesPorTitulo.length} pacientes como títulos dentro de la hoja (${pacientesPorTitulo.slice(0, 4).join(', ')}${pacientesPorTitulo.length > 4 ? '…' : ''}).`)
    }
    if (info.filasEjemplo > 0) problema('info', `Se ignoraron ${info.filasEjemplo} filas de ejemplo.`)
    if (info.filasRellenadas > 0) {
      problema('info', `${info.filasRellenadas} celdas de fecha o paciente estaban vacías (o combinadas) y se completaron con el valor de arriba.`)
    }
    if (info.fechaPorDefecto) problema('info', `No hay columna de fecha: se usó ${info.fechaPorDefecto.split('-').reverse().join('/')} (del título u hoja).`)
    if (info.pacientePorDefecto && pacientesPorTitulo.length === 0) {
      problema('info', `No hay columna de paciente: se usó "${info.pacientePorDefecto}" (del título u hoja).`)
    }
    const noReconocidas = info.columnas.filter((c) => c.id === 'ignorar' && c.nota === 'No se reconoció')
    if (noReconocidas.length) {
      problema('aviso', `Columnas que no se van a importar: ${noReconocidas.map((c) => `"${c.encabezado}"`).join(', ')}. Podés asignarlas a mano.`)
    }
  }

  // Registros sin ningún dato real
  const lista = [...registros.values()].filter((r) => {
    const vacioTotal = r.tomas.length === 0 && Object.keys(r.textos).length === 0 && !r.alimentacion.estado && !r.alimentacion.comentario
    return !vacioTotal
  })

  for (const r of lista) r.pacienteNombre = pacientes.get(r.pacienteClave)?.nombre ?? r.pacienteNombre

  return {
    hojas: analizadas,
    registros: lista.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.pacienteNombre.localeCompare(b.pacienteNombre)),
    pacientes: [...pacientes.values()]
      .filter((p) => p.enLista || p.cantidadRegistros > 0)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    problemas,
  }
}

type FnProblema = (nivel: Problema['nivel'], mensaje: string, r?: number) => void

function leerDatosPaciente(fila: Celda[], columnas: ColumnaDetectada[], problema: FnProblema, nFila?: number) {
  const datos: PacienteImportado['datos'] = {}
  for (const c of columnas) {
    const v = fila[c.indice]
    if (vacio(v)) continue
    switch (c.id) {
      case 'habitacion':
      case 'documento':
      case 'contacto':
        datos[c.id] = celdaATexto(v)
        break
      case 'notasPaciente':
        datos.notas = celdaATexto(v)
        break
      case 'fechaNacimiento': {
        const p = parsearFecha(v)
        if (p.valor) datos.fechaNacimiento = p.valor
        else problema('aviso', `Fecha de nacimiento: ${p.error}`, nFila)
        break
      }
    }
  }
  return datos
}

function leerFilaRegistro(fila: Celda[], columnas: ColumnaDetectada[], problema: FnProblema, nFila?: number) {
  const grupos = new Map<string, TomaSignos>()
  const tomaDe = (c: ColumnaDetectada) => {
    const g = c.grupoToma ?? '#0'
    let t = grupos.get(g)
    if (!t) {
      t = { id: nuevoId(), hora: c.horaToma }
      grupos.set(g, t)
    }
    return t
  }
  const notaEn = (t: TomaSignos, texto: string) => {
    t.nota = t.nota ? `${t.nota} · ${texto}` : texto
  }
  const tomasTexto: TomaSignos[] = []
  const textos: Partial<Record<CampoTexto, string>> = {}
  let alimentacion: Alimentacion = { estado: '' }

  for (const c of columnas) {
    const v = fila[c.indice] ?? null
    if (vacio(v)) continue
    const id = c.id
    switch (id) {
      case 'hora': {
        const p = parsearHora(v)
        if (p.valor) tomaDe(c).hora = p.valor
        else problema('aviso', `${p.error}. Se guardó como nota.`, nFila)
        if (p.aviso) problema('aviso', p.aviso, nFila)
        if (!p.valor) notaEn(tomaDe(c), `Hora: ${celdaATexto(v)}`)
        break
      }
      case 'presion': {
        const p = parsearPresion(v)
        const t = tomaDe(c)
        if (p.valor) Object.assign(t, Object.fromEntries(Object.entries(p.valor).filter(([, x]) => x != null)))
        else notaEn(t, `PA: ${celdaATexto(v)}`)
        if (p.aviso || p.error) problema('aviso', (p.aviso ?? p.error)!, nFila)
        break
      }
      case 'sistolica':
      case 'diastolica':
      case 'frecuenciaCardiaca':
      case 'temperatura':
      case 'saturacion':
      case 'frecuenciaRespiratoria':
      case 'glucemia': {
        const p = parsearSigno(id, v)
        const t = tomaDe(c)
        if (p.valor != null) t[id] = p.valor
        else notaEn(t, `${DEF_TOMA[id].corta}: ${celdaATexto(v)}`)
        if (p.aviso) problema('aviso', p.aviso, nFila)
        if (p.error) problema('aviso', `${DEF_TOMA[id].etiqueta}: ${p.error}. Se guardó como nota.`, nFila)
        break
      }
      case 'notaToma':
        notaEn(tomaDe(c), celdaATexto(v))
        break
      case 'signosTexto': {
        const r = parsearSignosTexto(v)
        tomasTexto.push(...r.tomas)
        r.avisos.forEach((a) => problema('aviso', a, nFila))
        break
      }
      case 'alimentacion': {
        const p = parsearAlimentacion(v)
        if (p.valor) alimentacion = unirAlimentacion(alimentacion, { estado: p.valor.estado, comentario: p.valor.comentario })
        if (p.aviso) problema('aviso', p.aviso, nFila)
        break
      }
      case 'alimentacionComentario':
        alimentacion = unirAlimentacion(alimentacion, { estado: '', comentario: celdaATexto(v) })
        break
      default:
        if (CAMPOS_REGISTRO.has(id)) {
          const k = id as CampoTexto
          textos[k] = unirTexto(textos[k], celdaATexto(v))
        }
    }
  }
  const tomas = [...grupos.values()].filter((t) => !tomaSinDatos(t)).concat(tomasTexto)
  return { tomas, textos, alimentacion }
}
