import { useLiveQuery } from 'dexie-react-hooks'
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardPlus,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  Info,
  MessageCircleQuestion,
  ShieldAlert,
  UserPlus,
  Users,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { mensajeDeError, useAvisos } from '../components/Avisos'
import { Link } from 'react-router'
import { textoUltimaCopia } from '../components/Copias'
import { Aviso, Boton, BotonLink, Cargando, EstadoVacio, Insignia } from '../components/ui'
import { urlRegistro } from '../components/VistaRegistros'
import { useAjustes } from '../db/ajustes'
import { db } from '../db/database'
import { listarPacientes } from '../db/pacientes'
import { calcularAlertas, type Alerta, type Gravedad } from '../domain/alertas'
import type { FechaISO } from '../domain/tipos'
import { diasDesde } from '../lib/copias'
import { fechaCorta, fechaLarga, hoyISO, sumarDias } from '../lib/fechas'
import { esNativo } from '../lib/plataforma'
import { useDemo } from '../demo/modoDemo'

const ESTILO: Record<Gravedad, { icono: typeof AlertOctagon; clase: string; texto: string }> = {
  urgente: { icono: AlertOctagon, clase: 'border-coral/40 bg-coral-claro text-coral', texto: 'Urgente' },
  atencion: { icono: AlertTriangle, clase: 'border-ambar/40 bg-ambar-claro text-ambar', texto: 'Atención' },
  aviso: { icono: Info, clase: 'border-cielo/30 bg-cielo-claro text-cielo', texto: 'Aviso' },
}

