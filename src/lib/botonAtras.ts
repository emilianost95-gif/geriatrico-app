import { useEffect, useRef } from 'react'
import { esNativo } from './plataforma'

/**
 * Botón "atrás" de Android.
 * Las pantallas pueden "atajarlo" (ej. cerrar una ventana o avisar de cambios sin guardar).
 * Se atiende primero el último que se registró. Si nadie lo ataja: vuelve una pantalla
 * o, si ya está al principio, minimiza la app (sin cerrarla).
 */
type Manejador = () => void
const pila: Manejador[] = []

export async function iniciarBotonAtras() {
  if (!esNativo) return
  const { App } = await import('@capacitor/app')
  await App.addListener('backButton', ({ canGoBack }) => {
    const ultimo = pila.at(-1)
    if (ultimo) ultimo()
    else if (canGoBack) window.history.back()
    else void App.minimizeApp()
  })
}

/** Mientras `activo` sea true, el botón atrás llama a `manejador` en vez de navegar. */
export function useBotonAtras(activo: boolean, manejador: Manejador) {
  const ref = useRef(manejador)
  useEffect(() => {
    ref.current = manejador
  })
  useEffect(() => {
    if (!activo || !esNativo) return
    const fn: Manejador = () => ref.current()
    pila.push(fn)
    return () => {
      const i = pila.lastIndexOf(fn)
      if (i >= 0) pila.splice(i, 1)
    }
  }, [activo])
}
