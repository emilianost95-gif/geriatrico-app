import { useLiveQuery } from 'dexie-react-hooks'
import { Database, Download, FileDown, FileUp, ShieldAlert, ShieldCheck, Table } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { mensajeDeError, useAvisos } from '../components/Avisos'
import { SeccionCopias } from '../components/Copias'
import { Importador } from '../components/Importador'
import { Encabezado } from '../components/Layout'
import { SelectorPacientes } from '../components/SelectorPacientes'
import { Alternador, Aviso, Boton, Campo, Seccion } from '../components/ui'
import { db, pedirAlmacenamientoPersistente } from '../db/database'
import { listarPacientes } from '../db/pacientes'
import { consultarRegistros } from '../db/registros'
import { descargarPlantilla, describirFiltro, exportarAExcel } from '../excel/acciones'
import { esNativo, textoArchivoListo } from '../lib/plataforma'

type Tab = 'exportar' | 'importar' | 'copias'
type Alcance = 'todo' | 'elegir'

export function PaginaExcel() {
  const [params, setParams] = useSearchParams()
  const t = params.get('tab')
  const tab: Tab = t === 'importar' || t === 'copias' ? t : 'exportar'

  return (
    <>
      <Encabezado titulo="Excel y copias" subtitulo="Pasá los datos a Excel, traelos desde una planilla o guardá una copia de seguridad." />
      <div className="mb-6">
        <Alternador<Tab>
          etiqueta="Qué querés hacer"
          valor={tab}
          onCambio={(v) => setParams({ tab: v }, { replace: true })}
          opciones={[
            { valor: 'exportar', texto: 'Exportar', icono: FileDown },
            { valor: 'importar', texto: 'Importar', icono: FileUp },
            { valor: 'copias', texto: 'Copias', icono: ShieldCheck },
          ]}
        />
      </div>
      {tab === 'exportar' && <Exportar />}
      {tab === 'importar' && (
        <Seccion titulo="Importar desde Excel" icono={FileUp}>
          <Importador />
        </Seccion>
      )}
      {tab === 'copias' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr]">
          <SeccionCopias />
          <EstadoDatos />
        </div>
      )}
    </>
  )
}

function Exportar() {
  const avisos = useAvisos()
  const pacientes = useLiveQuery(listarPacientes, [])
  const [alcance, setAlcance] = useState<Alcance>('todo')
  const [elegidos, setElegidos] = useState<number[] | null>(null)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [hojaPorPaciente, setHojaPorPaciente] = useState(false)
  const [trabajando, setTrabajando] = useState(false)

  // Por defecto, todos los pacientes activos
  const ids = elegidos ?? (pacientes ?? []).filter((p) => p.activo).map((p) => p.id!)
  const filtro = alcance === 'todo' ? {} : { pacienteIds: ids, desde, hasta }
  const cantidad = useLiveQuery(
    async () => (alcance === 'todo' ? db.registros.count() : (await consultarRegistros({ pacienteIds: ids, desde, hasta })).length),
    [alcance, ids.join(','), desde, hasta],
  )

  async function exportar() {
    setTrabajando(true)
    try {
      const n = await exportarAExcel(filtro, { copiaCompleta: alcance === 'todo', hojaPorPaciente })
      avisos.exito(textoArchivoListo(n))
    } catch (e) {
      avisos.error(`No se pudo exportar: ${mensajeDeError(e)}`)
    } finally {
      setTrabajando(false)
    }
  }

  const nombres = (pacientes ?? []).filter((p) => ids.includes(p.id!)).map((p) => p.nombre)

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr]">
      <Seccion titulo="Exportar a Excel" icono={FileDown}>
        <fieldset className="space-y-2">
          <legend className="etiqueta">¿Qué querés exportar?</legend>
          {(
            [
              ['todo', 'Todo', 'Todos los pacientes y todos los registros.'],
              ['elegir', 'Elegir pacientes y fechas', 'Uno, varios o todos los pacientes, en el período que quieras.'],
            ] as const
          ).map(([valor, titulo, texto]) => (
            <label
              key={valor}
              className={`flex cursor-pointer gap-3 rounded-xl border-2 p-4 ${alcance === valor ? 'border-salvia-600 bg-salvia-50' : 'border-arena bg-blanco hover:border-salvia-300'}`}
            >
              <input type="radio" name="alcance" checked={alcance === valor} onChange={() => setAlcance(valor)} className="mt-1 size-6 accent-salvia-600" />
              <span>
                <span className="block text-lg font-bold">{titulo}</span>
                <span className="text-base text-suave">{texto}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {alcance === 'elegir' && pacientes && (
          <div className="mt-5 space-y-4 rounded-xl bg-crema p-4">
            <SelectorPacientes pacientes={pacientes} elegidos={ids} onCambio={setElegidos} />
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
              <Campo etiqueta="Desde" type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} ayuda="Vacío = desde el principio" />
              <Campo etiqueta="Hasta" type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} ayuda="Vacío = hasta hoy" />
            </div>
          </div>
        )}

        <label className="mt-5 flex cursor-pointer items-start gap-3 text-lg">
          <input type="checkbox" checked={hojaPorPaciente} onChange={(e) => setHojaPorPaciente(e.target.checked)} className="mt-1 size-6 accent-salvia-600" />
          <span>
            <strong>Una hoja por paciente</strong>
            <span className="block text-base text-suave">Además de las hojas generales, cada paciente con su propia pestaña (ideal para imprimir).</span>
          </span>
        </label>

        <div className="mt-5 rounded-xl bg-salvia-50 p-4 text-lg">
          {alcance === 'todo' ? 'Se exportan todos los datos' : describirFiltro(filtro, nombres)}:{' '}
          <strong>{cantidad ?? '…'} {cantidad === 1 ? 'registro' : 'registros'}</strong>
        </div>
        <Boton
          icono={Download}
          grande
          ancho
          className="mt-4"
          onClick={exportar}
          disabled={trabajando || (alcance === 'elegir' && (!cantidad || ids.length === 0))}
        >
          {trabajando ? 'Preparando el archivo…' : esNativo ? 'Crear Excel y guardarlo' : 'Descargar Excel'}
        </Boton>
        <p className="mt-3 text-base text-suave">
          El archivo trae: registros por día, signos vitales (valores fuera de lo normal en rojo), pacientes e información.
          Se puede volver a importar sin cambios.
        </p>
      </Seccion>

      <div className="space-y-6">
        <Seccion titulo="Plantilla de migración" icono={Table}>
          <p className="mb-4 text-lg text-suave">
            Para pasar <strong>todo el hogar</strong> de una vez: una hoja con todos los residentes y otra con el historial.
            Trae ejemplos e instrucciones.
          </p>
          <Boton variante="secundario" icono={Download} ancho onClick={() => descargarPlantilla().catch((e) => avisos.error(mensajeDeError(e)))}>
            Descargar plantilla
          </Boton>
        </Seccion>
        <EstadoDatos />
      </div>
    </div>
  )
}

