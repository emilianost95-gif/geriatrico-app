// Genera ejemplos/ejemplo-importacion.xlsx: una planilla "desprolija" a propósito,
// como las que se arman a mano, para probar la importación inteligente.
// Uso: npm run ejemplo
import ExcelJS from 'exceljs'
import { mkdirSync } from 'node:fs'

const wb = new ExcelJS.Workbook()
const fecha = (d, m, y) => new Date(Date.UTC(y, m - 1, d))

// ─── Hoja 1: control general con celdas combinadas y títulos distintos ───
const ws = wb.addWorksheet('Septiembre')
ws.addRow(['RESIDENCIA LOS AROMOS — CONTROL DIARIO DE ENFERMERÍA'])
ws.mergeCells('A1:V1')
ws.getCell('A1').font = { bold: true, size: 14 }
ws.addRow([])
const titulos = [
  'Día', 'Apellido y Nombre', 'Hab.', 'Hora', 'T.A.', 'Pulso', 'Temp °C', 'SatO2 %', 'HGT',
  'Control de leucemia', 'Zonda SV', 'Diuresis', 'Deposiciones', 'SNG', 'Curaciones',
  'Alimentación', 'Rotación', 'Ejercicio', 'Sueño', 'Comportamiento', 'Obs.', 'Firma',
]
ws.addRow(titulos).font = { bold: true }

// [fecha, nombre, hab, [tomas], datos del día]
const filas = [
  [fecha(13, 9, 2026), 'GONZÁLEZ, María', '4B',
    [['08:00', '120/80', 72, 36.5, 96, 110], ['20:00', '130/85', 78, '36,8', 0.95, 145]],
    ['Sin estudios', 'No usa', 'Normal', 'Sí', 'No usa', 'No requiere', 'Positiva - comió todo', 'Cada 2 horas', 'Caminó', 'Durmió bien', 'Tranquila', 'Visita de la hija', 'Ana']],
  [fecha(13, 9, 2026), 'Pérez Juan Carlos', '2A',
    [['08:30', '12/8', '68 lpm', 365, 93, null], ['21:00', '140/90', 82, 37.9, 92, null]],
    ['Hemograma enviado', 'Permeable', 'Escasa, orina oscura', 'No', 'No usa', 'Escara sacra: curación con apósito', 'NEG - rechazó la cena', 'Cada 2 horas', 'Ejercicios en cama', 'Despertó varias veces', 'Desorientado a la tarde', 'Se avisó al médico por la fiebre', 'Ana']],
  [fecha(14, 9, 2026), 'Maria Gonzalez', '4B',
    [['08:00', '118/76', 70, 36.4, 97, 105]],
    ['', 'No usa', 'Normal', 'No hizo', 'No usa', '', '+', 'Cada 4 horas', 'Kinesiología', 'Durmió bien', 'Orientada', '', 'Luis']],
  [fecha(14, 9, 2026), 'Pérez, Juan Carlos', '2A',
    [['08:00', '135/88', 80, 37.2, 94, null], ['14:00', '130/84', 76, 36.9, 95, null], ['20:00', '128/82', 74, 36.7, 95, null]],
    ['', 'Permeable', 'Normal', 'Líquida', 'Alimentación por SNG', 'Curación realizada', 'comió bien', 'Cada 2 horas', 'No realizó', 'Durmió poco', 'Tranquilo', 'Mejor que ayer', 'Luis']],
  ['15-09-26', 'Luis Soto', '7',
    [['9 hs', '150/95', 88, 36.6, 96, 210], ['21 hs', '145/90', 84, 36.5, 96, 180]],
    ['', 'No usa', 'Abundante', 'Sí, normal', 'No usa', 'No requiere', 'media porción', 'Se moviliza solo', 'Caminó', 'Insomnio', 'Agitado a la noche', 'Glucemia alta a la mañana', 'Ana']],
]

for (const [f, nombre, hab, tomas, dia] of filas) {
  const inicio = ws.rowCount + 1
  tomas.forEach((t, i) => {
    const datosDia = i === 0 ? dia.slice(0, -1) : dia.slice(0, -1).map(() => null)
    ws.addRow([f, nombre, hab, ...t, ...datosDia, dia.at(-1)])
  })
  const fin = ws.rowCount
  if (fin > inicio) {
    // Fecha, nombre y habitación combinados en vertical, como se suele hacer a mano
    for (const col of ['A', 'B', 'C']) ws.mergeCells(`${col}${inicio}:${col}${fin}`)
  }
}
ws.getColumn(1).numFmt = 'dd/mm/yyyy'
ws.columns.forEach((c, i) => (c.width = i === 1 ? 24 : 14))

// ─── Hoja 2: una hoja por paciente, sin columna de nombre ni de fecha ───
const wr = wb.addWorksheet('Rosa Fernández')
wr.addRow(['Planilla del 14/09/2026'])
wr.addRow(['Horario', 'Presión arterial', 'FC', 'Temperatura', 'Saturación', 'Observaciones'])
wr.addRow(['08:00', '110/70', 66, 36.2, 98, 'Desayunó bien'])
wr.addRow(['16:00', '115/75', 70, 36.4, 97, ''])
wr.addRow(['22:00', '112/72', 64, 36.3, 97, 'Se acostó temprano'])
wr.columns.forEach((c) => (c.width = 16))

