import type { jsPDF as JsPDF } from 'jspdf'
import { CAMPOS_TEXTO, DEF_TOMA, fueraDeNormal, type CampoNumericoToma } from '../domain/campos'
import { calcularAlertas } from '../domain/alertas'
import type { FechaISO, Paciente, Registro, TomaSignos } from '../domain/tipos'
import { aISO, edad, fechaCorta, fechaLarga, isoADate } from '../lib/fechas'

/*
 * Informes PDF (A4) generados en el dispositivo con jsPDF.
 * Tipografía Helvetica (incluida en jsPDF): admite tildes y ñ.
 */

const VERDE: [number, number, number] = [63, 107, 92]
const TINTA: [number, number, number] = [43, 43, 40]
const SUAVE: [number, number, number] = [92, 88, 79]
const ROJO: [number, number, number] = [168, 65, 47]
const GRILLA: [number, number, number] = [225, 224, 217]
const MARGEN = 14

type AutoTable = (typeof import('jspdf-autotable'))['default']

async function cargar() {
  const [{ jsPDF }, at] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  return { jsPDF, autoTable: at.default as AutoTable }
}

const fmt = (v?: number) => (v == null ? '' : String(v).replace('.', ','))
const pa = (t: TomaSignos) => (t.sistolica != null || t.diastolica != null ? `${t.sistolica ?? '?'}/${t.diastolica ?? '?'}` : '')
const finalY = (doc: JsPDF) => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? MARGEN

interface Contexto {
  doc: JsPDF
  autoTable: AutoTable
  ancho: number
  alto: number
  nombreHogar: string
}

function encabezado(c: Contexto, titulo: string, subtitulo: string) {
  const { doc, ancho } = c
  doc.setFillColor(...VERDE)
  doc.rect(0, 0, ancho, 24, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text(c.nombreHogar || 'Registro Geriátrico', MARGEN, 10)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`${titulo} · ${subtitulo}`, MARGEN, 17)
  doc.text(`Generado el ${new Date().toLocaleString('es')}`, ancho - MARGEN, 17, { align: 'right' })
  doc.setTextColor(...TINTA)
  return 32
}

function pies(c: Contexto) {
  const { doc, ancho, alto } = c
  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    doc.setDrawColor(...GRILLA)
    doc.line(MARGEN, alto - 12, ancho - MARGEN, alto - 12)
    doc.setFontSize(8.5)
    doc.setTextColor(...SUAVE)
    doc.text('Registro Geriátrico · Los valores fuera de lo normal están en rojo y son orientativos.', MARGEN, alto - 7)
    doc.text(`Página ${i} de ${total}`, ancho - MARGEN, alto - 7, { align: 'right' })
  }
}

function tituloSeccion(c: Contexto, texto: string, y: number): number {
  const { doc, alto } = c
  if (y > alto - 40) {
    doc.addPage()
    y = MARGEN + 4
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12.5)
  doc.setTextColor(...VERDE)
  doc.text(texto, MARGEN, y)
  doc.setTextColor(...TINTA)
  doc.setFont('helvetica', 'normal')
  return y + 3
}

const estilosTabla = {
  styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.8, textColor: TINTA, lineColor: GRILLA, lineWidth: 0.1 },
  headStyles: { fillColor: VERDE, textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold' as const },
  alternateRowStyles: { fillColor: [250, 248, 242] as [number, number, number] },
  margin: { left: MARGEN, right: MARGEN, top: MARGEN, bottom: 18 },
  rowPageBreak: 'avoid' as const,
}

