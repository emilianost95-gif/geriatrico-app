import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  // ⚠️ No cambiar después de instalar la app: Android la trataría como otra app distinta
  appId: 'cl.registrogeriatrico.app',
  appName: 'Registro Geriátrico',
  webDir: 'dist',
  plugins: {
    SystemBars: {
      // Inyecta --safe-area-inset-* para que el encabezado no quede bajo la barra de estado
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
  },
  android: {
    // Permite ver la app en chrome://inspect solo en compilaciones de prueba
    webContentsDebuggingEnabled: false,
  },
}

export default config
