# Tarea 3: API & End2End Testing
Este repositorio contiene el código base necesario para el desarrollo de la Tarea 3 del curso de Testing.
La tarea se desarrolla sobre la base de la aplicación **DCCuote** que permite crear, listar y gestionar frases. Tu tarea será escribir una serie de **tests de API y E2E** que validen el comportamiento esperado de la aplicación frente a diferentes interacciones de usuario.

## Estructura del Proyecto
- [`api/`](./api/) → Contiene el backend (Flask API), los archivos docker necesarios para levantarlo, y la estructura base de API testing en pytest.
- [`web/`](./web/) → Contiene el frontend desarrollado con **React** (en TypeScript) y la estructura base de **tests E2E** de Playwright.  

En cada carpeta hay un readme que detalla cómo levantar las aplicaciones.

## Requisitos Previos
- Tener instalado **docker** y **python**
- Tener instalado **Node.js** y **npm**.

## Cómo ejecutar el proyecto y los tests

### Backend y base de datos de pruebas
Desde `api/`:

```bash
docker compose build
docker compose up -d      # API en http://127.0.0.1:5000 (documentación en /apidocs)
docker compose down       # para detenerlo
```

La API se configura con [`.env.test`](./api/.env.test), por lo que usa la base `db_test`. **Pytest borra y vuelve a poblar esa misma base** antes de cada test que la usa, así que no se deben ejecutar Pytest y Playwright al mismo tiempo.

### Tests unitarios y de integración (Pytest)
Desde `api/`:

```bash
docker compose build app   # necesario tras cambiar tests: se copian en la imagen
docker compose run --rm app pytest -q -k . tests/unit          # solo unitarios
docker compose run --rm app pytest -q -k . tests/integration   # solo integración
docker compose run --rm app pytest -q -k .                     # suite completa
```

Para copiar el reporte HTML de cobertura, ejecute sin `--rm` y use `docker cp <container_id>:/app/htmlcov ./htmlcov`.

### Tests end-to-end (Playwright)
Con el backend levantado, desde `web/`:

```bash
npm install
npx playwright install chromium
npx playwright test
npx playwright show-report
```

Playwright compila la aplicación y levanta su propio servidor en el puerto 4173, que debe estar libre. La suite usa solo Chromium. El resultado esperado es **8 tests aprobados y 2 fallidos** (los dos bugs descritos más abajo), por lo que el comando termina con código de error.

## API Testing

**Uso de IA:** Claude Code implementó las pruebas unitarias y de integración de la API.

| Conjunto | Tests | Cobertura de líneas del backend |
|---|---|---|
| Unitarios ([`api/tests/unit/`](./api/tests/unit/)) | 107 | **100%** (272 de 272) |
| Integración ([`api/tests/integration/`](./api/tests/integration/)) | 5 | 99% |
| Suite completa | 112 | 100% |

No hay líneas sin cubrir en los tests unitarios. El bloque `if __name__ == "__main__"` de `app.py` se prueba con `Flask.run` simulado, sin abrir un servidor.

Los cinco flujos de integración están en [`test_user_flows.py`](./api/tests/integration/test_user_flows.py); cada uno usa al menos tres endpoints distintos:

1. Ver la frase diaria, abrir su detalle y filtrar por personaje y etiquetas.
2. Publicar una frase con personaje y etiquetas nuevas, y encontrarla.
3. Corregir envíos inválidos, publicar y no poder duplicar la frase.
4. Etiquetar una frase, buscarla por la etiqueta y eliminar la etiqueta.
5. Eliminar la frase para poder eliminar su personaje.

En [`pytest.ini`](./api/pytest.ini) se quitó `--cov=scripts`, que apuntaba a un módulo inexistente (`--cov=src` ya incluye `src/scripts`).

## End-to-End Testing

La suite tiene exactamente diez tests: cuatro `@manual` y seis `@ia @claude`. El archivo `tests/seed.spec.ts` no cuenta.

| Test | Tags |
|---|---|
| [`example.spec.ts`](./web/tests/example.spec.ts): añadir frase exitosamente (incluido en el código base) | `@manual` |
| [`frase-duplicada.spec.ts`](./web/tests/manual/frase-duplicada.spec.ts): rechazar una frase duplicada | `@manual` |
| [`filtro-y-busqueda.spec.ts`](./web/tests/manual/filtro-y-busqueda.spec.ts): filtrar por personaje y acotar con búsqueda | `@manual` |
| [`navegacion-detalle.spec.ts`](./web/tests/manual/navegacion-detalle.spec.ts): ir al detalle, recargar y volver | `@manual` |
| [`crear-con-personaje-nuevo.spec.ts`](./web/tests/ia/crear-con-personaje-nuevo.spec.ts): crear frase con personaje nuevo y filtrar por él | `@ia @claude` |
| [`validacion-formulario.spec.ts`](./web/tests/ia/validacion-formulario.spec.ts): formulario incompleto no crea la frase | `@ia @claude` |
| [`eliminar-frase.spec.ts`](./web/tests/ia/eliminar-frase.spec.ts): eliminar una frase con confirmación | `@ia @claude` |
| [`agregar-etiquetas.spec.ts`](./web/tests/ia/agregar-etiquetas.spec.ts): agregar etiquetas desde el detalle | `@ia @claude` |
| [`bug-filtro-todos.spec.ts`](./web/tests/ia/bug-filtro-todos.spec.ts): **bug** del filtro "Todos" | `@ia @claude` |
| [`bug-etiquetas-residuales.spec.ts`](./web/tests/ia/bug-etiquetas-residuales.spec.ts): **bug** de etiquetas residuales | `@ia @claude` |

### Uso de IA
- Los seis tests `@ia @claude` se generaron con los Playwright Test Agents usando Claude Code. El plan original de Planner está sin modificaciones en [`web/tests/plan-planner.md`](./web/tests/plan-planner.md) y el plan refinado en [`web/tests/plan-final.md`](./web/tests/plan-final.md).
- Los tres tests `@manual` adicionales al ejemplo se basan en escenarios propuestos por Planner (sección 2 de su plan). Se desarrollaron tomando como referencia los ejemplos existentes, con apoyo de Claude en comprensión, revisión y validación.

### Bugs detectados
Estas dos pruebas afirman el comportamiento correcto, así que **fallan intencionalmente** mientras el defecto exista:

1. **`bug-filtro-todos`:** tras elegir "Todos" en el filtro de personaje, buscar un texto deja la lista vacía aunque haya coincidencias.
2. **`bug-etiquetas-residuales`:** al pasar del detalle de una frase a otro sin recargar, se siguen mostrando las etiquetas de la frase anterior.

### Ejecución en serie
Configuramos `workers: 1` en [`playwright.config.ts`](./web/playwright.config.ts) para evitar los timeouts observados durante la ejecución paralela, sin modificar assertions ni aumentar timeouts. Todos los tests comparten además la misma base de datos.

## Entrega
El `.zip` se genera desde la raíz del repositorio Git (`T3_Testing`, la carpeta que contiene `dccuote/`):

```bash
git archive --format=zip -o tarea3.zip HEAD dccuote ':(exclude)**/*:Zone.Identifier' ':(exclude)**/.DS_Store'
```

El archivo contiene únicamente la carpeta `dccuote/`, con los archivos que Git tiene registrados, y excluye los auxiliares `:Zone.Identifier` y `.DS_Store`.

> ⚠️ **Importante:** el comando empaqueta el **último commit** (`HEAD`), no el estado actual de los archivos. Antes de generarlo, revise con `git status` que los cambios de la entrega estén en un commit.