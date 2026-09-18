/**
 * Modo demostración: llena una base aparte ("geriatrico-demo") con un hogar de ejemplo
 * para mostrar la app sin tocar los datos reales. Al salir, la base de demo se borra.
 * Las fechas se arman a partir del día en que se enciende, así siempre hay datos "de hoy".
 */
import { useEffect, useState } from 'react'
import { dbDemo, usarBase } from '../db/database'
import type { Alimentacion, Paciente, Registro, TomaSignos } from '../domain/tipos'
import { hoyISO, sumarDias } from '../lib/fechas'
import { claveNombre } from '../lib/texto'

const CLAVE = 'modo-demo'
const oyentes = new Set<() => void>()
let activo = false

export const demoActivo = () => activo

function avisar() {
  for (const o of oyentes) o()
}

/** Números que parecen tomados a mano pero siempre iguales para el mismo día */
function pseudoAzar(semilla: number) {
  let x = semilla
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648
    return x / 2147483648
  }
}

interface Perfil {
  nombre: string
  habitacion: string
  documento?: string
  contacto?: string
  notas?: string
  nacimiento: string
  base: { sis: number; dia: number; fc: number; temp: number; sat: number; gluc?: number }
  /** Qué le pasa hoy, para que la demo tenga alertas de verdad */
  hoy?: 'fiebre' | 'saturacion' | 'presion' | 'glucemia' | 'sinRegistro'
}

const PERFILES: Perfil[] = [
  { nombre: 'Ana Díaz', habitacion: '1', documento: '5.123.456-7', contacto: 'Laura (hija) 9 1234 5678', notas: 'Hipertensa. Dieta hiposódica.', nacimiento: '1938-05-03', base: { sis: 128, dia: 80, fc: 72, temp: 36.5, sat: 96 } },
  { nombre: 'Luis Soto', habitacion: '2', documento: '4.987.654-3', contacto: 'Pedro (hijo) 9 8765 4321', notas: 'Diabético. Control de glucemia 2 veces por día.', nacimiento: '1941-11-21', base: { sis: 134, dia: 84, fc: 76, temp: 36.6, sat: 95, gluc: 150 }, hoy: 'glucemia' },
  { nombre: 'Rosa Fernández', habitacion: '3', contacto: 'Carmen (sobrina) 9 5555 1111', notas: 'Escara en talón izquierdo, curación diaria.', nacimiento: '1940-08-30', base: { sis: 118, dia: 74, fc: 68, temp: 36.3, sat: 97 } },
  { nombre: 'Elena Morales', habitacion: '4', documento: '6.222.333-4', contacto: 'Jorge (hijo) 9 2222 3333', nacimiento: '1943-02-14', base: { sis: 126, dia: 78, fc: 74, temp: 36.4, sat: 96 } },
  { nombre: 'Héctor Ruiz', habitacion: '5', contacto: 'Marta (esposa) 9 4444 5555', notas: 'EPOC. Oxígeno por las noches.', nacimiento: '1936-07-09', base: { sis: 140, dia: 86, fc: 80, temp: 36.7, sat: 93 }, hoy: 'fiebre' },
  { nombre: 'Olga Castro', habitacion: '6', nacimiento: '1945-12-01', base: { sis: 112, dia: 70, fc: 66, temp: 36.2, sat: 97 } },
  { nombre: 'Ramón Vega', habitacion: '7', contacto: 'Sofía (nieta) 9 7777 8888', notas: 'Usa andador. Riesgo de caídas.', nacimiento: '1939-03-25', base: { sis: 130, dia: 82, fc: 78, temp: 36.5, sat: 94 }, hoy: 'saturacion' },
  { nombre: 'Teresa Paz', habitacion: '8', documento: '6.555.444-1', contacto: 'Ana (hija) 9 9999 0000', nacimiento: '1942-09-17', base: { sis: 124, dia: 76, fc: 70, temp: 36.4, sat: 96, gluc: 120 } },
  { nombre: 'Juan Carlos Pérez', habitacion: '9', notas: 'Sonda vesical permanente.', nacimiento: '1937-06-11', base: { sis: 136, dia: 84, fc: 74, temp: 36.6, sat: 95 }, hoy: 'sinRegistro' },
]

const SUENO = ['Durmió bien', 'Durmió bien, sin despertares', 'Se despertó una vez', 'Durmió poco']
const COMPORTAMIENTO = ['Tranquila, orientada', 'Tranquilo, orientado', 'Participó del taller de memoria', 'Algo desorientado a la tarde']
const OBS = ['', '', '', 'Visita de la familia por la tarde.', 'Se lo notó más animado.', 'Caminó por el patio con ayuda.']

