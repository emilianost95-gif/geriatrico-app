import type { Row, Workbook, Worksheet } from 'exceljs'
import { CAMPOS_TEXTO, fueraDeNormal } from '../domain/campos'
import type { Paciente, Registro } from '../domain/tipos'
import { hoyISO, isoADate } from '../lib/fechas'
import { entregarArchivo } from '../lib/archivos'
import { resumenToma } from '../lib/tomas'

type ExcelJSMod = typeof import('exceljs')

async function cargarExcelJS(): Promise<ExcelJSMod> {
  const mod = await import('exceljs')
  return (mod as unknown as { default?: ExcelJSMod }).default ?? mod
}

const COLOR = {
  encabezado: 'FF3F6B5C',
  textoEncabezado: 'FFFFFFFF',
  alterna: 'FFF6F3EA',
  borde: 'FFD9D3C3',
  alerta: 'FFFBE3DF',
  textoAlerta: 'FF9B2C1F',
  positiva: 'FFE3F1E6',
  negativa: 'FFFBE3DF',
}

/** Fecha ISO → Date en UTC (así Excel muestra el mismo día en cualquier zona horaria). */
function fechaExcel(iso: string): Date {
  const d = isoADate(iso)
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}

interface DefCol {
  titulo: string
  ancho: number
  fecha?: boolean
  numero?: string
}

function prepararHoja(ws: Worksheet, cols: DefCol[], columnasFijas = 2) {
  ws.columns = cols.map((c) => ({
    header: c.titulo,
    width: c.ancho,
    style: {
      alignment: { vertical: 'top', wrapText: true },
      ...(c.fecha ? { numFmt: 'dd/mm/yyyy' } : c.numero ? { numFmt: c.numero } : {}),
    },
  }))
  const h = ws.getRow(1)
  h.height = 34
  h.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: COLOR.textoEncabezado }, size: 12 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.encabezado } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  })
  ws.views = [{ state: 'frozen', xSplit: columnasFijas, ySplit: 1 }]
}

function terminarHoja(ws: Worksheet) {
  const nCols = ws.columnCount
  ws.eachRow((row, n) => {
    if (n === 1) return
    for (let c = 1; c <= nCols; c++) {
      const cell = row.getCell(c)
      if (n % 2 === 0 && !cell.fill) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.alterna } }
      }
      cell.border = {
        top: { style: 'thin', color: { argb: COLOR.borde } },
        bottom: { style: 'thin', color: { argb: COLOR.borde } },
        left: { style: 'thin', color: { argb: COLOR.borde } },
        right: { style: 'thin', color: { argb: COLOR.borde } },
      }
    }
  })
  if (ws.rowCount > 1) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: ws.rowCount, column: nCols } }
  }
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }
  ws.pageSetup.printTitlesRow = '1:1'
}

function marcarAlerta(ws: Worksheet, fila: number, col: number) {
  const cell = ws.getRow(fila).getCell(col)
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.alerta } }
  cell.font = { bold: true, color: { argb: COLOR.textoAlerta } }
}

export interface DatosExportacion {
  pacientes: Paciente[]
  registros: Registro[]
  descripcionFiltro: string
  /** true: lista todos los pacientes en la hoja "Pacientes" (copia de seguridad) */
  incluirTodosLosPacientes?: boolean
  /** Además de las hojas generales, una hoja por cada paciente */
  hojaPorPaciente?: boolean
  nombreHogar?: string
}

const COLUMNAS_DIA: DefCol[] = [
  { titulo: 'Signos vitales', ancho: 48 },
  ...CAMPOS_TEXTO.filter((c) => c.clave !== 'observaciones').flatMap((c): DefCol[] => {
    const col = { titulo: c.etiqueta, ancho: c.multilinea ? 30 : 20 }
    // Alimentación va entre Curaciones y Rotación, como en la planilla original
    return c.clave === 'curaciones'
      ? [col, { titulo: 'Alimentación', ancho: 13 }, { titulo: 'Comentario alimentación', ancho: 26 }]
      : [col]
  }),
  { titulo: 'Observaciones', ancho: 40 },
]