function EstadoDatos() {
  const [persistente, setPersistente] = useState<boolean>()
  const [uso, setUso] = useState<string>()
  const conteo = useLiveQuery(async () => ({ pacientes: await db.pacientes.count(), registros: await db.registros.count() }), [])

  useEffect(() => {
    if (esNativo) return
    navigator.storage?.persisted?.().then(setPersistente).catch(() => setPersistente(false))
    navigator.storage?.estimate?.().then((e) => {
      if (e.usage != null) setUso(`${(e.usage / 1024 / 1024).toFixed(1).replace('.', ',')} MB`)
    })
  }, [])

  return (
    <Seccion titulo="Tus datos" icono={Database}>
      <p className="text-lg">
        <strong>{conteo?.pacientes ?? '…'}</strong> pacientes · <strong>{conteo?.registros ?? '…'}</strong> registros
        {uso && <span className="text-suave"> · {uso}</span>}
      </p>
      <div className="mt-4">
        {esNativo ? (
          <Aviso tono="info" icono={ShieldCheck} titulo="Los datos viven dentro de la app">
            Se guardan en este teléfono o tablet y no se suben a internet. Si se <strong>desinstala</strong> la app o se
            borran sus datos desde Ajustes, se pierden: por eso existe la copia automática.
          </Aviso>
        ) : persistente ? (
          <Aviso tono="exito" icono={ShieldCheck} titulo="Guardado seguro activado">
            El navegador no va a borrar los datos por falta de espacio.
          </Aviso>
        ) : (
          <Aviso tono="aviso" icono={ShieldAlert} titulo="Guardado seguro no activado">
            <p>Si el dispositivo se queda sin espacio, el navegador podría borrar datos. Instalá la app en la pantalla de inicio y tocá:</p>
            <Boton variante="secundario" className="mt-2" onClick={() => pedirAlmacenamientoPersistente().then(setPersistente)}>
              Activar guardado seguro
            </Boton>
          </Aviso>
        )}
      </div>
      {!esNativo && (
        <p className="mt-4 text-base text-suave">
          Los datos quedan solo en este navegador. Hacé una copia de seguridad una vez por semana y guardala en otro lado.
        </p>
      )}
    </Seccion>
  )
}
