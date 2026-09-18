import { AlertTriangle } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { DEF_TOMA, fueraDeNormal, type CampoNumericoToma } from '../domain/campos'
import type { Registro } from '../domain/tipos'
import { isoADate } from '../lib/fechas'
import { colorDelTema, useTema } from '../lib/tema'

/*
 * Gráficos de evolución en SVG propio (sin librerías).
 * Reglas: un eje por gráfico, líneas de 2 px, puntos ≥ 8 px con anillo del color de fondo,
 * banda suave con el rango normal, tooltip con cruz vertical y leyenda solo si hay 2+ series.
 * Colores validados (CVD y contraste) sobre el fondo de las tarjetas #fffdf8.
 */
/** Nombre de la variable CSS de cada color (src/index.css define una por tema) */
const VARIABLE = {
  serie1: 'grafico-1',
  serie2: 'grafico-2',
  critico: 'grafico-critico',
  normal: 'grafico-normal',
  fondo: 'papel',
  grilla: 'grafico-grilla',
  base: 'grafico-base',
  tinta: 'tinta',
  tintaSuave: 'suave',
} as const

const RESPALDO = {
  serie1: '#2a78d6',
  serie2: '#eb6834',
  critico: '#d03b3b',
  normal: '#0ca30c',
  fondo: '#fffdf8',
  grilla: '#e1e0d9',
  base: '#c3c2b7',
  tinta: '#2b2b28',
  tintaSuave: '#5c584f',
}

/** C.serie1, C.fondo… leen el color del tema activo en el momento de dibujar. */
const C = new Proxy(RESPALDO, {
  get: (respaldo, clave: string) => colorDelTema(VARIABLE[clave as keyof typeof VARIABLE], respaldo[clave as keyof typeof RESPALDO]),
}) as typeof RESPALDO

export interface Punto {
  t: number
  valor: number
  fecha: string
  hora?: string
}

interface Serie {
  nombre: string
  color: string
  campo: CampoNumericoToma
  puntos: Punto[]
}

const ALTO = 200
const M = { arriba: 14, derecha: 44, abajo: 30, izquierda: 44 }

const fmt = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',')

function ticksLindos(min: number, max: number, cantidad = 4): number[] {
  const rango = max - min || 1
  const paso0 = rango / cantidad
  const potencia = 10 ** Math.floor(Math.log10(paso0))
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= paso0) ?? paso0
  // El eje arranca y termina en un valor "redondo" para que todo dato quede entre dos líneas
  const inicio = Math.floor(min / paso) * paso
  const res: number[] = []
  for (let v = inicio; v < max + paso - 1e-9; v += paso) res.push(Math.round(v * 100) / 100)
  return res
}

function useAncho<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [ancho, setAncho] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setAncho(Math.floor(e.contentRect.width)))
    ro.observe(el)
    setAncho(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  return [ref, ancho] as const
}

