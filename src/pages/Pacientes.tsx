import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarCheck, CalendarClock, ClipboardPlus, FileSpreadsheet, History, Search, UserPlus, Users, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { db } from '../db/database'
import { listarPacientes } from '../db/pacientes'
import { Encabezado } from '../components/Layout'
import { BotonLink, Cargando, EstadoVacio, Insignia } from '../components/ui'
import { urlRegistro } from '../components/VistaRegistros'
import { edad, fechaCorta, hoyISO, isoADate } from '../lib/fechas'
import { normalizar } from '../lib/texto'

function haceCuanto(fecha: string): string {
  const dias = Math.round((isoADate(hoyISO()).getTime() - isoADate(fecha).getTime()) / 86400000)
  if (dias === 0) return 'hoy'
  if (dias === 1) return 'ayer'
  if (dias > 1 && dias < 30) return `hace ${dias} días`
  return `el ${fechaCorta(fecha)}`
}

export function PaginaPacientes() {
  const [busqueda, setBusqueda] = useState('')
  const [verInactivos, setVerInactivos] = useState(false)
  const hoy = hoyISO()

  const datos = useLiveQuery(async () => {
    const pacientes = await listarPacientes()
    // Última fecha con registro de cada paciente (recorriendo el índice compuesto, sin cargar todo)
    const ultimas = new Map<number, string>()
    await db.registros.orderBy('[pacienteId+fecha]').eachKey((k) => {
      const [id, fecha] = k as unknown as [number, string]
      ultimas.set(id, fecha)
    })
    return { pacientes, ultimas }
  }, [])

  const filtrados = useMemo(() => {
    if (!datos) return []
    const palabras = normalizar(busqueda).split(' ').filter(Boolean)
    return datos.pacientes.filter((p) => {
      if (!verInactivos && !p.activo) return false
      const texto = `${p.nombreClave} ${normalizar(p.habitacion ?? '')} ${normalizar(p.documento ?? '')}`
      return palabras.every((w) => texto.includes(w))
    })
  }, [datos, busqueda, verInactivos])

  if (!datos) return <Cargando />

  const activos = datos.pacientes.filter((p) => p.activo)
  const cargadosHoy = activos.filter((p) => datos.ultimas.get(p.id!) === hoy).length
  const inactivos = datos.pacientes.length - activos.length

  if (datos.pacientes.length === 0) {
    return (
      <>
        <Encabezado titulo="Pacientes" />
        <EstadoVacio icono={Users} titulo="Todavía no hay pacientes" texto="Agregá el primer paciente o traé los datos que ya tenés en una planilla de Excel.">
          <BotonLink to="/pacientes/nuevo" icono={UserPlus} grande>
            Agregar paciente
          </BotonLink>
          <BotonLink to="/excel?tab=importar" icono={FileSpreadsheet} variante="secundario" grande>
            Importar desde Excel
          </BotonLink>
        </EstadoVacio>
      </>
    )
  }

  return (
    <>
      <Encabezado
        titulo="Pacientes"
        subtitulo={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            {activos.length} {activos.length === 1 ? 'paciente' : 'pacientes'}
            <Insignia tono={cargadosHoy === activos.length ? 'exito' : 'aviso'} icono={CalendarCheck}>
              Hoy: {cargadosHoy} de {activos.length} con registro
            </Insignia>
          </span>
        }
      >
        <BotonLink to="/pacientes/nuevo" icono={UserPlus}>
          Nuevo paciente
        </BotonLink>
      </Encabezado>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <label htmlFor="buscar" className="sr-only">Buscar paciente</label>
          <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-6 -translate-y-1/2 text-suave" />
          <input
            id="buscar"
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar paciente…"
            className="control pl-13 pr-12 text-xl"
            autoComplete="off"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => setBusqueda('')}
              aria-label="Borrar búsqueda"
              className="absolute right-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-suave hover:bg-arena/60"
            >
              <X className="size-6" />
            </button>
          )}
        </div>
        {inactivos > 0 && (
          <label className="flex min-h-12 cursor-pointer items-center gap-3 text-lg">
            <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} className="size-6 accent-salvia-600" />
            Ver dados de alta ({inactivos})
          </label>
        )}
      </div>

      {filtrados.length === 0 ? (
        <EstadoVacio icono={Search} titulo="No se encontró ningún paciente" texto={`No hay pacientes que coincidan con "${busqueda}".`} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtrados.map((p) => {
            const ultima = datos.ultimas.get(p.id!)
            const cargadoHoy = ultima === hoy
            const anios = edad(p.fechaNacimiento)
            return (
              <li key={p.id} className={`tarjeta flex flex-col p-5 ${p.activo ? '' : 'opacity-70'}`}>
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-2xl leading-tight break-words">{p.nombre}</h2>
                    <p className="mt-1 text-lg text-suave">
                      {[p.habitacion && `Hab. ${p.habitacion}`, anios != null && `${anios} años`].filter(Boolean).join(' · ') || ' '}
                    </p>
                  </div>
                  {!p.activo && <Insignia>De alta</Insignia>}
                </div>
                <p className="mb-4 flex items-center gap-2 text-base">
                  {cargadoHoy ? (
                    <Insignia tono="exito" icono={CalendarCheck}>Registro de hoy listo</Insignia>
                  ) : (
                    <>
                      <CalendarClock aria-hidden className="size-5 text-ambar" />
                      <span className="text-suave">{ultima ? `Último registro: ${haceCuanto(ultima)}` : 'Sin registros todavía'}</span>
                    </>
                  )}
                </p>
                <div className="mt-auto flex flex-wrap gap-2">
                  <BotonLink to={urlRegistro(p.id!, hoy)} icono={ClipboardPlus} variante={cargadoHoy ? 'secundario' : 'principal'} className="flex-1 whitespace-nowrap px-4">
                    {cargadoHoy ? 'Ver hoy' : 'Cargar hoy'}
                  </BotonLink>
                  <BotonLink to={`/pacientes/${p.id}`} icono={History} variante="secundario" className="flex-1 whitespace-nowrap px-4">
                    Historial
                  </BotonLink>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
