import { DEF_TOMA } from '../../domain/campos'
import type { EstadoAlimentacion, FechaISO, TomaSignos } from '../../domain/tipos'
import { aISO, esFechaValida } from '../../lib/fechas'
import { normalizar, vacio } from '../../lib/texto'
import { nuevoId } from '../../lib/tomas'

/** Valor de una celda ya "aplanado" (sin fórmulas ni texto enriquecido). */
export type Celda = string | number | boolean | Date | null

/** Resultado de interpretar un valor: el valor y, si hubo, un aviso para la persona. */
export interface Parseo<T> {
  valor?: T
  aviso?: string
  error?: string
}

export function celdaATexto(c: Celda): string {
  if (c == null) return ''
  if (c instanceof Date) return aISO(new Date(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate()))
  if (typeof c === 'boolean') return c ? 'Sí' : 'No'
  return String(c).trim()
}

// ─────────────────────────── Fechas ───────────────────────────

const MESES: Record<string, number> = {
  ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abr: 4, abril: 4, may: 5, mayo: 5,
  jun: 6, junio: 6, jul: 7, julio: 7, ago: 8, agosto: 8, sep: 9, sept: 9, set: 9, septiembre: 9,
  setiembre: 9, oct: 10, octubre: 10, nov: 11, noviembre: 11, dic: 12, diciembre: 12,
  jan: 1, apr: 4, aug: 8, dec: 12,
}

function anioCompleto(y: number): number {
  if (y >= 100) return y
  return y + (y > 60 ? 1900 : 2000)
}

/** Número de serie de Excel (días desde 1899-12-30) → fecha */
function serialAFecha(n: number): FechaISO {
  const base = Date.UTC(1899, 11, 30)
  const d = new Date(base + Math.floor(n) * 86400000)
  return aISO(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/**
 * Interpreta fechas escritas de muchas formas. Se asume día/mes/año (Chile/Argentina).
 * @param anioPorDefecto para fechas sin año ("16/09")
 */
export function parsearFecha(c: Celda, anioPorDefecto = new Date().getFullYear()): Parseo<FechaISO> {
  if (c == null || c === '') return {}
  if (c instanceof Date) {
    if (isNaN(c.getTime())) return { error: 'Fecha inválida' }
    // ExcelJS entrega las fechas en UTC con los números "tal cual" se ven en la planilla
    return { valor: aISO(new Date(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate())) }
  }
  if (typeof c === 'number') {
    if (c > 20000 && c < 80000) return { valor: serialAFecha(c) }
    return { error: `"${c}" no parece una fecha` }
  }
  const texto = String(c).trim()
  if (!texto) return {}

  // 2026-09-16 · 2026/09/16 · 2026-09-16T10:00
  let m = texto.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) {
    const [y, mo, d] = [+m[1], +m[2], +m[3]]
    if (esFechaValida(y, mo, d)) return { valor: aISO(new Date(y, mo - 1, d)) }
    return { error: `"${texto}" no es una fecha válida` }
  }

  // 16/09/2026 · 16-09-26 · 16.09.2026 · 16/09
  m = texto.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?(?!\d)/)
  if (m) {
    const a = +m[1]
    const b = +m[2]
    const y = m[3] ? anioCompleto(+m[3]) : anioPorDefecto
    let d = a
    let mo = b
    let aviso: string | undefined
    if (b > 12 && a <= 12) {
      // Formato estadounidense (mes/día)
      d = b
      mo = a
      aviso = `"${texto}" se leyó como mes/día (${d}/${mo})`
    }
    if (!m[3]) aviso = `"${texto}" no tiene año: se usó ${y}`
    if (esFechaValida(y, mo, d)) return { valor: aISO(new Date(y, mo - 1, d)), aviso }
    return { error: `"${texto}" no es una fecha válida` }
  }

  // "16 de septiembre de 2026", "lunes 16 sep 2026", "16-sep-26"
  const n = normalizar(texto)
  m = n.match(/(\d{1,2}) (?:de )?([a-z]+)(?: (?:de |del )?(\d{2,4}))?/)
  if (m && MESES[m[2]]) {
    const d = +m[1]
    const mo = MESES[m[2]]
    const y = m[3] ? anioCompleto(+m[3]) : anioPorDefecto
    if (esFechaValida(y, mo, d)) {
      return { valor: aISO(new Date(y, mo - 1, d)), aviso: m[3] ? undefined : `"${texto}" no tiene año: se usó ${y}` }
    }
  }
  // Serial de Excel escrito como texto
  if (/^\d{5}(\.\d+)?$/.test(texto)) return parsearFecha(Number(texto), anioPorDefecto)
  return { error: `No se entiende la fecha "${texto}"` }
}