/** Helvetica (fuente estándar del PDF) no tiene subíndices ni algunos símbolos: se reemplazan. */
const REEMPLAZOS: Record<string, string> = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '–': '-', '—': '-', '…': '...', '“': '"', '”': '"' }
function textoSeguro(t: unknown): unknown {
  if (typeof t === 'string') return t.replace(/[₀-₃–—…“”]/g, (ch) => REEMPLAZOS[ch] ?? ch)
  if (Array.isArray(t)) return t.map(textoSeguro)
  return t
}
function protegerTexto(doc: JsPDF) {
  const original = doc.text.bind(doc) as (...a: unknown[]) => JsPDF
  ;(doc as unknown as { text: (...a: unknown[]) => JsPDF }).text = (texto: unknown, ...resto: unknown[]) =>
    original(textoSeguro(texto), ...resto)
  const partir = doc.splitTextToSize.bind(doc)
  doc.splitTextToSize = (texto: string, ...resto: Parameters<JsPDF['splitTextToSize']> extends [unknown, ...infer R] ? R : never) =>
    partir(textoSeguro(texto) as string, ...resto)
  return doc
}

function textoDelDia(r: Registro): string {
  const partes: string[] = []
  if (r.alimentacion.estado || r.alimentacion.comentario) {
    const e = r.alimentacion.estado === 'positiva' ? 'Positiva' : r.alimentacion.estado === 'negativa' ? 'Negativa' : ''
    partes.push(`Alimentación: ${[e, r.alimentacion.comentario].filter(Boolean).join(' - ')}`)
  }
  for (const c of CAMPOS_TEXTO) {
    const v = r[c.clave]
    if (v) partes.push(`${c.etiqueta}: ${v}`)
  }
  return partes.join('\n')
}

const CAMPOS_TABLA: { campo: CampoNumericoToma; titulo: string }[] = [
  { campo: 'frecuenciaCardiaca', titulo: 'Pulso' },
  { campo: 'temperatura', titulo: 'Temp.' },
  { campo: 'saturacion', titulo: 'Sat O2' },
  { campo: 'frecuenciaRespiratoria', titulo: 'Resp.' },
  { campo: 'glucemia', titulo: 'Gluc.' },
]

// ───────────────────────── Mini gráficos ─────────────────────────

function miniGrafico(
  c: Contexto,
  x0: number,
  y0: number,
  w: number,
  h: number,
  titulo: string,
  series: { puntos: { t: number; v: number }[]; color: [number, number, number]; campo: CampoNumericoToma }[],
  banda?: [number, number],
) {
  const { doc } = c
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.text(titulo, x0, y0)
  const top = y0 + 3
  const iz = x0 + 10
  const iw = w - 12
  const ih = h - 10
  const todos = series.flatMap((s) => s.puntos)
  const ts = todos.map((p) => p.t)
  let tMin = Math.min(...ts)
  let tMax = Math.max(...ts)
  if (tMin === tMax) {
    tMin -= 43200e3
    tMax += 43200e3
  }
  let vMin = Math.min(...todos.map((p) => p.v), ...(banda ? [banda[0]] : []))
  let vMax = Math.max(...todos.map((p) => p.v), ...(banda ? [banda[1]] : []))
  const pad = (vMax - vMin || 1) * 0.12
  vMin -= pad
  vMax += pad
  const X = (t: number) => iz + ((t - tMin) / (tMax - tMin)) * iw
  const Y = (v: number) => top + (1 - (v - vMin) / (vMax - vMin)) * ih

  if (banda) {
    doc.setFillColor(226, 241, 226)
    doc.rect(iz, Y(banda[1]), iw, Y(banda[0]) - Y(banda[1]), 'F')
  }
  doc.setDrawColor(...GRILLA)
  doc.setLineWidth(0.2)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...SUAVE)
  for (const v of [vMin + pad, vMax - pad]) {
    doc.line(iz, Y(v), iz + iw, Y(v))
    doc.text(fmt(Math.round(v * 10) / 10), iz - 1.5, Y(v) + 1, { align: 'right' })
  }
  const diaMes = (t: number) => fechaCorta(aISO(new Date(t))).slice(0, 5)
  doc.text(diaMes(Math.min(...ts)), iz, top + ih + 4)
  if (ts.length > 1) doc.text(diaMes(Math.max(...ts)), iz + iw, top + ih + 4, { align: 'right' })
  doc.setTextColor(...TINTA)

  for (const s of series) {
    doc.setDrawColor(...s.color)
    doc.setLineWidth(0.5)
    for (let i = 1; i < s.puntos.length; i++) {
      doc.line(X(s.puntos[i - 1].t), Y(s.puntos[i - 1].v), X(s.puntos[i].t), Y(s.puntos[i].v))
    }
    for (const p of s.puntos) {
      const fuera = fueraDeNormal(s.campo, p.v)
      doc.setFillColor(...(fuera ? ROJO : s.color))
      doc.circle(X(p.t), Y(p.v), fuera ? 0.9 : 0.6, 'F')
    }
  }
}

