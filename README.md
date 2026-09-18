# Registro Geriátrico

App web para llevar el registro diario de los pacientes de un hogar de adultos mayores.
Está pensada para personas que no son técnicas: letra grande, botones grandes, colores suaves
y opciones rápidas que se completan con un toque.

- Funciona **sin internet**. Se instala como **APK de Android** (compilado en GitHub Actions) o como app web (PWA).
- Los datos se guardan **en el dispositivo** (IndexedDB). No hay servidor ni cuentas.
- **Exporta** a Excel con formato e **importa** planillas de Excel armadas a mano (importación inteligente),
  incluida la **migración de todo el hogar** de una vez (muchos pacientes en el mismo archivo).
- Pantalla **Hoy** con avance del día y **alertas**, **ronda de signos** para todos los pacientes,
  **gráficos de evolución**, **informes PDF** para imprimir y **copias de seguridad** (automáticas en el APK).

---

## 1. Instalar y ejecutar

Requisitos: **Node.js 22 o superior** (lo pide Capacitor 8). Para ver tu versión: `node -v`.

```bash
cd geriatrico-app
npm install        # instala dependencias (una sola vez)
npm run dev        # modo desarrollo → abrí http://localhost:5173
```

Otros comandos:

| Comando | Qué hace |
|---|---|
| `npm run build` | Revisa los tipos y genera la versión web en `dist/` |
| `npm run build:android` | Genera la web para el APK y la copia al proyecto `android/` |
| `npm run android:abrir` | Abre el proyecto en Android Studio (si lo tenés instalado) |
| `npm run preview` | Sirve `dist/` para probarla como quedará publicada (http://localhost:4173) |
| `npm test` | Corre las 133 pruebas (importación, migración, exportación, copias, alertas, asistente, demo, PDF, base de datos) |
| `npm run ejemplo` | Vuelve a generar los Excel de `ejemplos/` |

### APK de Android (GitHub Actions)

El APK lo compila GitHub, no hace falta Android Studio. Ver la sección **6. Android** más abajo.

### Versión web (opcional)

`dist/` es una web estática: se puede subir gratis a **Netlify**, **Vercel**, **GitHub Pages** o **Cloudflare Pages**
(arrastrás la carpeta `dist` y listo; las rutas usan `#`, no hace falta configurar nada).
Después, desde la tablet:

1. Abrir la dirección en Chrome (Android) o Safari (iPad).
2. Menú → **"Agregar a la pantalla de inicio"** / **"Instalar app"**.
3. Desde ahí se abre como una app común, incluso sin internet.

> ⚠️ **Importante:** los datos quedan en ese dispositivo y en ese navegador.
> Si se borra el historial/datos del navegador o se cambia de tablet, se pierden.
> Por eso existe **Excel y copias → Copias → "Hacer copia ahora"** (un archivo `.json` con todo, que se
> restaura con "Restaurar una copia"). La pantalla Hoy avisa si pasaron más días de los elegidos en Ajustes.
> En el **APK** la copia es **automática**: una por día en `Documentos/RegistroGeriatrico` (quedan las últimas 14).
> La app además le pide al navegador "almacenamiento persistente" para que no borre datos por falta de espacio.

---

## 2. Tecnologías

| Pieza | Para qué |
|---|---|
| React 19 + TypeScript + Vite 8 | Interfaz y compilación |
| Tailwind CSS 4 | Estilos (tema en `src/index.css`) |
| Dexie 4 (IndexedDB) | Base de datos local con consultas reactivas (`useLiveQuery`) |
| ExcelJS | Leer y escribir `.xlsx` con formato (se carga solo al usar Excel) |
| PapaParse | Leer `.csv` |
| Capacitor 8 | Empaqueta la app como APK de Android (+ plugins Filesystem, Share y App) |
| vite-plugin-pwa (Workbox) | Instalación y funcionamiento offline en la versión web |
| React Router 8 (HashRouter) | Navegación |
| jsPDF + jspdf-autotable | Informes PDF (se cargan solo al pedir un informe) |
| Lucide | Íconos |
| Atkinson Hyperlegible | Tipografía diseñada para baja visión (incluida, funciona offline) |
| Vitest + fake-indexeddb | Pruebas |

> ¿Por qué ExcelJS y no SheetJS? La versión de SheetJS publicada en npm (0.18.5) está desactualizada
> y tiene vulnerabilidades conocidas; las versiones nuevas solo se distribuyen desde su CDN.
> ExcelJS está en npm, permite dar formato (colores, filtros, columnas fijas) y lee `.xlsx` sin problemas.
> Los `.xls` viejos no se leen: la app pide guardarlos como `.xlsx`.

---

## 3. Estructura

```
geriatrico-app/
├─ .github/workflows/                   (en la entrega vienen en `workflows-github/`: moverlos acá)
│  ├─ android.yml                      Compila el APK firmado (Artifacts y Releases)
│  └─ pages.yml                        Publica la versión web en GitHub Pages
├─ android/                            Proyecto nativo (Capacitor): íconos, firma, versión
├─ capacitor.config.ts                 Nombre e id de la app
├─ ejemplos/
│  ├─ ejemplo-importacion.xlsx         Planilla "desprolija" para probar la importación
│  └─ ejemplo-migracion.xlsx           Hogar completo: 8 residentes en 5 formatos distintos
├─ public/                             Íconos de la app
├─ scripts/generar-ejemplo.mjs         Genera el Excel de ejemplo
├─ src/
│  ├─ main.tsx · App.tsx               Arranque y rutas
│  ├─ index.css                        Tema: colores, tamaños, estilos base
│  ├─ domain/
│  │  ├─ tipos.ts                      Paciente, Registro, TomaSignos…
│  │  ├─ campos.ts                     ⭐ Definición de TODOS los campos: etiquetas,
│  │  │                                   opciones rápidas, unidades y rangos normales
│  │  ├─ alertas.ts                    Reglas de las alertas de la pantalla Hoy
│  │  └─ asistente.ts                  Motor del asistente "Preguntale a la app"
│  ├─ demo/modoDemo.ts                 Datos de ejemplo y encendido del modo demostración
│  ├─ db/
│  │  ├─ database.ts                   Esquema Dexie + base real / base demo (1 registro por paciente por día)
│  │  ├─ ajustes.ts                    Nombre del hogar, recordatorio y copia automática
│  │  ├─ pacientes.ts                  Alta, edición, alta médica, borrado
│  │  └─ registros.ts                  Guardar, consultar con filtros, borrar
│  ├─ excel/
│  │  ├─ columnas.ts                   ⭐ Diccionario de sinónimos de encabezados
│  │  ├─ exportar.ts                   Excel con formato (una hoja por paciente opcional)
│  │  │                                   + plantilla de migración
│  │  ├─ acciones.ts                   Atajos usados por las pantallas
│  │  └─ importar/
│  │     ├─ leer.ts                    .xlsx/.csv → tablas simples (celdas combinadas incluidas)
│  │     ├─ parsers.ts                 Fechas, horas, presión, números, alimentación, texto libre
│  │     ├─ analizar.ts                Encabezados → columnas → bloques → registros agrupados
│  │     ├─ transponer.ts              Tablas "al revés" (pacientes o días en columnas)
│  │     ├─ plan.ts                    Pacientes parecidos, nuevo/actualiza/sin cambios
│  │     ├─ aplicar.ts                 Guarda todo en una transacción
│  │     └─ tipos.ts
│  ├─ pdf/                             Informe del paciente e informe del día (jsPDF)
│  ├─ components/                      Botones, campos, confirmaciones, mensajes,
│  │                                   editor de tomas, tarjetas/tabla, importador,
│  │                                   gráficos (SVG propio), copias, selector de pacientes
│  ├─ pages/
│  │  ├─ Hoy.tsx                       Inicio: avance del día, alertas y pendientes
│  │  ├─ Ronda.tsx                     Una toma de signos para todos a la vez
│  │  ├─ Ajustes.tsx                   Nombre del hogar, copias, acerca de
│  │  ├─ Pacientes.tsx                 Lista + búsqueda + "Cargar hoy"
│  │  ├─ PacienteForm.tsx              Nuevo / editar / dar de alta / eliminar
│  │  ├─ Paciente.tsx                  Historial (tarjetas, tabla o gráficos) + PDF
│  │  ├─ RegistroForm.tsx              Formulario diario
│  │  ├─ Registros.tsx                 Todos los registros con filtros
│  │  └─ Excel.tsx                     Exportar / importar / copias
│  └─ lib/                             Fechas, texto, tomas, plataforma (web/APK),
│                                      archivos (descargar o compartir), botón atrás, copias
└─ tests/                              Pruebas
```

### Modelo de datos

- **pacientes**: `nombre`, `nombreClave` (sin tildes, palabras ordenadas → "Pérez, Juan" = "juan perez"),
  `habitacion`, `documento`, `fechaNacimiento`, `contacto`, `notas`, `activo`.
- **registros**: uno por paciente por día (índice único `[pacienteId+fecha]`).
  - `tomas[]`: varias por día, cada una con `hora`, presión máxima/mínima, pulso, temperatura,
    saturación, respiraciones, **glucemia** y una nota.
  - `alimentacion`: `{ estado: 'positiva' | 'negativa' | '', comentario }`.
  - Textos: `laboratorio`, `sondaVesical`, `diuresis`, `catarsis`, `sng`, `curaciones`,
    `rotacion`, `ejercicio`, `sueno`, `comportamiento`, `observaciones`.

**Para agregar un campo de texto nuevo:** sumalo a `CampoTexto` (`tipos.ts`), a `CAMPOS_TEXTO` (`campos.ts`),
a `ColumnaId` y `COLUMNAS` (`excel/columnas.ts`, con sus sinónimos) y ubicalo en una sección de `RegistroForm.tsx`.
El historial y la exportación lo toman solos.

---

## 4. Cómo funciona la importación inteligente

El objetivo es que se pueda importar **la planilla que ya existe**, aunque esté hecha a mano.
Todo pasa en 4 etapas y **nada se guarda hasta confirmar**.

### Etapa 1 — Leer (`leer.ts`)
- Abre `.xlsx` (con ExcelJS) o `.csv` (detecta `,` o `;` y la codificación de Excel en español).
- Saca el valor de fórmulas, texto con formato y links.
- **Celdas combinadas**: el valor se copia a todas las celdas del rango (fecha o nombre combinados en vertical).
- Ignora hojas ocultas.

### Etapa 2 — Entender las columnas (`columnas.ts`, `analizar.ts`)
1. **Busca la fila de títulos** entre las primeras 15 filas (la que tiene más títulos reconocibles),
   así funciona aunque arriba haya un título como "CONTROL DE ENFERMERÍA".
2. **Normaliza** cada título: minúsculas, sin tildes ni signos, junta abreviaturas con puntos
   (`P.A.` → `pa`) y quita unidades (`(mmHg)`, `°C`, `%`) y palabras de relleno (`de`, `del`…).
3. **Compara** contra un diccionario de sinónimos y le da un puntaje:
   | Coincidencia | Puntaje | Ejemplo |
   |---|---|---|
   | Exacta | 1 | `Paciente` |
   | Exacta sin unidades/relleno | 0,95 | `Temp °C` → temperatura |
   | Contiene la frase | ~0,8 | `Control de glucemia HGT` |
   | Error de tipeo (Levenshtein ≥ 80 %) | 0,68–0,85 | `Temperatrua`, `Obsevaciones` |
   | Abreviatura como primera palabra | 0,72 | `PA mañana`, `FC tarde` |

   Con menos de 0,7 la columna no se importa (y se avisa).
   Ejemplos: `Nombre`, `Paciente`, `Apellido y nombre`, `Residente` → **paciente** ·
   `T.A.`, `PA`, `Tensión arterial` → **presión** · `HGT`, `Glicemia`, `Dextro` → **glucemia** ·
   `Zonda SV`, `S.V.`, `Foley` → **sonda vesical** · `Deposiciones` → **catarsis** · `Obs.` → **observaciones**.
4. Si una columna única aparece dos veces, se queda la de mejor puntaje.
   Si un signo vital aparece varias veces (`PA mañana`, `PA tarde` o `PA 8:00`, `PA 20:00`),
   **cada una es una toma distinta** y la hora se saca del título.
5. Si no hay columna de **paciente** o **fecha**, los busca en el **título** ("Paciente: Rosa Díaz",
   "Planilla del 14/09/2026") o en el **nombre de la hoja** (una hoja por paciente).
6. Clasifica cada hoja en **registros diarios**, **lista de pacientes** (tiene nombre pero no datos del día)
   u **omitida** (y dice por qué). Cualquier hoja o paciente se puede marcar como **"No importar"**.

### Migración de todo el hogar (muchos pacientes en un archivo)
La app reconoce y mezcla sin problema estos formatos (pueden venir en hojas distintas del mismo archivo):

| Formato | Ejemplo |
|---|---|
| **Una fila por registro** con columna de paciente | `Fecha · Paciente · PA · FC · …` |
| **Padrón de residentes** (con o sin títulos) | `Nombre y apellido · Habitación · DNI…` o solo una columna de nombres |
| **Bloques por paciente** en la misma hoja, cada uno con sus columnas | fila `PACIENTE: ANA DÍAZ  HAB. 3` y debajo su tabla |
| **Nombre como fila separadora** (a veces combinada) | `Hab 4 - Luis Soto` entre las filas |
| **Fecha como fila separadora** y pacientes en filas | `Lunes 15/09/2026` y debajo un paciente por fila |
| **Pacientes en columnas** (planilla de turno) | `Control · Ana · Luis · Rosa` y una fila por dato |
| **Días en columnas** (control mensual) | `Día · 1 · 2 · 3…`; mes y año del título o de la hoja |
| **Una hoja por paciente** | el nombre sale de la pestaña o del título |

Además: separa la habitación del nombre (`Hab. 4B - X`, `X (hab 4B)`, `Cama 12: X`),
da vuelta `GONZÁLEZ, María` → `María González`, ignora las filas "Ejemplo:" de la plantilla y,
si el paciente ya existe, **completa** los datos que le faltan (habitación, documento, contacto…).
Para empezar de cero conviene la **plantilla de migración** (Excel y copias → Exportar → "Descargar plantilla").

### Etapa 3 — Interpretar cada valor (`parsers.ts`)
- **Fechas**: celdas de fecha de Excel, número de serie, `16/09/2026`, `16-9-26`, `2026-09-16`,
  `16 de septiembre de 2026`, `lun 16 sep`. Se asume día/mes; si el segundo número es > 12 se lee mes/día y se avisa.
- **Horas**: `8:30`, `08.30`, `8hs`, `8 pm`, celdas de hora de Excel, "mañana/tarde/noche" (aproximada, con aviso).
- **Presión**: `120/80`, `120-80`, `130 / 85 mmHg`, y `12/8` (cmHg) → 120/80 con aviso.
- **Números**: coma o punto decimal, con unidades (`68 lpm`, `36,5°`).
  Correcciones: temperatura `365` → 36,5 · saturación `0,95` (formato %) → 95.
  **Rangos**: si un valor es imposible (pulso 400) se importa pero se avisa para revisarlo.
- **Alimentación**: `Positiva`, `+`, `Sí`, `comió bien` → positiva · `Negativa`, `NEG`, `-`, `No`,
  `rechaza…` → negativa. Lo que sigue se guarda como comentario (`Positiva - comió todo`).
  Si no se entiende (`media porción`) queda como comentario y se avisa.
- **Signos vitales en texto libre** (una columna "Signos vitales"): entiende
  `08:00 · PA 120/80 · FC 72 · T° 36,5 · SatO2 96%` y también `PA 130/85 FC 80 T 36.8 Sat 95`
  o `20hs 12/8 72x' 36,5° 94%`. Cada renglón es una toma. Por eso **el Excel que exporta la app se vuelve a importar igual**.
- Si un valor no se puede leer (ej. "no se tomó" en glucemia), no se pierde: se guarda como **nota de la toma**.

### Etapa 4 — Agrupar, comparar y mostrar el resumen (`analizar.ts`, `plan.ts`)
- **Rellena hacia abajo** fecha y paciente cuando la celda está vacía (planillas con una fila por toma).
- **Agrupa** todas las filas del mismo paciente y día en un solo registro: suma tomas **sin duplicar**
  (compara hora + valores) y junta los textos distintos con " / ".
- **Pacientes**: compara cada nombre con los de la app:
  - *igual* (sin importar tildes, mayúsculas ni orden: "GONZÁLEZ, María" = "maria gonzalez"),
  - *parecido* (errores de tipeo o un nombre de más, ≥ 80 %) → se sugiere el existente con un aviso,
  - *nuevo* → se crea. También avisa si dos nombres nuevos se parecen entre sí.
  En pantalla se puede cambiar cada asignación.
- Para cada día decide si es **nuevo**, **se actualiza** o **sin cambios**, según el modo elegido:
  - **Completar y actualizar** (recomendado): suma tomas nuevas y actualiza los datos que vienen en el Excel;
    lo que el Excel tiene vacío no borra nada.
  - **Reemplazar**: el día queda igual al Excel.
  - **No tocar lo existente**: solo agrega días nuevos.
- **Vista previa**: totales, cómo se leyó cada columna (con menú para corregirla a mano),
  pacientes, avisos/errores con hoja y fila, y la lista de registros con lo que cambia.
- Al confirmar, todo se guarda en **una sola transacción**: si algo falla, no se guarda nada.
  Hay un botón para descargar una copia de seguridad antes.

Las filas con errores (fecha imposible, sin nombre) se saltan y se listan; el resto se importa.

### Archivo de ejemplo
`ejemplos/ejemplo-importacion.xlsx` trae a propósito: título arriba, títulos con otros nombres,
fechas y nombres combinados, nombres escritos distinto ("GONZÁLEZ, María" / "Maria Gonzalez"),
`12/8`, `365`, saturación en formato %, fecha como texto, una hoja por paciente con la fecha en el título
y una hoja de pacientes con Nombre y Apellido separados. Resultado esperado: 4 pacientes y 6 días.

`ejemplos/ejemplo-migracion.xlsx` simula el traspaso de un hogar entero: padrón sin títulos con la habitación
pegada al nombre, cuaderno con un bloque por paciente, planilla de turno con pacientes en columnas,
control mensual con días en columnas y una hoja con fechas como separadores. Resultado: 8 residentes con sus registros.

---

## 5. Pantallas

- **Hoy** (inicio): cuántos pacientes tienen el registro del día, botones **Ronda de signos** e **Informe del día**,
  **Para revisar** (alertas) y **Falta cargar hoy**. Aviso si hace falta una copia de seguridad.
  - Alertas **urgentes** (valores muy alejados: temperatura ≥ 38 o < 35, saturación < 90, presión ≥ 180/110 o < 90/50,
    pulso > 120 o < 50, respiraciones > 25 o < 10, glucemia < 70 o > 300), de **atención** (fuera del rango normal,
    alimentación negativa, 3 días sin catarsis) y **avisos** (más de 2 días sin registro). Son orientativas;
    los umbrales están en `src/domain/alertas.ts`.
- **Preguntale a la app** (ícono de globo con signo de pregunta, arriba, o botón "Preguntar" en Hoy): asistente local,
  **sin IA ni internet**, que responde con los datos del dispositivo. Entiende el nombre de un paciente
  ("¿Cómo está María?", "presión de Luis"), búsquedas ("¿quién tuvo fiebre ayer?", "saturación baja esta semana",
  "¿quién no comió?", "¿quién no hizo catarsis?"), "¿qué falta cargar?", "alertas", "resumen de la semana" y
  "¿cuándo fue la última copia?". En Chrome se puede preguntar hablando (botón Hablar).
  La lógica está en `src/domain/asistente.ts`: para sumar preguntas, agregar un patrón en `responder()`.
- **Ronda de signos**: una pantalla con todos los pacientes para cargar una toma a cada uno (misma hora).
  Suma la toma al registro del día si ya existe; los que quedan vacíos no se tocan.
- **Pacientes**: buscador, cuántos tienen el registro de hoy, "Cargar hoy" e "Historial" en cada tarjeta.
- **Registro del día**: paciente, día (con flechas), tomas de signos vitales (valores fuera de lo normal en ámbar,
  imposibles en rojo y con confirmación), alimentación con dos botones grandes, opciones rápidas en cada campo,
  "copiar datos que se repiten del último registro", barra fija para guardar y aviso de cambios sin guardar.
  Si ese día ya tiene registro, se abre para editarlo (nunca se duplica).
- **Historial del paciente**: filtros por período, vista en tarjetas, tabla o **gráficos** (presión, pulso, temperatura,
  saturación, glucemia y respiraciones, con la banda normal en verde y los valores fuera de rango en rojo;
  se toca el gráfico para ver cada medición), editar, eliminar, **Excel** e **Informe PDF** del período.
- **Registros**: todos los pacientes, filtro por paciente y fechas, Excel e informe PDF de lo filtrado.
- **Excel y copias**:
  - *Exportar*: todo, o **elegir pacientes y fechas**; opción "una hoja por paciente"; plantilla de migración.
  - *Importar*: la importación inteligente.
  - *Copias*: hacer copia, restaurar (reemplazar todo o combinar) y, en el APK, las copias automáticas.
- **Ajustes** (engranaje arriba): nombre del hogar (sale en la app, el Excel y los PDF), **modo demostración**,
  **colores de la app**, cada cuántos días recordar la copia, copia automática, versión y contacto.

### Modo demostración
Para mostrar la app sin usar datos de pacientes reales (Ajustes → "Probar con datos de ejemplo"):
- Arma un hogar de ejemplo con **9 residentes y 21 días** de registros, con fechas a partir del día en que se enciende,
  así siempre hay datos de hoy, alertas (fiebre, saturación baja, glucemia alta) y alguien sin cargar.
- Los datos van a una **base aparte** (`geriatrico-demo`): los reales no se tocan y vuelven al salir.
- Mientras está encendido se ve una franja arriba con el botón **Salir de la demo**; al salir, la base de ejemplo se borra.
- Código: `src/demo/modoDemo.ts` (datos y encendido) y el proxy `db` de `src/db/database.ts`, que apunta a la base activa.

### Temas de color
Ajustes → "Colores de la app": **Automático** (sigue al sistema), **Claro**, **Oscuro**, **Azul sereno** y
**Alto contraste** (blanco y negro, bordes gruesos, foco marcado; pensado para baja visión).
- La preferencia se guarda **por dispositivo** (localStorage), no viaja en las copias de seguridad.
- Cómo está hecho: cada tema solo redefine variables de color en `src/index.css` bajo `[data-tema='…']`, y las clases
  de Tailwind las leen. `src/lib/tema.ts` aplica el tema en `<html>` y actualiza el color de la barra del navegador.
- Los **gráficos** toman los colores del tema (paletas validadas para daltonismo y contraste en cada fondo).
  Los **PDF y el Excel salen siempre en claro**, porque son para imprimir.
- Para agregar un color nuevo: copiar un bloque `[data-tema='…']` en `index.css` y sumarlo a `TEMAS` en `src/lib/tema.ts`.

### Informes PDF
- **Del paciente** (A4 vertical): datos, resumen de signos (mínimo, máximo, promedio, último y cuántos fuera de lo normal),
  mini gráficos, tabla de signos (fuera de rango en rojo), registro diario y líneas para firma.
- **Del día / período** (A4 horizontal): para cada fecha, una fila por paciente con signos y registro del día.
  Desde Hoy incluye además las alertas y quiénes no tienen registro.
En el APK el PDF se abre con "Compartir" (WhatsApp, Drive, imprimir…); en la web se descarga.

---

## 6. Android (APK)

### Cómo está armado
- **Capacitor** mete la web compilada dentro de una app Android (`android/`). Id de la app:
  `cl.registrogeriatrico.app` — **no cambiarlo** después de instalarla, Android la tomaría como otra app.
- En el APK:
  - **Exportar Excel** abre el menú **Compartir** (Guardar en Drive, WhatsApp, Gmail, Archivos…),
    porque el WebView de Android no permite descargas comunes.
  - **Importar** abre el selector de archivos del teléfono (Descargas, Drive, WhatsApp).
  - El **botón atrás** vuelve de pantalla, cierra ventanas y avisa si hay cambios sin guardar.
  - No se usa service worker (`npm run build:android` lo desactiva): la app ya viene instalada.
- **Versión**: `versionCode` = número de ejecución del workflow (siempre sube, así se puede
  actualizar encima). `versionName` = `version` de `package.json`, o el número del tag (`v1.2.0` → `1.2.0`).
- **Firma**: `android/app/build.gradle` toma la clave de las variables de entorno (GitHub) o de
  `android/keystore.properties` (tu PC). Ese archivo y los `.jks` están en `.gitignore`.

> ⚠️ **Todos los APK tienen que estar firmados con la MISMA clave.** Si cambia la clave, Android no deja
> actualizar y hay que desinstalar la app, **lo que borra los datos del teléfono**.
> Guardá `registro-geriatrico.jks` y su contraseña en un lugar seguro, con copia.

### Paso a paso

1. **Crear el repo** en GitHub (recomendado: **privado**) y subir el proyecto:
   ```bash
   cd Documents/geriatrico-app
   git init
   git add .
   git commit -m "Registro Geriátrico: app web + Android"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/geriatrico-app.git
   git push -u origin main
   ```
   Antes del commit, revisá con `git status` que **no** aparezca ningún `.jks`.
   Si recibiste el proyecto con la carpeta `workflows-github/`, antes movela a `.github/workflows/`
   (PowerShell: `mkdir .github; move workflows-github .github\workflows`).
2. **Cargar los 4 secrets**: repo → *Settings* → *Secrets and variables* → *Actions* →
   *New repository secret* (los valores están en `DATOS-DE-FIRMA.txt`, en tu carpeta de firma):
   `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
3. **Compilar**: pestaña *Actions* → *APK Android* → *Run workflow* (o hacer cualquier push a `main`).
   Tarda unos 5–8 minutos.
4. **Descargar**: entrar a la ejecución terminada → sección *Artifacts* → `registro-geriatrico-apk`
   (viene en un .zip con el .apk adentro).
5. **Instalar en la tablet/celular**: pasar el .apk (WhatsApp, Drive, cable), abrirlo y aceptar
   *"Permitir instalar apps de esta fuente"*.

### Publicar una versión con Release (link fijo para descargar)
```bash
# 1) subí la versión en package.json (ej. 1.0.1), commit y push
git tag v1.0.1
git push origin v1.0.1
```
El workflow crea un **Release** con el APK adjunto: *Code → Releases*.

### Actualizar la app instalada
Instalar el APK nuevo **encima** del anterior (no desinstalar). Los datos se mantienen.
Igual, antes de actualizar conviene tocar **Excel y copias → Copias → Hacer copia ahora**.

### Copias automáticas en el APK
- Una vez por día (al abrir la app o volver a ella) se guarda `copia-AAAA-MM-DD.json` en
  **Documentos/RegistroGeriatrico** del teléfono. Quedan las últimas 14.
- Esa carpeta **sobrevive a una desinstalación**. Si hubo que reinstalar (o cambiar de teléfono, pasando la carpeta),
  se recupera todo con **Copias → Restaurar una copia** y eligiendo el archivo.
- Se puede apagar en **Ajustes**.

### Compilar en tu PC (opcional)
Con Android Studio instalado: crear `android/keystore.properties` (ver `DATOS-DE-FIRMA.txt`), después
```bash
npm run build:android
cd android
gradlew.bat assembleRelease
```
El APK queda en `android/app/build/outputs/apk/release/app-release.apk`.

### Versión web en GitHub Pages (opcional)
*Settings → Pages → Source: GitHub Actions*. En cada push a `main`, `pages.yml` la publica en
`https://TU-USUARIO.github.io/geriatrico-app/`. Si el repo es privado, Pages necesita un plan pago;
si no lo vas a usar, borrá `.github/workflows/pages.yml`.