export function PaginaHoy() {
  const hoy = hoyISO()
  const ajustes = useAjustes()
  const [verTodosPendientes, setVerTodosPendientes] = useState(false)
  const [verTodasAlertas, setVerTodasAlertas] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState(false)
  const avisos = useAvisos()
  const demo = useDemo()

  async function informeDelDia() {
    setGenerandoPdf(true)
    try {
      const { descargarInformeDias } = await import('../pdf/acciones')
      await descargarInformeDias({ desde: hoy, hasta: hoy, conPendientes: true })
      avisos.exito(esNativo ? 'Informe del día listo. Elegí dónde guardarlo o a quién mandarlo.' : 'Informe del día descargado.')
    } catch (e) {
      avisos.error(`No se pudo crear el PDF: ${mensajeDeError(e)}`)
    } finally {
      setGenerandoPdf(false)
    }
  }

  const datos = useLiveQuery(async () => {
    const pacientes = await listarPacientes()
    const ultimas = new Map<number, FechaISO>()
    await db.registros.orderBy('[pacienteId+fecha]').eachKey((k) => {
      const [id, fecha] = k as unknown as [number, string]
      ultimas.set(id, fecha)
    })
    const recientes = await db.registros.where('fecha').between(sumarDias(hoy, -14), hoy, true, true).toArray()
    const semana = recientes.filter((r) => r.fecha >= sumarDias(hoy, -6)).length
    return { pacientes, ultimas, recientes, semana }
  }, [hoy])

  const alertas = useMemo(
    () => (datos ? calcularAlertas(datos.pacientes, datos.recientes, datos.ultimas, { hoy }) : []),
    [datos, hoy],
  )

  if (!datos || !ajustes) return <Cargando />
  const activos = datos.pacientes.filter((p) => p.activo)
  const porId = new Map(datos.pacientes.map((p) => [p.id!, p]))

  if (datos.pacientes.length === 0) {
    return (
      <>
        <Titulo nombreHogar={ajustes.nombreHogar} hoy={hoy} />
        <EstadoVacio icono={Users} titulo="¡Bienvenida!" texto="Para empezar, agregá los pacientes uno por uno o traé todos juntos desde una planilla de Excel.">
          <BotonLink to="/pacientes/nuevo" icono={UserPlus} grande>
            Agregar paciente
          </BotonLink>
          <BotonLink to="/excel?tab=importar" icono={FileSpreadsheet} variante="secundario" grande>
            Importar desde Excel
          </BotonLink>
          <BotonLink to="/ajustes" icono={FlaskConical} variante="suave" grande>
            Ver una demostración
          </BotonLink>
        </EstadoVacio>
      </>
    )
  }

  const pendientes = activos.filter((p) => datos.ultimas.get(p.id!) !== hoy)
  const listos = activos.length - pendientes.length
  const porcentaje = activos.length ? Math.round((listos / activos.length) * 100) : 0
  const urgentes = alertas.filter((a) => a.gravedad === 'urgente').length
  const copiaAtrasada = diasDesde(ajustes.ultimaCopia) >= ajustes.diasRecordatorioCopia
  const alertasVisibles = verTodasAlertas ? alertas : alertas.slice(0, 8)
  const pendientesVisibles = verTodosPendientes ? pendientes : pendientes.slice(0, 8)

  return (
    <>
      <Titulo nombreHogar={ajustes.nombreHogar} hoy={hoy} />

      {copiaAtrasada && !demo && (
        <div className="mb-5">
          <Aviso tono="aviso" icono={ShieldAlert} titulo={textoUltimaCopia(ajustes.ultimaCopia)}>
            <span className="flex flex-wrap items-center gap-x-3">
              Hacé una copia de seguridad para no perder datos.
              <Link to="/excel?tab=copias" className="min-h-11 content-center font-bold text-salvia-800 underline">
                Hacer copia
              </Link>
            </span>
          </Aviso>
        </div>
      )}

      {/* Progreso del día */}
      <section className="tarjeta mb-6 p-5 sm:p-6" aria-labelledby="progreso">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="progreso" className="text-2xl">Registros de hoy</h2>
            <p className="mt-1 text-lg">
              <strong className="text-3xl tabular-nums text-salvia-700">{listos}</strong>
              <span className="text-suave"> de {activos.length} pacientes</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <BotonLink to="/ronda" icono={Activity} grande>
              Ronda de signos
            </BotonLink>
            <Boton icono={FileText} variante="secundario" grande onClick={informeDelDia} disabled={generandoPdf}>
              {generandoPdf ? 'Preparando…' : 'Informe del día'}
            </Boton>
            <BotonLink to="/asistente" icono={MessageCircleQuestion} variante="secundario" grande>
              Preguntar
            </BotonLink>
          </div>
        </div>
        <div
          className="mt-4 h-4 overflow-hidden rounded-full bg-arena/60"
          role="progressbar"
          aria-valuenow={porcentaje}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Avance de los registros de hoy"
        >
          <div className="h-full rounded-full bg-salvia-500 transition-all" style={{ width: `${porcentaje}%` }} />
        </div>
        <p className="mt-2 text-base text-suave">
          {pendientes.length === 0 ? '¡Todos los pacientes tienen su registro de hoy!' : `Faltan ${pendientes.length}.`}{' '}
          En los últimos 7 días se cargaron {datos.semana} registros.
        </p>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr]">
        {/* Alertas */}
        <section aria-labelledby="titulo-alertas" className="min-w-0">
          <h2 id="titulo-alertas" className="mb-3 flex flex-wrap items-center gap-3 text-2xl">
            Para revisar
            {urgentes > 0 && <Insignia tono="peligro" icono={AlertOctagon}>{urgentes} urgentes</Insignia>}
          </h2>
          {alertas.length === 0 ? (
            <div className="tarjeta flex items-center gap-3 p-5 text-lg">
              <CheckCircle2 aria-hidden className="size-8 text-exito" />
              Sin alertas de hoy ni de ayer.
            </div>
          ) : (
            <ul className="space-y-2">
              {alertasVisibles.map((a) => (
                <FilaAlerta key={a.id} alerta={a} nombre={porId.get(a.pacienteId)?.nombre ?? '—'} hoy={hoy} />
              ))}
            </ul>
          )}
          {alertas.length > alertasVisibles.length && (
            <button type="button" onClick={() => setVerTodasAlertas(true)} className="mt-3 min-h-11 font-bold text-salvia-700 underline">
              Ver las {alertas.length} alertas
            </button>
          )}
          <p className="mt-3 text-sm text-suave">
            Las alertas son orientativas (valores fuera del rango habitual en adultos mayores). No reemplazan la indicación médica.
          </p>
        </section>

        {/* Pendientes */}
        <section aria-labelledby="titulo-pendientes" className="min-w-0">
          <h2 id="titulo-pendientes" className="mb-3 text-2xl">Falta cargar hoy</h2>
          {pendientes.length === 0 ? (
            <div className="tarjeta flex items-center gap-3 p-5 text-lg">
              <CheckCircle2 aria-hidden className="size-8 text-exito" />
              Nada pendiente.
            </div>
          ) : (
            <ul className="tarjeta divide-y divide-arena">
              {pendientesVisibles.map((p) => {
                const ultima = datos.ultimas.get(p.id!)
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <Link to={`/pacientes/${p.id}`} className="block truncate text-lg font-bold hover:underline">
                        {p.nombre}
                      </Link>
                      <p className="flex flex-wrap items-center gap-x-2 text-base text-suave">
                        {p.habitacion && <span className="whitespace-nowrap">Hab. {p.habitacion}</span>}
                        <span className="flex items-center gap-1 whitespace-nowrap">
                          <CalendarClock aria-hidden className="size-4" />
                          {ultima ? (ultima === sumarDias(hoy, -1) ? 'ayer' : fechaCorta(ultima)) : 'sin registros'}
                        </span>
                      </p>
                    </div>
                    <BotonLink to={urlRegistro(p.id!, hoy)} icono={ClipboardPlus} className="shrink-0 px-4">
                      Cargar
                    </BotonLink>
                  </li>
                )
              })}
            </ul>
          )}
          {pendientes.length > pendientesVisibles.length && (
            <button type="button" onClick={() => setVerTodosPendientes(true)} className="mt-3 min-h-11 font-bold text-salvia-700 underline">
              Ver los {pendientes.length} pendientes
            </button>
          )}
        </section>
      </div>
    </>
  )
}

