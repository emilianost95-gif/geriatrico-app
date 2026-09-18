import { useLiveQuery } from 'dexie-react-hooks'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Download,
  FileSpreadsheet,
  Info,
  RefreshCw,
  Upload,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { listarPacientes } from '../db/pacientes'
import { COLUMNAS, type ColumnaId, type GrupoColumna } from '../excel/columnas'
import { analizarLibro } from '../excel/importar/analizar'
import { aplicarImportacion, prepararPlan } from '../excel/importar/aplicar'
import { FormatoNoSoportadoError, leerArchivo } from '../excel/importar/leer'
import { nombresNuevosParecidos, sugerirPacientes } from '../excel/importar/plan'
import type {
  AjustesColumnas,
  AsignacionPaciente,
  ColumnaDetectada,
  EstadoItem,
  HojaAnalizada,
  HojaCruda,
  ModoImportacion,
  Plan,
  Problema,
  ResultadoImportacion,
} from '../excel/importar/tipos'
import { ETIQUETA_CAMPO } from '../domain/campos'
import { fechaCorta } from '../lib/fechas'
import { descargarCopia } from '../lib/copias'
import { esNativo } from '../lib/plataforma'
import { mensajeDeError, useAvisos } from './Avisos'
import { useConfirmar } from './Confirmar'
import { Aviso, Boton, BotonLink, Cargando, Insignia } from './ui'
import { InsigniaAlimentacion } from './VistaRegistros'

type Paso = 'elegir' | 'leyendo' | 'revisar' | 'importando' | 'listo'

const NOMBRE_GRUPO: Record<GrupoColumna, string> = {
  clave: 'Identificación',
  toma: 'Signos vitales',
  registro: 'Registro del día',
  paciente: 'Datos del paciente',
  otro: 'Otros',
}

