/**
 * Temas de color. La preferencia es de cada dispositivo (localStorage),
 * no se guarda en la base ni viaja en las copias de seguridad.
 * Los colores viven en src/index.css: acá solo se elige cuál se aplica.
 */
import { useEffect, useState } from 'react'

export type Tema = 'auto' | 'claro' | 'oscuro' | 'azul' | 'contraste'
/** El tema que finalmente se pinta (auto se resuelve según el sistema) */
export type TemaAplicado = Exclude<Tema, 'auto'>

export const TEMAS: { valor: Tema; texto: string; ayuda: string }[] = [
  { valor: 'auto', texto: 'Automático', ayuda: 'Sigue lo que tenga configurado el teléfono o la computadora.' },
  { valor: 'claro', texto: 'Claro', ayuda: 'Verde salvia sobre fondo crema. El de siempre.' },
  { valor: 'oscuro', texto: 'Oscuro', ayuda: 'Fondos oscuros: molesta menos de noche.' },
  { valor: 'azul', texto: 'Azul sereno', ayuda: 'Los mismos tamaños, en tonos azules.' },
  { valor: 'contraste', texto: 'Alto contraste', ayuda: 'Blanco y negro, bordes gruesos. Para ver mejor.' },
]

const CLAVE = 'tema'
const COLOR_BARRA: Record<TemaAplicado, string> = {
  claro: '#3f6b5c',
  oscuro: '#34594c',
  azul: '#2f5f94',
  contraste: '#0f3526',
}

const oyentes = new Set<() => void>()
let actual: Tema = 'auto'

export function leerTema(): Tema {
  try {
    const v = localStorage.getItem(CLAVE)
    if (v === 'claro' || v === 'oscuro' || v === 'azul' || v === 'contraste' || v === 'auto') return v
  } catch {
    /* modo incógnito o storage bloqueado: queda en automático */
  }
  return 'auto'
}

function prefiereOscuro(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
}

export function temaAplicado(t: Tema = actual): TemaAplicado {
  return t === 'auto' ? (prefiereOscuro() ? 'oscuro' : 'claro') : t
}

function pintar() {
  const aplicado = temaAplicado()
  document.documentElement.dataset.tema = aplicado
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLOR_BARRA[aplicado])
  for (const o of oyentes) o()
}

/** Se llama una sola vez al arrancar la app (antes de dibujar, para que no parpadee). */
export function iniciarTema() {
  actual = leerTema()
  pintar()
  if (typeof matchMedia === 'function') {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (actual === 'auto') pintar()
    })
  }
}

export function guardarTema(t: Tema) {
  actual = t
  try {
    localStorage.setItem(CLAVE, t)
  } catch {
    /* si no se puede guardar, al menos se aplica en esta sesión */
  }
  pintar()
}

/** Tema elegido + el que se está viendo. Re-dibuja los componentes cuando cambia. */
export function useTema(): { tema: Tema; aplicado: TemaAplicado; cambiar: (t: Tema) => void } {
  const [, forzar] = useState(0)
  useEffect(() => {
    const o = () => forzar((n) => n + 1)
    oyentes.add(o)
    return () => {
      oyentes.delete(o)
    }
  }, [])
  return { tema: actual, aplicado: temaAplicado(), cambiar: guardarTema }
}

/** Lee un color del tema actual (para dibujar los gráficos en SVG). */
export function colorDelTema(nombre: string, respaldo: string): string {
  if (typeof getComputedStyle !== 'function') return respaldo
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--color-${nombre}`).trim()
  return v || respaldo
}