function puntos(registros: Registro[], campo: CampoNumericoToma) {
  const res: { t: number; v: number }[] = []
  for (const r of registros) {
    for (const t of r.tomas) {
      const v = t[campo]
      if (v == null) continue
      const [h, m] = (t.hora ?? '12:00').split(':').map(Number)
      const d = isoADate(r.fecha)
      d.setHours(h, m)
      res.push({ t: d.getTime(), v })
    }
  }
  return res.sort((a, b) => a.t - b.t)
}

// ───────────────────────── Informe de un paciente ─────────────────────────

export interface DatosInformePaciente {
  paciente: Paciente
  registros: Registro[]
  desde?: FechaISO
  hasta?: FechaISO
  nombreHogar: string
}

export async function crearInformePaciente(d: DatosInformePaciente): Promise<Blob> {
  const { jsPDF, autoTable } = await cargar()
  const doc = protegerTexto(new jsPDF({ unit: 'mm', format: 'a4' }))
  const c: Contexto = { doc, autoTable, ancho: doc.internal.pageSize.getWidth(), alto: doc.internal.pageSize.getHeight(), nombreHogar: d.nombreHogar }
  const registros = [...d.registros].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const periodo =
    d.desde && d.hasta ? `del ${fechaCorta(d.desde)} al ${fechaCorta(d.hasta)}` : registros.length ? `del ${fechaCorta(registros[0].fecha)} al ${fechaCorta(registros[registros.length - 1].fecha)}` : 'sin registros'
  let y = encabezado(c, 'Informe del paciente', periodo)

  // Datos del paciente
  const p = d.paciente
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(p.nombre, MARGEN, y + 2)
  y += 8
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...SUAVE)
  const anios = edad(p.fechaNacimiento)
  const datos = [
    p.habitacion && `Habitación ${p.habitacion}`,
    anios != null && `${anios} años (nació el ${fechaCorta(p.fechaNacimiento!)})`,
    p.documento && `Documento ${p.documento}`,
    p.contacto && `Contacto: ${p.contacto}`,
  ].filter(Boolean) as string[]
  if (datos.length) {
    doc.text(datos.join('   ·   '), MARGEN, y)
    y += 5
  }
  if (p.notas) {
    const lineas = doc.splitTextToSize(`Notas: ${p.notas}`, c.ancho - 2 * MARGEN)
    doc.text(lineas, MARGEN, y)
    y += lineas.length * 4.2 + 1
  }
  doc.setTextColor(...TINTA)
  const tomas = registros.flatMap((r) => r.tomas.map((t) => ({ r, t })))
  doc.text(`${registros.length} registros diarios y ${tomas.length} tomas de signos vitales en el período.`, MARGEN, y + 1)
  y += 7

  // Resumen de signos
  const filasResumen = (Object.keys(DEF_TOMA) as CampoNumericoToma[])
    .map((campo) => {
      const vals = tomas.map(({ t }) => t[campo]).filter((v): v is number => v != null)
      if (!vals.length) return null
      const def = DEF_TOMA[campo]
      const prom = vals.reduce((a, b) => a + b, 0) / vals.length
      const fuera = vals.filter((v) => fueraDeNormal(campo, v)).length
      return [
        def.etiqueta,
        `${fmt(def.normal![0])} a ${fmt(def.normal![1])} ${def.unidad}`,
        fmt(Math.min(...vals)),
        fmt(Math.max(...vals)),
        fmt(Math.round(prom * 10) / 10),
        fmt(vals[vals.length - 1]),
        fuera ? `${fuera} de ${vals.length}` : '-',
      ]
    })
    .filter((f): f is string[] => !!f)

  if (filasResumen.length) {
    y = tituloSeccion(c, 'Resumen de signos vitales', y)
    autoTable(doc, {
      ...estilosTabla,
      startY: y,
      head: [['Signo', 'Rango normal', 'Mínimo', 'Máximo', 'Promedio', 'Último', 'Fuera de lo normal']],
      body: filasResumen,
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'center' } },
      didParseCell: (h) => {
        if (h.section === 'body' && h.column.index === 6 && h.cell.raw !== '-') {
          h.cell.styles.textColor = ROJO
          h.cell.styles.fontStyle = 'bold'
        }
      },
    })
    y = finalY(doc) + 8

    // Gráficos (2 por fila)
    const graficos = [
      { titulo: 'Presión arterial (mmHg)', series: [{ campo: 'sistolica' as const, color: [42, 120, 214] as [number, number, number] }, { campo: 'diastolica' as const, color: [235, 104, 52] as [number, number, number] }] },
      { titulo: 'Temperatura (°C)', series: [{ campo: 'temperatura' as const, color: [42, 120, 214] as [number, number, number] }], banda: DEF_TOMA.temperatura.normal },
      { titulo: 'Saturación O2 (%)', series: [{ campo: 'saturacion' as const, color: [42, 120, 214] as [number, number, number] }], banda: DEF_TOMA.saturacion.normal },
      { titulo: 'Pulso (lpm)', series: [{ campo: 'frecuenciaCardiaca' as const, color: [42, 120, 214] as [number, number, number] }], banda: DEF_TOMA.frecuenciaCardiaca.normal },
      { titulo: 'Glucemia (mg/dL)', series: [{ campo: 'glucemia' as const, color: [42, 120, 214] as [number, number, number] }], banda: DEF_TOMA.glucemia.normal },
    ]
      .map((g) => ({ ...g, series: g.series.map((s) => ({ ...s, puntos: puntos(registros, s.campo) })).filter((s) => s.puntos.length > 1) }))
      .filter((g) => g.series.length > 0)
      .slice(0, 4)
    if (graficos.length) {
      y = tituloSeccion(c, 'Evolución', y)
      const w = (c.ancho - 2 * MARGEN - 8) / 2
      const h = 38
      graficos.forEach((g, i) => {
        const col = i % 2
        if (col === 0 && i > 0) y += h + 6
        if (col === 0 && y + h > c.alto - 20) {
          doc.addPage()
          y = MARGEN + 4
        }
        miniGrafico(c, MARGEN + col * (w + 8), y + 4, w, h, g.titulo, g.series, g.banda)
      })
      y += h + 12
      if (graficos[0].titulo.startsWith('Presión')) {
        doc.setFontSize(8)
        doc.setTextColor(...SUAVE)
        doc.text('Presión: azul = máxima, naranja = mínima. Banda verde = rango normal. Puntos rojos = fuera de lo normal.', MARGEN, y - 4)
        doc.setTextColor(...TINTA)
      }
    }
  }

  // Tabla de tomas
  if (tomas.length) {
    y = tituloSeccion(c, 'Signos vitales', y)
    autoTable(doc, {
      ...estilosTabla,
      startY: y,
      head: [['Fecha', 'Hora', 'Presión', ...CAMPOS_TABLA.map((f) => f.titulo), 'Nota']],
      body: tomas.map(({ r, t }) => [fechaCorta(r.fecha), t.hora ?? '', pa(t), ...CAMPOS_TABLA.map((f) => fmt(t[f.campo])), t.nota ?? '']),
      columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 13 }, 2: { cellWidth: 18 }, 8: { cellWidth: 'auto' } },
      didParseCell: (h) => {
        if (h.section !== 'body') return
        const { t } = tomas[h.row.index]
        const fuera =
          (h.column.index === 2 && (fueraDeNormal('sistolica', t.sistolica) || fueraDeNormal('diastolica', t.diastolica))) ||
          (h.column.index >= 3 && h.column.index < 3 + CAMPOS_TABLA.length && fueraDeNormal(CAMPOS_TABLA[h.column.index - 3].campo, t[CAMPOS_TABLA[h.column.index - 3].campo]))
        if (fuera) {
          h.cell.styles.textColor = ROJO
          h.cell.styles.fontStyle = 'bold'
        }
      },
    })
    y = finalY(doc) + 8
  }

  // Registro diario
  const conTexto = registros.filter((r) => textoDelDia(r))
  if (conTexto.length) {
    y = tituloSeccion(c, 'Registro diario', y)
    autoTable(doc, {
      ...estilosTabla,
      startY: y,
      head: [['Fecha', 'Detalle']],
      body: conTexto.map((r) => [fechaCorta(r.fecha), textoDelDia(r)]),
      columnStyles: { 0: { cellWidth: 22, fontStyle: 'bold' } },
    })
    y = finalY(doc) + 8
  }

  firma(c, y)
  pies(c)
  return doc.output('blob')
}

