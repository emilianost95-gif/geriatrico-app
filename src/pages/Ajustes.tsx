import { Building2, FlaskConical, Info, Palette, Save, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAvisos } from '../components/Avisos'
import { textoUltimaCopia } from '../components/Copias'
import { Encabezado } from '../components/Layout'
import { Boton, BotonLink, Campo, Cargando, Seccion, Selector } from '../components/ui'
import { APP } from '../config'
import { guardarAjuste, useAjustes } from '../db/ajustes'
import { esNativo } from '../lib/plataforma'
import { TEMAS, useTema } from '../lib/tema'
import { entrarEnDemo, salirDeDemo, useDemo } from '../demo/modoDemo'
import { useConfirmar } from '../components/Confirmar'

export function PaginaAjustes() {
  const { tema, cambiar: cambiarTema } = useTema()
  const demo = useDemo()
  const confirmar = useConfirmar()
  const [cambiandoDemo, setCambiandoDemo] = useState(false)

  async function alternarDemo() {
    if (demo) {
      setCambiandoDemo(true)
      await salirDeDemo()
      setCambiandoDemo(false)
      return
    }
    const ok = await confirmar({
      titulo: '¿Encender el modo demostración?',
      mensaje:
        'Vas a ver un hogar de ejemplo con 9 residentes y 3 semanas de registros. Tus datos reales quedan intactos y volvés a ellos cuando salgas de la demo.',
      textoConfirmar: 'Encender la demo',
    })
    if (!ok) return
    setCambiandoDemo(true)
    await entrarEnDemo()
    setCambiandoDemo(false)
  }
  const ajustes = useAjustes()
  const avisos = useAvisos()
  const [nombre, setNombre] = useState<string>()

  useEffect(() => {
    if (ajustes && nombre === undefined) setNombre(ajustes.nombreHogar)
  }, [ajustes, nombre])

  if (!ajustes || nombre === undefined) return <Cargando />

  return (
    <div className="mx-auto max-w-3xl">
      <Encabezado titulo="Ajustes" />
      <div className="space-y-6">
        <Seccion titulo="Datos del hogar" icono={Building2}>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault()
              await guardarAjuste('nombreHogar', nombre.trim())
              avisos.exito('Nombre del hogar guardado.')
            }}
          >
            <Campo
              etiqueta="Nombre del hogar o residencia"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej.: Residencia Los Aromos"
              ayuda="Aparece en la pantalla de inicio, en los Excel y en los informes PDF."
            />
            <Boton type="submit" icono={Save} disabled={nombre.trim() === ajustes.nombreHogar}>
              Guardar
            </Boton>
          </form>
        </Seccion>

        <Seccion titulo="Modo demostración" icono={FlaskConical}>
          <p className="text-lg">
            Llena la app con un hogar de ejemplo para mostrarla sin usar datos de pacientes reales. Los datos de ejemplo se guardan
            en una base aparte y se borran al salir.
          </p>
          <Boton
            variante={demo ? 'peligro' : 'secundario'}
            icono={FlaskConical}
            onClick={() => void alternarDemo()}
            disabled={cambiandoDemo}
            className="mt-4"
          >
            {cambiandoDemo ? 'Un momento…' : demo ? 'Salir de la demostración' : 'Probar con datos de ejemplo'}
          </Boton>
        </Seccion>

        <Seccion titulo="Colores de la app" icono={Palette}>
          <fieldset className="min-w-0">
            <legend className="etiqueta">¿Cómo querés ver la app?</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {TEMAS.map((t) => (
                <label
                  key={t.valor}
                  className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border-2 p-3 transition-colors ${
                    tema === t.valor ? 'border-salvia-500 bg-salvia-50' : 'border-arena-oscura bg-blanco hover:bg-salvia-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="tema"
                    className="mt-1.5 size-5 shrink-0 accent-salvia-600"
                    checked={tema === t.valor}
                    onChange={() => cambiarTema(t.valor)}
                  />
                  <span className="min-w-0">
                    <span className="block text-lg font-bold">{t.texto}</span>
                    <span className="block text-base text-suave">{t.ayuda}</span>
                  </span>
                  <span aria-hidden className="ml-auto flex shrink-0 gap-1">
                    {(t.valor === 'auto' ? ['claro', 'oscuro'] : [t.valor]).map((v) => (
                      <span key={v} className="size-8 rounded-lg border border-arena-oscura" data-tema={v} style={{ background: 'var(--color-papel)' }}>
                        <span className="m-1 block size-4 rounded" style={{ background: 'var(--color-salvia-600)' }} />
                      </span>
                    ))}
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-3 text-base text-suave">
              El color se guarda solo en este dispositivo. Los informes PDF y el Excel salen siempre en claro, para imprimirlos.
            </p>
          </fieldset>
        </Seccion>

        <Seccion titulo="Copias de seguridad" icono={ShieldCheck}>
          <p className="mb-4 text-lg">{textoUltimaCopia(ajustes.ultimaCopia)}</p>
          <Selector
            etiqueta="Avisarme si pasan más de…"
            value={ajustes.diasRecordatorioCopia}
            onChange={(e) => void guardarAjuste('diasRecordatorioCopia', Number(e.target.value))}
          >
            {[1, 3, 7, 14, 30].map((d) => (
              <option key={d} value={d}>
                {d === 1 ? '1 día' : `${d} días`} sin hacer una copia
              </option>
            ))}
          </Selector>
          {esNativo && (
            <label className="mt-4 flex cursor-pointer items-start gap-3 text-lg">
              <input
                type="checkbox"
                checked={ajustes.copiaAutomatica}
                onChange={(e) => void guardarAjuste('copiaAutomatica', e.target.checked)}
                className="mt-1 size-6 accent-salvia-600"
              />
              <span>
                <strong>Copia automática diaria</strong> en Documentos/RegistroGeriatrico
              </span>
            </label>
          )}
          <BotonLink to="/excel?tab=copias" variante="secundario" className="mt-4">
            Ir a copias de seguridad
          </BotonLink>
        </Seccion>

        <Seccion titulo="Acerca de" icono={Info}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-lg">
            <dt className="font-bold">App</dt>
            <dd>{APP.nombre}</dd>
            <dt className="font-bold">Versión</dt>
            <dd>
              {APP.version} {esNativo ? '(Android)' : '(web)'}
            </dd>
            <dt className="font-bold">Desarrollo</dt>
            <dd>{APP.desarrollador}</dd>
            <dt className="font-bold">Contacto</dt>
            <dd className="break-all">
              <a className="text-salvia-700 underline" href={`mailto:${APP.contacto}`}>
                {APP.contacto}
              </a>
            </dd>
          </dl>
          <p className="mt-4 text-base text-suave">
            Los datos se guardan solo en este dispositivo y no se envían a ningún servidor.
          </p>
        </Seccion>
      </div>
    </div>
  )
}
