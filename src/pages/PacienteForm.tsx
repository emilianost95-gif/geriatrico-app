import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Save, Trash2, UserCheck, UserMinus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { mensajeDeError, useAvisos } from '../components/Avisos'
import { useConfirmar } from '../components/Confirmar'
import { Encabezado } from '../components/Layout'
import { AreaTexto, Boton, Campo, Cargando } from '../components/ui'
import { db } from '../db/database'
import {
  actualizarPaciente,
  buscarMismoNombre,
  cambiarActivo,
  crearPaciente,
  eliminarPaciente,
  type DatosPaciente,
} from '../db/pacientes'
import type { Paciente } from '../domain/tipos'
import { hoyISO } from '../lib/fechas'

const VACIO: DatosPaciente = { nombre: '', habitacion: '', documento: '', fechaNacimiento: '', contacto: '', notas: '' }

export function PaginaPacienteForm() {
  const { id } = useParams()
  const idNum = id ? Number(id) : undefined
  // undefined = cargando · null = no existe
  const paciente = useLiveQuery(async () => (idNum ? ((await db.pacientes.get(idNum)) ?? null) : null), [idNum])

  if (idNum && paciente === undefined) return <Cargando />
  if (idNum && paciente === null) return <p className="text-lg">No se encontró el paciente.</p>
  // key: si cambia el paciente, se reinicia el formulario
  return <Formulario key={idNum ?? 'nuevo'} paciente={paciente ?? undefined} />
}

function Formulario({ paciente }: { paciente?: Paciente }) {
  const navegar = useNavigate()
  const avisos = useAvisos()
  const confirmar = useConfirmar()
  const [datos, setDatos] = useState<DatosPaciente>(() => (paciente ? { ...VACIO, ...paciente } : VACIO))
  const [error, setError] = useState<string>()
  const [guardando, setGuardando] = useState(false)
  const editando = !!paciente

  const set = (k: keyof DatosPaciente) => (e: { target: { value: string } }) => setDatos((d) => ({ ...d, [k]: e.target.value }))

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!datos.nombre.trim()) {
      setError('Escribí el nombre del paciente.')
      return
    }
    setGuardando(true)
    try {
      const repetido = await buscarMismoNombre(datos.nombre, paciente?.id)
      if (
        repetido &&
        !(await confirmar({
          titulo: 'Ya hay un paciente con ese nombre',
          mensaje: `"${repetido.nombre}" ya está cargado. ¿Querés guardar otro paciente con el mismo nombre?`,
          textoConfirmar: 'Sí, guardar igual',
        }))
      ) {
        return
      }
      if (editando) {
        await actualizarPaciente(paciente.id!, datos)
        avisos.exito('Datos del paciente guardados.')
        navegar(`/pacientes/${paciente.id}`)
      } else {
        const nuevoId = await crearPaciente(datos)
        avisos.exito(`${datos.nombre.trim()} se agregó a la lista.`)
        navegar(`/pacientes/${nuevoId}`)
      }
    } catch (err) {
      avisos.error(mensajeDeError(err))
    } finally {
      setGuardando(false)
    }
  }

  async function alternarAlta() {
    if (!paciente) return
    if (paciente.activo) {
      const ok = await confirmar({
        titulo: `¿Dar de alta a ${paciente.nombre}?`,
        mensaje: 'Deja de aparecer en la lista principal, pero su historial se conserva. Se puede reactivar cuando quieras.',
        textoConfirmar: 'Dar de alta',
      })
      if (!ok) return
    }
    await cambiarActivo(paciente.id!, !paciente.activo)
    avisos.exito(paciente.activo ? 'Paciente dado de alta.' : 'Paciente reactivado.')
    navegar(`/pacientes/${paciente.id}`)
  }

  async function eliminar() {
    if (!paciente) return
    const cantidad = await db.registros.where('pacienteId').equals(paciente.id!).count()
    const ok = await confirmar({
      titulo: `¿Eliminar a ${paciente.nombre}?`,
      mensaje: (
        <>
          Se borrarán el paciente y <strong>{cantidad} {cantidad === 1 ? 'registro' : 'registros'}</strong>. Esto no se puede deshacer.
          {cantidad > 0 && <> Si solo dejó el hogar, mejor usá “Dar de alta”.</>}
        </>
      ),
      textoConfirmar: 'Sí, eliminar',
      peligro: true,
    })
    if (!ok) return
    try {
      await eliminarPaciente(paciente.id!)
      avisos.exito('Paciente eliminado.')
      navegar('/pacientes')
    } catch (err) {
      avisos.error(mensajeDeError(err))
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link to={editando ? `/pacientes/${paciente.id}` : '/pacientes'} className="mb-3 inline-flex min-h-11 items-center gap-2 text-lg font-bold text-salvia-700 hover:underline">
        <ArrowLeft aria-hidden className="size-5" /> Volver
      </Link>
      <Encabezado titulo={editando ? 'Editar paciente' : 'Nuevo paciente'} subtitulo="Solo el nombre es obligatorio." />

      <form onSubmit={guardar} className="tarjeta space-y-5 p-5 sm:p-6" noValidate>
        <Campo
          etiqueta="Nombre y apellido"
          required
          autoFocus={!editando}
          value={datos.nombre}
          onChange={(e) => {
            set('nombre')(e)
            setError(undefined)
          }}
          error={error}
          autoComplete="off"
          placeholder="Ej.: María González"
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <Campo etiqueta="Habitación / cama" value={datos.habitacion} onChange={set('habitacion')} placeholder="Ej.: 4B" />
          <Campo etiqueta="Documento (DNI / RUT)" value={datos.documento} onChange={set('documento')} />
          <Campo etiqueta="Fecha de nacimiento" type="date" max={hoyISO()} value={datos.fechaNacimiento} onChange={set('fechaNacimiento')} />
          <Campo etiqueta="Contacto de un familiar" value={datos.contacto} onChange={set('contacto')} placeholder="Nombre y teléfono" />
        </div>
        <AreaTexto etiqueta="Notas" value={datos.notas} onChange={set('notas')} placeholder="Diagnósticos, alergias, indicaciones…" />
        <Boton type="submit" icono={Save} grande ancho disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar paciente'}
        </Boton>
      </form>

      {editando && (
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Boton variante="secundario" icono={paciente.activo ? UserMinus : UserCheck} onClick={alternarAlta} className="flex-1">
            {paciente.activo ? 'Dar de alta' : 'Reactivar paciente'}
          </Boton>
          <Boton variante="peligro" icono={Trash2} onClick={eliminar} className="flex-1">
            Eliminar paciente
          </Boton>
        </div>
      )}
    </div>
  )
}
