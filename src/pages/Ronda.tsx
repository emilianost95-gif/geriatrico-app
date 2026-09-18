import { useLiveQuery } from 'dexie-react-hooks'
import { Activity, ArrowLeft, Clock, Save, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { mensajeDeError, useAvisos } from '../components/Avisos'
import { useConfirmar } from '../components/Confirmar'
import { CampoNumero } from '../components/EditorToma'
import { Encabezado } from '../components/Layout'
import { Boton, Cargando, EstadoVacio, Insignia } from '../components/ui'
import { db } from '../db/database'
import { listarPacientes } from '../db/pacientes'
import { guardarRegistro, obtenerRegistro } from '../db/registros'
import { CAMPOS_TOMA, type CampoNumericoToma } from '../domain/campos'
import type { TomaSignos } from '../domain/tipos'
import { useBotonAtras } from '../lib/botonAtras'
import { fechaLarga, horaActual, hoyISO } from '../lib/fechas'
import { normalizar } from '../lib/texto'
import { nuevoId, tomaSinDatos } from '../lib/tomas'

type Valores = Partial<Record<CampoNumericoToma, number>>

/** Qué signos se piden en la ronda (glucemia y respiraciones se pueden ocultar) */
const CAMPOS_BASE: CampoNumericoToma[] = ['sistolica', 'diastolica', 'frecuenciaCardiaca', 'temperatura', 'saturacion']
const CAMPOS_EXTRA: CampoNumericoToma[] = ['glucemia', 'frecuenciaRespiratoria']

/**
 * Ronda de signos vitales: cargar una toma para todos los pacientes en una sola pantalla.
 */
export function PaginaRonda() {
  const navegar = useNavigate()
  const avisos = useAvisos()
  const confirmar = useConfirmar()
  const [fecha, setFecha] = useState(hoyISO())
  const [hora, setHora] = useState(horaActual())
  const [valores, setValores] = useState<Record<number, Valores>>({})
  const [notas, setNotas] = useState<Record<number, string>>({})
  const [extras, setExtras] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [guardando, setGuardando] = useState(false)

  const pacientes = useLiveQuery(async () => (await listarPacientes()).filter((p) => p.activo), [])
  const tomasDelDia = useLiveQuery(async () => {
    const m = new Map<number, number>()
    const lista = await db.registros.where('fecha').equals(fecha).toArray()
    for (const r of lista) m.set(r.pacienteId, r.tomas.length)
    return m
  }, [fecha])

  const ordenados = useMemo(
    () =>
      [...(pacientes ?? [])].sort(
        (a, b) => (a.habitacion ?? '~').localeCompare(b.habitacion ?? '~', 'es', { numeric: true }) || a.nombre.localeCompare(b.nombre, 'es'),
      ),
    [pacientes],
  )
  const visibles = ordenados.filter((p) =>
    normalizar(busqueda).split(' ').filter(Boolean).every((w) => `${p.nombreClave} ${normalizar(p.habitacion ?? '')}`.includes(w)),
  )

  const conDatos = Object.entries(valores).filter(
    ([id, v]) => Object.values(v).some((x) => x != null) || notas[Number(id)]?.trim(),
  )
  const cantidad = new Set([
    ...conDatos.map(([id]) => Number(id)),
    ...Object.entries(notas).filter(([, n]) => n.trim()).map(([id]) => Number(id)),
  ]).size
  const hayCambios = cantidad > 0

  useEffect(() => {
    if (!hayCambios) return
    const h = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [hayCambios])

  useBotonAtras(hayCambios, async () => {
    if (await confirmar({ titulo: '¿Salir sin guardar la ronda?', textoConfirmar: 'Salir sin guardar', textoCancelar: 'Seguir', peligro: true })) {
      setValores({})
      setNotas({})
      navegar(-1)
    }
  })

  const set = (id: number, campo: CampoNumericoToma, v?: number) =>
    setValores((prev) => ({ ...prev, [id]: { ...prev[id], [campo]: v } }))

  async function guardar(e: FormEvent) {
    e.preventDefault()
    const ids = [...new Set([...Object.keys(valores), ...Object.keys(notas)].map(Number))]
    const tomas = ids
      .map((id) => ({ id, toma: { id: nuevoId(), hora, ...valores[id], nota: notas[id]?.trim() || undefined } as TomaSignos }))
      .filter(({ toma }) => !tomaSinDatos(toma))
    if (tomas.length === 0) {
      avisos.error('No hay ningún valor cargado.')
      return
    }
    const raros = tomas.flatMap(({ id, toma }) =>
      CAMPOS_TOMA.filter((c) => toma[c.clave] != null && (toma[c.clave]! < c.min || toma[c.clave]! > c.max)).map(
        (c) => `${pacientes?.find((p) => p.id === id)?.nombre}: ${c.etiqueta} ${String(toma[c.clave]).replace('.', ',')} ${c.unidad}`,
      ),
    )
    if (
      raros.length &&
      !(await confirmar({
        titulo: '¿Los valores están bien?',
        mensaje: (
          <>
            Estos valores son muy poco comunes:
            <ul className="mt-2 list-disc pl-6 font-bold text-tinta">{raros.map((r) => <li key={r}>{r}</li>)}</ul>
          </>
        ),
        textoConfirmar: 'Sí, están bien',
        textoCancelar: 'Revisar',
      }))
    ) {
      return
    }
    setGuardando(true)
    try {
      await db.transaction('rw', db.registros, async () => {
        for (const { id, toma } of tomas) {
          const previo = await obtenerRegistro(id, fecha)
          if (previo) {
            await guardarRegistro({ ...previo, tomas: [...previo.tomas, toma] })
          } else {
            await guardarRegistro({ pacienteId: id, fecha, tomas: [toma], alimentacion: { estado: '' } })
          }
        }
      })
      avisos.exito(`Ronda guardada: ${tomas.length} ${tomas.length === 1 ? 'paciente' : 'pacientes'} a las ${hora}.`)
      setValores({})
      setNotas({})
      navegar('/')
    } catch (err) {
      avisos.error(`No se pudo guardar la ronda: ${mensajeDeError(err)}`)
    } finally {
      setGuardando(false)
    }
  }

  if (!pacientes || !tomasDelDia) return <Cargando />
  if (pacientes.length === 0) {
    return <EstadoVacio icono={Activity} titulo="No hay pacientes activos" texto="Agregá pacientes para hacer una ronda de signos." />
  }
  const campos = extras ? [...CAMPOS_BASE, ...CAMPOS_EXTRA] : CAMPOS_BASE

  return (
    <form
      onSubmit={guardar}
      noValidate
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target instanceof HTMLInputElement) e.preventDefault()
      }}
    >
      <Link to="/" className="mb-3 inline-flex min-h-11 items-center gap-2 text-lg font-bold text-salvia-700 hover:underline">
        <ArrowLeft aria-hidden className="size-5" /> Volver
      </Link>
      <Encabezado titulo="Ronda de signos vitales" subtitulo="Cargá una toma para todos los pacientes de una vez. Los que queden vacíos no se tocan." />

      <section className="tarjeta z-20 mb-5 sm:sticky sm:top-[4.5rem] grid grid-cols-1 gap-4 p-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
        <div>
          <label htmlFor="ronda-fecha" className="etiqueta">Día</label>
          <input id="ronda-fecha" type="date" value={fecha} max={hoyISO()} onChange={(e) => e.target.value && setFecha(e.target.value)} className="control text-lg font-bold" />
          <p className="mt-1 text-sm text-suave first-letter:uppercase">{fechaLarga(fecha)}</p>
        </div>
        <div>
          <label htmlFor="ronda-hora" className="etiqueta">Hora</label>
          <div className="flex gap-2">
            <input id="ronda-hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="control w-40 text-lg font-bold" />
            <button type="button" onClick={() => setHora(horaActual())} className="flex min-h-14 items-center gap-1 rounded-xl px-3 font-bold text-salvia-700 hover:bg-salvia-100">
              <Clock aria-hidden className="size-5" /> Ahora
            </button>
          </div>
          <p className="mt-1 text-sm text-suave">&nbsp;</p>
        </div>
        <div className="flex flex-col gap-2">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-base">
            <input type="checkbox" checked={extras} onChange={(e) => setExtras(e.target.checked)} className="size-6 accent-salvia-600" />
            Incluir glucemia y respiraciones
          </label>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-suave" />
            <input type="search" aria-label="Buscar paciente" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar paciente…" className="control min-h-12 pl-10" />
          </div>
        </div>
      </section>

      <ul className="space-y-3">
        {visibles.map((p) => {
          const v = valores[p.id!] ?? {}
          const cargados = Object.values(v).some((x) => x != null)
          const previas = tomasDelDia.get(p.id!) ?? 0
          return (
            <li key={p.id} className={`tarjeta p-4 ${cargados ? 'border-salvia-400 ring-2 ring-salvia-200' : ''}`}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xl font-bold">
                  {p.nombre}
                  {p.habitacion && <span className="ml-2 text-base font-normal text-suave">Hab. {p.habitacion}</span>}
                </p>
                <div className="flex items-center gap-2">
                  {previas > 0 && <Insignia tono="marca">{previas} {previas === 1 ? 'toma' : 'tomas'} este día</Insignia>}
                  {cargados && (
                    <button
                      type="button"
                      onClick={() => setValores((prev) => ({ ...prev, [p.id!]: {} }))}
                      className="flex min-h-10 items-center gap-1 rounded-lg px-2 text-base font-bold text-coral hover:bg-coral-claro"
                    >
                      <X aria-hidden className="size-4" /> Borrar
                    </button>
                  )}
                </div>
              </div>
              <div className={`grid grid-cols-2 items-end gap-3 sm:grid-cols-3 ${extras ? 'lg:grid-cols-7' : 'lg:grid-cols-5'}`}>
                {campos.map((c) => (
                  <CampoNumero key={c} campo={c} valor={v[c]} contexto={p.nombre} onCambio={(x) => set(p.id!, c, x)} />
                ))}
              </div>
              <details className="mt-2">
                <summary className="min-h-10 cursor-pointer content-center text-base font-bold text-salvia-700">Agregar nota</summary>
                <input
                  aria-label={`Nota para ${p.nombre}`}
                  value={notas[p.id!] ?? ''}
                  onChange={(e) => setNotas((n) => ({ ...n, [p.id!]: e.target.value }))}
                  placeholder="Ej.: dormido, no se tomó la presión…"
                  className="control mt-1"
                />
              </details>
            </li>
          )
        })}
      </ul>

      <div className="no-imprimir fixed inset-x-0 bottom-0 z-30 border-t border-arena bg-papel/95 backdrop-blur" style={{ paddingBottom: 'var(--safe-area-inset-bottom, env(safe-area-inset-bottom))' }}>
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <p className="flex-1 text-lg max-sm:hidden" aria-live="polite">
            {cantidad === 0 ? <span className="text-suave">Cargá los valores de cada paciente.</span> : <><strong>{cantidad}</strong> {cantidad === 1 ? 'paciente' : 'pacientes'} con datos · {hora}</>}
          </p>
          <Boton type="submit" icono={Save} grande disabled={guardando || cantidad === 0} className="flex-1 sm:flex-none sm:px-10">
            {guardando ? 'Guardando…' : `Guardar ronda${cantidad ? ` (${cantidad})` : ''}`}
          </Boton>
        </div>
      </div>
    </form>
  )
}