function GraficoLineas({ titulo, series, unidad, banda, tope }: {
  titulo: string
  /** Valor que la medida nunca supera (ej.: saturación 100 %) */
  tope?: number
  series: Serie[]
  unidad: string
  banda?: [number, number]
}) {
  const [cont, ancho] = useAncho<HTMLDivElement>()
  useTema() // vuelve a dibujar cuando cambia el tema
  const idTitulo = useId()
  const [activo, setActivo] = useState<number | null>(null)

  const tiempos = useMemo(() => [...new Set(series.flatMap((s) => s.puntos.map((p) => p.t)))].sort((a, b) => a - b), [series])
  const valores = series.flatMap((s) => s.puntos.map((p) => p.valor))
  if (ancho === 0 || tiempos.length === 0) return <div ref={cont} className="h-[200px]" />

  const W = ancho
  const iw = W - M.izquierda - M.derecha
  const ih = ALTO - M.arriba - M.abajo
  let tMin = tiempos[0]
  let tMax = tiempos[tiempos.length - 1]
  if (tMin === tMax) {
    tMin -= 12 * 3600e3
    tMax += 12 * 3600e3
  }
  let vMin = Math.min(...valores, ...(banda ? [banda[0]] : []))
  let vMax = Math.max(...valores, ...(banda ? [banda[1]] : []))
  const pad = (vMax - vMin || Math.abs(vMax) * 0.1 || 1) * 0.12
  vMin -= pad
  vMax += pad
  let ticksY = ticksLindos(vMin, vMax)
  if (tope != null && ticksY[ticksY.length - 1] > tope) {
    ticksY = [...ticksY.filter((v) => v < tope), tope]
  }
  vMin = ticksY[0]
  vMax = ticksY[ticksY.length - 1]
  const x = (t: number) => M.izquierda + ((t - tMin) / (tMax - tMin)) * iw
  const y = (v: number) => M.arriba + (1 - (v - vMin) / (vMax - vMin)) * ih

  // Etiquetas de fecha en el eje X (una por día, las que entren)
  const dias = [...new Set(tiempos.map((t) => new Date(t).toDateString()))].map((d) => {
    const f = new Date(d)
    return { t: f.getTime() + 12 * 3600e3, texto: `${String(f.getDate()).padStart(2, '0')}/${String(f.getMonth() + 1).padStart(2, '0')}` }
  })
  const maxEtiquetas = Math.max(2, Math.floor(iw / 56))
  const salto = Math.ceil(dias.length / maxEtiquetas)
  const ticksX = dias.filter((_, i) => i % salto === 0)

  const tActivo = activo != null ? tiempos[activo] : null
  const mover = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - r.left
    let mejor = 0
    tiempos.forEach((t, i) => {
      if (Math.abs(x(t) - px) < Math.abs(x(tiempos[mejor]) - px)) mejor = i
    })
    setActivo(mejor)
  }
  const teclado = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const d = e.key === 'ArrowRight' ? 1 : -1
      setActivo((a) => Math.min(tiempos.length - 1, Math.max(0, (a ?? (d > 0 ? -1 : tiempos.length)) + d)))
    }
    if (e.key === 'Escape') setActivo(null)
  }

  const ultimo = series.map((s) => s.puntos[s.puntos.length - 1]).filter(Boolean)
  const resumen = `${titulo}: ${tiempos.length} mediciones. Último valor ${ultimo.map((p, i) => `${series[i].nombre} ${fmt(p.valor)}`).join(', ')} ${unidad}.`

  return (
    <div ref={cont} className="relative">
      <svg
        width={W}
        height={ALTO}
        role="img"
        aria-labelledby={idTitulo}
        tabIndex={0}
        className="touch-pan-y rounded-lg outline-offset-2"
        onPointerMove={mover}
        onPointerDown={mover}
        onPointerLeave={() => setActivo(null)}
        onKeyDown={teclado}
        onBlur={() => setActivo(null)}
      >
        <title id={idTitulo}>{resumen}</title>
        {banda && (
          <rect x={M.izquierda} width={iw} y={y(banda[1])} height={Math.max(0, y(banda[0]) - y(banda[1]))} fill={C.normal} opacity={0.08} />
        )}
        {ticksY.map((v) => (
          <g key={v}>
            <line x1={M.izquierda} x2={W - M.derecha} y1={y(v)} y2={y(v)} stroke={C.grilla} strokeWidth={1} />
            <text x={M.izquierda - 8} y={y(v)} dy="0.32em" textAnchor="end" fontSize={13} fill={C.tintaSuave} className="tabular-nums">
              {fmt(v)}
            </text>
          </g>
        ))}
        <line x1={M.izquierda} x2={W - M.derecha} y1={ALTO - M.abajo} y2={ALTO - M.abajo} stroke={C.base} strokeWidth={1} />
        {ticksX.map((d) => (
          <text key={d.t} x={Math.min(W - M.derecha, Math.max(M.izquierda, x(d.t)))} y={ALTO - 8} textAnchor="middle" fontSize={13} fill={C.tintaSuave}>
            {d.texto}
          </text>
        ))}

        {tActivo != null && <line x1={x(tActivo)} x2={x(tActivo)} y1={M.arriba} y2={ALTO - M.abajo} stroke={C.base} strokeWidth={1} />}

        {series.map((s) => (
          <g key={s.nombre}>
            <polyline
              points={s.puntos.map((p) => `${x(p.t)},${y(p.valor)}`).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {s.puntos.map((p) => {
              const fuera = fueraDeNormal(s.campo, p.valor)
              const grande = p.t === tActivo
              return (
                <circle
                  key={p.t}
                  cx={x(p.t)}
                  cy={y(p.valor)}
                  r={grande ? 6 : fuera ? 5 : 4}
                  fill={fuera ? C.critico : s.color}
                  stroke={C.fondo}
                  strokeWidth={2}
                />
              )
            })}
            {/* Valor al final de la línea */}
            {s.puntos.length > 0 && (
              <text
                x={x(s.puntos[s.puntos.length - 1].t) + 8}
                y={y(s.puntos[s.puntos.length - 1].valor)}
                dy="0.32em"
                fontSize={13}
                fontWeight={700}
                fill={C.tinta}
              >
                {fmt(s.puntos[s.puntos.length - 1].valor)}
              </text>
            )}
          </g>
        ))}
      </svg>

      {tActivo != null && (
        <Tooltip
          x={x(tActivo)}
          ancho={W}
          series={series}
          t={tActivo}
          unidad={unidad}
        />
      )}
    </div>
  )
}