function firma(c: Contexto, y: number) {
  const { doc, alto, ancho } = c
  if (y > alto - 34) {
    doc.addPage()
    y = MARGEN + 10
  }
  y += 14
  doc.setDrawColor(...SUAVE)
  doc.setLineWidth(0.3)
  doc.line(MARGEN, y, MARGEN + 70, y)
  doc.line(ancho - MARGEN - 70, y, ancho - MARGEN, y)
  doc.setFontSize(9)
  doc.setTextColor(...SUAVE)
  doc.text('Firma y aclaración del responsable', MARGEN, y + 4)
  doc.text('Fecha', ancho - MARGEN - 70, y + 4)
  doc.setTextColor(...TINTA)
}

// ───────────────────────── Informe por día (todos los pacientes) ─────────────────────────

export interface DatosInformeDias {
  pacientes: Paciente[]
  registros: Registro[]
  desde: FechaISO
  hasta: FechaISO
  nombreHogar: string
  /** Incluir la lista de pacientes activos sin registro (útil para el informe de hoy) */
  conPendientes?: boolean
}

export async function crearInformeDias(d: DatosInformeDias): Promise<Blob> {
  const { jsPDF, autoTable } = await cargar()
  const doc = protegerTexto(new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' }))
  const c: Contexto = { doc, autoTable, ancho: doc.internal.pageSize.getWidth(), alto: doc.internal.pageSize.getHeight(), nombreHogar: d.nombreHogar }
  const porId = new Map(d.pacientes.map((p) => [p.id!, p]))
  const fechas = [...new Set(d.registros.map((r) => r.fecha))].sort()
  const titulo = d.desde === d.hasta ? 'Informe del día' : 'Informe de registros'
  const subtitulo = d.desde === d.hasta ? fechaLarga(d.desde) : `del ${fechaCorta(d.desde)} al ${fechaCorta(d.hasta)}`
  let y = encabezado(c, titulo, subtitulo)

  if (d.conPendientes) {
    const alertas = calcularAlertas(d.pacientes, d.registros, new Map(d.registros.map((r) => [r.pacienteId, r.fecha])), {
      hoy: d.hasta,
      diasRevisados: 1,
    }).filter((a) => a.gravedad !== 'aviso')
    const conRegistro = new Set(d.registros.filter((r) => r.fecha === d.hasta).map((r) => r.pacienteId))
    const pendientes = d.pacientes.filter((p) => p.activo && !conRegistro.has(p.id!))
    doc.setFontSize(10.5)
    doc.text(
      `${conRegistro.size} de ${d.pacientes.filter((p) => p.activo).length} pacientes con registro · ${alertas.length} alertas`,
      MARGEN,
      y,
    )
    y += 6
    if (alertas.length) {
      y = tituloSeccion(c, 'Para revisar', y)
      autoTable(doc, {
        ...estilosTabla,
        startY: y,
        head: [['Paciente', 'Alerta', 'Hora', 'Detalle']],
        body: alertas.map((a) => [porId.get(a.pacienteId)?.nombre ?? '', a.titulo, a.hora ?? '', a.detalle ?? '']),
        didParseCell: (h) => {
          if (h.section === 'body' && h.column.index === 1 && alertas[h.row.index].gravedad === 'urgente') {
            h.cell.styles.textColor = ROJO
            h.cell.styles.fontStyle = 'bold'
          }
        },
      })
      y = finalY(doc) + 8
    }
    if (pendientes.length) {
      y = tituloSeccion(c, 'Sin registro en el día', y)
      doc.setFontSize(10)
      const lineas = doc.splitTextToSize(pendientes.map((p) => (p.habitacion ? `${p.nombre} (hab. ${p.habitacion})` : p.nombre)).join(' · '), c.ancho - 2 * MARGEN)
      doc.text(lineas, MARGEN, y + 3)
      y += lineas.length * 4.5 + 8
    }
  }

  if (fechas.length === 0) {
    doc.setFontSize(11)
    doc.text('No hay registros en este período.', MARGEN, y + 4)
  }

  for (const fecha of fechas) {
    const delDia = d.registros
      .filter((r) => r.fecha === fecha)
      .sort((a, b) => (porId.get(a.pacienteId)?.nombre ?? '').localeCompare(porId.get(b.pacienteId)?.nombre ?? '', 'es'))
    y = tituloSeccion(c, fechaLarga(fecha).replace(/^./, (l) => l.toUpperCase()), y)
    autoTable(doc, {
      ...estilosTabla,
      startY: y,
      head: [['Paciente', 'Hab.', 'Signos vitales', 'Registro del día']],
      body: delDia.map((r) => {
        const p = porId.get(r.pacienteId)
        const signos = r.tomas
          .map((t) =>
            [
              t.hora,
              pa(t) && `PA ${pa(t)}`,
              t.frecuenciaCardiaca != null && `FC ${fmt(t.frecuenciaCardiaca)}`,
              t.temperatura != null && `T ${fmt(t.temperatura)}`,
              t.saturacion != null && `Sat ${fmt(t.saturacion)}%`,
              t.frecuenciaRespiratoria != null && `FR ${fmt(t.frecuenciaRespiratoria)}`,
              t.glucemia != null && `Gluc ${fmt(t.glucemia)}`,
              t.nota,
            ]
              .filter(Boolean)
              .join('  '),
          )
          .join('\n')
        return [p?.nombre ?? '', p?.habitacion ?? '', signos, textoDelDia(r)]
      }),
      columnStyles: { 0: { cellWidth: 45, fontStyle: 'bold' }, 1: { cellWidth: 14 }, 2: { cellWidth: 95 } },
      didParseCell: (h) => {
        if (h.section !== 'body' || h.column.index !== 2) return
        const r = delDia[h.row.index]
        const hayFuera = r.tomas.some((t) => (Object.keys(DEF_TOMA) as CampoNumericoToma[]).some((k) => fueraDeNormal(k, t[k])))
        if (hayFuera) h.cell.styles.textColor = ROJO
      },
    })
    y = finalY(doc) + 8
  }

  firma(c, y)
  pies(c)
  return doc.output('blob')
}
