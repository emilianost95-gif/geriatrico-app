import { Check, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Paciente } from '../domain/tipos'
import { normalizar } from '../lib/texto'

/** Lista con casillas para elegir uno, varios o todos los pacientes. */
export function SelectorPacientes({ pacientes, elegidos, onCambio }: {
  pacientes: Paciente[]
  elegidos: number[]
  onCambio: (ids: number[]) => void
}) {
  const [busqueda, setBusqueda] = useState('')
  const visibles = useMemo(() => {
    const palabras = normalizar(busqueda).split(' ').filter(Boolean)
    return pacientes.filter((p) => palabras.every((w) => `${p.nombreClave} ${normalizar(p.habitacion ?? '')}`.includes(w)))
  }, [pacientes, busqueda])
  const set = new Set(elegidos)
  const alternar = (id: number) => onCambio(set.has(id) ? elegidos.filter((x) => x !== id) : [...elegidos, id])

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="etiqueta mb-0">
          Pacientes <span className="font-normal text-suave">({elegidos.length} de {pacientes.length} elegidos)</span>
        </span>
        <div className="flex gap-2">
          <button type="button" onClick={() => onCambio(pacientes.map((p) => p.id!))} className="min-h-11 rounded-lg px-3 font-bold text-salvia-700 hover:bg-salvia-100">
            Todos
          </button>
          <button type="button" onClick={() => onCambio([])} className="min-h-11 rounded-lg px-3 font-bold text-salvia-700 hover:bg-salvia-100">
            Ninguno
          </button>
        </div>
      </div>
      {pacientes.length > 6 && (
        <div className="relative mb-2">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-suave" />
          <input
            type="search"
            aria-label="Buscar paciente en la lista"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar…"
            className="control min-h-12 pl-10"
          />
        </div>
      )}
      <ul className="max-h-72 space-y-1 overflow-y-auto rounded-xl border-2 border-arena bg-blanco p-2">
        {visibles.map((p) => {
          const activo = set.has(p.id!)
          return (
            <li key={p.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={activo}
                onClick={() => alternar(p.id!)}
                className={`flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-lg ${activo ? 'bg-salvia-50 font-bold' : 'hover:bg-crema'}`}
              >
                <span className={`grid size-7 shrink-0 place-items-center rounded-md border-2 ${activo ? 'border-salvia-600 bg-salvia-600 text-white' : 'border-arena-oscura bg-blanco'}`}>
                  {activo && <Check aria-hidden className="size-5" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
                {p.habitacion && <span className="text-base font-normal text-suave">Hab. {p.habitacion}</span>}
                {!p.activo && <span className="text-sm font-normal text-suave">(de alta)</span>}
              </button>
            </li>
          )
        })}
        {visibles.length === 0 && <li className="p-3 text-suave">No hay pacientes con ese nombre.</li>}
      </ul>
    </div>
  )
}
