import { useLiveQuery } from 'dexie-react-hooks'
import { ClipboardList, ClipboardPlus, Download, FileText, LayoutList, Table2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { mensajeDeError, useAvisos } from '../components/Avisos'
import { useConfirmar } from '../components/Confirmar'
import { FiltroFechas, rangoDeAtajo, type RangoFechas } from '../components/FiltroFechas'
import { Encabezado } from '../components/Layout'
import { Alternador, Boton, BotonLink, Cargando, EstadoVacio, Selector } from '../components/ui'
import { TablaRegistros, TarjetaRegistro } from '../components/VistaRegistros'
import { listarPacientes } from '../db/pacientes'
import { consultarRegistros, eliminarRegistro } from '../db/registros'
import type { Registro } from '../domain/tipos'
import { describirFiltro, exportarAExcel } from '../excel/acciones'
import { fechaLarga, hoyISO } from '../lib/fechas'
import { esNativo, textoArchivoListo } from '../lib/plataforma'
import { usePreferencia } from '../lib/usePreferencia'

export function PaginaRegistros() {
  const avisos = useAvisos()
  const confirmar = useConfirmar()
  const [pacienteId, setPacienteId] = useState<number>()
  const [rango, setRango] = useState<RangoFechas>(() => rangoDeAtajo('semana'))
  const [vista, setVista] = usePreferencia<'tarjetas' | 'tabla'>('vista-registros', 'tarjetas')
  const [exportando, setExportando] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState(false)

  const pacientes = useLiveQuery(listarPacientes, [])
  const filtro = { pacienteId, desde: rango.desde, hasta: rango.hasta }
  const registros = useLiveQuery(() => consultarRegistros(filtro), [pacienteId, rango])
  const porId = useMemo(() => new Map((pacientes ?? []).map((p) => [p.id!, p])), [pacientes])

  // Agrupados por día para la vista de tarjetas
  const porDia = useMemo(() => {
    const m = new Map<string, Registro[]>()
    for (const r of registros ?? []) {
      const lista = m.get(r.fecha) ?? []
      lista.push(r)
      m.set(r.fecha, lista)
    }
    for (const lista of m.values()) {
      lista.sort((a, b) => (porId.get(a.pacienteId)?.nombre ?? '').localeCompare(porId.get(b.pacienteId)?.nombre ?? '', 'es'))
    }
    return [...m.entries()]
  }, [registros, porId])

  if (!pacientes) return <Cargando />

  async function exportar() {
    setExportando(true)
    try {
      const n = await exportarAExcel(filtro)
      avisos.exito(textoArchivoListo(n))
    } catch (e) {
      avisos.error(`No se pudo exportar: ${mensajeDeError(e)}`)
    } finally {
      setExportando(false)
    }
  }

  async function informePdf() {
    const fechas = [...new Set((registros ?? []).map((r) => r.fecha))].sort()
    if (fechas.length === 0) return
    if (fechas.length > 62) {
      avisos.error('El informe PDF admite hasta 2 meses. Elegí un período más corto.')
      return
    }
    setGenerandoPdf(true)
    try {
      const { descargarInformeDias } = await import('../pdf/acciones')
      await descargarInformeDias({
        desde: rango.desde || fechas[0],
        hasta: rango.hasta || fechas[fechas.length - 1],
        pacienteIds: pacienteId ? [pacienteId] : undefined,
      })
      avisos.exito(esNativo ? 'Informe PDF listo. Elegí dónde guardarlo o a quién mandarlo.' : 'Informe PDF descargado.')
    } catch (e) {
      avisos.error(`No se pudo crear el PDF: ${mensajeDeError(e)}`)
    } finally {
      setGenerandoPdf(false)
    }
  }

  async function eliminar(r: Registro) {
    const nombre = porId.get(r.pacienteId)?.nombre ?? 'el paciente'
    const ok = await confirmar({
      titulo: '¿Eliminar este registro?',
      mensaje: `Se borrará todo lo cargado para ${nombre} el ${fechaLarga(r.fecha)}. No se puede deshacer.`,
      textoConfirmar: 'Sí, eliminar',
      peligro: true,
    })
    if (!ok) return
    await eliminarRegistro(r.id!)
    avisos.exito('Registro eliminado.')
  }

  const nombrePaciente = pacienteId ? porId.get(pacienteId)?.nombre : undefined

  return (
    <>
      <Encabezado titulo="Registros" subtitulo="Buscá registros por paciente y por fecha.">
        <BotonLink to={`/registro?fecha=${hoyISO()}`} icono={ClipboardPlus}>
          Nuevo registro
        </BotonLink>
      </Encabezado>

      <section className="tarjeta mb-5 grid grid-cols-1 gap-5 p-5 lg:grid-cols-[1fr_2fr]" aria-label="Filtros">
        <Selector etiqueta="Paciente" value={pacienteId ?? ''} onChange={(e) => setPacienteId(e.target.value ? Number(e.target.value) : undefined)}>
          <option value="">Todos los pacientes</option>
          {pacientes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
              {!p.activo ? ' (de alta)' : ''}
            </option>
          ))}
        </Selector>
        <FiltroFechas valor={rango} onCambio={setRango} />
      </section>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-lg" aria-live="polite">
          <strong>{registros?.length ?? '…'}</strong> {registros?.length === 1 ? 'registro' : 'registros'} · <span className="text-suave">{describirFiltro(filtro, nombrePaciente)}</span>
        </p>
        <div className="flex flex-wrap gap-3">
          <Alternador
            etiqueta="Forma de ver los registros"
            valor={vista}
            onCambio={setVista}
            opciones={[
              { valor: 'tarjetas', texto: 'Tarjetas', icono: LayoutList },
              { valor: 'tabla', texto: 'Tabla', icono: Table2 },
            ]}
          />
          <Boton variante="secundario" icono={Download} onClick={exportar} disabled={exportando || !registros?.length}>
            {exportando ? 'Preparando…' : 'Excel'}
          </Boton>
          <Boton variante="secundario" icono={FileText} onClick={informePdf} disabled={generandoPdf || !registros?.length}>
            {generandoPdf ? 'Preparando…' : 'Informe PDF'}
          </Boton>
        </div>
      </div>

      {registros === undefined ? (
        <Cargando />
      ) : registros.length === 0 ? (
        <EstadoVacio icono={ClipboardList} titulo="No hay registros" texto="No hay registros con estos filtros. Probá eligiendo “Todo” o “Todos los pacientes”." />
      ) : vista === 'tabla' ? (
        <TablaRegistros registros={registros} pacientes={porId} mostrarPaciente />
      ) : (
        <div className="space-y-8">
          {porDia.map(([fecha, lista]) => (
            <section key={fecha} aria-label={fechaLarga(fecha)}>
              <h2 className="sticky top-[4.5rem] z-10 mb-3 bg-crema/95 py-2 text-2xl backdrop-blur first-letter:uppercase">
                {fechaLarga(fecha)} <span className="text-lg font-normal text-suave">· {lista.length}</span>
              </h2>
              <div className="space-y-4">
                {lista.map((r) => (
                  <TarjetaRegistro key={r.id} registro={r} paciente={porId.get(r.pacienteId)} mostrarPaciente onEliminar={eliminar} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