/** Busca una fecha dentro de un texto libre: "Registro del 16/09/2026" */
export function buscarFechaEnTexto(texto: string): FechaISO | undefined {
  const m = String(texto).match(/\b(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{4}-\d{2}-\d{2})\b/)
  if (!m) return undefined
  return parsearFecha(m[1]).valor
}

// ─────────────────────────── Horas ───────────────────────────

const pad = (n: number) => String(n).padStart(2, '0')

export function parsearHora(c: Celda): Parseo<string> {
  if (c == null || c === '') return {}
  if (c instanceof Date) return { valor: `${pad(c.getUTCHours())}:${pad(c.getUTCMinutes())}` }
  if (typeof c === 'number') {
    if (c >= 0 && c < 1) {
      const minutos = Math.round(c * 24 * 60)
      return { valor: `${pad(Math.floor(minutos / 60) % 24)}:${pad(minutos % 60)}` }
    }
    if (Number.isInteger(c) && c >= 0 && c <= 24) return { valor: `${pad(c % 24)}:00` }
    return { error: `"${c}" no parece una hora` }
  }
  const t = String(c).trim().toLowerCase()
  if (!t) return {}
  const m = t.match(/^(\d{1,2})(?:\s*[:.h]\s*(\d{2}))?\s*(hs?|hrs?|horas?|am|a\.m\.|pm|p\.m\.)?\.?$/)
  if (!m) {
    const turno = normalizar(t)
    if (['manana', 'tarde', 'noche', 'madrugada'].includes(turno)) {
      return { valor: { manana: '08:00', tarde: '16:00', noche: '22:00', madrugada: '04:00' }[turno], aviso: `"${c}" se registró como hora aproximada` }
    }
    return { error: `No se entiende la hora "${c}"` }
  }
  let h = +m[1]
  const min = m[2] ? +m[2] : 0
  if (m[3]?.startsWith('p') && h < 12) h += 12
  if (m[3]?.startsWith('a') && h === 12) h = 0
  if (h > 24 || min > 59) return { error: `"${c}" no es una hora válida` }
  return { valor: `${pad(h % 24)}:${pad(min)}` }
}

// ─────────────────────────── Números ───────────────────────────

export function parsearNumero(c: Celda): Parseo<number> {
  if (c == null || c === '') return {}
  if (typeof c === 'number') return Number.isFinite(c) ? { valor: c } : { error: 'Número inválido' }
  if (c instanceof Date || typeof c === 'boolean') return { error: `"${celdaATexto(c)}" no es un número` }
  const t = String(c).trim()
  const m = t.match(/-?\d+(?:[.,]\d+)?/)
  if (!m) return { error: `"${t}" no es un número` }
  const valor = Number(m[0].replace(',', '.'))
  // Si hay más texto además del número, se avisa (ej. "36,5 axilar")
  const resto = normalizar(t.replace(m[0], '')).replace(/\b(mmhg|lpm|ppm|rpm|mg|dl|c|grados|x|min)\b/g, '').trim()
  return { valor, aviso: resto ? `"${t}": se tomó solo el número ${valor}` : undefined }
}

type CampoNumerico = keyof typeof DEF_TOMA

/**
 * Número de signo vital con corrección de errores típicos y validación de rango.
 * Ej: temperatura "365" → 36,5 · saturación 0,96 → 96.
 */
export function parsearSigno(campo: CampoNumerico, c: Celda): Parseo<number> {
  const p = parsearNumero(c)
  if (p.valor == null) return p
  const def = DEF_TOMA[campo]
  let v = p.valor
  let aviso = p.aviso
  if (campo === 'temperatura' && v >= 300 && v <= 450) {
    v = v / 10
    aviso = `Temperatura "${c}" se corrigió a ${v}`
  }
  if (campo === 'saturacion' && v > 0 && v <= 1) {
    v = Math.round(v * 100)
  }
  if (!def.decimales) v = Math.round(v)
  else v = Math.round(v * 10) / 10
  if (v < def.min || v > def.max) {
    return { valor: v, aviso: `${def.etiqueta} ${v} ${def.unidad} está fuera de lo esperable (${def.min}–${def.max}). Revisalo.` }
  }
  return { valor: v, aviso }
}

