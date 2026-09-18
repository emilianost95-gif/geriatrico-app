import { AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

type TipoAviso = 'exito' | 'error'
interface Toast {
  id: number
  tipo: TipoAviso
  texto: string
}

interface ApiAvisos {
  exito: (texto: string) => void
  error: (texto: string) => void
}

const Contexto = createContext<ApiAvisos | null>(null)

/** Mensajes flotantes de éxito / error, grandes y fáciles de leer. */
export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<Toast[]>([])
  const contador = useRef(0)

  const cerrar = useCallback((id: number) => setLista((l) => l.filter((t) => t.id !== id)), [])
  const agregar = useCallback(
    (tipo: TipoAviso, texto: string) => {
      const id = ++contador.current
      setLista((l) => [...l.slice(-2), { id, tipo, texto }])
      // Los errores quedan más tiempo en pantalla
      setTimeout(() => cerrar(id), tipo === 'error' ? 9000 : 4000)
    },
    [cerrar],
  )
  const api = useMemo<ApiAvisos>(() => ({ exito: (t) => agregar('exito', t), error: (t) => agregar('error', t) }), [agregar])

  return (
    <Contexto.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-3">
        {lista.map((t) => {
          const Icono = t.tipo === 'exito' ? CheckCircle2 : AlertTriangle
          return (
            <div
              key={t.id}
              role={t.tipo === 'error' ? 'alert' : 'status'}
              className={`pointer-events-auto flex w-full max-w-lg items-start gap-3 rounded-2xl border-2 p-4 text-lg font-bold shadow-lg ${
                t.tipo === 'exito' ? 'border-exito/30 bg-exito-claro text-exito' : 'border-coral/30 bg-coral-claro text-coral'
              }`}
            >
              <Icono aria-hidden className="mt-0.5 size-7 shrink-0" />
              <p className="flex-1 text-tinta">{t.texto}</p>
              <button type="button" onClick={() => cerrar(t.id)} className="rounded-lg p-1 hover:bg-black/5" aria-label="Cerrar mensaje">
                <X className="size-6" />
              </button>
            </div>
          )
        })}
      </div>
    </Contexto.Provider>
  )
}

export function useAvisos() {
  const c = useContext(Contexto)
  if (!c) throw new Error('useAvisos fuera de ProveedorAvisos')
  return c
}

/** Mensaje amigable a partir de cualquier error. */
export function mensajeDeError(e: unknown): string {
  if (e instanceof Error) {
    if (e.name === 'QuotaExceededError') return 'No queda espacio en el dispositivo para guardar.'
    return e.message
  }
  return 'Ocurrió un error inesperado.'
}