/** Valores del día (desde "Signos vitales" hasta "Observaciones"), en el orden de COLUMNAS_DIA */
function valoresDelDia(r: Registro): (string | undefined)[] {
  const fila: (string | undefined)[] = [r.tomas.map(resumenToma).join('\n') || undefined]
  for (const c of CAMPOS_TEXTO) {
    if (c.clave === 'observaciones') continue
    fila.push(r[c.clave])
    if (c.clave === 'curaciones') {
      fila.push(r.alimentacion.estado === 'positiva' ? 'Positiva' : r.alimentacion.estado === 'negativa' ? 'Negativa' : undefined)
      fila.push(r.alimentacion.comentario)
    }
  }
  fila.push(r.observaciones)
  return fila
}

const INDICE_ALIMENTACION = COLUMNAS_DIA.findIndex((c) => c.titulo === 'Alimentación')

function pintarAlimentacion(row: Row, desde: number, estado: Registro['alimentacion']['estado']) {
  if (!estado) return
  row.getCell(desde + INDICE_ALIMENTACION).fill = {
    type: 'pattern', pattern: 'solid',
    fgColor: { argb: estado === 'positiva' ? COLOR.positiva : COLOR.negativa },
  }
}

/** Nombre de hoja válido para Excel (máx. 31 caracteres, sin : \\ / ? * [ ]) y sin repetir */
function nombreHoja(nombre: string, usados: Set<string>): string {
  const base = nombre.replace(/[:\\/?*[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28) || 'Paciente'
  let candidato = base
  for (let i = 2; usados.has(candidato.toLowerCase()); i++) candidato = `${base.slice(0, 26)} ${i}`
  usados.add(candidato.toLowerCase())
  return candidato
}

export async function crearLibro(datos: DatosExportacion): Promise<Workbook> {
  const ExcelJS = await cargarExcelJS()
  const wb = new ExcelJS.Workbook()
  wb.creator = datos.nombreHogar || 'Registro Geriátrico'
  wb.created = new Date()
  const porId = new Map(datos.pacientes.map((p) => [p.id!, p]))
  const nombreDe = (id: number) => porId.get(id)?.nombre ?? '(paciente borrado)'
  const registros = [...datos.registros].sort(
    (a, b) => a.fecha.localeCompare(b.fecha) || nombreDe(a.pacienteId).localeCompare(nombreDe(b.pacienteId), 'es'),
  )
  const usados = new Set<string>()

  // ── Hoja 1: un renglón por paciente por día ──
  const wsReg = wb.addWorksheet(nombreHoja('Registros diarios', usados), { properties: { tabColor: { argb: COLOR.encabezado } } })
  prepararHoja(wsReg, [
    { titulo: 'Fecha', ancho: 12, fecha: true },
    { titulo: 'Paciente', ancho: 26 },
    { titulo: 'Habitación', ancho: 11 },
    ...COLUMNAS_DIA,
  ])
  for (const r of registros) {
    const p = porId.get(r.pacienteId)
    const row = wsReg.addRow([fechaExcel(r.fecha), nombreDe(r.pacienteId), p?.habitacion, ...valoresDelDia(r)])
    pintarAlimentacion(row, 4, r.alimentacion.estado)
  }
  terminarHoja(wsReg)

  // ── Hoja 2: un renglón por toma de signos vitales ──
  const wsSig = wb.addWorksheet(nombreHoja('Signos vitales', usados), { properties: { tabColor: { argb: 'FF7FA99B' } } })
  prepararHoja(wsSig, [
    { titulo: 'Fecha', ancho: 12, fecha: true },
    { titulo: 'Paciente', ancho: 26 },
    { titulo: 'Hora', ancho: 8 },
    { titulo: 'Presión arterial', ancho: 11 },
    { titulo: 'Frecuencia cardíaca', ancho: 12 },
    { titulo: 'Temperatura', ancho: 12, numero: '0.0' },
    { titulo: 'Saturación O2', ancho: 12 },
    { titulo: 'Frecuencia respiratoria', ancho: 13 },
    { titulo: 'Glucemia', ancho: 10 },
    { titulo: 'Nota', ancho: 30 },
  ])
  for (const r of registros) {
    for (const t of r.tomas) {
      const pa = t.sistolica != null || t.diastolica != null ? `${t.sistolica ?? '?'}/${t.diastolica ?? '?'}` : undefined
      const row = wsSig.addRow([
        fechaExcel(r.fecha), nombreDe(r.pacienteId), t.hora, pa,
        t.frecuenciaCardiaca, t.temperatura, t.saturacion, t.frecuenciaRespiratoria, t.glucemia, t.nota,
      ])
      const n = row.number
      if (fueraDeNormal('sistolica', t.sistolica) || fueraDeNormal('diastolica', t.diastolica)) marcarAlerta(wsSig, n, 4)
      if (fueraDeNormal('frecuenciaCardiaca', t.frecuenciaCardiaca)) marcarAlerta(wsSig, n, 5)
      if (fueraDeNormal('temperatura', t.temperatura)) marcarAlerta(wsSig, n, 6)
      if (fueraDeNormal('saturacion', t.saturacion)) marcarAlerta(wsSig, n, 7)
      if (fueraDeNormal('frecuenciaRespiratoria', t.frecuenciaRespiratoria)) marcarAlerta(wsSig, n, 8)
      if (fueraDeNormal('glucemia', t.glucemia)) marcarAlerta(wsSig, n, 9)
    }
  }
  terminarHoja(wsSig)

  // ── Hoja 3: pacientes ──
  const wsPac = wb.addWorksheet(nombreHoja('Pacientes', usados), { properties: { tabColor: { argb: 'FFC9A66B' } } })
  prepararHoja(wsPac, [
    { titulo: 'Nombre del paciente', ancho: 28 },
    { titulo: 'Habitación', ancho: 11 },
    { titulo: 'Documento', ancho: 16 },
    { titulo: 'Fecha de nacimiento', ancho: 14, fecha: true },
    { titulo: 'Contacto', ancho: 28 },
    { titulo: 'Notas del paciente', ancho: 36 },
    { titulo: 'Activo', ancho: 9 },
    { titulo: 'Cantidad de registros', ancho: 12 },
  ], 1)
  const cantidad = new Map<number, number>()
  for (const r of datos.registros) cantidad.set(r.pacienteId, (cantidad.get(r.pacienteId) ?? 0) + 1)
  const pacientesExportados = datos.incluirTodosLosPacientes
    ? datos.pacientes
    : datos.pacientes.filter((p) => cantidad.has(p.id!))
  for (const p of pacientesExportados) {
    wsPac.addRow([
      p.nombre, p.habitacion, p.documento,
      p.fechaNacimiento ? fechaExcel(p.fechaNacimiento) : undefined,
      p.contacto, p.notas, p.activo ? 'Sí' : 'No', cantidad.get(p.id!) ?? 0,
    ])
  }
  terminarHoja(wsPac)

  // ── Hojas por paciente (opcional) ──
  if (datos.hojaPorPaciente) {
    for (const p of pacientesExportados) {
      const propios = registros.filter((r) => r.pacienteId === p.id)
      if (propios.length === 0) continue
      escribirHojaPaciente(wb.addWorksheet(nombreHoja(p.nombre, usados)), p, propios)
    }
  }

  // ── Información ──
  const wsInfo = wb.addWorksheet(nombreHoja('Información', usados))
  wsInfo.columns = [{ width: 26 }, { width: 60 }]
  const info: [string, string][] = [
    ...(datos.nombreHogar ? ([['Hogar', datos.nombreHogar]] as [string, string][]) : []),
    ['Exportado el', new Date().toLocaleString('es')],
    ['Contenido', datos.descripcionFiltro],
    ['Registros diarios', String(registros.length)],
    ['Tomas de signos vitales', String(registros.reduce((s, r) => s + r.tomas.length, 0))],
    ['Pacientes', String(pacientesExportados.length)],
    ['', ''],
    ['Colores', 'Rojo claro = valor fuera del rango normal. Verde / rojo en Alimentación = positiva / negativa.'],
    ['Volver a importar', 'Este archivo se puede importar en la app sin cambios. Si lo editás, no cambies los títulos de las columnas.'],
  ]
  info.forEach(([a, b]) => {
    const row = wsInfo.addRow([a, b])
    row.getCell(1).font = { bold: true }
    row.getCell(2).alignment = { wrapText: true }
  })
  wsInfo.getRow(1).getCell(1).font = { bold: true, size: 13, color: { argb: COLOR.encabezado } }

  return wb
}

/** Hoja de un paciente: título con sus datos y debajo sus registros día por día. */
function escribirHojaPaciente(ws: Worksheet, p: Paciente, registros: Registro[]) {
  const cols: DefCol[] = [{ titulo: 'Fecha', ancho: 12, fecha: true }, ...COLUMNAS_DIA]
  ws.columns = cols.map((c) => ({
    width: c.ancho,
    style: { alignment: { vertical: 'top', wrapText: true }, ...(c.fecha ? { numFmt: 'dd/mm/yyyy' } : {}) },
  }))
  const titulo = ws.addRow([`Paciente: ${p.nombre}`])
  titulo.font = { bold: true, size: 15, color: { argb: COLOR.encabezado } }
  titulo.height = 24
  const datos = [
    p.habitacion && `Habitación: ${p.habitacion}`,
    p.documento && `Documento: ${p.documento}`,
    p.fechaNacimiento && `Nacimiento: ${p.fechaNacimiento.split('-').reverse().join('/')}`,
    p.contacto && `Contacto: ${p.contacto}`,
  ].filter(Boolean)
  const sub = ws.addRow([datos.join('   ·   ') || ' '])
  sub.font = { color: { argb: 'FF5C584F' } }
  const enc = ws.addRow(cols.map((c) => c.titulo))
  enc.height = 34
  enc.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: COLOR.textoEncabezado }, size: 12 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.encabezado } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  })
  for (const r of registros) {
    const row = ws.addRow([fechaExcel(r.fecha), ...valoresDelDia(r)])
    pintarAlimentacion(row, 2, r.alimentacion.estado)
  }
  const nCols = cols.length
  ws.eachRow((row, n) => {
    if (n <= 3) return
    for (let c = 1; c <= nCols; c++) {
      const cell = row.getCell(c)
      if (n % 2 === 0 && !cell.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.alterna } }
      cell.border = { bottom: { style: 'thin', color: { argb: COLOR.borde } } }
    }
  })
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 3 }]
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }
  ws.pageSetup.printTitlesRow = '1:3'
}

