import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, ChartLine, ClipboardPlus, Download, FileText, LayoutList, Pencil, Phone, StickyNote, Table2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { mensajeDeError, useAvisos } from '../components/Avisos'
import { useConfirmar } from '../components/Confirmar'
import { GraficosEvolucion } from '../components/Graficos'
import { FiltroFechas, rangoDeAtajo, type RangoFechas } from '../components/FiltroFechas'
import { Alternador, Boton, BotonLink, Cargando, EstadoVacio, Insignia } from '../components/ui'
import { TablaRegistros, TarjetaRegistro, urlRegistro } from '../components/VistaRegistros'
import { db } from '../db/database'
import { consultarRegistros, eliminarRegistro } from '../db/registros'
import type { Registro } from '../domain/tipos'
import { exportarAExcel } from '../excel/acciones'
import { edad, fechaCorta, fechaLarga, hoyISO } from '../lib/fechas'
import { esNativo, textoArchivoListo } from '../lib/plataforma'
import { usePreferencia } from '../lib/usePreferencia'

export function PaginaPaciente() {
  const id = Number(useParams().id)
  const avisos = useAvisos()
  const confirmar = useConfirmar()
  const [rango, setRango] = useState<RangoFechas>(() => rangoDeAtajo('mes'))
  const [vista, setVista] = usePreferencia<'tarjetas' | 'tabla' | 'graficos'>('vista-historial', 'tarjetas')
  const [exportando, setExportando] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState(false)

  const paciente = useLiveQuery(async () => (await db.pacientes.get(id)) ?? null, [id])
  const registros = useLiveQuery(() => consultarRegistros({ pacienteId: id, desde: rango.desde, hasta: rango.hasta }), [id, rango])
  const total = useLiveQuery(() => db.registros.where('pacienteId').equals(id).count(), [id])

  if (paciente === undefined) return <Cargando />
  if (paciente === null) {
    return (
      <EstadoVacio icono={StickyNote} titulo="No se encontró el paciente">
        <BotonLink to="/pacientes">Volver a pacientes</BotonLink>
      </EstadoVacio>
    )
  }

  async function eliminar(r: Registro) {
    const ok = await confirmar({
      titulo: '¿Eliminar este registro?',
      mensaje: `Se borrará todo lo cargado el ${fechaLarga(r.fecha)} para ${paciente!.nombre}. No se puede deshacer.`,
      textoConfirmar: 'Sí, eliminar',
      peligro: true,
    })
    if (!ok) return
    try {
      await eliminarRegistro(r.id!)
      avisos.exito('Registro eliminado.')
    } catch (e) {
      avisos.error(mensajeDeError(e))
    }
  }

  async function exportar() {
    setExportando(true)
    try {
      const n = await exportarAExcel({ pacienteId: id, desde: rango.desde, hasta: rango.hasta })
      avisos.exito(textoArchivoListo(n))
    } catch (e) {
      avisos.error(`No se pudo exportar: ${mensajeDeError(e)}`)
    } finally {
      setExportando(false)
    }
  }

  async function informePdf() {
    setGenerandoPdf(true)
    try {
      const { descargarInformePaciente } = await import('../pdf/acciones')
      await descargarInformePaciente(id, rango.desde || undefined, rango.hasta || undefined)
      avisos.exito(esNativo ? 'Informe PDF listo. Elegí dónde guardarlo o a quién mandarlo.' : 'Informe PDF descargado.')
    } catch (e) {
      avisos.error(`No se pudo crear el PDF: ${mensajeDeError(e)}`)
    } finally {
      setGenerandoPdf(false)
    }
  }

  const anios = edad(paciente.fechaNacimiento)
  const datos = [
    paciente.habitacion && `Habitación ${paciente.habitacion}`,
    anios != null && `${anios} años (nació el ${fechaCorta(paciente.fechaNacimiento!)})`,
    paciente.documento && `Doc. ${paciente.documento}`,
  ].filter(Boolean)

  return (
    <>
      <Link to="/pacientes" className="mb-3 inline-flex min-h-11 items-center gap-2 text-lg font-bold text-salvia-700 hover:underline no-imprimir">
        <ArrowLeft aria-hidden className="size-5" /> Todos los pacientes
      </Link>

      <section className="tarjeta mb-6 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-3 text-3xl sm:text-4xl">
              {paciente.nombre}
              {!paciente.activo && <Insignia>De alta</Insignia>}
            </h1>
            {datos.length > 0 && <p className="mt-1 text-lg text-suave">{datos.join(' · ')}</p>}
            {paciente.contacto && (
              <p className="mt-1 flex items-center gap-2 text-lg">
                <Phone aria-hidden className="size-5 text-salvia-600" /> {paciente.contacto}
              </p>
            )}
          </div>
          <BotonLink to={`/pacientes/${id}/editar`} variante="suave" icono={Pencil} className="no-imprimir">
            Editar datos
          </BotonLink>
        </div>
        {paciente.notas && (
          <p className="mt-4 whitespace-pre-line rounded-xl bg-ambar-claro p-4 text-lg">
            <StickyNote aria-hidden className="mr-2 inline size-5 text-ambar" />
            {paciente.notas}
          </p>
        )}
        <div className="mt-5 grid gap-3 sm:grid-cols-3 no-imprimir">
          <BotonLink to={urlRegistro(id, hoyISO())} icono={ClipboardPlus} grande>
            Nuevo registro
          </BotonLink>
          <Boton variante="secundario" icono={Download} grande onClick={exportar} disabled={exportando || !registros?.length}>
            {exportando ? 'Preparando…' : 'Excel'}
          </Boton>
          <Boton variante="secundario" icono={FileText} grande onClick={informePdf} disabled={generandoPdf || !registros?.length}>
            {generandoPdf ? 'Preparando…' : 'Informe PDF'}
          </Boton>
        </div>
        <p className="mt-2 text-base text-suave no-imprimir">El Excel y el PDF usan el período elegido abajo en el historial.</p>
      </section>

      <section aria-labelledby="titulo-historial">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 id="titulo-historial" className="text-3xl">
            Historial
          </h2>
          <span className="text-lg text-suave">{total ?? '…'} registros en total</span>
        </div>
        <div className="tarjeta mb-4 flex flex-col gap-4 p-4 lg:flex-row lg:items-end lg:justify-between no-imprimir">
          <div className="lg:max-w-xl lg:flex-1">
            <FiltroFechas valor={rango} onCambio={setRango} />
          </div>
          <Alternador
            etiqueta="Forma de ver el historial"
            valor={vista}
            onCambio={setVista}
            opciones={[
              { valor: 'tarjetas', texto: 'Tarjetas', icono: LayoutList },
              { valor: 'tabla', texto: 'Tabla', icono: Table2 },
              { valor: 'graficos', texto: 'Gráficos', icono: ChartLine },
            ]}
          />
        </div>

        {registros === undefined ? (
          <Cargando />
        ) : registros.length === 0 ? (
          <EstadoVacio
            icono={ClipboardPlus}
            titulo="No hay registros en estas fechas"
            texto={total ? 'Probá con otro período, por ejemplo "Todo".' : 'Todavía no se cargó ningún registro para este paciente.'}
          >
            <BotonLink to={urlRegistro(id, hoyISO())} icono={ClipboardPlus}>
              Cargar el de hoy
            </BotonLink>
          </EstadoVacio>
        ) : vista === 'graficos' ? (
          <GraficosEvolucion registros={registros} />
        ) : vista === 'tabla' ? (
          <TablaRegistros registros={registros} pacientes={new Map([[id, paciente]])} />
        ) : (
          <div className="space-y-4">
            {registros.map((r) => (
              <TarjetaRegistro key={r.id} registro={r} onEliminar={eliminar} />
            ))}
          </div>
        )}
      </section>
    </>
  )
}
