import { useState } from 'react'

/** Estado que se recuerda en este dispositivo (ej. vista tarjetas/tabla). */
export function usePreferencia<T extends string>(clave: string, inicial: T): [T, (v: T) => void] {
  const [valor, setValor] = useState<T>(() => {
    try {
      return (localStorage.getItem(`pref:${clave}`) as T | null) ?? inicial
    } catch {
      return inicial
    }
  })
  const guardar = (v: T) => {
    setValor(v)
    try {
      localStorage.setItem(`pref:${clave}`, v)
    } catch {
      /* sin almacenamiento: solo en memoria */
    }
  }
  return [valor, guardar]
}
