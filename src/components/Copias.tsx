import { useLiveQuery } from 'dexie-react-hooks'
import { ArchiveRestore, CheckCircle2, FolderOpen, HardDriveDownload, History, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useRef, useState } from 'react'
import { guardarAjuste, useAjustes } from '../db/ajustes'
import { db } from '../db/database'
import {
  CARPETA_COPIAS,
  CopiaInvalidaError,
  descargarCopia,
  diasDesde,
  leerCopiaAutomatica,
  listarCopiasAutomaticas,
  restaurarCopia,
  validarCopia,
  type CopiaSeguridad,
  type ModoRestaurar,
} from '../lib/copias'
import { esNativo } from '../lib/plataforma'
import { mensajeDeError, useAvisos } from './Avisos'
import { useConfirmar, useElegir } from './Confirmar'
import { Aviso, Boton, Seccion } from './ui'

export function textoUltimaCopia(iso: string): string {
  if (!iso) return 'Nunca se hizo una copia de seguridad.'
  const d = new Date(iso)
  const dias = diasDesde(iso)
  const cuando = dias === 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`
  return `Última copia: ${cuando} (${d.toLocaleDateString('es')} ${d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}).`
}

export function SeccionCopias() {
  const avisos = useAvisos()
  const confirmar = useConfirmar()
  const elegir = useElegir()
  const ajustes = useAjustes()
  const input = useRef<HTMLInputElement>(null)
  const [trabajando, setTrabajando] = useState(false)
  const automaticas = useLiveQuery(() => listarCopiasAutomaticas(), [ajustes?.ultimaCopiaAutoArchivo])

  async function hacerCopia() {
    setTrabajando(true)
    try {
      const c = await descargarCopia()
      avisos.exito(`Copia lista: ${c.pacientes.length} pacientes y ${c.registros.length} registros.${esNativo ? ' Elegí dónde guardarla.' : ' Quedó en Descargas.'}`)
    } catch (e) {
      avisos.error(`No se pudo hacer la copia: ${mensajeDeError(e)}`)
    } finally {
      setTrabajando(false)
    }
  }

  async function restaurar(copia: CopiaSeguridad) {
    const actuales = { pacientes: await db.pacientes.count(), registros: await db.registros.count() }
    const detalle = (
      <p>
        La copia es del <strong>{new Date(copia.creada).toLocaleString('es')}</strong> y tiene{' '}
        <strong>{copia.pacientes.length} pacientes</strong> y <strong>{copia.registros.length} registros</strong>.
      </p>
    )
    let modo: ModoRestaurar | null = 'reemplazar'
    if (actuales.pacientes > 0) {
      modo = await elegir<ModoRestaurar>({
        titulo: '¿Cómo restaurar la copia?',
        mensaje: (
          <>
            {detalle}
            <p className="mt-2">
              En la app hay ahora {actuales.pacientes} pacientes y {actuales.registros} registros.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li><strong>Combinar</strong>: suma lo que falta, no borra nada.</li>
              <li><strong>Reemplazar todo</strong>: deja la app igual que la copia (lo que no esté en la copia se borra).</li>
            </ul>
          </>
        ),
        opciones: [
          { valor: 'reemplazar', texto: 'Reemplazar todo', variante: 'secundario' },
          { valor: 'combinar', texto: 'Combinar' },
        ],
      })
      if (!modo) return
      if (modo === 'reemplazar') {
        const seguro = await confirmar({
          titulo: '¿Seguro que querés reemplazar todo?',
          mensaje: 'Se borran los datos actuales y quedan los de la copia. Esto no se puede deshacer.',
          textoConfirmar: 'Sí, reemplazar',
          peligro: true,
        })
        if (!seguro) return
      }
    } else if (!(await confirmar({ titulo: '¿Restaurar esta copia?', mensaje: detalle, textoConfirmar: 'Restaurar' }))) {
      return
    }
    setTrabajando(true)
    try {
      const r = await restaurarCopia(copia, modo!)
      avisos.exito(
        modo === 'reemplazar'
          ? `Copia restaurada: ${r.pacientesNuevos} pacientes y ${r.registrosNuevos} registros.`
          : `Copia combinada: ${r.pacientesNuevos} pacientes nuevos, ${r.registrosNuevos} registros nuevos y ${r.registrosCombinados} completados.`,
      )
    } catch (e) {
      avisos.error(`No se pudo restaurar: ${mensajeDeError(e)}`)
    } finally {
      setTrabajando(false)
    }
  }

  async function desdeArchivo(file: File) {
    try {
      if (/\.(xlsx|xls|csv)$/i.test(file.name)) {
        avisos.error('Ese es un Excel: para traerlo usá la pestaña "Importar".')
        return
      }
      await restaurar(validarCopia(await file.text()))
    } catch (e) {
      avisos.error(e instanceof CopiaInvalidaError ? e.message : `No se pudo leer el archivo: ${mensajeDeError(e)}`)
    }
  }

  const dias = ajustes ? diasDesde(ajustes.ultimaCopia) : 0
  const atrasada = ajustes && dias >= ajustes.diasRecordatorioCopia

  return (
    <Seccion titulo="Copias de seguridad" icono={ShieldCheck}>
      {ajustes && (
        <Aviso tono={atrasada ? 'aviso' : 'exito'} icono={atrasada ? ShieldAlert : CheckCircle2} titulo={textoUltimaCopia(ajustes.ultimaCopia)}>
          {atrasada && 'Conviene hacer una ahora: si se rompe o se pierde la tablet, la copia es lo único que salva los datos.'}
        </Aviso>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Boton icono={HardDriveDownload} grande onClick={hacerCopia} disabled={trabajando}>
          Hacer copia ahora
        </Boton>
        <Boton variante="secundario" icono={ArchiveRestore} grande onClick={() => input.current?.click()} disabled={trabajando}>
          Restaurar una copia
        </Boton>
        <input
          ref={input}
          type="file"
          accept={esNativo ? undefined : '.json,application/json'}
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void desdeArchivo(f)
            e.target.value = ''
          }}
        />
      </div>
      <p className="mt-2 text-base text-suave">
        La copia es un archivo <strong>.json</strong> con todo: pacientes, registros y ajustes. Guardala en Drive, un pendrive
        o mandátela por WhatsApp. Sirve también para pasar los datos a otra tablet.
      </p>

      {esNativo && ajustes && (
        <div className="mt-6 space-y-3 border-t border-arena pt-5">
          <label className="flex cursor-pointer items-start gap-3 text-lg">
            <input
              type="checkbox"
              checked={ajustes.copiaAutomatica}
              onChange={(e) => void guardarAjuste('copiaAutomatica', e.target.checked)}
              className="mt-1 size-6 accent-salvia-600"
            />
            <span>
              <strong>Copia automática todos los días</strong>
              <span className="block text-base text-suave">
                Al abrir la app se guarda una copia en la carpeta <strong>Documentos/{CARPETA_COPIAS}</strong> del teléfono. Esa
                carpeta <strong>no se borra</strong> aunque se desinstale la app. Se guardan las últimas 14.
              </span>
            </span>
          </label>
          {automaticas && automaticas.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-2 font-bold text-salvia-900">
                <History aria-hidden className="size-5" /> Copias automáticas guardadas
              </p>
              <ul className="divide-y divide-arena rounded-xl border border-arena bg-blanco">
                {automaticas.slice(0, 7).map((c) => (
                  <li key={c.ruta} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span>
                      {c.nombre.replace('copia-', '').replace('.json', '').split('-').slice(0, 3).reverse().join('/')}
                      <span className="text-suave"> · {(c.tamano / 1024).toFixed(0)} KB</span>
                    </span>
                    <button
                      type="button"
                      disabled={trabajando}
                      onClick={async () => {
                        try {
                          await restaurar(await leerCopiaAutomatica(c.ruta))
                        } catch (e) {
                          avisos.error(mensajeDeError(e))
                        }
                      }}
                      className="min-h-11 rounded-lg px-3 font-bold text-salvia-700 hover:bg-salvia-100"
                    >
                      Restaurar
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="flex gap-2 text-base text-suave">
            <FolderOpen aria-hidden className="mt-0.5 size-5 shrink-0" />
            Si reinstalaste la app, tocá “Restaurar una copia” y buscá el archivo en Documentos/{CARPETA_COPIAS}.
          </p>
        </div>
      )}
    </Seccion>
  )
}