// ─── Hoja 3: lista de pacientes con Nombre y Apellido separados ───
const wp = wb.addWorksheet('Pacientes')
wp.addRow(['Nombre', 'Apellido', 'Habitación', 'RUT', 'Fecha de nacimiento', 'Contacto familiar'])
wp.addRow(['María', 'González', '4B', '5.123.456-7', fecha(3, 5, 1938), 'Laura (hija) 9 1234 5678'])
wp.addRow(['Juan Carlos', 'Pérez', '2A', '4.987.654-3', fecha(21, 11, 1941), 'Pedro (hijo) 9 8765 4321'])
wp.addRow(['Luis', 'Soto', '7', '6.555.444-1', '12/02/1945', ''])
wp.addRow(['Rosa', 'Fernández', '5', '', '1940-08-30', 'Carmen (sobrina)'])
wp.getColumn(5).numFmt = 'dd/mm/yyyy'
wp.columns.forEach((c) => (c.width = 20))

mkdirSync('ejemplos', { recursive: true })
await wb.xlsx.writeFile('ejemplos/ejemplo-importacion.xlsx')
console.log('✔ ejemplos/ejemplo-importacion.xlsx generado')

// ═══ Segundo archivo: migración de un hogar completo (muchos pacientes, formatos mezclados) ═══
const m = new ExcelJS.Workbook()

// Hoja 1: padrón de residentes, sin títulos y con "Hab." pegado al nombre
const m1 = m.addWorksheet('Residentes')
;[
  ['Hab. 1 - Díaz, Ana'], ['Hab. 2 - Soto, Luis'], ['Hab. 3 - Fernández, Rosa'], ['Hab. 4 - Morales, Elena'],
  ['Hab. 5 - Ruiz, Héctor'], ['Hab. 6 - Castro, Olga'], ['Hab. 7 - Vega, Ramón'], ['Hab. 8 - Paz, Teresa'],
].forEach((f) => m1.addRow(f))
m1.getColumn(1).width = 32

// Hoja 2: cuaderno de enfermería, un bloque por paciente (cada bloque con sus columnas)
const m2 = m.addWorksheet('Cuaderno')
const bloque = (titulo, cabecera, filas) => {
  const r = m2.addRow([titulo])
  r.font = { bold: true, size: 13 }
  m2.mergeCells(r.number, 1, r.number, cabecera.length)
  m2.addRow(cabecera).font = { bold: true }
  filas.forEach((f) => m2.addRow(f))
  m2.addRow([])
}
bloque('PACIENTE: ANA DÍAZ   HAB. 1', ['Fecha', 'Hora', 'T.A.', 'F.C.', 'Temp.', 'Sat.', 'Diuresis', 'Obs.'], [
  ['14/09/2026', '08:00', '120/80', 70, 36.5, 96, 'Normal', 'Tranquila'],
  ['14/09/2026', '20:00', '125/80', 72, 36.7, 95, '', ''],
  ['15/09/2026', '08:00', '118/78', 68, 36.4, 97, 'Normal', 'Visita del hijo'],
])
bloque('PACIENTE: LUIS SOTO   HAB. 2', ['Fecha', 'HGT', 'Alimentación', 'Sueño', 'Comportamiento'], [
  ['14/09/2026', 210, 'Negativa - no quiso cenar', 'Insomnio', 'Agitado a la noche'],
  ['15/09/2026', 180, 'Positiva', 'Durmió bien', 'Tranquilo'],
])
m2.columns.forEach((c) => (c.width = 16))

// Hoja 3: planilla del turno, los pacientes en columnas
const m3 = m.addWorksheet('Turno 16-09-2026')
;[
  ['Control', 'Elena Morales', 'Héctor Ruiz', 'Olga Castro', 'Ramón Vega'],
  ['Presión arterial', '130/85', '140/90', '110/70', '125/80'],
  ['Pulso', 78, 84, 66, 72],
  ['Temperatura', 36.6, 38.2, 36.1, 36.8],
  ['Saturación', 95, 91, 97, 88],
  ['Diuresis', 'Normal', 'Escasa', 'Normal', 'Normal'],
  ['Catarsis', 'Sí', 'No', 'Sí', 'No'],
  ['Alimentación', '+', '-', '+', '+'],
  ['Firma', 'Marta', 'Marta', 'Marta', 'Marta'],
].forEach((f, i) => (m3.addRow(f).font = { bold: i === 0 }))
m3.columns.forEach((c, i) => (c.width = i === 0 ? 20 : 16))

// Hoja 4: control mensual de glucemia de una paciente, los días en columnas
const m4 = m.addWorksheet('Teresa Paz')
m4.addRow(['CONTROL DE GLUCEMIA — SEPTIEMBRE 2026']).font = { bold: true }
m4.addRow(['Día', 10, 11, 12, 13, 14, 15, 16]).font = { bold: true }
m4.addRow(['HGT', 110, 125, 98, 140, 132, 118, 105])
m4.addRow(['Presión', '120/80', '', '118/76', '', '122/80', '', '120/78'])

// Hoja 5: registro por fecha (la fecha es una fila separadora)
const m5 = m.addWorksheet('Rosa')
;[
  ['Paciente', 'PA', 'FC', 'Rotación', 'Curaciones'],
  ['Lunes 15/09/2026'],
  ['Rosa Fernández', '110/70', 66, 'Cada 2 horas', 'Talón izquierdo'],
  ['Martes 16/09/2026'],
  ['Rosa Fernández', '112/72', 64, 'Cada 2 horas', 'Talón izquierdo, mejorando'],
].forEach((f) => m5.addRow(f))
m5.columns.forEach((c) => (c.width = 20))

await m.xlsx.writeFile('ejemplos/ejemplo-migracion.xlsx')
console.log('✔ ejemplos/ejemplo-migracion.xlsx generado')
