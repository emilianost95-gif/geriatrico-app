import { useLiveQuery } from 'dexie-react-hooks'
import { db as dbPorDefecto, type GeriatricoDB } from './database'

/** Ajustes conocidos y su tipo */
export interface Ajustes {
  /** Nombre del hogar: aparece en el encabezado, los Excel y los PDF */
  nombreHogar: string
  /** Fecha y hora (ISO) de la última copia de seguridad hecha a mano o automática */
  ultimaCopia: string
  /** Copia automática diaria en la carpeta Documentos (solo APK) */
  copiaAutomatica: boolean
  /** Última carpeta/archivo donde se guardó la copia automática */
  ultimaCopiaAutoArchivo: string
  /** Recordar hacer copia cada N días */
  diasRecordatorioCopia: number
}

export const AJUSTES_POR_DEFECTO: Ajustes = {
  nombreHogar: '',
  ultimaCopia: '',
  copiaAutomatica: true,
  ultimaCopiaAutoArchivo: '',
  diasRecordatorioCopia: 7,
}

export async function leerAjuste<K extends keyof Ajustes>(clave: K, db: GeriatricoDB = dbPorDefecto): Promise<Ajustes[K]> {
  const fila = await db.ajustes.get(clave)
  return (fila?.valor as Ajustes[K] | undefined) ?? AJUSTES_POR_DEFECTO[clave]
}

export async function guardarAjuste<K extends keyof Ajustes>(clave: K, valor: Ajustes[K], db: GeriatricoDB = dbPorDefecto) {
  await db.ajustes.put({ clave, valor })
}

export async function leerAjustes(db: GeriatricoDB = dbPorDefecto): Promise<Ajustes> {
  const filas = await db.ajustes.toArray()
  const res = { ...AJUSTES_POR_DEFECTO } as Record<string, unknown>
  for (const f of filas) if (f.clave in res) res[f.clave] = f.valor
  return res as unknown as Ajustes
}

/** Ajustes en vivo (se actualizan solos). undefined mientras cargan. */
export function useAjustes(): Ajustes | undefined {
  return useLiveQuery(() => leerAjustes(), [])
}