/** "120/80", "120-80", "12/8" (cmHg) → { sistolica, diastolica } */
export function parsearPresion(c: Celda): Parseo<{ sistolica?: number; diastolica?: number }> {
  if (c == null || c === '') return {}
  if (typeof c === 'number') {
    const s = parsearSigno('sistolica', c)
    return { valor: { sistolica: s.valor }, aviso: `Presión "${c}" tiene un solo valor: se guardó como máxima` }
  }
  const t = celdaATexto(c)
  const m = t.match(/(\d{1,3}(?:[.,]\d)?)\s*[/\\\-|]\s*(\d{1,3}(?:[.,]\d)?)/)
  if (!m) {
    const s = parsearNumero(t)
    if (s.valor != null) {
      return { valor: { sistolica: Math.round(s.valor) }, aviso: `Presión "${t}" tiene un solo valor: se guardó como máxima` }
    }
    return { error: `No se entiende la presión "${t}" (usá el formato 120/80)` }
  }
  let sis = Number(m[1].replace(',', '.'))
  let dia = Number(m[2].replace(',', '.'))
  let aviso: string | undefined
  if (sis < 30 && dia < 20) {
    // Notación en cmHg: 12/8 → 120/80
    sis *= 10
    dia *= 10
    aviso = `Presión "${t}" se interpretó como ${Math.round(sis)}/${Math.round(dia)} mmHg`
  }
  const ps = parsearSigno('sistolica', Math.round(sis))
  const pd = parsearSigno('diastolica', Math.round(dia))
  return { valor: { sistolica: ps.valor, diastolica: pd.valor }, aviso: aviso ?? ps.aviso ?? pd.aviso }
}

// ─────────────────────────── Alimentación ───────────────────────────

