import { AlertTriangle, HelpCircle } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useBotonAtras } from '../lib/botonAtras'
import { Boton } from './ui'

interface OpcionesConfirmar {
  titulo: string
  mensaje?: ReactNode
  textoConfirmar?: string
  textoCancelar?: string
  peligro?: boolean
}

export interface OpcionElegir<T extends string> {
  valor: T
  texto: string
  variante?: 'principal' | 'secundario' | 'peligroLleno'
}

interface OpcionesElegir<T extends string> {
  titulo: string
  mensaje?: ReactNode
  opciones: OpcionElegir<T>[]
  peligro?: boolean
}

type FnConfirmar = (o: OpcionesConfirmar) => Promise<boolean>
type FnElegir = <T extends string>(o: OpcionesElegir<T>) => Promise<T | null>

const Contexto = createContext<{ confirmar: FnConfirmar; elegir: FnElegir } | null>(null)

interface Dialogo {
  titulo: string
  mensaje?: ReactNode
  peligro?: boolean
  opciones: OpcionElegir<string>[]
  textoCancelar?: string
}

/**
 * Ventanas de confirmación propias (en vez de window.confirm) con botones grandes.
 * - confirmar(): Sí / No
 * - elegir(): varias opciones + Cancelar (cerrar la ventana siempre es "cancelar")
 */
export function ProveedorConfirmar({ children }: { children: ReactNode }) {
  const [abierto, setAbierto] = useState<Dialogo | null>(null)
  const resolver = useRef<(v: string | null) => void>(undefined)
  const botonCancelar = useRef<HTMLButtonElement>(null)

  const abrir = useCallback((d: Dialogo) => {
    setAbierto(d)
    return new Promise<string | null>((res) => {
      resolver.current = res
    })
  }, [])

  const confirmar = useCallback<FnConfirmar>(
    async (o) => {
      const r = await abrir({
        titulo: o.titulo,
        mensaje: o.mensaje,
        peligro: o.peligro,
        opciones: [{ valor: 'si', texto: o.textoConfirmar ?? 'Aceptar', variante: o.peligro ? 'peligroLleno' : 'principal' }],
        textoCancelar: o.textoCancelar,
      })
      return r === 'si'
    },
    [abrir],
  )

  const elegir = useCallback<FnElegir>(
    (o) => abrir({ titulo: o.titulo, mensaje: o.mensaje, peligro: o.peligro, opciones: o.opciones }) as never,
    [abrir],
  )

  const responder = useCallback((v: string | null) => {
    resolver.current?.(v)
    resolver.current = undefined
    setAbierto(null)
  }, [])

  useBotonAtras(!!abierto, () => responder(null))

  useEffect(() => {
    if (!abierto) return
    // Foco en "Cancelar": la opción segura
    botonCancelar.current?.focus()
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && responder(null)
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [abierto, responder])

  const Icono = abierto?.peligro ? AlertTriangle : HelpCircle
  const textoCancelar = abierto?.textoCancelar ?? 'Cancelar'
  return (
    <Contexto.Provider value={{ confirmar, elegir }}>
      {children}
      {abierto && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-tinta/50 p-3 sm:items-center" onClick={() => responder(null)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirmar-titulo"
            className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl bg-papel p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex gap-4">
              <span className={`grid size-14 shrink-0 place-items-center rounded-full ${abierto.peligro ? 'bg-coral-claro text-coral' : 'bg-salvia-100 text-salvia-700'}`}>
                <Icono aria-hidden className="size-8" />
              </span>
              <div className="min-w-0">
                <h2 id="confirmar-titulo" className="text-2xl">
                  {abierto.titulo}
                </h2>
                {abierto.mensaje && <div className="mt-2 text-lg text-suave">{abierto.mensaje}</div>}
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
              <Boton ref={botonCancelar} variante="secundario" onClick={() => responder(null)}>
                {textoCancelar}
              </Boton>
              {abierto.opciones.map((o) => (
                <Boton key={o.valor} variante={o.variante ?? 'principal'} onClick={() => responder(o.valor)}>
                  {o.texto}
                </Boton>
              ))}
            </div>
          </div>
        </div>
      )}
    </Contexto.Provider>
  )
}

export function useConfirmar() {
  const c = useContext(Contexto)
  if (!c) throw new Error('useConfirmar fuera de ProveedorConfirmar')
  return c.confirmar
}

export function useElegir() {
  const c = useContext(Contexto)
  if (!c) throw new Error('useElegir fuera de ProveedorConfirmar')
  return c.elegir
}
