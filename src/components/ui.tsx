import type { LucideIcon } from 'lucide-react'
import { useId, type ButtonHTMLAttributes, type Ref, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Link, type LinkProps } from 'react-router'

// ─────────────────────────── Botones ───────────────────────────

type Variante = 'principal' | 'secundario' | 'peligro' | 'peligroLleno' | 'suave' | 'exito'

const VARIANTES: Record<Variante, string> = {
  principal: 'bg-salvia-600 text-white hover:bg-salvia-700 active:bg-salvia-800 shadow-sm',
  secundario: 'bg-blanco text-salvia-800 border-2 border-salvia-300 hover:bg-salvia-50 active:bg-salvia-100',
  peligro: 'bg-blanco text-coral border-2 border-coral/40 hover:bg-coral-claro active:bg-coral-claro',
  peligroLleno: 'bg-coral text-white hover:brightness-110 shadow-sm',
  suave: 'bg-transparent text-salvia-800 hover:bg-salvia-100 active:bg-salvia-200',
  exito: 'bg-exito text-white hover:brightness-110 shadow-sm',
}

function clasesBoton(variante: Variante, grande?: boolean, ancho?: boolean) {
  return [
    'inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-colors select-none',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    grande ? 'min-h-16 px-6 text-xl' : 'min-h-14 px-5 text-lg',
    ancho ? 'w-full' : '',
    VARIANTES[variante],
  ].join(' ')
}

interface PropsBoton extends ButtonHTMLAttributes<HTMLButtonElement> {
  ref?: Ref<HTMLButtonElement>
  variante?: Variante
  icono?: LucideIcon
  grande?: boolean
  ancho?: boolean
}

export function Boton({ variante = 'principal', icono: Icono, grande, ancho, className = '', children, type = 'button', ...resto }: PropsBoton) {
  return (
    <button type={type} className={`${clasesBoton(variante, grande, ancho)} ${className}`} {...resto}>
      {Icono && <Icono aria-hidden className={`shrink-0 ${grande ? 'size-7' : 'size-6'}`} strokeWidth={2.2} />}
      {children}
    </button>
  )
}

interface PropsBotonLink extends LinkProps {
  variante?: Variante
  icono?: LucideIcon
  grande?: boolean
  ancho?: boolean
}

export function BotonLink({ variante = 'principal', icono: Icono, grande, ancho, className = '', children, ...resto }: PropsBotonLink) {
  return (
    <Link className={`${clasesBoton(variante, grande, ancho)} ${className}`} {...resto}>
      {Icono && <Icono aria-hidden className={`shrink-0 ${grande ? 'size-7' : 'size-6'}`} strokeWidth={2.2} />}
      {children}
    </Link>
  )
}

// ─────────────────────────── Campos ───────────────────────────

interface PropsEnvoltura {
  etiqueta: string
  ayuda?: ReactNode
  error?: string
  obligatorio?: boolean
  children: (id: string) => ReactNode
  className?: string
}

export function Envoltura({ etiqueta, ayuda, error, obligatorio, children, className = '' }: PropsEnvoltura) {
  const id = useId()
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={id} className="etiqueta">
        {etiqueta}
        {obligatorio && <span className="text-coral"> *</span>}
      </label>
      {children(id)}
      {ayuda && !error && <p className="mt-1 text-base text-suave">{ayuda}</p>}
      {error && (
        <p role="alert" className="mt-1 text-base font-bold text-coral">
          {error}
        </p>
      )}
    </div>
  )
}

type PropsCampo = InputHTMLAttributes<HTMLInputElement> & {
  etiqueta: string
  ayuda?: ReactNode
  error?: string
  ref?: Ref<HTMLInputElement>
}

export function Campo({ etiqueta, ayuda, error, className = '', required, ...resto }: PropsCampo) {
  return (
    <Envoltura etiqueta={etiqueta} ayuda={ayuda} error={error} obligatorio={required} className={className}>
      {(id) => <input id={id} required={required} aria-invalid={!!error} className="control" {...resto} />}
    </Envoltura>
  )
}

type PropsArea = TextareaHTMLAttributes<HTMLTextAreaElement> & { etiqueta: string; ayuda?: ReactNode }

export function AreaTexto({ etiqueta, ayuda, className = '', rows = 3, ...resto }: PropsArea) {
  return (
    <Envoltura etiqueta={etiqueta} ayuda={ayuda} className={className}>
      {(id) => <textarea id={id} rows={rows} className="control min-h-24 resize-y py-3 leading-snug" {...resto} />}
    </Envoltura>
  )
}

