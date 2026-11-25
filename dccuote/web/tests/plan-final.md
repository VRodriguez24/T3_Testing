# Plan final E2E - DCCuote (generación con agentes IA)

## Application Overview

DCCuote es una aplicación React (http://localhost:4173, levantada por el `webServer` de `playwright.config.ts`) con una API Flask en http://127.0.0.1:5000 y base PostgreSQL. Rutas usadas: `/quotes` (lista, búsqueda, filtro por personaje, eliminación) y `/quotes/:id` (detalle y etiquetas). El botón "Nueva frase" está en la barra superior.

Este plan refina `tests/plan-planner.md` (sección 1) y contiene únicamente los **6 escenarios que debe implementar Generator**. Los tests manuales se desarrollan por separado.

| # | Resultado que prueba | Archivo | Resultado esperado hoy |
|---|---|---|---|
| 1.1 | Alta con personaje nuevo, visible al filtrar por él | `tests/ia/crear-con-personaje-nuevo.spec.ts` | Pasa |
| 1.2 | El formulario inválido se rechaza y no guarda nada | `tests/ia/validacion-formulario.spec.ts` | Pasa |
| 1.3 | Eliminación: cancelar conserva, confirmar borra | `tests/ia/eliminar-frase.spec.ts` | Pasa |
| 1.4 | Etiquetas agregadas desde el detalle persisten | `tests/ia/agregar-etiquetas.spec.ts` | Pasa |
| 1.5 | "Todos" no debe romper la búsqueda | `tests/ia/bug-filtro-todos.spec.ts` | Falla (bug) |
| 1.6 | El detalle no debe heredar etiquetas de otra frase | `tests/ia/bug-etiquetas-residuales.spec.ts` | Falla (bug) |

## Reglas obligatorias para todos los tests

### Formato
- Un solo `test` por archivo, en la ruta indicada. El título es exactamente el nombre del escenario.
- Cada test se declara con `{ tag: ['@ia', '@claude'] }`.
- Incluir un comentario con los pasos del flujo.
- No crear tests adicionales ni modificar `tests/seed.spec.ts`, los tests existentes o el código de la aplicación.

### Datos únicos
- Generar en cada ejecución una marca única, por ejemplo `E2E-<escenario>-${crypto.randomUUID().slice(0, 8)}`, **dentro del test o de `beforeEach`**, nunca como constante fija.
- Usar la marca en frases, fuentes, personajes y etiquetas creados.
- El ID de una frase es el SHA-256 (hex) de su texto exacto. Calcularlo en el test permite limpiar aunque falle antes de conocer el ID.
- Nunca modificar, etiquetar ni borrar datos preexistentes. Elegir el personaje existente "Marie Curie" es solo lectura, siempre que la frase no llegue a crearse.

### Limpieza garantizada
- Registrar los recursos que se van a crear **antes** de crearlos y limpiarlos en `test.afterEach` (o en un fixture con teardown), de modo que ocurra también si el test falla o agota el tiempo.
- Orden: (1) `DELETE /quotes/delete/{id}`; (2) etiquetas propias, buscando su ID por nombre en `GET /tags`, con `DELETE /tags/delete/{id}`; (3) personajes propios, buscando por nombre en `GET /characters`, con `DELETE /characters/delete/{id}` (la API no permite borrar un personaje con frases).
- Borrar una frase no borra sus etiquetas ni su personaje.
- Aceptar 200 o 404 (recurso ya eliminado o nunca creado); cualquier otro código es un error de limpieza.
- Usar el fixture `request` con URL absoluta `http://127.0.0.1:5000`; `baseURL` apunta al frontend.

### Independencia y estabilidad
- Cada test prepara su propio estado y no depende de otro ni del orden (`fullyParallel` está activo).
- Prohibido `waitForTimeout` y cualquier espera fija. Usar `expect` con reintento y, cuando haga falta, `waitForResponse` registrado antes de la acción.
- No asumir conteos globales, posiciones ni el contenido de la frase diaria. Solo se permiten conteos sobre recursos propios (marca o personaje exclusivo).
- **Aserciones de ausencia:** antes de comprobar que algo no está, esperar una señal positiva de que la vista cargó (respuesta de la API y un elemento visible). Sin ella, `toHaveCount(0)` pasa con la página todavía vacía.
- No ejecutar Pytest al mismo tiempo: sus fixtures borran todas las tablas de la base a la que apunte la API.

### Tests `bug:`
- Afirman el comportamiento **correcto**. Su fallo es intencional mientras el defecto exista.
- No invertir aserciones, no usar `test.fail`, `test.skip` ni `test.fixme`, no relajar localizadores o expectativas para que pasen. Esto aplica también a Healer.
- Deben fallar en la aserción marcada como **ASERCIÓN DEL BUG**, no en la preparación ni en la limpieza. Comentar en el código cuál es el defecto.

### Localizadores observados
- Tarjetas: `page.getByTestId('quotes-grid').locator(':scope > *').filter({ hasText: marca })`.
- Etiquetas de una tarjeta: dentro de `[data-slot="card-footer"]`.
- Formulario: `const dialogo = page.getByRole('dialog', { name: 'Nueva frase' })`; dentro de él, `getByRole('textbox', { name: 'Frase' })`, `getByLabel('Fuente')`, `getByLabel('Etiquetas')`, `getByRole('combobox')`, botones "Añadir" y "Cancelar".
- Opciones de personaje: `page.getByRole('option', { name, exact: true })`.
- Personaje nuevo: escribir en el placeholder "Search or create new" y pulsar `page.getByText('Create "<nombre>"').first()`.
- Lista: placeholder "Buscar frases..."; el filtro de personaje es el `combobox` de la página (con el diálogo cerrado).
- Modo eliminar: `page.getByRole('switch')` (sin nombre accesible). El botón de papelera tampoco tiene nombre: `tarjeta.getByRole('button')`.
- Detalle: `getByRole('heading', { level: 1 })`, botón "Add Tag", diálogo "Nuevas etiquetas para la frase", placeholder "chile, humor, tv", botón "Agregar etiquetas".

## Test Scenarios

### 1. Suite IA

**Seed:** `tests/seed.spec.ts`

#### 1.1. crear frase con personaje nuevo y encontrarla filtrando por ese personaje

**File:** `tests/ia/crear-con-personaje-nuevo.spec.ts`

**Datos:** frase, fuente, personaje y etiquetas `tagA` y `tagB`, todos con la marca. Sin precondiciones por API.

**Steps:**
  1. Ir a /quotes y abrir 'Nueva frase'. En Personaje, escribir el nombre único y elegir 'Create "<nombre>"'.
    - expect: El combobox del diálogo muestra el nombre nuevo
  2. Completar Frase y Fuente y escribir en Etiquetas ' <tagA> , <tagB> ,, '. Pulsar 'Añadir'.
    - expect: Es visible 'Frase añadida exitosamente'
    - expect: El diálogo 'Nueva frase' se cierra
    - expect: La tarjeta propia muestra el texto, el personaje y la fuente
    - expect: El pie de la tarjeta contiene exactamente dos etiquetas, tagA y tagB, sin espacios sobrantes ni etiquetas vacías
  3. Recargar /quotes (el filtro solo carga personajes al montarse) y elegir el personaje nuevo en el filtro.
    - expect: La lista muestra exactamente una tarjeta y es la frase creada (el personaje es exclusivo del test)
    - expect: La tarjeta conserva fuente y ambas etiquetas
  4. Limpieza en afterEach: frase, dos etiquetas y personaje.
    - expect: No quedan recursos del test

#### 1.2. formulario incompleto muestra errores y no crea la frase

**File:** `tests/ia/validacion-formulario.spec.ts`

**Datos:** texto de frase y fuente con la marca. La marca va en **ambos** campos, porque en el paso 3 el texto es solo espacios y una creación errónea solo se podría reconocer por la fuente.

**Steps:**
  1. Ir a /quotes, abrir 'Nueva frase' y pulsar 'Añadir' sin completar nada.
    - expect: Alerta 'Error al añadir la frase.' con 'Faltan campos obligatorios.'
    - expect: El diálogo sigue abierto
  2. Escribir la frase única, elegir 'Marie Curie' y dejar Fuente vacía. Pulsar 'Añadir'.
    - expect: Alerta con 'La fuente no es válida.'
    - expect: La frase y el personaje elegidos se conservan
  3. Reemplazar la frase por solo espacios y completar Fuente con la marca. Pulsar 'Añadir'.
    - expect: Alerta con 'El texto de la cita no es válido.'
    - expect: No aparece 'Frase añadida exitosamente'
  4. Pulsar 'Cancelar' y volver a abrir 'Nueva frase'.
    - expect: Los campos están vacíos, el combobox muestra su placeholder y no hay alerta
  5. Cerrar el diálogo y consultar por API `GET /quotes`.
    - expect: La respuesta es 200
    - expect: Ninguna frase tiene la marca en su texto ni en su fuente
  6. Limpieza en afterEach: si alguna frase con la marca (en texto o fuente) llegó a crearse, eliminarla usando el ID devuelto por `GET /quotes`.
    - expect: No quedan recursos del test y 'Marie Curie' no se modifica

#### 1.3. eliminar una frase con confirmación y que no reaparezca

**File:** `tests/ia/eliminar-frase.spec.ts`

**Datos:** una frase y un personaje únicos, sin etiquetas, creados por API con `POST /quotes/add` (esperar 201).

**Steps:**
  1. Ir a /quotes.
    - expect: La tarjeta propia es visible y no tiene botón
  2. Activar el switch de Psycho Killer Mode y pulsar el botón de papelera de la tarjeta propia, y de ninguna otra.
    - expect: Diálogo '¿Deseas eliminar la frase?' que cita el texto propio
    - expect: La URL sigue siendo /quotes
  3. Pulsar 'Cancelar'.
    - expect: El diálogo se cierra y la tarjeta propia sigue presente
  4. Volver a pulsar la papelera y confirmar con 'Eliminar'.
    - expect: El diálogo se cierra y la tarjeta propia desaparece
  5. Registrar la espera de la respuesta de `GET /quotes`, recargar y esperarla. Comprobar que la lista cargó (alguna otra tarjeta visible, o respuesta vacía).
    - expect: La respuesta no contiene la frase eliminada
    - expect: La tarjeta propia no reaparece
    - expect: `GET /quotes/{id}` responde 404
  6. Limpieza en afterEach: frase (si el test falló antes) y personaje.
    - expect: No quedan recursos del test

#### 1.4. agregar varias etiquetas desde el detalle y que persistan

**File:** `tests/ia/agregar-etiquetas.spec.ts`

**Datos:** frase y personaje únicos sin etiquetas, creados por API. Etiquetas únicas `cancelada`, `tagA` y `tagB`.

**Steps:**
  1. Ir a /quotes/{id}.
    - expect: El h1 muestra la frase
  2. Pulsar 'Add Tag', escribir la etiqueta `cancelada` y pulsar 'Cancelar'.
    - expect: El diálogo se cierra y `cancelada` no aparece en el detalle
  3. Abrir de nuevo, reemplazar el valor (el campo conserva lo cancelado) por '<tagA>, <tagB>' y pulsar 'Agregar etiquetas'.
    - expect: Es visible 'Etiquetas añadidas exitosamente'
    - expect: El diálogo se cierra
    - expect: tagA y tagB son visibles en el detalle
  4. Recargar la página y esperar el h1.
    - expect: tagA y tagB siguen visibles
    - expect: `cancelada` no aparece en el detalle ni en `GET /tags`
  5. Navegar a /quotes con carga completa y localizar la tarjeta propia.
    - expect: La tarjeta muestra tagA y tagB
  6. Limpieza en afterEach: frase, las tres etiquetas posibles y personaje.
    - expect: No quedan recursos del test

#### 1.5. bug: tras elegir 'Todos' en el filtro, la búsqueda deja la lista vacía

**File:** `tests/ia/bug-filtro-todos.spec.ts`

**Datos:** frase (con la marca en el texto) y personaje únicos, creados por API.

**Defecto:** al buscar con "Todos" seleccionado, la app exige que el personaje de cada frase se llame "Todos" y descarta todas.

**Steps:**
  1. Ir a /quotes.
    - expect: La tarjeta propia es visible
  2. Abrir el filtro de personaje y elegir 'Todos'.
    - expect: El filtro muestra 'Todos'
    - expect: La tarjeta propia sigue visible
  3. Escribir la marca en 'Buscar frases...'.
    - expect: **ASERCIÓN DEL BUG:** la tarjeta propia es visible (hoy la lista queda vacía)
  4. Borrar la búsqueda. Con la aserción normal del paso 3, este paso solo se ejecuta cuando el defecto esté corregido.
    - expect: La tarjeta propia es visible
  5. Limpieza en afterEach: frase y personaje.
    - expect: La limpieza ocurre aunque el test falle

#### 1.6. bug: el detalle de una frase nueva muestra las etiquetas de la frase anterior

**File:** `tests/ia/bug-etiquetas-residuales.spec.ts`

**Datos:** frase A con una etiqueta única `tagA` y un personaje único, creados por API. Frase B única, creada desde la interfaz sin etiquetas.

**Defecto:** al pasar de un detalle a otro sin recargar, la vista conserva las etiquetas mostradas anteriormente.

**Steps:**
  1. Ir a /quotes/{idA}.
    - expect: El h1 muestra la frase A y tagA es visible
  2. Sin recargar ni salir de la vista, abrir 'Nueva frase' y crear la frase B con el personaje de A, una fuente única y Etiquetas vacío.
    - expect: Es visible 'Frase añadida exitosamente' con el botón 'Ver'
  3. Pulsar 'Ver' (navegación interna, sin `page.goto` ni recarga).
    - expect: La URL termina en el ID de B
    - expect: El h1 muestra la frase B (comprobarlo antes de la aserción siguiente)
    - expect: **ASERCIÓN DEL BUG:** tagA no aparece en la página (`toHaveCount(0)`); hoy B la muestra
  4. Limpieza en afterEach: frases A y B, tagA y personaje.
    - expect: La limpieza ocurre aunque el test falle
