import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import './index.css'
import { SystemBars, SystemBarsStyle, SystemBarType } from '@capacitor/core'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import { App } from './App'
import { pedirAlmacenamientoPersistente } from './db/database'
import { iniciarBotonAtras } from './lib/botonAtras'
import { iniciarTema } from './lib/tema'
import { esNativo } from './lib/plataforma'

// El tema se aplica antes de dibujar, así no parpadea
iniciarTema()

if (esNativo) {
  // APK: botón atrás de Android y textos claros sobre el encabezado verde
  void iniciarBotonAtras()
  void SystemBars.setStyle({ style: SystemBarsStyle.Dark, bar: SystemBarType.StatusBar }).catch(() => {})
} else {
  // Navegador: pedir que no borre la base de datos por falta de espacio
  void pedirAlmacenamientoPersistente()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
