// spec: tests/plan-final.md
// seed: tests/seed.spec.ts
//
// Flujo: crear una frase por API, elegir 'Todos' en el filtro, buscar la frase y borrar la búsqueda.
//
// DEFECTO: al buscar con 'Todos' seleccionado, la app exige que el personaje de cada frase se llame
// 'Todos' y descarta todas. El test afirma el comportamiento correcto, por lo que falla mientras exista.

import { createHash } from 'node:crypto';
import { test, expect } from '@playwright/test';

const API = 'http://127.0.0.1:5000';

// Recursos propios de la ejecución en curso; se registran ANTES de crearlos.
let recursos: { frases: string[]; personajes: string[] };

test.describe('Suite IA', () => {
  test.beforeEach(() => {
    recursos = { frases: [], personajes: [] };
  });

  // Limpieza garantizada (también cuando el test falla): frase y personaje, en ese orden (200 o 404).
  test.afterEach(async ({ request }) => {
    for (const id of recursos.frases) {
      const respuesta = await request.delete(`${API}/quotes/delete/${id}`);
      expect.soft([200, 404], `borrar frase ${id}`).toContain(respuesta.status());
    }

    const personajes: { id: string; name: string }[] = await (await request.get(`${API}/characters`)).json();
    for (const personaje of personajes.filter((p) => recursos.personajes.includes(p.name))) {
      const respuesta = await request.delete(`${API}/characters/delete/${personaje.id}`);
      expect.soft([200, 404], `borrar personaje ${personaje.name}`).toContain(respuesta.status());
    }
  });

  test("bug: tras elegir 'Todos' en el filtro, la búsqueda deja la lista vacía", { tag: ['@ia', '@claude'] }, async ({ page, request }) => {
    const marca = `E2E-todos-${crypto.randomUUID().slice(0, 8)}`;
    const frase = `${marca} frase`;
    const personaje = `${marca} personaje`;

    recursos.frases.push(createHash('sha256').update(frase).digest('hex'));
    recursos.personajes.push(personaje);

    const alta = await request.post(`${API}/quotes/add`, {
      data: { quote: frase, character: personaje, source: `${marca} fuente` },
    });
    expect(alta.status()).toBe(201);

    const tarjeta = page.getByTestId('quotes-grid').locator(':scope > *').filter({ hasText: marca });
    const filtro = page.locator('button[role="combobox"]');
    const buscador = page.getByPlaceholder('Buscar frases...');

    // 1. Ir a /quotes.
    await page.goto('/quotes');
    await expect(tarjeta).toBeVisible();

    // 2. Abrir el filtro de personaje y elegir 'Todos'.
    await filtro.click();
    await page.getByRole('option', { name: 'Todos', exact: true }).click();
    await expect(filtro).toHaveText('Todos');
    await expect(tarjeta).toBeVisible();

    // 3. Escribir la marca en 'Buscar frases...'.
    await buscador.fill(marca);
    // ASERCIÓN DEL BUG: la tarjeta propia debe ser visible (hoy la lista queda vacía).
    await expect(tarjeta).toBeVisible();

    // 4. Borrar la búsqueda. Solo se ejecuta cuando el defecto esté corregido.
    await buscador.fill('');
    await expect(tarjeta).toBeVisible();

    // 5. Limpieza en afterEach: frase y personaje.
  });
});