function Tooltip({ x, ancho, series, t, unidad }: { x: number; ancho: number; series: Serie[]; t: number; unidad: string }) {
  const filas = series
    .map((s) => ({ s, p: s.puntos.find((p) => p.t === t) }))
    .filter((f): f is { s: Serie; p: Punto } => !!f.p)
  if (filas.length === 0) return null
  const p0 = filas[0].p
  const izquierda = Math.min(Math.max(x - 90, 0), ancho - 180)
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 w-[180px] rounded-xl border border-arena bg-blanco p-2.5 text-base shadow-lg"
      style={{ left: izquierda }}
      role="status"
    >
      <p className="text-sm text-suave">
        {p0.fecha.split('-').reverse().join('/')}
        {p0.hora ? ` · ${p0.hora}` : ''}
      </p>
      {filas.map(({ s, p }) => {
        const fuera = fueraDeNormal(s.campo, p.valor)
        return (
          <p key={s.nombre} className="flex items-center gap-2">
            <span aria-hidden className="inline-block h-0.5 w-3 rounded" style={{ background: s.color }} />
            <strong className="tabular-nums">
              {fmt(p.valor)} {unidad}
            </strong>
            {series.length > 1 && <span className="text-sm text-suave">{s.nombre}</span>}
            {fuera && <AlertTriangle aria-label="Fuera de lo normal" className="size-4 text-coral" />}
          </p>
        )
      })}
      {filas.some(({ s, p }) => fueraDeNormal(s.campo, p.valor)) && <p className="text-sm font-bold text-coral">Fuera de lo normal</p>}
    </div>
  )
}

function puntosDe(registros: Registro[], campo: CampoNumericoToma): Punto[] {
  const puntos: Punto[] = []
  for (const r of registros) {
    for (const tm of r.tomas) {
      const v = tm[campo]
      if (v == null) continue
      const [h, m] = (tm.hora ?? '12:00').split(':').map(Number)
      const d = isoADate(r.fecha)
      d.setHours(h, m)
      puntos.push({ t: d.getTime(), valor: v, fecha: r.fecha, hora: tm.hora })
    }
  }
  // Si hay dos tomas a la misma hora, se separan un minuto para que no se pisen
  puntos.sort((a, b) => a.t - b.t)
  for (let i = 1; i < puntos.length; i++) if (puntos[i].t <= puntos[i - 1].t) puntos[i].t = puntos[i - 1].t + 60e3
  return puntos
}

