import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, ArrowRight, Mic, MicOff, SendHorizontal, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Encabezado } from '../components/Layout'
import { Boton, Cargando } from '../components/ui'
import { useAjustes } from '../db/ajustes'
import { db } from '../db/database'
import { listarPacientes } from '../db/pacientes'
import { responder, SUGERENCIAS, type DatosAsistente, type Respuesta } from '../domain/asistente'
import type { FechaISO } from '../domain/tipos'
import { hoyISO, sumarDias } from '../lib/fechas'

interface Mensaje {
  id: number
  pregunta: string
  respuesta: Respuesta
}

/** Dictado por voz del navegador (Chrome). En el APK puede no estar disponible. */
type Reconocedor = {
  lang: string
  interimResults: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}
const ConstructorVoz = (globalThis as unknown as { SpeechRecognition?: new () => Reconocedor; webkitSpeechRecognition?: new () => Reconocedor })
const Voz = ConstructorVoz.SpeechRecognition ?? ConstructorVoz.webkitSpeechRecognition

export function PaginaAsistente() {
  const hoy = hoyISO()
  const ajustes = useAjustes()
  const [texto, setTexto] = useState('')
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [escuchando, setEscuchando] = useState(false)
  const reconocedor = useRef<Reconocedor | null>(null)
  const fin = useRef<HTMLDivElement>(null)
  const entrada = useRef<HTMLInputElement>(null)

  const datos = useLiveQuery(async () => {
    const pacientes = await listarPacientes()
    const ultimas = new Map<number, FechaISO>()
    await db.registros.orderBy('[pacienteId+fecha]').eachKey((k) => {
      const [id, fecha] = k as unknown as [number, string]
      ultimas.set(id, fecha)
    })
    const registros = await db.registros.where('fecha').between(sumarDias(hoy, -30), hoy, true, true).toArray()
    return { pacientes, ultimas, registros }
  }, [hoy])

  useEffect(() => {
    fin.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [mensajes])

  useEffect(() => () => reconocedor.current?.stop(), [])

  if (!datos || !ajustes) return <Cargando />
  const contexto: DatosAsistente = { ...datos, hoy, ultimaCopia: ajustes.ultimaCopia }

  function preguntar(p: string) {
    const limpia = p.trim()
    if (!limpia) return
    setMensajes((m) => [...m, { id: Date.now(), pregunta: limpia, respuesta: responder(limpia, contexto) }])
    setTexto('')
  }

  function enviar(e: FormEvent) {
    e.preventDefault()
    preguntar(texto)
    entrada.current?.focus()
  }

  function dictar() {
    if (!Voz) return
    if (escuchando) {
      reconocedor.current?.stop()
      return
    }
    const r = new Voz()
    r.lang = 'es-AR'
    r.interimResults = false
    r.onresult = (e) => {
      const dicho = e.results[0]?.[0]?.transcript ?? ''
      if (dicho) preguntar(dicho)
    }
    r.onend = () => setEscuchando(false)
    r.onerror = () => setEscuchando(false)
    reconocedor.current = r
    setEscuchando(true)
    r.start()
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Encabezado
        titulo="Preguntale a la app"
        subtitulo="Escribí o tocá una pregunta. Responde con los datos de este dispositivo, sin internet."
      >
        {mensajes.length > 0 && (
          <Boton variante="suave" icono={Trash2} onClick={() => setMensajes([])}>
            Limpiar
          </Boton>
        )}
      </Encabezado>

      <div className="space-y-4 pb-44" aria-live="polite">
        {mensajes.length === 0 && (
          <div className="tarjeta flex items-start gap-3 p-5 text-lg">
            <Sparkles aria-hidden className="mt-1 size-7 shrink-0 text-salvia-600" />
            <p>
              Podés preguntar por un paciente (<strong>“¿Cómo está María?”</strong>, <strong>“Presión de Luis”</strong>) o por todos
              (<strong>“¿Quién tuvo fiebre ayer?”</strong>, <strong>“¿Qué falta cargar?”</strong>).
            </p>
          </div>
        )}
        {mensajes.map((m) => (
          <div key={m.id} className="space-y-2">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-salvia-600 px-4 py-2.5 text-lg text-white">{m.pregunta}</p>
            <div className={`tarjeta max-w-[95%] p-4 ${m.respuesta.alerta ? 'border-ambar/50 bg-ambar-claro/40' : ''}`}>
              <p className="flex items-start gap-2 text-lg font-bold">
                {m.respuesta.alerta && <AlertTriangle aria-hidden className="mt-1 size-5 shrink-0 text-ambar" />}
                {m.respuesta.texto}
              </p>
              {m.respuesta.lineas && (
                <ul className="mt-2 space-y-1 text-lg">
                  {m.respuesta.lineas.map((l, i) => (
                    <li key={i} className="border-l-4 border-salvia-200 pl-3">
                      {l}
                    </li>
                  ))}
                </ul>
              )}
              {m.respuesta.enlaces && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {m.respuesta.enlaces.map((e) => (
                    <Link
                      key={e.a}
                      to={e.a}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border-2 border-salvia-300 bg-blanco px-3 font-bold text-salvia-800 hover:bg-salvia-50"
                    >
                      {e.texto} <ArrowRight aria-hidden className="size-4" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={fin} />
      </div>

      {/* Barra fija para preguntar */}
      <div
        className="no-imprimir fixed inset-x-0 bottom-0 z-40 border-t border-arena bg-papel/95 backdrop-blur"
        style={{ paddingBottom: 'var(--safe-area-inset-bottom, env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
            {SUGERENCIAS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => preguntar(s)}
                className="min-h-10 shrink-0 rounded-full border-2 border-salvia-200 bg-blanco px-3 text-base font-bold text-salvia-800 hover:bg-salvia-50"
              >
                {s}
              </button>
            ))}
          </div>
          <form onSubmit={enviar} className="flex gap-2">
            <label htmlFor="pregunta" className="sr-only">
              Tu pregunta
            </label>
            <input
              id="pregunta"
              ref={entrada}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={escuchando ? 'Escuchando…' : 'Ej.: ¿Cómo está Rosa?'}
              autoComplete="off"
              enterKeyHint="send"
              className="control min-w-0 flex-1"
            />
            {Voz && (
              <Boton
                type="button"
                variante={escuchando ? 'peligro' : 'secundario'}
                icono={escuchando ? MicOff : Mic}
                onClick={dictar}
                aria-label={escuchando ? 'Dejar de escuchar' : 'Preguntar hablando'}
                className="shrink-0 px-3"
              >
                <span className="max-sm:hidden">{escuchando ? 'Parar' : 'Hablar'}</span>
              </Boton>
            )}
            <Boton type="submit" icono={SendHorizontal} disabled={!texto.trim()} className="shrink-0 px-4">
              <span className="max-sm:hidden">Preguntar</span>
            </Boton>
          </form>
        </div>
      </div>
    </div>
  )
}