export function parsearAlimentacion(c: Celda): Parseo<{ estado: EstadoAlimentacion; comentario?: string }> {
  if (vacio(c)) return {}
  const original = celdaATexto(c)
  const crudo = original.trim()
  if (crudo === '+') return { valor: { estado: 'positiva' } }
  if (crudo === '-' || crudo === '−') return { valor: { estado: 'negativa' } }
  if (typeof c === 'boolean') return { valor: { estado: c ? 'positiva' : 'negativa' } }

  const n = normalizar(crudo)
  // Quita la palabra de estado del principio para dejar solo el comentario
  const comentarioDe = (patron: RegExp) => {
    let resto = crudo.replace(patron, '').replace(/^[\s,.;:(\-–—/]+/, '').trim()
    if (resto.endsWith(')') && !resto.includes('(')) resto = resto.slice(0, -1).trim()
    return resto || undefined
  }
  const PATRON_NEG = /^\s*(\(?-\)?|negativ[oa]s?|neg\.?|no\b)/i
  const PATRON_POS = /^\s*(\(?\+\)?|positiv[oa]s?|pos\.?|s[ií](?!\p{L}))/iu

  if (PATRON_NEG.test(crudo) || /\b(rechaz\w*|nada|no comio|no come|no acepta|no quiso)\b/.test(n)) {
    return { valor: { estado: 'negativa', comentario: PATRON_NEG.test(crudo) ? comentarioDe(PATRON_NEG) : crudo } }
  }
  if (PATRON_POS.test(crudo)) return { valor: { estado: 'positiva', comentario: comentarioDe(PATRON_POS) } }
  if (/\b(bien|buena|bueno|completa|completo|comio|come|acepta|todo|ok|normal)\b/.test(n)) {
    return { valor: { estado: 'positiva', comentario: crudo } }
  }
  return {
    valor: { estado: '', comentario: crudo },
    aviso: `Alimentación "${crudo}": no se pudo saber si fue positiva o negativa, se guardó como comentario`,
  }
}

// ─────────────────────── Signos vitales en texto libre ───────────────────────

const RX = {
  hora: /^\s*([01]?\d|2[0-3])\s*[:.h]\s*([0-5]\d)\s*(?:hs?|hrs?)?\s*$/i,
  horaInicio: /^\s*([01]?\d|2[0-3])\s*(?:[:.]\s*([0-5]\d)|hs\b|h\b)\s*(?:hs?\b|hrs?\b)?\s*[-–:]?\s*/i,
  pa: /(?:\bp\.?\s?a\.?|\bt\.?\s?a\.?|presi[oó]n(?:\s+arterial)?|tensi[oó]n(?:\s+arterial)?)\s*[:=]?\s*(\d{1,3}(?:[.,]\d)?)\s*[/\\\-]\s*(\d{1,3}(?:[.,]\d)?)/i,
  paSuelta: /(?<![\d.,/])(\d{2,3})\s*\/\s*(\d{1,3})(?![\d.,/])/,
  fc: /(?:\bf\.?\s?c\.?|pulso|\bppm\b)\s*[:=]?\s*(\d{2,3})|(\d{2,3})\s*(?:lpm|ppm|x['´’]?)(?![a-z])/i,
  temp: /(?:\bt(?:emp(?:eratura)?)?\s*°?\.?\s*(?:ax(?:ilar)?)?\s*[:=]?\s*)(\d{2}(?:[.,]\d{1,2})?)(?!\d)|(\d{2}[.,]\d)\s*°\s*c?/i,
  sat: /(?:\bsat(?:uraci[oó]n)?\.?\s*(?:o2|o₂|02)?|\bspo2|\bsp\s?o2)\s*[:=]?\s*(\d{2,3})\s*%?|(\d{2,3})\s*%/i,
  fr: /(?:\bf\.?\s?r\.?|resp(?:iraciones)?)\s*[:=]?\s*(\d{1,2})(?!\d)|(\d{1,2})\s*rpm\b/i,
  gluc: /(?:gluc(?:emia|osa)?|glic(?:emia)?|\bhgt|dextro)\s*[:=]?\s*(\d{2,3})/i,
}

function primerGrupo(m: RegExpMatchArray | null): string | undefined {
  if (!m) return undefined
  return m.slice(1).find((g) => g != null)
}

export interface ResultadoSignosTexto {
  tomas: TomaSignos[]
  avisos: string[]
}

/**
 * Interpreta signos vitales escritos a mano:
 *   "08:00 · PA 120/80 · FC 72 · T° 36,5 · SatO2 96%"
 *   "PA 130/85 FC 80 T 36.8 Sat 95"
 *   "8hs 120/80 72x' 36,5° 96%"
 * Cada renglón es una toma.
 */
export function parsearSignosTexto(c: Celda): ResultadoSignosTexto {
  const avisos: string[] = []
  const tomas: TomaSignos[] = []
  const texto = celdaATexto(c)
  if (!texto) return { tomas, avisos }

  for (const linea of texto.split(/\r?\n|\s*\/\/\s*/)) {
    if (!linea.trim()) continue
    const toma: TomaSignos = { id: nuevoId() }
    const notas: string[] = []
    let hayDatos = false
    let resto = linea

    const mh = resto.match(RX.horaInicio)
    if (mh && !/^\s*\d{2,3}\s*\//.test(resto)) {
      toma.hora = `${mh[1].padStart(2, '0')}:${mh[2] ?? '00'}`
      resto = resto.slice(mh[0].length)
    }

    for (const segmento of resto.split(/\s*[·|•]\s*/)) {
      if (!segmento.trim()) continue
      if (RX.hora.test(segmento) && !toma.hora) {
        const p = parsearHora(segmento.trim())
        toma.hora = p.valor
        continue
      }
      let s = segmento
      let encontrado = false
      const usar = (m: RegExpMatchArray | null) => {
        if (m) {
          s = s.replace(m[0], ' ')
          encontrado = true
        }
        return m
      }
      const pa = usar(s.match(RX.pa)) ?? usar(s.match(RX.paSuelta))
      if (pa) {
        const p = parsearPresion(`${pa[1]}/${pa[2]}`)
        Object.assign(toma, p.valor)
        if (p.aviso) avisos.push(p.aviso)
      }
      const campos: [keyof typeof RX, keyof typeof DEF_TOMA][] = [
        ['gluc', 'glucemia'],
        ['sat', 'saturacion'],
        ['fc', 'frecuenciaCardiaca'],
        ['fr', 'frecuenciaRespiratoria'],
        ['temp', 'temperatura'],
      ]
      for (const [rx, campo] of campos) {
        const m = usar(s.match(RX[rx]))
        const g = primerGrupo(m)
        if (g != null) {
          const p = parsearSigno(campo, g)
          toma[campo] = p.valor
          if (p.aviso) avisos.push(p.aviso)
        }
      }
      if (encontrado) hayDatos = true
      else notas.push(segmento.trim())
    }
    if (notas.length) toma.nota = notas.join(' · ')
    if (hayDatos || toma.nota) tomas.push(toma)
  }
  return { tomas, avisos }
}
