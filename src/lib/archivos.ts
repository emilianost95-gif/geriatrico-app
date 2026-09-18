import { esNativo } from './plataforma'

function blobABase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader()
    lector.onload = () => resolve(String(lector.result).split(',')[1] ?? '')
    lector.onerror = () => reject(lector.error ?? new Error('No se pudo leer el archivo'))
    lector.readAsDataURL(blob)
  })
}

/**
 * Entrega un archivo generado por la app.
 * - Navegador: lo descarga (carpeta Descargas).
 * - Android: el WebView no permite descargas con <a download>, así que se guarda
 *   en la caché de la app y se abre el menú "Compartir" (Drive, WhatsApp, Gmail, Archivos…).
 */
export async function entregarArchivo(blob: Blob, nombre: string): Promise<void> {
  if (!esNativo) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nombre
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
    return
  }

  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ])
  const { uri } = await Filesystem.writeFile({
    path: nombre,
    data: await blobABase64(blob),
    directory: Directory.Cache,
  })
  try {
    await Share.share({ title: nombre, files: [uri], dialogTitle: 'Guardar o enviar el Excel' })
  } catch (e) {
    // Cerrar el menú sin elegir nada no es un error
    if (!/cancel/i.test(String((e as Error)?.message ?? e))) throw e
  }
}