type PropsSelector = SelectHTMLAttributes<HTMLSelectElement> & { etiqueta: string; ayuda?: ReactNode }

export function Selector({ etiqueta, ayuda, className = '', children, ...resto }: PropsSelector) {
  return (
    <Envoltura etiqueta={etiqueta} ayuda={ayuda} className={className}>
      {(id) => (
        <select id={id} className="control cursor-pointer pr-10" {...resto}>
          {children}
        </select>
      )}
    </Envoltura>
  )
}

// ─────────────────────────── Otros ───────────────────────────

type Tono = 'exito' | 'peligro' | 'aviso' | 'info' | 'neutro' | 'marca'

const TONOS: Record<Tono, string> = {
  exito: 'bg-exito-claro text-exito border-exito/25',
  peligro: 'bg-coral-claro text-coral border-coral/25',
  aviso: 'bg-ambar-claro text-ambar border-ambar/25',
  info: 'bg-cielo-claro text-cielo border-cielo/25',
  neutro: 'bg-arena/50 text-suave border-arena-oscura/50',
  marca: 'bg-salvia-100 text-salvia-800 border-salvia-200',
}

export function Insignia({ tono = 'neutro', children, icono: Icono }: { tono?: Tono; children: ReactNode; icono?: LucideIcon }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-3 py-0.5 text-base font-bold ${TONOS[tono]}`}>
      {Icono && <Icono aria-hidden className="size-4" strokeWidth={2.5} />}
      {children}
    </span>
  )
}

export function Aviso({ tono = 'info', titulo, children, icono: Icono }: { tono?: Tono; titulo?: string; children?: ReactNode; icono?: LucideIcon }) {
  return (
    <div role={tono === 'peligro' ? 'alert' : 'status'} className={`flex gap-3 rounded-xl border-2 p-4 ${TONOS[tono]}`}>
      {Icono && <Icono aria-hidden className="mt-0.5 size-6 shrink-0" />}
      <div className="min-w-0 text-tinta">
        {titulo && <p className="font-bold">{titulo}</p>}
        {children && <div className="text-base">{children}</div>}
      </div>
    </div>
  )
}

export function Seccion({ titulo, icono: Icono, children, accion, className = '' }: { titulo: string; icono?: LucideIcon; children: ReactNode; accion?: ReactNode; className?: string }) {
  return (
    <section className={`tarjeta p-5 sm:p-6 ${className}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-2xl">
          {Icono && (
            <span className="grid size-10 place-items-center rounded-xl bg-salvia-100 text-salvia-700">
              <Icono aria-hidden className="size-6" />
            </span>
          )}
          {titulo}
        </h2>
        {accion}
      </div>
      {children}
    </section>
  )
}

export function EstadoVacio({ icono: Icono, titulo, texto, children }: { icono: LucideIcon; titulo: string; texto?: string; children?: ReactNode }) {
  return (
    <div className="tarjeta flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-4 grid size-20 place-items-center rounded-full bg-salvia-100 text-salvia-600">
        <Icono aria-hidden className="size-10" />
      </span>
      <h2 className="text-2xl">{titulo}</h2>
      {texto && <p className="mt-2 max-w-md text-lg text-suave">{texto}</p>}
      {children && <div className="mt-6 flex flex-wrap justify-center gap-3">{children}</div>}
    </div>
  )
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-lg text-suave" role="status">
      <span className="size-7 animate-spin rounded-full border-4 border-salvia-200 border-t-salvia-600" />
      {texto}
    </div>
  )
}

/** Selector de dos opciones con botones grandes (ej. Tarjetas / Tabla) */
export function Alternador<T extends string>({ valor, opciones, onCambio, etiqueta }: {
  valor: T
  opciones: { valor: T; texto: string; icono?: LucideIcon }[]
  onCambio: (v: T) => void
  etiqueta: string
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="inline-flex max-w-full flex-wrap rounded-xl border-2 border-arena-oscura bg-blanco p-1">
      {opciones.map((o) => {
        const activo = o.valor === valor
        const Icono = o.icono
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => onCambio(o.valor)}
            className={`flex min-h-11 grow items-center justify-center gap-1.5 rounded-lg px-3 text-base font-bold transition-colors sm:gap-2 sm:px-4 ${
              activo ? 'bg-salvia-600 text-white' : 'text-salvia-800 hover:bg-salvia-50'
            }`}
          >
            {Icono && <Icono aria-hidden className="size-5 shrink-0" />}
            {o.texto}
          </button>
        )
      })}
    </div>
  )
}
