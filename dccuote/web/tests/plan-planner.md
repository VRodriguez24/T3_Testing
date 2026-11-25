# Plan de pruebas E2E - DCCuote (Tarea 3 IIC3745)

## Application Overview

DCCuote es una aplicación React (frontend en http://localhost:4173, levantado por el webServer de playwright.config.ts) con backend Flask en http://127.0.0.1:5000. Rutas: `/` (frase diaria), `/quotes` (lista con búsqueda por texto, filtro por personaje y "Psycho Killer Mode" para eliminar) y `/quotes/:id` (detalle y agregado de etiquetas). La barra superior tiene "Frases", "Frase diaria" y "Nueva frase". No hay login (LoginForm.tsx está vacío), ni filtro por etiqueta en la interfaz, ni UI para borrar etiquetas o personajes.

## Alcance y selección
El enunciado exige exactamente 10 tests, cada uno con un flujo distinto: 4 @manual (el de `tests/example.spec.ts`, "añadir frase exitosamente", cuenta como uno) y 6 generados con agentes (@ia y @claude). Este plan propone:
- Suite 1: 6 escenarios para Generator (@ia, @claude).
- Suite 2: 3 escenarios para escribir a mano (@manual), que con el ejemplo suman 4.
- Suite 3: reservas, para reemplazar alguno. NO implementarlas además de las 10, porque cada test extra descuenta puntaje.

El seed no cuenta. El flujo de creación exitosa con "Ver" ya está cubierto por el ejemplo.

## Observado frente a supuesto
Observado en la aplicación real (exploración del 2026-11-25): mensajes de validación y de duplicado, creación con personaje nuevo, filtros, eliminación, etiquetas, navegación y todos los defectos marcados como "bug:".

Supuesto o inferido solo del código (verificar al implementar):
- La búsqueda compara solo el texto de la frase, no el personaje, la fuente ni las etiquetas.
- Las burbujas de etiqueta muestran cursor de enlace pero no tienen acción.
- La detección de duplicados es por coincidencia exacta, por lo que variaciones de mayúsculas o espacios serían aceptadas.
- Los comportamientos con base vacía o backend caído no se exploraron.
- Los escenarios no se han ejecutado como archivos .spec.ts.

## Estrategia de datos (base compartida)
1. Generar un sufijo único por test y por ejecución (por ejemplo, `E2E-<testId>-<Date.now()>`) y usarlo en frase, personaje y etiquetas. El ID de una frase es el SHA-256 de su texto, así que textos repetidos chocan.
2. No asumir conteos totales, posiciones ni que la base solo tenga el seed. Localizar tarjetas con `page.getByTestId('quotes-grid').locator(':scope > *').filter({ hasText: <marca única> })`.
3. Preparar precondiciones por API: `POST /quotes/add` con `{quote, character, source, tags}`.
4. Limpiar siempre en `afterEach` o `finally`, también cuando el test "bug:" falla, y en este orden: (a) `DELETE /quotes/delete/{id}`; (b) las etiquetas propias, buscando su ID en `GET /tags`, con `DELETE /tags/delete/{id}`; (c) el personaje propio, buscado en `GET /characters`, con `DELETE /characters/delete/{id}`. Borrar una frase no borra sus etiquetas ni su personaje.
5. Nunca borrar ni etiquetar datos preexistentes.
6. No ejecutar Pytest al mismo tiempo que los E2E: comparten la base.
7. `fullyParallel` está activo. `/quotes/daily` devuelve la frase de menor ID, y cualquier frase creada (ID hexadecimal) queda antes que las del seed (ID con prefijo `q`). Por eso no se debe fijar el texto de la frase diaria.

## Selectores observados
- Navegación: `getByRole('link', {name: 'Frases'})`, `getByRole('link', {name: 'Frase diaria'})`, `getByRole('button', {name: 'Nueva frase'})`.
- Formulario: diálogo "Nueva frase"; campos `getByRole('textbox', {name: 'Frase'})`, `getByLabel('Fuente')`, `getByLabel('Etiquetas')`; combobox del diálogo; botones "Añadir" y "Cancelar".
- Personaje nuevo: escribir en el placeholder "Search or create new" y pulsar `getByText('Create "<nombre>"').first()`.
- Lista: placeholder "Buscar frases...", `getByRole('combobox')`, opciones con `getByRole('option', {name, exact: true})`.
- Modo eliminar: `getByRole('switch')`. No tiene nombre accesible, porque el label apunta a otro id. El botón de papelera tampoco tiene nombre: usar `tarjeta.getByRole('button')`.
- Detalle: `getByRole('heading', {level: 1})`, botón "Add Tag", diálogo "Nuevas etiquetas para la frase", placeholder "chile, humor, tv", botón "Agregar etiquetas".

## Criterios generales
- Estado inicial: contexto de navegador nuevo; cada test crea y limpia sus datos y no depende de otro.
- Éxito: se cumplen todas las expectativas. Fallo: cualquiera no se cumple.
- Los tests "bug:" afirman el comportamiento CORRECTO, así que hoy deben fallar, y precisamente en la aserción indicada, no en la preparación. No usar `test.fail` ni invertir la aserción.
- Usar aserciones con reintento (`expect(locator)`) en vez de esperas fijas.

## Test Scenarios

### 1. 1. Selección principal para agentes IA (@ia @claude)

**Seed:** `tests/seed.spec.ts`

#### 1.1. crear frase con personaje nuevo y encontrarla filtrando por ese personaje

**File:** `tests/ia/crear-con-personaje-nuevo.spec.ts`

**Steps:**
  1. Ir a /quotes y abrir 'Nueva frase'. En Personaje, escribir un nombre único y elegir 'Create "<nombre>"'.
    - expect: El combobox del diálogo muestra el nombre nuevo
  2. Completar Frase y Fuente únicas, y en Etiquetas escribir ' <tagA> , <tagB> ,, '. Pulsar 'Añadir'.
    - expect: Aparece 'Frase añadida exitosamente'
    - expect: El diálogo se cierra
    - expect: La tarjeta nueva aparece en la lista con texto, personaje, fuente y exactamente las dos etiquetas sin espacios ni elementos vacíos
  3. Recargar /quotes (el filtro solo carga personajes al montarse) y seleccionar el personaje nuevo en el filtro.
    - expect: La única tarjeta visible es la frase creada (el personaje es exclusivo del test)
    - expect: La tarjeta conserva fuente y etiquetas
  4. Limpiar por API la frase, las dos etiquetas y el personaje.
    - expect: Todas las eliminaciones responden 200

#### 1.2. formulario incompleto muestra errores y no crea la frase

**File:** `tests/ia/validacion-formulario.spec.ts`

**Steps:**
  1. Ir a /quotes, abrir 'Nueva frase' y pulsar 'Añadir' sin completar nada.
    - expect: Alerta 'Error al añadir la frase.' con 'Faltan campos obligatorios.'
    - expect: El diálogo sigue abierto
  2. Escribir una frase única y elegir un personaje existente, dejando Fuente vacía. Pulsar 'Añadir'.
    - expect: Alerta con 'La fuente no es válida.'
    - expect: Los valores escritos se conservan
  3. Reemplazar la frase por solo espacios, completar Fuente y pulsar 'Añadir'.
    - expect: Alerta con 'El texto de la cita no es válido.'
  4. Pulsar 'Cancelar' y volver a abrir 'Nueva frase'.
    - expect: Los campos están vacíos y no hay alerta
  5. Cerrar, recargar y buscar la marca única.
    - expect: No hay tarjetas con la marca: no se creó nada
    - expect: Si por error se hubiera creado, la limpieza la elimina

#### 1.3. eliminar una frase con confirmación y que no reaparezca

**File:** `tests/ia/eliminar-frase.spec.ts`

**Steps:**
  1. Crear por API una frase única con personaje único y sin etiquetas. Ir a /quotes.
    - expect: La tarjeta propia es visible y no tiene botón de eliminar
  2. Activar el switch de Psycho Killer Mode y pulsar el botón de papelera SOLO de la tarjeta propia.
    - expect: Diálogo '¿Deseas eliminar la frase?' que cita el texto propio
    - expect: La URL sigue siendo /quotes
  3. Pulsar 'Cancelar'.
    - expect: El diálogo se cierra y la tarjeta sigue presente
  4. Volver a pulsar la papelera y confirmar con 'Eliminar'.
    - expect: La tarjeta propia desaparece
  5. Recargar la página.
    - expect: La tarjeta no reaparece
    - expect: GET /quotes/{id} responde 404
  6. Eliminar por API el personaje propio (y la frase si el test falló antes).
    - expect: La base queda sin datos del test

#### 1.4. agregar varias etiquetas desde el detalle y que persistan

**File:** `tests/ia/agregar-etiquetas.spec.ts`

**Steps:**
  1. Crear por API una frase única sin etiquetas. Ir a /quotes/{id}.
    - expect: El h1 muestra la frase
  2. Pulsar 'Add Tag', escribir una etiqueta única y pulsar 'Cancelar'.
    - expect: El diálogo se cierra y la etiqueta no aparece
  3. Abrir de nuevo, reemplazar el valor (el campo conserva lo cancelado) por '<tagA>, <tagB>' y pulsar 'Agregar etiquetas'.
    - expect: Toast 'Etiquetas añadidas exitosamente'
    - expect: Diálogo cerrado
    - expect: Ambas etiquetas visibles en el detalle
  4. Recargar la página.
    - expect: Ambas etiquetas siguen visibles
    - expect: La etiqueta cancelada no existe
  5. Navegar a /quotes con carga completa y localizar la tarjeta.
    - expect: La tarjeta muestra ambas etiquetas
  6. Limpiar frase, etiquetas y personaje por API.
    - expect: Base sin datos del test

#### 1.5. bug: tras elegir 'Todos' en el filtro, la búsqueda deja la lista vacía

**File:** `tests/ia/bug-filtro-todos.spec.ts`

**Steps:**
  1. Crear por API una frase única. Ir a /quotes y comprobar que la tarjeta es visible.
    - expect: La tarjeta propia está presente
  2. Abrir el filtro de personaje y elegir 'Todos'.
    - expect: La tarjeta propia sigue visible
  3. Escribir la marca única en 'Buscar frases...'.
    - expect: Correcto: la tarjeta propia es visible
    - expect: Actual (observado): la lista queda vacía; esta aserción falla
  4. Borrar la búsqueda.
    - expect: Correcto: la tarjeta propia vuelve a ser visible
    - expect: Actual (observado): la lista sigue vacía
  5. Limpiar los datos en afterEach.
    - expect: La limpieza ocurre aunque el test falle

#### 1.6. bug: el detalle de una frase nueva muestra las etiquetas de la frase anterior

**File:** `tests/ia/bug-etiquetas-residuales.spec.ts`

**Steps:**
  1. Crear por API la frase A con una etiqueta única. Ir a /quotes/{idA}.
    - expect: Se ven la frase A y su etiqueta
  2. Sin salir de la vista, abrir 'Nueva frase' y crear la frase B única (puede usar el mismo personaje de A) sin etiquetas.
    - expect: Aparece el toast con el botón 'Ver'
  3. Pulsar 'Ver' (navegación interna, sin recarga).
    - expect: La URL cambia al ID de B y el h1 muestra B
    - expect: Correcto: la etiqueta de A NO es visible
    - expect: Actual (observado): B muestra las etiquetas de la frase anterior; esta aserción falla
  4. Limpiar A, B, la etiqueta y el personaje en afterEach.
    - expect: Base sin datos del test

### 2. 2. Selección para tests manuales (@manual), además del ejemplo existente

**Seed:** `tests/seed.spec.ts`

#### 2.1. rechazar una frase duplicada sin crear una segunda copia

**File:** `tests/manual/frase-duplicada.spec.ts`

**Steps:**
  1. Crear por API una frase única. Ir a /quotes.
    - expect: Existe exactamente una tarjeta con la marca
  2. Abrir 'Nueva frase', ingresar el mismo texto exacto, elegir un personaje existente, completar Fuente y pulsar 'Añadir'.
    - expect: Alerta con 'La cita ya existe.'
    - expect: El diálogo sigue abierto y no hay toast de éxito
  3. Cerrar el diálogo y recargar.
    - expect: Sigue habiendo exactamente una tarjeta, con el personaje y la fuente originales
  4. Limpiar por API.
    - expect: Base sin datos del test

#### 2.2. filtrar por personaje y luego acotar con búsqueda sin distinguir mayúsculas

**File:** `tests/manual/filtro-y-busqueda.spec.ts`

**Steps:**
  1. Crear por API dos frases de un personaje único (una contiene 'ALFA', otra 'BETA') y una tercera con 'ALFA' de otro personaje único. Ir a /quotes.
    - expect: Las tres tarjetas propias son visibles
  2. Seleccionar el primer personaje en el filtro.
    - expect: Solo quedan sus dos tarjetas
  3. Buscar 'alfa' en minúsculas.
    - expect: Solo queda la frase ALFA del primer personaje
    - expect: La frase ALFA del otro personaje no aparece
  4. Buscar un texto inexistente.
    - expect: La lista queda sin tarjetas (la app no muestra mensaje de vacío)
  5. Borrar la búsqueda.
    - expect: Vuelven las dos tarjetas del personaje seleccionado
  6. Limpiar las tres frases y los dos personajes.
    - expect: Base sin datos del test

#### 2.3. navegar de la lista al detalle, recargar y volver

**File:** `tests/manual/navegacion-detalle.spec.ts`

**Steps:**
  1. Crear por API una frase única con fuente distinta del personaje y una etiqueta. Ir a / y pulsar el enlace 'Frases'.
    - expect: URL /quotes y tarjeta propia visible
  2. Hacer clic en el texto de la tarjeta.
    - expect: URL /quotes/{id}
    - expect: h1 con la frase, '- <personaje> (<fuente>)' y la etiqueta
  3. Recargar la página.
    - expect: El enlace directo sigue mostrando la misma frase
  4. Usar el botón Atrás del navegador.
    - expect: URL /quotes y tarjeta propia visible
  5. Limpiar frase, etiqueta y personaje.
    - expect: Base sin datos del test

### 3. 3. Reservas (usar solo como reemplazo; no sumar a las 10)

**Seed:** `tests/seed.spec.ts`

#### 3.1. bug: elegir un personaje ignora el texto ya buscado

**File:** `tests/reserva/bug-busqueda-y-personaje.spec.ts`

**Steps:**
  1. Crear por API dos frases con personajes únicos distintos: P1 contiene 'ALFA' y P2 contiene 'BETA'. Ir a /quotes y buscar 'ALFA' junto con la marca.
    - expect: Solo se ve la frase de P1
  2. Seleccionar P2 en el filtro.
    - expect: Correcto: no hay tarjetas
    - expect: Actual (observado con datos del seed): aparece la frase de P2 aunque no coincide con la búsqueda
  3. Limpiar en afterEach.
    - expect: Base sin datos del test

#### 3.2. bug: agregar una etiqueta repetida la muestra duplicada

**File:** `tests/reserva/bug-etiqueta-repetida.spec.ts`

**Steps:**
  1. Crear por API una frase única con una etiqueta única. Ir a su detalle.
    - expect: La etiqueta aparece una vez
  2. Agregar la misma etiqueta con 'Add Tag'.
    - expect: Aparece el toast de éxito (confirma que la petición terminó)
    - expect: Correcto: la etiqueta aparece una sola vez
    - expect: Actual (observado): aparece dos veces hasta recargar
  3. Limpiar en afterEach.
    - expect: Base sin datos del test

#### 3.3. bug: presionar Enter en el diálogo de etiquetas recarga la página sin guardar

**File:** `tests/reserva/bug-enter-etiquetas.spec.ts`

**Steps:**
  1. Crear por API una frase única, ir a su detalle, abrir 'Add Tag', escribir una etiqueta única y presionar Enter.
    - expect: Correcto: la etiqueta queda visible y guardada, sin cambiar la URL
    - expect: Actual (observado): la página navega a ?tags=<valor> y la etiqueta no se guarda
  2. Limpiar en afterEach.
    - expect: Base sin datos del test

#### 3.4. bug: la lista no refleja etiquetas recién agregadas desde el detalle

**File:** `tests/reserva/bug-lista-desactualizada.spec.ts`

**Steps:**
  1. Crear por API una frase única. Ir a /quotes, abrir su detalle haciendo clic y agregar una etiqueta única.
    - expect: La etiqueta se ve en el detalle
  2. Volver con el enlace 'Frases', sin recargar.
    - expect: Correcto: la tarjeta muestra la etiqueta
    - expect: Actual (observado): no la muestra hasta recargar
  3. Limpiar en afterEach.
    - expect: Base sin datos del test

#### 3.5. la vista 'Frase diaria' muestra la frase entregada por la API

**File:** `tests/reserva/frase-diaria.spec.ts`

**Steps:**
  1. Ir a /quotes. Preparar la captura de la respuesta de GET /quotes/daily y pulsar 'Frase diaria'.
    - expect: URL /
  2. Comparar la vista con el JSON capturado de esa misma carga (no con un texto fijo ni con otra llamada).
    - expect: h1 igual a quote
    - expect: Se muestra el personaje y, si difiere de él, la fuente
    - expect: Se ven las etiquetas de la respuesta

#### 3.6. buscar por texto en toda la lista, sin resultados y restaurar

**File:** `tests/reserva/busqueda-texto.spec.ts`

**Steps:**
  1. Crear por API dos frases únicas. Ir a /quotes sin tocar el filtro de personaje y buscar parte del texto de una, cambiando mayúsculas.
    - expect: Solo aparece la tarjeta coincidente
  2. Buscar un texto inexistente y luego borrar la búsqueda.
    - expect: Primero no hay tarjetas; después ambas frases propias vuelven a estar visibles
  3. Limpiar en afterEach.
    - expect: Base sin datos del test