const COLOR_EJEMPLO = 'FF7A7A7A'

/**
 * Plantilla para migrar todo el hogar de una vez:
 * - "Pacientes": todos los residentes (se crean aunque no tengan registros).
 * - "Registros": el historial, una fila por toma.
 * Las filas que empiezan con "Ejemplo:" se ignoran al importar.
 */
export async function crearPlantilla(): Promise<Workbook> {
  const ExcelJS = await cargarExcelJS()
  const wb = new ExcelJS.Workbook()

  // ── Pacientes ──
  const wp = wb.addWorksheet('Pacientes', { properties: { tabColor: { argb: 'FFC9A66B' } } })
  prepararHoja(wp, [
    { titulo: 'Nombre y apellido', ancho: 30 },
    { titulo: 'Habitación', ancho: 12 },
    { titulo: 'Documento', ancho: 16 },
    { titulo: 'Fecha de nacimiento', ancho: 16, fecha: true },
    { titulo: 'Contacto familiar', ancho: 30 },
    { titulo: 'Notas del paciente', ancho: 40 },
  ], 1)
  wp.addRow(['Ejemplo: María González', '4B', '5.123.456-7', new Date(Date.UTC(1938, 4, 3)), 'Laura (hija) 9 1234 5678', 'Diabética, dieta hiposódica'])
  wp.addRow(['Ejemplo: Juan Pérez', '2A', '', '', 'Pedro (hijo)', ''])
  ;[2, 3].forEach((n) => (wp.getRow(n).font = { italic: true, color: { argb: COLOR_EJEMPLO } }))
  terminarHoja(wp)

  // ── Registros ──
  const ws = wb.addWorksheet('Registros', { properties: { tabColor: { argb: COLOR.encabezado } } })
  const cols: DefCol[] = [
    { titulo: 'Fecha', ancho: 12, fecha: true },
    { titulo: 'Paciente', ancho: 26 },
    { titulo: 'Hora', ancho: 8 },
    { titulo: 'Presión arterial', ancho: 11 },
    { titulo: 'Frecuencia cardíaca', ancho: 12 },
    { titulo: 'Temperatura', ancho: 12 },
    { titulo: 'Saturación O2', ancho: 12 },
    { titulo: 'Frecuencia respiratoria', ancho: 13 },
    { titulo: 'Glucemia', ancho: 10 },
    ...CAMPOS_TEXTO.filter((c) => c.clave !== 'observaciones').flatMap((c): DefCol[] =>
      c.clave === 'curaciones'
        ? [{ titulo: c.etiqueta, ancho: 20 }, { titulo: 'Alimentación', ancho: 13 }, { titulo: 'Comentario alimentación', ancho: 24 }]
        : [{ titulo: c.etiqueta, ancho: 18 }],
    ),
    { titulo: 'Observaciones', ancho: 36 },
  ]
  prepararHoja(ws, cols)
  const hoy = new Date()
  const hoyUTC = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()))
  ws.addRow([hoyUTC, 'Ejemplo: María González', '08:00', '120/80', 72, 36.5, 96, 16, 110, 'Sin estudios hoy', 'No usa', 'Normal', 'Sí, normal', 'No usa', 'No requiere', 'Positiva', 'Comió todo', 'Cada 2 horas', 'Caminó', 'Durmió bien', 'Tranquila', 'Las filas que empiezan con "Ejemplo:" no se importan'])
  ws.addRow([hoyUTC, 'Ejemplo: María González', '20:00', '130/85', 78, 36.8, 95])
  ws.addRow([hoyUTC, 'Ejemplo: Juan Pérez', '09:00', '140/90', 80, 37.9, 93, 18, undefined, undefined, 'Permeable', 'Escasa', 'No hizo', 'No usa', 'Escara sacra', 'Negativa', 'Rechazó la cena', 'Cada 2 horas', 'Ejercicios en cama', 'Durmió poco', 'Desorientado', 'Se avisó al médico'])
  ;[2, 3, 4].forEach((n) => (ws.getRow(n).font = { italic: true, color: { argb: COLOR_EJEMPLO } }))
  // Listas desplegables
  const colAlim = cols.findIndex((c) => c.titulo === 'Alimentación') + 1
  for (let r = 2; r <= 1000; r++) {
    ws.getRow(r).getCell(colAlim).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Positiva,Negativa"'] }
    ws.getRow(r).getCell(2).dataValidation = {
      type: 'list', allowBlank: true, formulae: ['Pacientes!$A$2:$A$500'],
      showErrorMessage: false,
    }
  }
  terminarHoja(ws)

  const wi = wb.addWorksheet('Cómo usar')
  wi.columns = [{ width: 110 }]
  ;[
    'CÓMO PASAR TODO EL HOGAR A LA APP',
    '',
    '1) Hoja "Pacientes": una fila por residente. Solo el nombre es obligatorio.',
    '   Se crean todos, aunque todavía no tengan registros.',
    '2) Hoja "Registros": el historial. Una fila por cada toma de signos vitales.',
    '   Si un paciente tiene 3 tomas en el día, usá 3 filas con la misma fecha y paciente.',
    '   Los demás datos del día (diuresis, catarsis, etc.) alcanza con escribirlos en una sola de esas filas.',
    '   En la columna Paciente podés elegir el nombre de la lista (se arma con la hoja Pacientes).',
    '3) En la app: Excel → Importar → elegir este archivo → revisar el resumen → Importar.',
    '',
    'FORMATOS',
    '• Fecha: día/mes/año (ej. 16/09/2026).  Presión: 120/80.  Temperatura con coma o punto (36,5).',
    '• Alimentación: Positiva o Negativa (hay una lista desplegable).',
    '• Las filas que empiezan con "Ejemplo:" se ignoran solas: podés dejarlas o borrarlas.',
    '• Podés agregar, quitar o reordenar columnas: la app las reconoce por el título aunque no sea exacto.',
    '',
    '¿YA TENÉS OTRA PLANILLA?',
    '• No hace falta pasarla a esta plantilla: la app también entiende planillas con un bloque por paciente,',
    '  una hoja por paciente, pacientes en columnas (planilla de turno) o días en columnas (control mensual).',
  ].forEach((t, i) => {
    const row = wi.addRow([t])
    if (i === 0 || t === 'FORMATOS' || t.startsWith('¿YA')) row.font = { bold: true, size: i === 0 ? 14 : 12, color: { argb: COLOR.encabezado } }
  })
  return wb
}

export async function descargarLibro(wb: Workbook, nombreArchivo: string) {
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  await entregarArchivo(blob, nombreArchivo)
}

export function nombreArchivoExport(sufijo: string) {
  const limpio = sufijo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `geriatrico-${limpio || 'datos'}-${hoyISO()}.xlsx`
}
