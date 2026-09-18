import { ClipboardList, FileSpreadsheet, FlaskConical, HeartPulse, House, MessageCircleQuestion, Settings, Users, WifiOff } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router'
import { useAjustes } from '../db/ajustes'
import { esNativo } from '../lib/plataforma'
import { salirDeDemo, useDemo } from '../demo/modoDemo'

const SECCIONES = [
  { a: '/', texto: 'Hoy', icono: House, fin: true },
  { a: '/pacientes', texto: 'Pacientes', icono: Users, fin: false },
  { a: '/registros', texto: 'Registros', icono: ClipboardList, fin: false },
  { a: '/excel', texto: 'Excel', icono: FileSpreadsheet, fin: false },
]

function useEnLinea() {
  const [enLinea, setEnLinea] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setEnLinea(true)
    const off = () => setEnLinea(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return enLinea
}

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const enFormulario = (pathname.startsWith('/registro') && !pathname.startsWith('/registros')) || pathname === '/ronda' || pathname === '/asistente'
  const enLinea = useEnLinea()
  const demo = useDemo()
  const nombreHogar = useAjustes()?.nombreHogar

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="min-h-dvh">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-blanco focus:p-3">
        Saltar al contenido
      </a>
      <header
        className="no-imprimir sticky top-0 z-30 border-b border-salvia-700 bg-salvia-600 text-white shadow-sm"
        // En Android la barra de estado queda encima del encabezado: se deja su espacio
        style={{ paddingTop: 'var(--safe-area-inset-top, env(safe-area-inset-top))' }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5">
          <NavLink to="/" className="flex items-center gap-3 rounded-lg py-1">
            <span className="grid size-11 place-items-center rounded-xl bg-white/15">
              <HeartPulse aria-hidden className="size-7" />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block text-xl font-bold sm:text-2xl">Registro Geriátrico</span>
              {nombreHogar && <span className="block truncate text-sm text-white/85 sm:text-base">{nombreHogar}</span>}
            </span>
          </NavLink>
          <nav aria-label="Principal" className="flex gap-1 max-md:hidden">
            {SECCIONES.map(({ a, texto, icono: Icono, fin }) => (
              <NavLink
                key={a}
                to={a}
                end={fin}
                className={({ isActive }) =>
                  `flex min-h-12 items-center gap-2 rounded-xl px-4 text-lg font-bold transition-colors ${
                    isActive ? 'bg-blanco text-salvia-800' : 'text-white hover:bg-white/15'
                  }`
                }
              >
                <Icono aria-hidden className="size-6" /> {texto}
              </NavLink>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-1 md:ml-[-0.75rem]">
            <NavLink
              to="/asistente"
              aria-label="Preguntale a la app"
              title="Preguntale a la app"
              className={({ isActive }) =>
                `grid size-12 place-items-center rounded-xl transition-colors ${isActive ? 'bg-blanco text-salvia-800' : 'text-white hover:bg-white/15'}`
              }
            >
              <MessageCircleQuestion aria-hidden className="size-7" />
            </NavLink>
            <NavLink
              to="/ajustes"
              aria-label="Ajustes"
              title="Ajustes"
              className={({ isActive }) =>
                `grid size-12 place-items-center rounded-xl transition-colors ${isActive ? 'bg-blanco text-salvia-800' : 'text-white hover:bg-white/15'}`
              }
            >
              <Settings aria-hidden className="size-7" />
            </NavLink>
          </div>
        </div>
        {demo && (
          <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-ambar-claro px-4 py-1.5 text-base font-bold text-ambar">
            <span className="flex items-center gap-2">
              <FlaskConical aria-hidden className="size-5" /> Modo demostración: datos de ejemplo, tus datos reales no se tocan.
            </span>
            <button type="button" onClick={() => void salirDeDemo()} className="min-h-10 rounded-lg border-2 border-ambar/50 px-3 hover:bg-ambar/10">
              Salir de la demo
            </button>
          </p>
        )}
        {!enLinea && !esNativo && (
          <p className="flex items-center justify-center gap-2 bg-ambar-claro px-4 py-1.5 text-base font-bold text-ambar">
            <WifiOff aria-hidden className="size-5" /> Sin internet: la app sigue funcionando y guarda todo en este dispositivo.
          </p>
        )}
      </header>

      <main id="contenido" className={`mx-auto max-w-6xl px-4 pt-6 ${enFormulario ? 'pb-32' : 'con-barra-inferior md:pb-12'}`}>
        {children}
      </main>

      {!enFormulario && (
        <nav
          aria-label="Principal"
          className="no-imprimir fixed inset-x-0 bottom-0 z-30 border-t border-arena bg-papel/95 backdrop-blur md:hidden"
          style={{ paddingBottom: 'var(--safe-area-inset-bottom, env(safe-area-inset-bottom))' }}
        >
          <div className="grid grid-cols-4">
            {SECCIONES.map(({ a, texto, icono: Icono, fin }) => (
              <NavLink
                key={a}
                to={a}
                end={fin}
                className={({ isActive }) =>
                  `flex min-h-18 flex-col items-center justify-center gap-0.5 text-base font-bold ${
                    isActive ? 'text-salvia-700' : 'text-suave'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={`grid h-9 w-14 place-items-center rounded-full ${isActive ? 'bg-salvia-100' : ''}`}>
                      <Icono aria-hidden className="size-7" />
                    </span>
                    {texto}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  )
}

export function Encabezado({ titulo, subtitulo, children }: { titulo: ReactNode; subtitulo?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-3xl sm:text-4xl">{titulo}</h1>
        {subtitulo && <div className="mt-1 text-lg text-suave">{subtitulo}</div>}
      </div>
      {children && <div className="flex flex-wrap gap-3">{children}</div>}
    </div>
  )
}
