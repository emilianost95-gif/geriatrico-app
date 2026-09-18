import { lazy, Suspense, useEffect, useState } from 'react'
import { Route, Routes } from 'react-router'
import { mensajeDeError, ProveedorAvisos, useAvisos } from './components/Avisos'
import { ProveedorConfirmar } from './components/Confirmar'
import { Layout } from './components/Layout'
import { BotonLink, Cargando, EstadoVacio } from './components/ui'
import { PaginaHoy } from './pages/Hoy'
import { PaginaPacientes } from './pages/Pacientes'
import { PaginaRegistroForm } from './pages/RegistroForm'
import { SearchX } from 'lucide-react'
import { esNativo } from './lib/plataforma'
import { restaurarDemoSiCorresponde, useDemo } from './demo/modoDemo'

// Estas páginas se cargan cuando se usan (ExcelJS es pesado)
const PaginaPaciente = lazy(() => import('./pages/Paciente').then((m) => ({ default: m.PaginaPaciente })))
const PaginaPacienteForm = lazy(() => import('./pages/PacienteForm').then((m) => ({ default: m.PaginaPacienteForm })))
const PaginaRegistros = lazy(() => import('./pages/Registros').then((m) => ({ default: m.PaginaRegistros })))
const PaginaExcel = lazy(() => import('./pages/Excel').then((m) => ({ default: m.PaginaExcel })))
const PaginaRonda = lazy(() => import('./pages/Ronda').then((m) => ({ default: m.PaginaRonda })))
const PaginaAsistente = lazy(() => import('./pages/Asistente').then((m) => ({ default: m.PaginaAsistente })))
const PaginaAjustes = lazy(() => import('./pages/Ajustes').then((m) => ({ default: m.PaginaAjustes })))

/** En el APK: copia de seguridad automática al abrir la app (una por día). */
function CopiaAutomatica() {
  const avisos = useAvisos()
  useEffect(() => {
    if (!esNativo) return
    const hacer = () =>
      import('./lib/copias')
        .then((m) => m.copiaAutomaticaSiCorresponde())
        .catch((e) => avisos.error(`No se pudo guardar la copia automática: ${mensajeDeError(e)}`))
    const t = setTimeout(hacer, 1500)
    // La tablet puede quedar con la app abierta varios días: también al volver a la app
    let quitar: (() => void) | undefined
    void import('@capacitor/app').then(({ App: AppNativa }) =>
      AppNativa.addListener('resume', hacer).then((h) => {
        quitar = () => void h.remove()
      }),
    )
    return () => {
      clearTimeout(t)
      quitar?.()
    }
  }, [avisos])
  return null
}

function NoEncontrada() {
  return (
    <EstadoVacio icono={SearchX} titulo="Esta página no existe">
      <BotonLink to="/">Volver al inicio</BotonLink>
    </EstadoVacio>
  )
}

export function App() {
  const demo = useDemo()
  const [listo, setListo] = useState(false)
  // Si se recarga la página con la demo encendida, se vuelve a activar antes de leer datos
  useEffect(() => {
    void restaurarDemoSiCorresponde().finally(() => setListo(true))
  }, [])
  if (!listo) return <Cargando />
  return (
    <ProveedorAvisos>
      <ProveedorConfirmar>
        <CopiaAutomatica />
        {/* La key hace que todo se vuelva a leer al entrar o salir de la demo */}
        <Layout key={demo ? 'demo' : 'real'}>
          <Suspense fallback={<Cargando />}>
            <Routes>
              <Route path="/" element={<PaginaHoy />} />
              <Route path="/pacientes" element={<PaginaPacientes />} />
              <Route path="/ronda" element={<PaginaRonda />} />
              <Route path="/ajustes" element={<PaginaAjustes />} />
              <Route path="/asistente" element={<PaginaAsistente />} />
              <Route path="/pacientes/nuevo" element={<PaginaPacienteForm />} />
              <Route path="/pacientes/:id" element={<PaginaPaciente />} />
              <Route path="/pacientes/:id/editar" element={<PaginaPacienteForm />} />
              <Route path="/registro" element={<PaginaRegistroForm />} />
              <Route path="/registros" element={<PaginaRegistros />} />
              <Route path="/excel" element={<PaginaExcel />} />
              <Route path="*" element={<NoEncontrada />} />
            </Routes>
          </Suspense>
        </Layout>
      </ProveedorConfirmar>
    </ProveedorAvisos>
  )
}
