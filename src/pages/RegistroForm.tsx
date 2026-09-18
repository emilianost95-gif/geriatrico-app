import { useLiveQuery } from 'dexie-react-hooks'
import {
  Activity,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  Droplets,
  FlaskConical,
  HandHeart,
  Info,
  MessageSquareText,
  Moon,
  Plus,
  Save,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Utensils,
  UserPlus,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { mensajeDeError, useAvisos } from '../components/Avisos'
import { CampoRapido } from '../components/CampoRapido'
import { useConfirmar } from '../components/Confirmar'
import { EditorToma } from '../components/EditorToma'
import { Aviso, Boton, BotonLink, Cargando, EstadoVacio, Seccion } from '../components/ui'
import { db } from '../db/database'
import { listarPacientes } from '../db/pacientes'
import { eliminarRegistro, guardarRegistro, obtenerRegistro, RegistroDuplicadoError, registroVacio } from '../db/registros'
import { CAMPOS_TEXTO, CAMPOS_TOMA, type DefCampoTexto } from '../domain/campos'
import type { Alimentacion, CampoTexto, EstadoAlimentacion, TomaSignos } from '../domain/tipos'
import { useBotonAtras } from '../lib/botonAtras'
import { fechaCorta, fechaLarga, horaActual, hoyISO, sumarDias } from '../lib/fechas'
import { tomaSinDatos, tomaVacia } from '../lib/tomas'

type Textos = Record<CampoTexto, string>
const TEXTOS_VACIOS = Object.fromEntries(CAMPOS_TEXTO.map((c) => [c.clave, ''])) as Textos
const DEF = Object.fromEntries(CAMPOS_TEXTO.map((c) => [c.clave, c])) as Record<CampoTexto, DefCampoTexto>
/** Datos que suelen repetirse de un día a otro */
const COPIABLES: CampoTexto[] = ['sondaVesical', 'sng', 'rotacion', 'ejercicio']

interface EstadoForm {
  tomas: TomaSignos[]
  alimentacion: Alimentacion
  textos: Textos
}

const formVacio = (): EstadoForm => ({
  tomas: [tomaVacia(horaActual())],
  alimentacion: { estado: '', comentario: '' },
  textos: { ...TEXTOS_VACIOS },
})

export function PaginaRegistroForm() {
  const [params, setParams] = useSearchParams()
  const navegar = useNavigate()
  const location = useLocation()
  const avisos = useAvisos()
  const confirmar = useConfirmar()

  const pacienteId = Number(params.get('paciente')) || 0
  const fecha = params.get('fecha') || hoyISO()
  const clave = `${pacienteId}|${fecha}`

  const pacientes = useLiveQuery(listarPacientes, [])
  const [form, setForm] = useState<EstadoForm>(formVacio)
  const [existenteId, setExistenteId] = useState<number>()
  const [cargadoPara, setCargadoPara] = useState<string>()
  const [modificado, setModificado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const anteriorParaCopiar = useRef<Partial<Textos> | null>(null)
  const [puedeCopiar, setPuedeCopiar] = useState(false)

  // Cargar el registro del paciente + fecha elegidos (si existe)
  useEffect(() => {
    let cancelado = false
    ;(async () => {
      if (!pacienteId) {
        setCargadoPara(clave)
        return
      }
      const r = await obtenerRegistro(pacienteId, fecha)
      // Registro anterior, para ofrecer "copiar datos del día anterior"
      const previo = await db.registros
        .where('[pacienteId+fecha]')
        .between([pacienteId, '0000-01-01'], [pacienteId, fecha], true, false)
        .last()
      if (cancelado) return
      if (r) {
        setForm({
          tomas: r.tomas.length ? r.tomas : [],
          alimentacion: { estado: r.alimentacion.estado, comentario: r.alimentacion.comentario ?? '' },
          textos: { ...TEXTOS_VACIOS, ...Object.fromEntries(CAMPOS_TEXTO.map((c) => [c.clave, r[c.clave] ?? ''])) },
        })
        setExistenteId(r.id)
      } else {
        setForm(formVacio())
        setExistenteId(undefined)
      }
      const copiables = previo ? Object.fromEntries(COPIABLES.filter((k) => previo[k]).map((k) => [k, previo[k]!])) : {}
      anteriorParaCopiar.current = Object.keys(copiables).length ? copiables : null
      setPuedeCopiar(!r && !!anteriorParaCopiar.current)
      setModificado(false)
      setCargadoPara(clave)
    })()
    return () => {
      cancelado = true
    }
  }, [clave, pacienteId, fecha])

  // Aviso del navegador si se cierra la pestaña con cambios sin guardar
  useEffect(() => {
    if (!modificado) return
    const h = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [modificado])

  const actualizar = useCallback((cambio: (f: EstadoForm) => EstadoForm) => {
    setForm(cambio)
    setModificado(true)
  }, [])

  async function cambiarClave(nuevoPaciente: number, nuevaFecha: string) {
    if (modificado) {
      const ok = await confirmar({
        titulo: 'Hay cambios sin guardar',
        mensaje: 'Si cambiás de paciente o de día, se pierde lo que cargaste. ¿Seguir?',
        textoConfirmar: 'Sí, descartar cambios',
        peligro: true,
      })
      if (!ok) return
    }
    setModificado(false)
    const p = new URLSearchParams()
    if (nuevoPaciente) p.set('paciente', String(nuevoPaciente))
    p.set('fecha', nuevaFecha)
    setParams(p, { replace: true })
  }

  const volver = () => (location.key !== 'default' ? navegar(-1) : navegar(pacienteId ? `/pacientes/${pacienteId}` : '/pacientes'))

  // Botón atrás de Android: si hay cambios, preguntar antes de salir
  useBotonAtras(modificado, async () => {
    const salir = await confirmar({
      titulo: '¿Salir sin guardar?',
      mensaje: 'Hay datos cargados que todavía no se guardaron.',
      textoConfirmar: 'Salir sin guardar',
      textoCancelar: 'Seguir cargando',
      peligro: true,
    })
    if (salir) {
      setModificado(false)
      volver()
    }
  })

  async function guardar(e?: FormEvent) {
    e?.preventDefault()
    if (!pacienteId) {
      avisos.error('Elegí el paciente antes de guardar.')
      return
    }
    const datos = {
      id: existenteId,
      pacienteId,
      fecha,
      tomas: form.tomas,
      alimentacion: form.alimentacion,
      ...form.textos,
    }
    if (registroVacio(datos)) {
      avisos.error('No hay ningún dato cargado todavía.')
      return
    }
    // Valores imposibles: se pide confirmación
    const raros: string[] = []
    for (const t of form.tomas) {
      for (const c of CAMPOS_TOMA) {
        const v = t[c.clave]
        if (v != null && (v < c.min || v > c.max)) raros.push(`${c.etiqueta}: ${String(v).replace('.', ',')} ${c.unidad}`)
      }
    }
    if (
      raros.length &&
      !(await confirmar({
        titulo: '¿Los valores están bien?',
        mensaje: (
          <>
            Estos valores son muy poco comunes:
            <ul className="mt-2 list-disc pl-6 font-bold text-tinta">
              {raros.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </>
        ),
        textoConfirmar: 'Sí, están bien',
        textoCancelar: 'Revisar',
      }))
    ) {
      return
    }
    if (fecha > hoyISO() && !(await confirmar({ titulo: 'La fecha es futura', mensaje: `Estás guardando un registro para el ${fechaCorta(fecha)}. ¿Es correcto?`, textoConfirmar: 'Sí, guardar' }))) {
      return
    }

    setGuardando(true)
    try {
      await guardarRegistro(datos)
      setModificado(false)
      const nombre = pacientes?.find((p) => p.id === pacienteId)?.nombre ?? 'el paciente'
      avisos.exito(`Registro de ${nombre} guardado.`)
      volver()
    } catch (err) {
      avisos.error(err instanceof RegistroDuplicadoError ? `${err.message} Recargá la página.` : `No se pudo guardar: ${mensajeDeError(err)}`)
    } finally {
      setGuardando(false)
    }
  }

  async function eliminar() {
    if (!existenteId) return
    const ok = await confirmar({
      titulo: '¿Eliminar este registro?',
      mensaje: `Se borrará todo lo cargado el ${fechaLarga(fecha)}. No se puede deshacer.`,
      textoConfirmar: 'Sí, eliminar',
      peligro: true,
    })
    if (!ok) return
    await eliminarRegistro(existenteId)
    setModificado(false)
    avisos.exito('Registro eliminado.')
    volver()
  }

  function copiarAnterior() {
    const datos = anteriorParaCopiar.current
    if (!datos) return
    actualizar((f) => ({
      ...f,
      textos: { ...f.textos, ...Object.fromEntries(Object.entries(datos).filter(([k]) => !f.textos[k as CampoTexto])) },
    }))
    setPuedeCopiar(false)
    avisos.exito('Se copiaron sonda, SNG, rotación y ejercicio del último registro.')
  }

  const setTexto = (k: CampoTexto) => (v: string) => actualizar((f) => ({ ...f, textos: { ...f.textos, [k]: v } }))
  const setAlim = (a: Partial<Alimentacion>) => actualizar((f) => ({ ...f, alimentacion: { ...f.alimentacion, ...a } }))
  const alternarEstado = (e: EstadoAlimentacion) => setAlim({ estado: form.alimentacion.estado === e ? '' : e })

  if (!pacientes) return <Cargando />
  if (pacientes.length === 0) {
    return (
      <EstadoVacio icono={UserPlus} titulo="Primero agregá un paciente">
        <BotonLink to="/pacientes/nuevo" icono={UserPlus}>Agregar paciente</BotonLink>
      </EstadoVacio>
    )
  }

  const paciente = pacientes.find((p) => p.id === pacienteId)
  const listo = cargadoPara === clave
  const tomasConDatos = form.tomas.filter((t) => !tomaSinDatos(t)).length

  return (
    <form
      onSubmit={guardar}
      noValidate
      // Enter en un campo no guarda (evita guardar sin querer); solo el botón Guardar
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target instanceof HTMLInputElement) e.preventDefault()
      }}
    >
      <button type="button" onClick={volver} className="mb-3 inline-flex min-h-11 items-center gap-2 text-lg font-bold text-salvia-700 hover:underline">
        <ArrowLeft aria-hidden className="size-5" /> Volver
      </button>

      {/* Paciente y día */}
      <section className="tarjeta mb-5 p-5 sm:p-6">
        <h1 className="text-3xl sm:text-4xl">{existenteId ? 'Editar registro' : 'Registro del día'}</h1>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="min-w-0">
            <label htmlFor="paciente" className="etiqueta">Paciente</label>
            <select
              id="paciente"
              value={pacienteId || ''}
              onChange={(e) => cambiarClave(Number(e.target.value), fecha)}
              className={`control cursor-pointer text-xl font-bold ${!pacienteId ? 'border-ambar bg-ambar-claro' : ''}`}
            >
              <option value="">— Elegí un paciente —</option>
              {pacientes
                .filter((p) => p.activo || p.id === pacienteId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                    {p.habitacion ? ` (hab. ${p.habitacion})` : ''}
                  </option>
                ))}
            </select>
          </div>
          <div className="min-w-0">
            <label htmlFor="fecha" className="etiqueta">Día</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => cambiarClave(pacienteId, sumarDias(fecha, -1))}
                className="grid min-h-14 w-12 shrink-0 place-items-center rounded-xl border-2 border-salvia-300 bg-blanco text-salvia-800 hover:bg-salvia-50"
                aria-label="Día anterior"
              >
                <ChevronLeft className="size-7" />
              </button>
              <input
                id="fecha"
                type="date"
                value={fecha}
                onChange={(e) => e.target.value && cambiarClave(pacienteId, e.target.value)}
                className="control px-3 text-xl font-bold"
              />
              <button
                type="button"
                onClick={() => cambiarClave(pacienteId, sumarDias(fecha, 1))}
                className="grid min-h-14 w-12 shrink-0 place-items-center rounded-xl border-2 border-salvia-300 bg-blanco text-salvia-800 hover:bg-salvia-50"
                aria-label="Día siguiente"
              >
                <ChevronRight className="size-7" />
              </button>
            </div>
            <p className="mt-1 text-base text-suave first-letter:uppercase">
              {fechaLarga(fecha)}
              {fecha !== hoyISO() && (
                <button type="button" onClick={() => cambiarClave(pacienteId, hoyISO())} className="ml-2 font-bold text-salvia-700 underline">
                  Ir a hoy
                </button>
              )}
            </p>
          </div>
        </div>
        {paciente && listo && existenteId && (
          <div className="mt-4">
            <Aviso tono="info" icono={Info} titulo="Este día ya tiene un registro">
              Estás viendo lo que se cargó. Podés agregar o corregir datos y guardar.
            </Aviso>
          </div>
        )}
        {paciente && listo && puedeCopiar && (
          <div className="mt-4">
            <Boton variante="secundario" icono={ClipboardCopy} onClick={copiarAnterior}>
              Copiar datos que se repiten del último registro
            </Boton>
          </div>
        )}
      </section>

      {!pacienteId ? (
        <Aviso tono="aviso" icono={Info} titulo="Elegí un paciente para empezar" />
      ) : !listo ? (
        <Cargando />
      ) : (
        <div className="space-y-5">
          <Seccion
            titulo="Signos vitales"
            icono={Activity}
            accion={tomasConDatos > 0 && <span className="text-lg text-suave">{tomasConDatos} {tomasConDatos === 1 ? 'toma' : 'tomas'}</span>}
          >
            <div className="space-y-4">
              {form.tomas.map((t, i) => (
                <EditorToma
                  key={t.id}
                  toma={t}
                  numero={i + 1}
                  onCambio={(nueva) => actualizar((f) => ({ ...f, tomas: f.tomas.map((x) => (x.id === t.id ? nueva : x)) }))}
                  onQuitar={async () => {
                    if (!tomaSinDatos(t) && !(await confirmar({ titulo: `¿Quitar la toma ${i + 1}?`, textoConfirmar: 'Quitar', peligro: true }))) return
                    actualizar((f) => ({ ...f, tomas: f.tomas.filter((x) => x.id !== t.id) }))
                  }}
                />
              ))}
              <Boton
                variante="secundario"
                icono={Plus}
                ancho
                onClick={() => actualizar((f) => ({ ...f, tomas: [...f.tomas, tomaVacia(horaActual())] }))}
              >
                {form.tomas.length ? 'Agregar otra toma' : 'Agregar toma de signos vitales'}
              </Boton>
            </div>
          </Seccion>

          <Seccion titulo="Alimentación" icono={Utensils}>
            <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2" role="group" aria-label="Resultado de la alimentación">
              <button
                type="button"
                aria-pressed={form.alimentacion.estado === 'positiva'}
                onClick={() => alternarEstado('positiva')}
                className={`flex min-h-20 items-center justify-center gap-3 rounded-2xl border-3 text-2xl font-bold transition-colors ${
                  form.alimentacion.estado === 'positiva'
                    ? 'border-exito bg-exito text-white'
                    : 'border-exito/30 bg-exito-claro text-exito hover:border-exito'
                }`}
              >
                <ThumbsUp aria-hidden className="size-8" /> Positiva
              </button>
              <button
                type="button"
                aria-pressed={form.alimentacion.estado === 'negativa'}
                onClick={() => alternarEstado('negativa')}
                className={`flex min-h-20 items-center justify-center gap-3 rounded-2xl border-3 text-2xl font-bold transition-colors ${
                  form.alimentacion.estado === 'negativa'
                    ? 'border-coral bg-coral text-white'
                    : 'border-coral/30 bg-coral-claro text-coral hover:border-coral'
                }`}
              >
                <ThumbsDown aria-hidden className="size-8" /> Negativa
              </button>
            </div>
            <div className="mt-4">
              <label htmlFor="alim-comentario" className="etiqueta">
                Comentario <span className="font-normal text-suave">(opcional)</span>
              </label>
              <input
                id="alim-comentario"
                value={form.alimentacion.comentario ?? ''}
                onChange={(e) => setAlim({ comentario: e.target.value })}
                placeholder="Ej.: comió la mitad, rechazó la cena…"
                className="control"
              />
            </div>
          </Seccion>

          <Seccion titulo="Sondas y eliminación" icono={Droplets}>
            <div className="grid gap-6 lg:grid-cols-2">
              {(['sondaVesical', 'diuresis', 'catarsis', 'sng'] as const).map((k) => (
                <CampoRapido key={k} def={DEF[k]} valor={form.textos[k]} onCambio={setTexto(k)} />
              ))}
            </div>
          </Seccion>

          <Seccion titulo="Cuidados" icono={HandHeart}>
            <div className="grid gap-6 lg:grid-cols-2">
              {(['curaciones', 'rotacion', 'ejercicio'] as const).map((k) => (
                <CampoRapido key={k} def={DEF[k]} valor={form.textos[k]} onCambio={setTexto(k)} />
              ))}
            </div>
          </Seccion>

          <Seccion titulo="Descanso y ánimo" icono={Moon}>
            <div className="grid gap-6 lg:grid-cols-2">
              {(['sueno', 'comportamiento'] as const).map((k) => (
                <CampoRapido key={k} def={DEF[k]} valor={form.textos[k]} onCambio={setTexto(k)} />
              ))}
            </div>
          </Seccion>

          <Seccion titulo="Laboratorio" icono={FlaskConical}>
            <CampoRapido def={DEF.laboratorio} valor={form.textos.laboratorio} onCambio={setTexto('laboratorio')} />
          </Seccion>

          <Seccion titulo="Observaciones" icono={MessageSquareText}>
            <CampoRapido def={DEF.observaciones} valor={form.textos.observaciones} onCambio={setTexto('observaciones')} />
          </Seccion>

          {existenteId && (
            <Boton variante="peligro" icono={Trash2} onClick={eliminar} ancho>
              Eliminar el registro de este día
            </Boton>
          )}
        </div>
      )}

      {/* Barra fija para guardar */}
      <div
        className="no-imprimir fixed inset-x-0 bottom-0 z-30 border-t border-arena bg-papel/95 backdrop-blur"
        style={{ paddingBottom: 'var(--safe-area-inset-bottom, env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <p className="flex-1 text-lg text-suave max-sm:hidden" aria-live="polite">
            {modificado ? (
              <span className="font-bold text-ambar">● Hay cambios sin guardar</span>
            ) : paciente ? (
              <>
                <span className="font-bold text-tinta">{paciente.nombre}</span> · {fechaCorta(fecha)}
              </>
            ) : null}
          </p>
          <Boton variante="secundario" onClick={volver} className="flex-1 sm:flex-none">
            Cancelar
          </Boton>
          <Boton type="submit" icono={Save} disabled={guardando || !pacienteId || !listo} className="flex-[2] sm:flex-none sm:px-10" grande>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Boton>
        </div>
      </div>
    </form>
  )
}