function toma(hora: string, p: Perfil, r: () => number, forzar?: Perfil['hoy']): TomaSignos {
  const v = (base: number, rango: number) => Math.round(base + (r() - 0.5) * rango)
  const t: TomaSignos = {
    id: `${hora}-${Math.round(r() * 1e9).toString(36)}`,
    hora,
    sistolica: v(p.base.sis, 16),
    diastolica: v(p.base.dia, 10),
    frecuenciaCardiaca: v(p.base.fc, 10),
    temperatura: Math.round((p.base.temp + (r() - 0.5) * 0.6) * 10) / 10,
    saturacion: v(p.base.sat, 4),
  }
  if (p.base.gluc) t.glucemia = v(p.base.gluc, 40)
  if (forzar === 'fiebre') t.temperatura = 38.2
  if (forzar === 'saturacion') t.saturacion = 88
  if (forzar === 'presion') t.sistolica = 182
  if (forzar === 'glucemia' && p.base.gluc) t.glucemia = 312
  return t
}

function registrosDe(p: Perfil, pacienteId: number, dias: number, hoy: string): Omit<Registro, 'id'>[] {
  const r = pseudoAzar(pacienteId * 7919 + 13)
  const salida: Omit<Registro, 'id'>[] = []
  for (let i = dias - 1; i >= 0; i--) {
    const fecha = sumarDias(hoy, -i)
    if (p.hoy === 'sinRegistro' && i < 3) continue // queda "sin registro" para que la demo muestre pendientes
    const esHoy = i === 0
    const negativa = r() < 0.12
    const alimentacion: Alimentacion = negativa
      ? { estado: 'negativa', comentario: 'Rechazó la cena' }
      : { estado: 'positiva', comentario: r() < 0.2 ? 'Comió todo' : undefined }
    const tomas = [toma('08:00', p, r, esHoy ? p.hoy : undefined), toma('20:00', p, r)]
    if (esHoy) tomas.pop() // el turno de la noche todavía no se cargó
    salida.push({
      pacienteId,
      fecha,
      tomas,
      alimentacion,
      diuresis: r() < 0.15 ? 'Escasa' : 'Normal',
      catarsis: r() < 0.3 ? 'No hizo' : 'Sí, normal',
      sondaVesical: p.notas?.includes('Sonda') ? 'Permeable, orina clara' : 'No usa',
      curaciones: p.notas?.includes('Escara') ? 'Curación con apósito, mejorando' : '',
      rotacion: 'Cada 2 horas',
      ejercicio: r() < 0.5 ? 'Caminó por el pasillo' : 'Ejercicios en la silla',
      sueno: SUENO[Math.floor(r() * SUENO.length)],
      comportamiento: COMPORTAMIENTO[Math.floor(r() * COMPORTAMIENTO.length)],
      observaciones: OBS[Math.floor(r() * OBS.length)],
      creadoEn: Date.now(),
      actualizadoEn: Date.now(),
    })
  }
  return salida
}

/** Borra la demo anterior y arma un hogar nuevo con 9 residentes y 21 días de registros. */
export async function prepararDemo(hoy = hoyISO()) {
  await dbDemo.open()
  await dbDemo.transaction('rw', dbDemo.pacientes, dbDemo.registros, dbDemo.ajustes, async () => {
    await Promise.all([dbDemo.pacientes.clear(), dbDemo.registros.clear(), dbDemo.ajustes.clear()])
    const pacientes: Omit<Paciente, 'id'>[] = PERFILES.map((p) => ({
      nombre: p.nombre,
      nombreClave: claveNombre(p.nombre),
      habitacion: p.habitacion,
      documento: p.documento,
      fechaNacimiento: p.nacimiento,
      contacto: p.contacto,
      notas: p.notas,
      activo: true,
      creadoEn: Date.now(),
      actualizadoEn: Date.now(),
    }))
    const ids = await dbDemo.pacientes.bulkAdd(pacientes as Paciente[], { allKeys: true })
    const registros = PERFILES.flatMap((p, i) => registrosDe(p, ids[i] as number, 21, hoy))
    await dbDemo.registros.bulkAdd(registros as Registro[])
    await dbDemo.ajustes.put({ clave: 'nombreHogar', valor: 'Residencia Las Camelias (demo)' })
  })
}

/** Enciende la demo: prepara los datos y pasa la app a la base de demostración. */
export async function entrarEnDemo() {
  await prepararDemo()
  usarBase('demo')
  activo = true
  try {
    sessionStorage.setItem(CLAVE, '1')
  } catch {
    /* sin sessionStorage la demo igual funciona, solo no sobrevive a un refresco */
  }
  avisar()
}

/** Apaga la demo, vuelve a los datos reales y borra todo lo de la demostración. */
export async function salirDeDemo() {
  usarBase('real')
  activo = false
  try {
    sessionStorage.removeItem(CLAVE)
  } catch {
    /* nada que limpiar */
  }
  avisar()
  await dbDemo.delete().catch(() => {})
}

/** Si se recarga la página con la demo encendida, la vuelve a dejar activa. */
export async function restaurarDemoSiCorresponde() {
  try {
    if (sessionStorage.getItem(CLAVE) !== '1') return false
  } catch {
    return false
  }
  usarBase('demo')
  activo = true
  const vacia = (await dbDemo.pacientes.count()) === 0
  if (vacia) await prepararDemo()
  avisar()
  return true
}

export function useDemo() {
  const [, forzar] = useState(0)
  useEffect(() => {
    const o = () => forzar((n) => n + 1)
    oyentes.add(o)
    return () => {
      oyentes.delete(o)
    }
  }, [])
  return activo
}
