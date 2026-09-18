import type { FechaISO } from '../domain/tipos'
import { hoyISO, sumarDias } from '../lib/fechas'

export interface RangoFechas {
  desde: FechaISO
  hasta: FechaISO
}

export type Atajo = 'hoy' | 'semana' | 'mes' | 'todo'

export function rangoDeAtajo(a: Atajo): RangoFechas {
  const hoy = hoyISO()
  switch (a) {
    case 'hoy':
      return { desde: hoy, hasta: hoy }
    case 'semana':
      return { desde: sumarDias(hoy, -6), hasta: hoy }
    case 'mes':
      return { desde: sumarDias(hoy, -29), hasta: hoy }
    case 'todo':
      return { desde: '', hasta: '' }
  }
}

const ATAJOS: { a: Atajo; texto: string }[] = [
  { a: 'hoy', texto: 'Hoy' },
  { a: 'semana', texto: 'Últimos 7 días' },
  { a: 'mes', texto: 'Últimos 30 días' },
  { a: 'todo', texto: 'Todo' },
]

export function FiltroFechas({ valor, onCambio }: { valor: RangoFechas; onCambio: (r: RangoFechas) => void }) {
  const activo = ATAJOS.find(({ a }) => {
    const r = rangoDeAtajo(a)
    return r.desde === valor.desde && r.hasta === valor.hasta
  })?.a

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Período rápido">
        {ATAJOS.map(({ a, texto }) => (
          <button
            key={a}
            type="button"
            aria-pressed={activo === a}
            onClick={() => onCambio(rangoDeAtajo(a))}
            className={`min-h-12 rounded-full border-2 px-4 text-base font-bold transition-colors ${
              activo === a ? 'border-salvia-600 bg-salvia-600 text-white' : 'border-salvia-200 bg-blanco text-salvia-800 hover:border-salvia-400'
            }`}
          >
            {texto}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="filtro-desde" className="etiqueta">Desde</label>
          <input
            id="filtro-desde"
            type="date"
            value={valor.desde}
            max={valor.hasta || undefined}
            onChange={(e) => onCambio({ ...valor, desde: e.target.value })}
            className="control"
          />
        </div>
        <div>
          <label htmlFor="filtro-hasta" className="etiqueta">Hasta</label>
          <input
            id="filtro-hasta"
            type="date"
            value={valor.hasta}
            min={valor.desde || undefined}
            onChange={(e) => onCambio({ ...valor, hasta: e.target.value })}
            className="control"
          />
        </div>
      </div>
    </div>
  )
}
