import { Clock, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { DEF_TOMA, fueraDeNormal } from '../domain/campos'
import type { TomaSignos } from '../domain/tipos'
import { horaActual } from '../lib/fechas'

type CampoNum = keyof typeof DEF_TOMA

/** Input numérico que acepta coma o punto y no pierde lo que se está escribiendo ("36,"). */
export function CampoNumero({ campo, valor, onCambio, contexto }: { campo: CampoNum; valor?: number; onCambio: (v?: number) => void; contexto?: string }) {
  const def = DEF_TOMA[campo]
  const [texto, setTexto] = useState(valor == null ? '' : String(valor).replace('.', ','))
  const [ultimo, setUltimo] = useState(valor)
  // Si el valor cambia desde afuera (cargar otro registro), se actualiza el texto
  if (valor !== ultimo) {
    setUltimo(valor)
    setTexto(valor == null ? '' : String(valor).replace('.', ','))
  }
  const imposible = valor != null && (valor < def.min || valor > def.max)
  const raro = !imposible && fueraDeNormal(campo, valor)
  const idInput = useId()

  return (
    <div className="min-w-0">
      <label htmlFor={idInput} className="mb-1 flex flex-wrap items-baseline justify-between gap-x-1 text-base font-bold leading-tight text-salvia-900">
        <span>{def.formulario}</span>
        <span className="whitespace-nowrap text-sm font-normal text-suave">{def.unidad}</span>
      </label>
      <div>
        <input
          id={idInput}
          aria-label={`${def.etiqueta} (${def.unidad})${contexto ? ` de ${contexto}` : ''}`}
          inputMode={def.decimales ? 'decimal' : 'numeric'}
          autoComplete="off"
          value={texto}
          onChange={(e) => {
            const t = e.target.value.replace(/[^\d.,]/g, '')
            setTexto(t)
            const n = t === '' ? undefined : Number(t.replace(',', '.'))
            const v = n == null || Number.isNaN(n) ? undefined : n
            setUltimo(v)
            onCambio(v)
          }}
          aria-invalid={imposible}
          className={`control px-3 text-xl font-bold tabular-nums ${
            imposible ? 'border-coral bg-coral-claro' : raro ? 'border-ambar/60 bg-ambar-claro' : ''
          }`}
        />
      </div>
      {imposible && <p className="mt-1 text-sm font-bold text-coral">¿Seguro? Es un valor muy raro</p>}
      {raro && <p className="mt-1 text-sm font-bold text-ambar">Fuera de lo normal</p>}
    </div>
  )
}

interface Props {
  toma: TomaSignos
  numero: number
  onCambio: (t: TomaSignos) => void
  onQuitar: () => void
}

export function EditorToma({ toma, numero, onCambio, onQuitar }: Props) {
  const set = (campo: keyof TomaSignos, v: unknown) => onCambio({ ...toma, [campo]: v })
  const idHora = `hora-${toma.id}`

  return (
    <fieldset className="min-w-0 rounded-2xl border-2 border-salvia-200 bg-salvia-50/60 p-4">
      <legend className="sr-only">Toma {numero}</legend>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-xl font-bold text-salvia-900">
          <span className="grid size-10 place-items-center rounded-full bg-salvia-600 text-lg text-white" aria-hidden>
            {numero}
          </span>
          Toma {numero}
        </p>
        <button
          type="button"
          onClick={onQuitar}
          className="flex min-h-12 items-center gap-2 rounded-xl px-3 text-base font-bold text-coral hover:bg-coral-claro"
        >
          <Trash2 aria-hidden className="size-5" /> Quitar
        </button>
      </div>
      <div className="mb-4">
            <label htmlFor={idHora} className="mb-1 block text-base font-bold text-salvia-900">
              Hora
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id={idHora}
                type="time"
                value={toma.hora ?? ''}
                onChange={(e) => set('hora', e.target.value || undefined)}
                className="control w-44 shrink-0 text-xl font-bold"
              />
              <button
                type="button"
                onClick={() => set('hora', horaActual())}
                className="flex min-h-14 items-center gap-1 rounded-xl px-3 text-base font-bold text-salvia-700 hover:bg-salvia-100"
              >
                <Clock aria-hidden className="size-5" /> Ahora
              </button>
            </div>
      </div>

      {/* Presión arterial: máxima / mínima juntas */}
      <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <div className="col-span-2 grid grid-cols-2 gap-3 rounded-xl bg-white/70 p-2 sm:col-span-3 lg:col-span-2">
          <p className="col-span-2 px-1 text-base font-bold text-salvia-800">Presión arterial</p>
          <CampoNumero campo="sistolica" valor={toma.sistolica} onCambio={(v) => set('sistolica', v)} />
          <CampoNumero campo="diastolica" valor={toma.diastolica} onCambio={(v) => set('diastolica', v)} />
        </div>
        <CampoNumero campo="frecuenciaCardiaca" valor={toma.frecuenciaCardiaca} onCambio={(v) => set('frecuenciaCardiaca', v)} />
        <CampoNumero campo="temperatura" valor={toma.temperatura} onCambio={(v) => set('temperatura', v)} />
        <CampoNumero campo="saturacion" valor={toma.saturacion} onCambio={(v) => set('saturacion', v)} />
        <CampoNumero campo="frecuenciaRespiratoria" valor={toma.frecuenciaRespiratoria} onCambio={(v) => set('frecuenciaRespiratoria', v)} />
        <CampoNumero campo="glucemia" valor={toma.glucemia} onCambio={(v) => set('glucemia', v)} />
      </div>
      <div className="mt-3">
        <label htmlFor={`nota-${toma.id}`} className="mb-1 block text-base font-bold text-salvia-900">
          Nota de esta toma <span className="font-normal text-suave">(opcional)</span>
        </label>
        <input
          id={`nota-${toma.id}`}
          value={toma.nota ?? ''}
          onChange={(e) => set('nota', e.target.value)}
          placeholder="Ej.: después de almorzar, con dolor…"
          className="control"
        />
      </div>
    </fieldset>
  )
}
