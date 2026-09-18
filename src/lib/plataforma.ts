import { Capacitor } from '@capacitor/core'

/** true cuando la app corre como APK (Android), false en el navegador. */
export const esNativo = Capacitor.isNativePlatform()

/** Mensaje para después de exportar, según dónde corre la app. */
export function textoArchivoListo(cantidad: number): string {
  const n = `${cantidad} ${cantidad === 1 ? 'registro' : 'registros'}`
  return esNativo
    ? `Excel listo con ${n}. Elegí dónde guardarlo (Drive, Archivos) o a quién mandarlo.`
    : `Se descargó el Excel con ${n}. Buscalo en "Descargas".`
}
