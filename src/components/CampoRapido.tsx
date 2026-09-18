import { Check } from 'lucide-react'
import type { DefCampoTexto } from '../domain/campos'
import { normalizar } from '../lib/texto'
import { Envoltura } from './ui'

const SEP = ', '

function partes(valor: string) {
  return valor
    .split(/\s*,\s*/)
    .map((p) => p.trim())
    .filter(Boolean)
}

/**
 * Campo de texto con "opciones rápidas": botones que agregan o quitan
 * una frase del campo con un solo toque. El texto sigue siendo editable.
 */
export function CampoRapido({ def, valor, onCambio }: { def: DefCampoTexto; valor: string; onCambio: (v: string) => void }) {
  const actuales = partes(valor)
  const tiene = (op: string) => actuales.some((p) => normalizar(p) === normalizar(op))

  const alternar = (op: string) => {
    const nuevo = tiene(op) ? actuales.filter((p) => normalizar(p) !== normalizar(op)) : [...actuales, op]
    onCambio(nuevo.join(SEP))
  }

  return (
    <Envoltura etiqueta={def.etiqueta} ayuda={def.ayuda}>
      {(id) => (
        <>
          {def.opciones.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2" role="group" aria-label={`Opciones rápidas de ${def.etiqueta}`}>
              {def.opciones.map((op) => {
                const activa = tiene(op)
                return (
                  <button
                    key={op}
                    type="button"
                    aria-pressed={activa}
                    onClick={() => alternar(op)}
                    className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 px-4 text-base font-bold transition-colors ${
                      activa
                        ? 'border-salvia-600 bg-salvia-600 text-white'
                        : 'border-salvia-200 bg-salvia-50 text-salvia-800 hover:border-salvia-400'
                    }`}
                  >
                    {activa && <Check aria-hidden className="size-4" strokeWidth={3} />}
                    {op}
                  </button>
                )
              })}
            </div>
          )}
          {def.multilinea ? (
            <textarea
              id={id}
              rows={def.clave === 'observaciones' ? 4 : 2}
              value={valor}
              onChange={(e) => onCambio(e.target.value)}
              placeholder={def.opciones.length ? 'Tocá una opción o escribí acá…' : 'Escribí acá…'}
              className="control min-h-20 resize-y py-3 leading-snug"
            />
          ) : (
            <input
              id={id}
              value={valor}
              onChange={(e) => onCambio(e.target.value)}
              placeholder="Tocá una opción o escribí acá…"
              className="control"
            />
          )}
        </>
      )}
    </Envoltura>
  )
}