function Titulo({ nombreHogar, hoy }: { nombreHogar: string; hoy: FechaISO }) {
  const hora = new Date().getHours()
  const saludo = hora < 12 ? 'Buen día' : hora < 20 ? 'Buenas tardes' : 'Buenas noches'
  return (
    <div className="mb-6">
      <p className="text-lg text-suave first-letter:uppercase">{fechaLarga(hoy)}</p>
      <h1 className="text-3xl sm:text-4xl">
        {saludo}
        {nombreHogar ? <span className="text-salvia-600"> · {nombreHogar}</span> : ''}
      </h1>
    </div>
  )
}

function FilaAlerta({ alerta: a, nombre, hoy }: { alerta: Alerta; nombre: string; hoy: FechaISO }) {
  const e = ESTILO[a.gravedad]
  const Icono = e.icono
  const cuando = a.fecha ? (a.fecha === hoy ? 'hoy' : a.fecha === sumarDias(hoy, -1) ? 'ayer' : fechaCorta(a.fecha)) : ''
  return (
    <li>
      <Link
        to={a.gravedad === 'aviso' ? urlRegistro(a.pacienteId, hoy) : `/pacientes/${a.pacienteId}`}
        className={`flex items-start gap-3 rounded-2xl border-2 p-3 transition-transform hover:-translate-y-0.5 ${e.clase}`}
      >
        <Icono aria-hidden className="mt-0.5 size-7 shrink-0" />
        <span className="min-w-0 flex-1 text-tinta">
          <span className="block text-lg font-bold">{nombre}</span>
          <span className="block">
            <span className="font-bold">{a.titulo}</span>
            {(cuando || a.hora) && (
              <span className="text-suave">
                {' '}· {cuando}
                {a.hora ? ` ${a.hora}` : ''}
              </span>
            )}
          </span>
          {a.detalle && <span className="block text-sm text-suave">{a.detalle}</span>}
        </span>
        <span className="sr-only">{e.texto}</span>
      </Link>
    </li>
  )
}