export function Importador() {
  const avisos = useAvisos()
  const confirmar = useConfirmar()
  const [paso, setPaso] = useState<Paso>('elegir')
  const [archivo, setArchivo] = useState<{ nombre: string; hojas: HojaCruda[] }>()
  const [ajustes, setAjustes] = useState<AjustesColumnas>({})
  const [hojasOmitidas, setHojasOmitidas] = useState<string[]>([])
  const [elecciones, setElecciones] = useState<Record<string, { accion: AsignacionPaciente['accion']; pacienteId?: number }>>({})
  const [modo, setModo] = useState<ModoImportacion>('actualizar')
  const [plan, setPlan] = useState<Plan>()
  const [resultado, setResultado] = useState<ResultadoImportacion>()
  const [error, setError] = useState<string>()
  const pacientes = useLiveQuery(listarPacientes, [])

  const lectura = useMemo(
    () => (archivo ? analizarLibro(archivo.hojas, ajustes, { omitidas: hojasOmitidas }) : undefined),
    [archivo, ajustes, hojasOmitidas],
  )

  const asignaciones = useMemo<AsignacionPaciente[]>(() => {
    if (!lectura || !pacientes) return []
    return sugerirPacientes(lectura.pacientes, pacientes).map((a) => {
      const e = elecciones[a.clave]
      return e ? { ...a, accion: e.accion, pacienteId: e.accion === 'existente' ? e.pacienteId : undefined } : a
    })
  }, [lectura, pacientes, elecciones])

  // Recalcula el plan cuando cambia algo (columnas, pacientes o modo)
  useEffect(() => {
    if (!lectura || paso !== 'revisar') return
    let cancelado = false
    prepararPlan(lectura, asignaciones, modo).then(
      (p) => !cancelado && setPlan(p),
      (e) => !cancelado && setError(mensajeDeError(e)),
    )
    return () => {
      cancelado = true
    }
  }, [lectura, asignaciones, modo, paso])

  async function abrir(file: File) {
    setError(undefined)
    setPaso('leyendo')
    try {
      const hojas = await leerArchivo(await file.arrayBuffer(), file.name)
      setArchivo({ nombre: file.name, hojas })
      setAjustes({})
      setHojasOmitidas([])
      setElecciones({})
      setPlan(undefined)
      setPaso('revisar')
    } catch (e) {
      setError(e instanceof FormatoNoSoportadoError ? e.message : `No se pudo leer el archivo: ${mensajeDeError(e)}`)
      setPaso('elegir')
    }
  }

  function reiniciar() {
    setArchivo(undefined)
    setPlan(undefined)
    setResultado(undefined)
    setError(undefined)
    setPaso('elegir')
  }

  async function importar() {
    if (!lectura || !plan) return
    const ok = await confirmar({
      titulo: '¿Importar los datos?',
      mensaje: (
        <ul className="list-disc space-y-1 pl-6">
          <li>{plan.totales.nuevo} registros nuevos</li>
          <li>{plan.totales.actualiza} registros que se actualizan</li>
          <li>{plan.totales.pacientesNuevos} pacientes nuevos</li>
          {plan.totales.pacientesActualizados > 0 && <li>{plan.totales.pacientesActualizados} pacientes con datos completados</li>}
        </ul>
      ),
      textoConfirmar: 'Sí, importar',
    })
    if (!ok) return
    setPaso('importando')
    try {
      // Plan fresco, por si algo cambió mientras se revisaba
      const planFinal = await prepararPlan(lectura, asignaciones, modo)
      const r = await aplicarImportacion(lectura, asignaciones, planFinal)
      setResultado(r)
      setPaso('listo')
      avisos.exito(`Importación terminada: ${r.registrosCreados + r.registrosActualizados} registros guardados.`)
    } catch (e) {
      setPaso('revisar')
      avisos.error(`No se importó nada: ${mensajeDeError(e)}`)
    }
  }

  // ───────────── Paso 1: elegir archivo ─────────────
  if (paso === 'elegir' || paso === 'leyendo') {
    return (
      <div className="space-y-4">
        {error && <Aviso tono="peligro" icono={AlertCircle} titulo="No se pudo abrir el archivo">{error}</Aviso>}
        <ZonaArchivo onArchivo={abrir} leyendo={paso === 'leyendo'} />
        <details className="rounded-xl bg-salvia-50 p-4 text-lg">
          <summary className="cursor-pointer font-bold text-salvia-800">¿Cómo tiene que ser el Excel?</summary>
          <ul className="mt-3 list-disc space-y-1.5 pl-6 text-base">
            <li>Sirven planillas con <strong>muchos pacientes</strong> en cualquiera de estas formas:
              <ul className="mt-1 list-[circle] space-y-1 pl-6">
                <li>una fila por paciente y día (con columnas “Paciente” y “Fecha”);</li>
                <li>un bloque por paciente (“PACIENTE: Ana Díaz” y debajo su tabla);</li>
                <li>una hoja por paciente (el nombre en la pestaña o en el título);</li>
                <li>planilla de turno con los pacientes en columnas;</li>
                <li>control mensual con los días (1, 2, 3…) en columnas;</li>
                <li>una lista de residentes (solo nombres, habitación, documento…).</li>
              </ul>
            </li>
            <li>Una fila de títulos (puede tener un título arriba, se detecta sola).</li>
            <li>Los títulos no tienen que ser exactos: “Paciente”, “Nombre” o “Apellido y nombre” sirven igual.</li>
            <li>Tiene que haber una columna con el nombre del paciente y otra con la fecha (o una hoja por paciente con el nombre en la pestaña).</li>
            <li>Si un paciente tiene varias tomas en el día, pueden ir en varias filas: se juntan solas.</li>
            <li>Antes de guardar vas a ver un resumen y podés corregir lo que haga falta.</li>
          </ul>
        </details>
      </div>
    )
  }

  // ───────────── Paso final ─────────────
  if (paso === 'listo' && resultado) {
    return (
      <div className="space-y-5">
        <div className="flex flex-col items-center rounded-2xl bg-exito-claro p-8 text-center">
          <CheckCircle2 aria-hidden className="size-16 text-exito" />
          <h3 className="mt-3 text-3xl">¡Listo! Los datos se importaron</h3>
          <ul className="mt-4 space-y-1 text-xl">
            <li><strong>{resultado.registrosCreados}</strong> registros nuevos</li>
            <li><strong>{resultado.registrosActualizados}</strong> registros actualizados</li>
            <li><strong>{resultado.pacientesCreados}</strong> pacientes nuevos</li>
            {resultado.sinCambios > 0 && <li className="text-suave">{resultado.sinCambios} ya estaban iguales</li>}
            {resultado.omitidos > 0 && <li className="text-suave">{resultado.omitidos} se dejaron sin tocar</li>}
          </ul>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <BotonLink to="/pacientes" icono={Users} grande>Ver pacientes</BotonLink>
          <Boton variante="secundario" icono={Upload} grande onClick={reiniciar}>Importar otro archivo</Boton>
        </div>
      </div>
    )
  }

  // ───────────── Paso 2: revisar ─────────────
  if (!lectura || !archivo || !pacientes) return <Cargando />
  const hojasUtiles = lectura.hojas.filter((h) => h.tipo !== 'omitida')
  const errores = lectura.problemas.filter((p) => p.nivel === 'error')
  const parecidos = nombresNuevosParecidos(asignaciones)
  const registrosAGuardar = plan ? plan.totales.nuevo + plan.totales.actualiza : 0
  const pacientesAGuardar = plan ? plan.totales.pacientesNuevos + plan.totales.pacientesActualizados : 0
  const aImportar = registrosAGuardar + pacientesAGuardar

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-salvia-50 p-4">
        <p className="flex items-center gap-3 text-lg">
          <FileSpreadsheet aria-hidden className="size-8 text-salvia-600" />
          <span>
            <strong className="break-all">{archivo.nombre}</strong>
            <br />
            <span className="text-suave">
              {archivo.hojas.length} {archivo.hojas.length === 1 ? 'hoja' : 'hojas'} · {hojasUtiles.length} con datos para importar
            </span>
          </span>
        </p>
        <Boton variante="suave" icono={RefreshCw} onClick={reiniciar}>Elegir otro archivo</Boton>
      </div>

      {error && <Aviso tono="peligro" icono={AlertCircle}>{error}</Aviso>}

      {lectura.registros.length === 0 && lectura.pacientes.length === 0 ? (
        <Aviso tono="aviso" icono={AlertTriangle} titulo="No se encontraron datos para importar">
          Revisá abajo cómo se leyeron las columnas. Si alguna no se reconoció, elegí a mano qué es.
        </Aviso>
      ) : (
        <Resumen plan={plan} errores={errores.length} avisos={lectura.problemas.length - errores.length} />
      )}

      {/* Qué hacer con lo que ya existe */}
      {plan && plan.items.some((i) => i.existenteId != null) && (
        <fieldset className="space-y-2">
          <legend className="etiqueta text-xl">Algunos días ya están cargados en la app. ¿Qué hacemos?</legend>
          {(
            [
              ['actualizar', 'Completar y actualizar (recomendado)', 'Se agregan las tomas nuevas y se actualizan los datos que vienen en el Excel. Lo que el Excel tiene vacío no se borra.'],
              ['reemplazar', 'Reemplazar por lo del Excel', 'El día queda exactamente como está en el Excel. Lo que no esté en el Excel se borra.'],
              ['soloNuevos', 'No tocar lo que ya existe', 'Solo se agregan los días que todavía no están cargados.'],
            ] as const
          ).map(([valor, titulo, texto]) => (
            <label
              key={valor}
              className={`flex cursor-pointer gap-3 rounded-xl border-2 p-4 transition-colors ${
                modo === valor ? 'border-salvia-600 bg-salvia-50' : 'border-arena bg-blanco hover:border-salvia-300'
              }`}
            >
              <input type="radio" name="modo" value={valor} checked={modo === valor} onChange={() => setModo(valor)} className="mt-1 size-6 shrink-0 accent-salvia-600" />
              <span>
                <span className="block text-lg font-bold">{titulo}</span>
                <span className="text-base text-suave">{texto}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {/* Pacientes */}
      {asignaciones.length > 0 && (
        <Plegable titulo={`Pacientes del archivo (${asignaciones.length})`} abierto={asignaciones.some((a) => a.sugerencia !== 'exacto')}>
          <p className="mb-3 text-base text-suave">Revisá que cada nombre del Excel corresponda al paciente correcto.</p>
          {parecidos.length > 0 && (
            <div className="mb-3">
              <Aviso tono="aviso" icono={AlertTriangle} titulo="Nombres nuevos muy parecidos entre sí">
                {parecidos.map(([a, b]) => `"${a}" y "${b}"`).join(' · ')}. ¿Serán la misma persona escrita distinto? Si es así, asigná uno de los dos al otro después de importar, o corregí el Excel.
              </Aviso>
            </div>
          )}
          <ul className="divide-y divide-arena rounded-xl border border-arena bg-blanco">
            {asignaciones.map((a) => (
              <li key={a.clave} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-lg font-bold">{a.nombre}</p>
                  <p className="flex flex-wrap items-center gap-2 text-base text-suave">
                    {a.cantidadRegistros} {a.cantidadRegistros === 1 ? 'día' : 'días'}
                    {a.sugerencia === 'exacto' && <Insignia tono="exito">Ya existe</Insignia>}
                    {a.sugerencia === 'parecido' && (
                      <Insignia tono="aviso">Nombre parecido ({Math.round((a.similitud ?? 0) * 100)}%)</Insignia>
                    )}
                    {a.sugerencia === 'nuevo' && <Insignia tono="info">Paciente nuevo</Insignia>}
                  </p>
                </div>
                <label className="sr-only" htmlFor={`asig-${a.clave}`}>Paciente para {a.nombre}</label>
                <select
                  id={`asig-${a.clave}`}
                  className="control sm:max-w-xs"
                  value={a.accion === 'existente' ? String(a.pacienteId) : a.accion}
                  onChange={(e) =>
                    setElecciones((el) => ({
                      ...el,
                      [a.clave]:
                        e.target.value === 'nuevo' || e.target.value === 'omitir'
                          ? { accion: e.target.value }
                          : { accion: 'existente', pacienteId: Number(e.target.value) },
                    }))
                  }
                >
                  <option value="nuevo">➕ Crear paciente nuevo</option>
                  <option value="omitir">🚫 No importar</option>
                  {pacientes.map((p) => (
                    <option key={p.id} value={p.id}>
                      = {p.nombre}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </Plegable>
      )}

      {/* Hojas y columnas */}
      <Plegable
        titulo="Cómo se leyeron las columnas"
        abierto={lectura.hojas.some((h) => h.tipo === 'omitida' || h.columnas.some((c) => c.nota === 'No se reconoció'))}
      >
        <div className="space-y-5">
          {lectura.hojas.length === 0 && <p className="text-lg text-suave">El archivo no tiene hojas con datos.</p>}
          {lectura.hojas.map((h) => (
            <TablaColumnas
              key={h.nombre}
              hoja={h}
              onCambio={(indice, id) => setAjustes((aj) => ({ ...aj, [h.nombre]: { ...aj[h.nombre], [indice]: id } }))}
              onRestablecer={() => setAjustes((aj) => ({ ...aj, [h.nombre]: {} }))}
              onOmitir={(omitir) =>
                setHojasOmitidas((l) => (omitir ? [...l, h.nombre] : l.filter((x) => x !== h.nombre)))
              }
              tieneAjustes={Object.keys(ajustes[h.nombre] ?? {}).length > 0}
            />
          ))}
        </div>
      </Plegable>

      {lectura.problemas.length > 0 && (
        <Plegable titulo={`Avisos y errores (${lectura.problemas.length})`} abierto={errores.length > 0}>
          <ListaProblemas problemas={lectura.problemas} />
        </Plegable>
      )}

      {plan && plan.items.length > 0 && (
        <Plegable titulo={`Vista previa de los registros (${plan.items.length})`} abierto>
          <VistaPrevia plan={plan} />
        </Plegable>
      )}

      <div className="sticky bottom-24 z-20 flex flex-col gap-3 rounded-2xl border-2 border-salvia-200 bg-papel/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center md:bottom-4">
        <p className="flex-1 text-lg">
          {!plan ? 'Calculando…' : aImportar === 0 ? 'No hay nada nuevo para guardar.' : (
            <>
              Se van a guardar{' '}
              {[
                registrosAGuardar > 0 && <strong key="r">{registrosAGuardar} {registrosAGuardar === 1 ? 'registro' : 'registros'}</strong>,
                pacientesAGuardar > 0 && <strong key="p">{pacientesAGuardar} {pacientesAGuardar === 1 ? 'paciente' : 'pacientes'}</strong>,
              ]
                .filter(Boolean)
                .flatMap((x, i) => (i ? [' y ', x] : [x]))}
              .
            </>
          )}
          {errores.length > 0 && <span className="block text-base text-coral">Las {errores.length} filas con error no se importan.</span>}
        </p>
        <Boton
          variante="secundario"
          icono={Download}
          onClick={() =>
            descargarCopia().then(
              () => avisos.exito('Copia de seguridad lista.'),
              (e) => avisos.error(mensajeDeError(e)),
            )
          }
        >
          Copia de seguridad antes
        </Boton>
        <Boton icono={Upload} grande onClick={importar} disabled={!plan || aImportar === 0 || paso === 'importando'}>
          {paso === 'importando' ? 'Importando…' : 'Importar'}
        </Boton>
      </div>
    </div>
  )
}

// ─────────────────────────── Piezas ───────────────────────────

function ZonaArchivo({ onArchivo, leyendo }: { onArchivo: (f: File) => void; leyendo: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [encima, setEncima] = useState(false)
  const soltar = (e: DragEvent) => {
    e.preventDefault()
    setEncima(false)
    const f = e.dataTransfer.files[0]
    if (f) onArchivo(f)
  }
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setEncima(true)
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={soltar}
      className={`flex flex-col items-center rounded-2xl border-3 border-dashed p-8 text-center transition-colors ${
        encima ? 'border-salvia-500 bg-salvia-100' : 'border-salvia-300 bg-salvia-50/60'
      }`}
    >
      {leyendo ? (
        <Cargando texto="Leyendo el archivo…" />
      ) : (
        <>
          <FileSpreadsheet aria-hidden className="size-16 text-salvia-500" />
          <p className="mt-3 text-xl font-bold">Elegí el archivo de Excel</p>
          <p className="mb-5 text-base text-suave">
            {esNativo ? 'Archivos .xlsx o .csv (de Descargas, Drive o WhatsApp)' : 'Archivos .xlsx o .csv · también podés arrastrarlo acá'}
          </p>
          <Boton icono={Upload} grande onClick={() => input.current?.click()}>
            Elegir archivo
          </Boton>
          <input
            ref={input}
            type="file"
            // En Android no se filtra: algunas apps (WhatsApp, Drive) informan mal el tipo del Excel
            accept={esNativo ? undefined : '.xlsx,.xlsm,.csv,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv'}
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onArchivo(f)
              e.target.value = ''
            }}
          />
        </>
      )}
    </div>
  )
}

function Plegable({ titulo, abierto, children }: { titulo: string; abierto?: boolean; children: ReactNode }) {
  return (
    <details open={abierto} className="group rounded-2xl border border-arena bg-blanco">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 text-xl font-bold text-salvia-900 [&::-webkit-details-marker]:hidden">
        {titulo}
        <ChevronDown aria-hidden className="size-6 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-arena p-4">{children}</div>
    </details>
  )
}

function Resumen({ plan, errores, avisos }: { plan?: Plan; errores: number; avisos: number }) {
  if (!plan) return <Cargando texto="Preparando el resumen…" />
  const t = plan.totales
  const tarjetas: { n: number; texto: string; tono: string }[] = [
    { n: t.nuevo, texto: 'registros nuevos', tono: 'bg-exito-claro text-exito' },
    { n: t.actualiza, texto: 'se actualizan', tono: 'bg-cielo-claro text-cielo' },
    { n: t.sinCambios + t.omitido, texto: 'sin cambios', tono: 'bg-arena/50 text-suave' },
    { n: t.pacientesNuevos, texto: 'pacientes nuevos', tono: 'bg-salvia-100 text-salvia-800' },
    { n: t.pacientesActualizados, texto: 'pacientes con datos nuevos', tono: 'bg-salvia-100 text-salvia-800' },
    { n: errores, texto: 'filas con error', tono: errores ? 'bg-coral-claro text-coral' : 'bg-arena/50 text-suave' },
    { n: avisos, texto: 'avisos para revisar', tono: avisos ? 'bg-ambar-claro text-ambar' : 'bg-arena/50 text-suave' },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
      {tarjetas.map((c) => (
        <div key={c.texto} className={`rounded-2xl p-4 ${c.tono}`}>
          <p className="text-4xl font-bold tabular-nums">{c.n}</p>
          <p className="text-base font-bold leading-tight">{c.texto}</p>
        </div>
      ))}
    </div>
  )
}

function InsigniaConfianza({ c }: { c: ColumnaDetectada }) {
  if (c.manual) return <Insignia tono="marca">Elegida a mano</Insignia>
  if (c.id === 'ignorar') return <Insignia>{c.nota?.startsWith('Repetida') ? 'Repetida' : 'No se importa'}</Insignia>
  if (c.puntaje >= 0.95) return <Insignia tono="exito" icono={CheckCircle2}>Reconocida</Insignia>
  return <Insignia tono="aviso">Revisar</Insignia>
}

const OPCIONES_AGRUPADAS = (['clave', 'toma', 'registro', 'paciente', 'otro'] as GrupoColumna[]).map((g) => ({
  grupo: g,
  columnas: COLUMNAS.filter((c) => c.grupo === g),
}))

const FORMATOS: Record<HojaAnalizada['formato'], string | null> = {
  filas: null,
  pacientesEnColumnas: 'Pacientes en columnas: cada fila de la planilla es un dato',
  fechasEnColumnas: 'Días en columnas: cada fila de la planilla es un dato',
  listaSinTitulos: 'Lista de nombres sin títulos',
}

function TablaColumnas({ hoja, onCambio, onRestablecer, onOmitir, tieneAjustes }: {
  hoja: HojaAnalizada
  onCambio: (indice: number, id: ColumnaId) => void
  onRestablecer: () => void
  onOmitir: (omitir: boolean) => void
  tieneAjustes: boolean
}) {
  const invertida = hoja.formato === 'pacientesEnColumnas' || hoja.formato === 'fechasEnColumnas'
  const tipo = {
    registros: <Insignia tono="exito">Registros diarios</Insignia>,
    pacientes: <Insignia tono="info">Lista de pacientes</Insignia>,
    omitida: <Insignia>No se importa</Insignia>,
  }[hoja.tipo]

  return (
    <div className="rounded-xl border border-arena">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-crema px-4 py-3">
        <h4 className="flex flex-wrap items-center gap-2 text-lg font-bold">
          Hoja “{hoja.nombre}” {tipo}
        </h4>
        <span className="flex flex-wrap items-center gap-3 text-base text-suave">
          {hoja.columnas.length > 0 && !invertida && `Títulos en la fila ${hoja.filaEncabezado + 1}`}
          {hoja.filasConDatos > 0 && ` · ${hoja.filasConDatos} ${invertida ? 'columnas' : 'filas'} con datos`}
          {(hoja.tipo !== 'omitida' || hoja.omitidaPorUsuario) && (
            <button
              type="button"
              onClick={() => onOmitir(!hoja.omitidaPorUsuario)}
              className="min-h-10 rounded-lg border-2 border-arena-oscura bg-blanco px-3 font-bold text-salvia-800 hover:bg-salvia-50"
            >
              {hoja.omitidaPorUsuario ? 'Sí, importar esta hoja' : 'No importar esta hoja'}
            </button>
          )}
        </span>
      </div>
      {FORMATOS[hoja.formato] && <p className="px-4 pt-2 text-base font-bold text-cielo">{FORMATOS[hoja.formato]}</p>}
      {hoja.pacientesPorTitulo.length > 0 && (
        <p className="px-4 pt-2 text-base text-cielo">
          Pacientes encontrados como títulos dentro de la hoja: <strong>{hoja.pacientesPorTitulo.join(', ')}</strong>
        </p>
      )}
      {hoja.motivo && (
        <p className="flex items-center gap-2 px-4 py-2 text-base text-ambar">
          <Info aria-hidden className="size-5" /> {hoja.motivo}
          {hoja.columnas.length > 0 && '. Podés elegir las columnas a mano.'}
        </p>
      )}
      {((hoja.pacientePorDefecto && hoja.pacientesPorTitulo.length === 0) || hoja.fechaPorDefecto) && (
        <p className="px-4 py-2 text-base text-cielo">
          {hoja.pacientePorDefecto && hoja.pacientesPorTitulo.length === 0 && (
            <>Paciente tomado del nombre de la hoja o título: <strong>{hoja.pacientePorDefecto}</strong>. </>
          )}
          {hoja.fechaPorDefecto && <>Fecha tomada del título: <strong>{fechaCorta(hoja.fechaPorDefecto)}</strong>.</>}
        </p>
      )}
      {hoja.columnas.length > 0 && !hoja.omitidaPorUsuario && (
        <ul className="divide-y divide-arena">
          {hoja.columnas.map((c) => (
            <li key={c.indice} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto_minmax(14rem,18rem)] sm:items-center">
              <div className="min-w-0">
                <p className="text-lg">
                  {!invertida && (
                    <span className="mr-2 inline-grid min-w-8 place-items-center rounded bg-arena/60 px-1.5 text-base font-bold text-suave">{c.letra}</span>
                  )}
                  <span className="font-bold break-words">{c.encabezado}</span>
                </p>
                {c.nota && c.nota !== 'No se reconoció' && <p className="text-sm text-suave">{c.nota}</p>}
                {c.horaToma && <p className="text-sm text-suave">Toma de las {c.horaToma}</p>}
                {!c.horaToma && c.grupoToma && !c.grupoToma.startsWith('#') && <p className="text-sm text-suave">Toma de la {c.grupoToma}</p>}
                {c.grupoToma && c.grupoToma !== '#0' && c.grupoToma.startsWith('#') && <p className="text-sm text-suave">Toma n.º {Number(c.grupoToma.slice(1)) + 1}</p>}
              </div>
              <InsigniaConfianza c={c} />
              <select
                aria-label={`Qué es la columna ${c.letra} (${c.encabezado})`}
                className={`control min-h-12 text-base ${c.id === 'ignorar' ? 'text-suave' : 'font-bold'}`}
                value={c.id}
                onChange={(e) => onCambio(c.indice, e.target.value as ColumnaId)}
              >
                {OPCIONES_AGRUPADAS.map(({ grupo, columnas }) => (
                  <optgroup key={grupo} label={NOMBRE_GRUPO[grupo]}>
                    {columnas.map((col) => (
                      <option key={col.id} value={col.id}>{col.etiqueta}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
      {tieneAjustes && (
        <div className="border-t border-arena px-4 py-2">
          <button type="button" onClick={onRestablecer} className="min-h-11 font-bold text-salvia-700 underline">
            Volver a la detección automática
          </button>
        </div>
      )}
    </div>
  )
}

const ICONO_PROBLEMA = { error: AlertCircle, aviso: AlertTriangle, info: Info }
const COLOR_PROBLEMA = { error: 'text-coral', aviso: 'text-ambar', info: 'text-cielo' }

function ListaProblemas({ problemas }: { problemas: Problema[] }) {
  const [todos, setTodos] = useState(false)
  const orden = { error: 0, aviso: 1, info: 2 }
  const ordenados = [...problemas].sort((a, b) => orden[a.nivel] - orden[b.nivel])
  const visibles = todos ? ordenados : ordenados.slice(0, 15)
  return (
    <>
      <ul className="space-y-2">
        {visibles.map((p, i) => {
          const Icono = ICONO_PROBLEMA[p.nivel]
          return (
            <li key={i} className="flex gap-2 text-base">
              <Icono aria-hidden className={`mt-0.5 size-5 shrink-0 ${COLOR_PROBLEMA[p.nivel]}`} />
              <span>
                <span className="font-bold">
                  {p.hoja}
                  {p.fila != null && `, fila ${p.fila}`}
                  {p.ubicacion && `, ${p.ubicacion}`}:
                </span>{' '}
                {p.mensaje}
              </span>
            </li>
          )
        })}
      </ul>
      {ordenados.length > visibles.length && (
        <Boton variante="suave" className="mt-3" onClick={() => setTodos(true)}>
          Ver los {ordenados.length} avisos
        </Boton>
      )}
    </>
  )
}

const ESTADO: Record<EstadoItem, { texto: string; tono: 'exito' | 'info' | 'neutro' }> = {
  nuevo: { texto: 'Nuevo', tono: 'exito' },
  actualiza: { texto: 'Se actualiza', tono: 'info' },
  sinCambios: { texto: 'Sin cambios', tono: 'neutro' },
  omitido: { texto: 'No se toca', tono: 'neutro' },
}

function VistaPrevia({ plan }: { plan: Plan }) {
  const [filtro, setFiltro] = useState<EstadoItem | 'todos'>('todos')
  const [limite, setLimite] = useState(50)
  const items = plan.items.filter((i) => filtro === 'todos' || i.estado === filtro)
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        {(['todos', 'nuevo', 'actualiza', 'sinCambios'] as const).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filtro === f}
            onClick={() => setFiltro(f)}
            className={`min-h-11 rounded-full border-2 px-4 text-base font-bold ${
              filtro === f ? 'border-salvia-600 bg-salvia-600 text-white' : 'border-salvia-200 bg-blanco text-salvia-800'
            }`}
          >
            {f === 'todos' ? 'Todos' : ESTADO[f].texto}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-arena">
        <table className="w-full min-w-[40rem] text-left text-base">
          <thead className="bg-crema text-salvia-900">
            <tr>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Paciente</th>
              <th className="px-3 py-2">Contenido</th>
              <th className="px-3 py-2">Fila del Excel</th>
            </tr>
          </thead>
          <tbody>
            {items.slice(0, limite).map((it) => {
              const imp = it.importado
              const campos = Object.keys(imp.textos).map((k) => ETIQUETA_CAMPO[k as keyof typeof ETIQUETA_CAMPO])
              return (
                <tr key={imp.clave + it.estado} className="border-t border-arena align-top">
                  <td className="px-3 py-2"><Insignia tono={ESTADO[it.estado].tono}>{ESTADO[it.estado].texto}</Insignia></td>
                  <td className="whitespace-nowrap px-3 py-2 font-bold">{fechaCorta(imp.fecha)}</td>
                  <td className="px-3 py-2">{imp.pacienteNombre}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {imp.tomas.length > 0 && <Insignia tono="marca">{imp.tomas.length} {imp.tomas.length === 1 ? 'toma' : 'tomas'}</Insignia>}
                      <InsigniaAlimentacion estado={imp.alimentacion.estado} />
                      {campos.length > 0 && <span className="text-suave">{campos.join(', ')}</span>}
                    </div>
                    {it.cambios.length > 0 && it.estado === 'actualiza' && (
                      <p className="mt-1 text-sm text-cielo">Cambia: {it.cambios.join(', ')}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-suave">
                    {imp.origen.slice(0, 3).map((o) => `${o.hoja} ${o.ubicacion ?? o.fila}`).join(', ')}
                    {imp.origen.length > 3 && ` y ${imp.origen.length - 3} más`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {items.length > limite && (
        <Boton variante="suave" className="mt-3" onClick={() => setLimite((l) => l + 200)}>
          Ver más ({items.length - limite} restantes)
        </Boton>
      )}
    </>
  )
}