interface DefGrafico {
  titulo: string
  campos: { campo: CampoNumericoToma; nombre: string; color: string }[]
  banda?: [number, number]
}

const GRAFICOS: DefGrafico[] = [
  {
    titulo: 'Presión arterial',
    campos: [
      { campo: 'sistolica', nombre: 'Máxima', color: C.serie1 },
      { campo: 'diastolica', nombre: 'Mínima', color: C.serie2 },
    ],
  },
  { titulo: 'Pulso', campos: [{ campo: 'frecuenciaCardiaca', nombre: 'Pulso', color: C.serie1 }], banda: DEF_TOMA.frecuenciaCardiaca.normal },
  { titulo: 'Temperatura', campos: [{ campo: 'temperatura', nombre: 'Temperatura', color: C.serie1 }], banda: DEF_TOMA.temperatura.normal },
  { titulo: 'Saturación de oxígeno', campos: [{ campo: 'saturacion', nombre: 'Saturación', color: C.serie1 }], banda: DEF_TOMA.saturacion.normal },
  { titulo: 'Glucemia', campos: [{ campo: 'glucemia', nombre: 'Glucemia', color: C.serie1 }], banda: DEF_TOMA.glucemia.normal },
  { titulo: 'Respiraciones', campos: [{ campo: 'frecuenciaRespiratoria', nombre: 'Respiraciones', color: C.serie1 }], banda: DEF_TOMA.frecuenciaRespiratoria.normal },
]

/** Todos los gráficos de un paciente para los registros del período elegido. */
export function GraficosEvolucion({ registros }: { registros: Registro[] }) {
  const graficos = useMemo(
    () =>
      GRAFICOS.map((g) => ({
        ...g,
        series: g.campos.map((c) => ({ ...c, puntos: puntosDe(registros, c.campo) })).filter((s) => s.puntos.length > 0),
      })),
    [registros],
  )
  const conDatos = graficos.filter((g) => g.series.length > 0)
  const sinDatos = graficos.filter((g) => g.series.length === 0)

  if (conDatos.length === 0) {
    return <p className="tarjeta p-5 text-lg text-suave">No hay signos vitales cargados en este período.</p>
  }
  return (
    <div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {conDatos.map((g) => {
          const unidad = DEF_TOMA[g.campos[0].campo].unidad
          return (
            <figure key={g.titulo} className="tarjeta min-w-0 p-4">
              <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xl font-bold text-salvia-900">
                  {g.titulo} <span className="text-base font-normal text-suave">({unidad})</span>
                </span>
                <span className="flex flex-wrap items-center gap-3 text-sm text-suave">
                  {g.series.length > 1 &&
                    g.series.map((s) => (
                      <span key={s.nombre} className="flex items-center gap-1.5">
                        <span aria-hidden className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} />
                        {s.nombre}
                      </span>
                    ))}
                  {g.banda && (
                    <span className="flex items-center gap-1.5">
                      <span aria-hidden className="inline-block size-3 rounded-sm" style={{ background: C.normal, opacity: 0.25 }} />
                      Normal {fmt(g.banda[0])}–{fmt(g.banda[1])}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden className="inline-block size-2.5 rounded-full" style={{ background: C.critico }} />
                    Fuera de lo normal
                  </span>
                </span>
              </figcaption>
              <GraficoLineas titulo={g.titulo} series={g.series} unidad={unidad} banda={g.banda} tope={unidad === '%' ? 100 : undefined} />
            </figure>
          )
        })}
      </div>
      {sinDatos.length > 0 && (
        <p className="mt-3 text-base text-suave">Sin datos en este período: {sinDatos.map((g) => g.titulo.toLowerCase()).join(', ')}.</p>
      )}
      <p className="mt-2 text-sm text-suave">Tocá o pasá el dedo sobre un gráfico para ver cada medición. Los valores exactos están en la vista “Tabla”.</p>
    </div>
  )
}
