import { Pencil, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { CAMPOS_TEXTO, CAMPOS_TOMA, fueraDeNormal } from '../domain/campos'
import type { Paciente, Registro, TomaSignos } from '../domain/tipos'
import { fechaCorta, fechaLarga, hoyISO } from '../lib/fechas'
import { resumenToma } from '../lib/tomas'
import { Insignia } from './ui'

const fmt = (n?: number) => (n == null ? '—' : String(n).replace('.', ','))

export function urlRegistro(pacienteId: number, fecha: string) {
  return `/registro?paciente=${pacienteId}&fecha=${fecha}`
}

function Valor({ campo, valor }: { campo: (typeof CAMPOS_TOMA)[number]['clave']; valor?: number }) {
  const alerta = fueraDeNormal(campo, valor)
  return <span className={alerta ? 'rounded bg-coral-claro px-1.5 font-bold text-coral' : ''}>{fmt(valor)}</span>
}

function TablaTomas({ tomas }: { tomas: TomaSignos[] }) {
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[34rem] border-separate border-spacing-0 text-left text-base tabular-nums">
        <thead>
          <tr className="text-sm text-suave">
            <th className="px-2 py-1 font-bold">Hora</th>
            <th className="px-2 py-1 font-bold">Presión</th>
            <th className="px-2 py-1 font-bold">Pulso</th>
            <th className="px-2 py-1 font-bold">Temp.</th>
            <th className="px-2 py-1 font-bold">Sat O₂</th>
            <th className="px-2 py-1 font-bold">Resp.</th>
            <th className="px-2 py-1 font-bold">Glucemia</th>
          </tr>
        </thead>
        <tbody>
          {tomas.map((t) => (
            <tr key={t.id} className="odd:bg-salvia-50">
              <td className="rounded-l-lg px-2 py-1.5 font-bold">{t.hora ?? '—'}</td>
              <td className="px-2 py-1.5">
                {t.sistolica == null && t.diastolica == null ? (
                  '—'
                ) : (
                  <>
                    <Valor campo="sistolica" valor={t.sistolica} />/<Valor campo="diastolica" valor={t.diastolica} />
                  </>
                )}
              </td>
              <td className="px-2 py-1.5"><Valor campo="frecuenciaCardiaca" valor={t.frecuenciaCardiaca} /></td>
              <td className="px-2 py-1.5"><Valor campo="temperatura" valor={t.temperatura} />{t.temperatura != null && '°'}</td>
              <td className="px-2 py-1.5"><Valor campo="saturacion" valor={t.saturacion} />{t.saturacion != null && '%'}</td>
              <td className="px-2 py-1.5"><Valor campo="frecuenciaRespiratoria" valor={t.frecuenciaRespiratoria} /></td>
              <td className="rounded-r-lg px-2 py-1.5"><Valor campo="glucemia" valor={t.glucemia} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {tomas.some((t) => t.nota) && (
        <ul className="mt-2 space-y-0.5 px-1 text-base text-suave">
          {tomas.filter((t) => t.nota).map((t) => (
            <li key={t.id}>
              <span className="font-bold">{t.hora ?? 'Nota'}:</span> {t.nota}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function InsigniaAlimentacion({ estado }: { estado: Registro['alimentacion']['estado'] }) {
  if (estado === 'positiva') return <Insignia tono="exito" icono={ThumbsUp}>Positiva</Insignia>
  if (estado === 'negativa') return <Insignia tono="peligro" icono={ThumbsDown}>Negativa</Insignia>
  return null
}

interface PropsTarjeta {
  registro: Registro
  paciente?: Paciente
  mostrarPaciente?: boolean
  onEliminar?: (r: Registro) => void
}

export function TarjetaRegistro({ registro: r, paciente, mostrarPaciente, onEliminar }: PropsTarjeta) {
  const campos = CAMPOS_TEXTO.filter((c) => r[c.clave])
  const esHoy = r.fecha === hoyISO()
  return (
    <article className="tarjeta overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-arena bg-salvia-50 px-5 py-3">
        <div>
          {mostrarPaciente && paciente && (
            <Link to={`/pacientes/${paciente.id}`} className="block text-xl font-bold text-salvia-800 underline-offset-4 hover:underline">
              {paciente.nombre}
            </Link>
          )}
          <h3 className={mostrarPaciente ? 'text-lg font-bold text-suave first-letter:uppercase' : 'text-xl first-letter:uppercase'}>
            {fechaLarga(r.fecha)} {esHoy && <Insignia tono="marca">Hoy</Insignia>}
          </h3>
        </div>
        <div className="flex gap-2 no-imprimir">
          <Link
            to={urlRegistro(r.pacienteId, r.fecha)}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-salvia-300 bg-blanco px-4 font-bold text-salvia-800 hover:bg-salvia-50"
          >
            <Pencil aria-hidden className="size-5" /> Editar
          </Link>
          {onEliminar && (
            <button
              type="button"
              onClick={() => onEliminar(r)}
              className="inline-flex min-h-12 items-center gap-2 rounded-xl px-3 font-bold text-coral hover:bg-coral-claro"
              aria-label={`Eliminar registro del ${fechaCorta(r.fecha)}`}
            >
              <Trash2 aria-hidden className="size-5" />
              <span className="max-sm:hidden">Eliminar</span>
            </button>
          )}
        </div>
      </header>
      <div className="space-y-4 p-5">
        {r.tomas.length > 0 ? (
          <div>
            <h4 className="mb-1 text-base font-bold uppercase tracking-wide text-salvia-700">
              Signos vitales · {r.tomas.length} {r.tomas.length === 1 ? 'toma' : 'tomas'}
            </h4>
            <TablaTomas tomas={r.tomas} />
          </div>
        ) : (
          <p className="text-base text-suave">Sin signos vitales cargados.</p>
        )}

        {(r.alimentacion.estado || r.alimentacion.comentario) && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-salvia-900">Alimentación:</span>
            <InsigniaAlimentacion estado={r.alimentacion.estado} />
            {r.alimentacion.comentario && <span className="text-suave">{r.alimentacion.comentario}</span>}
          </div>
        )}

        {campos.length > 0 && (
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {campos.map((c) => (
              <div key={c.clave} className={c.multilinea ? 'sm:col-span-2' : ''}>
                <dt className="text-base font-bold text-salvia-800">{c.etiqueta}</dt>
                <dd className="whitespace-pre-line text-lg">{r[c.clave]}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </article>
  )
}

interface PropsTabla {
  registros: Registro[]
  pacientes: Map<number, Paciente>
  mostrarPaciente?: boolean
}

/** Vista compacta: una fila por día, con scroll horizontal en pantallas chicas. */
export function TablaRegistros({ registros, pacientes, mostrarPaciente }: PropsTabla) {
  const columnas = CAMPOS_TEXTO.filter((c) => registros.some((r) => r[c.clave]))
  return (
    <div className="tarjeta overflow-x-auto">
      <table className="w-full min-w-[48rem] text-left text-base">
        <thead className="sticky top-0 bg-salvia-600 text-white">
          <tr>
            <th className="px-3 py-3 font-bold">Fecha</th>
            {mostrarPaciente && <th className="px-3 py-3 font-bold">Paciente</th>}
            <th className="px-3 py-3 font-bold">Signos vitales</th>
            <th className="px-3 py-3 font-bold">Alimentación</th>
            {columnas.map((c) => (
              <th key={c.clave} className="px-3 py-3 font-bold">{c.etiqueta}</th>
            ))}
            <th className="px-3 py-3"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {registros.map((r) => (
            <tr key={r.id} className="border-b border-arena align-top odd:bg-blanco even:bg-crema">
              <td className="whitespace-nowrap px-3 py-3 font-bold">{fechaCorta(r.fecha)}</td>
              {mostrarPaciente && (
                <td className="px-3 py-3">
                  <Link className="font-bold text-salvia-800 hover:underline" to={`/pacientes/${r.pacienteId}`}>
                    {pacientes.get(r.pacienteId)?.nombre ?? '—'}
                  </Link>
                </td>
              )}
              <td className="min-w-64 px-3 py-3 tabular-nums">
                {r.tomas.length ? r.tomas.map((t) => <div key={t.id}>{resumenToma(t)}</div>) : <span className="text-suave">—</span>}
              </td>
              <td className="px-3 py-3">
                <InsigniaAlimentacion estado={r.alimentacion.estado} />
                {r.alimentacion.comentario && <div className="text-suave">{r.alimentacion.comentario}</div>}
              </td>
              {columnas.map((c) => (
                <td key={c.clave} className="min-w-40 whitespace-pre-line px-3 py-3">{r[c.clave] ?? ''}</td>
              ))}
              <td className="px-3 py-3">
                <Link to={urlRegistro(r.pacienteId, r.fecha)} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 font-bold text-salvia-700 hover:bg-salvia-100">
                  <Pencil aria-hidden className="size-5" /> Editar
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
