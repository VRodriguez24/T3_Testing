// spec: tests/plan-final.md
// seed: tests/seed.spec.ts
//
// Flujo: crear una frase por API, cancelar una etiqueta desde el detalle, agregar otras dos,
// recargar y comprobar que persisten en el detalle y en la lista.

import { createHash } from 'node:crypto';
import { test, expect } from '@playwright/test';

const API = 'http://127.0.0.1:5000';

// Recursos propios de la ejecución en curso; se registran ANTES de crearlos.
let recursos: { frases: string[]; etiquetas: string[]; personajes: string[] };

test.describe('Suite IA', () => {
  test.beforeEach(() => {
    recursos = { frases: [], etiquetas: [], personajes: [] };
  });

  // Limpieza garantizada: frase, etiquetas y personaje, en ese orden (200 o 404).
  test.afterEach(async ({ request }) => {
    for (const id of recursos.frases) {
      const respuesta = await request.delete(`${API}/quotes/delete/${id}`);
      expect.soft([200, 404], `borrar frase ${id}`).toContain(respuesta.status());
    }

    const etiquetas: { id: string; name: string }[] = await (await request.get(`${API}/tags`)).json();
    for (const etiqueta of etiquetas.filter((e) => recursos.etiquetas.includes(e.name))) {
      const respuesta = await request.delete(`${API}/tags/delete/${etiqueta.id}`);
      expect.soft([200, 404], `borrar etiqueta ${etiqueta.name}`).toContain(respuesta.status());
    }

    const personajes: { id: string; name: string }[] = await (await request.get(`${API}/characters`)).json();
    for (const personaje of personajes.filter((p) => recursos.personajes.includes(p.name))) {
      const respuesta = await request.delete(`${API}/characters/delete/${personaje.id}`);
      expect.soft([200, 404], `borrar personaje ${personaje.name}`).toContain(respuesta.status());
    }
  });

  test('agregar varias etiquetas desde el detalle y que persistan', { tag: ['@ia', '@claude'] }, async ({ page, request }) => {
    const marca = `E2E-etiquetas-${crypto.randomUUID().slice(0, 8)}`;
    const frase = `${marca} frase`;
    const personaje = `${marca} personaje`;
    const cancelada = `${marca}-cancelada`;
    const tagA = `${marca}-tagA`;
    const tagB = `${marca}-tagB`;
    const id = createHash('sha256').update(frase).digest('hex');

    recursos.frases.push(id);
    recursos.etiquetas.push(cancelada, tagA, tagB);
    recursos.personajes.push(personaje);

    const alta = await request.post(`${API}/quotes/add`, {
      data: { quote: frase, character: personaje, source: `${marca} fuente` },
    });
    expect(alta.status()).toBe(201);

    const titulo = page.getByRole('heading', { level: 1 });
    const botonAgregar = page.getByRole('button', { name: 'Add Tag' });
    const dialogo = page.getByRole('dialog', { name: 'Nuevas etiquetas para la frase' });
    const campo = dialogo.getByPlaceholder('chile, humor, tv');

    // 1. Ir a /quotes/{id}.
    await page.goto(`/quotes/${id}`);
    await expect(titulo).toHaveText(frase);

    // 2. Pulsar 'Add Tag', escribir la etiqueta `cancelada` y pulsar 'Cancelar'.
    await botonAgregar.click();
    await campo.fill(cancelada);
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialogo).toBeHidden();
    await expect(titulo).toBeVisible();
    await expect(page.getByText(cancelada, { exact: true })).toHaveCount(0);

    // 3. Abrir de nuevo, reemplazar el valor (el campo conserva lo cancelado) por '<tagA>, <tagB>' y pulsar 'Agregar etiquetas'.
    await botonAgregar.click();
    await campo.fill(`${tagA}, ${tagB}`);
    await dialogo.getByRole('button', { name: 'Agregar etiquetas' }).click();
    await expect(page.getByText('Etiquetas añadidas exitosamente')).toBeVisible();
    await expect(dialogo).toBeHidden();
    await expect(page.getByText(tagA, { exact: true })).toBeVisible();
    await expect(page.getByText(tagB, { exact: true })).toBeVisible();

    // 4. Recargar la página y esperar el h1.
    await page.reload();
    await expect(titulo).toHaveText(frase);
    await expect(page.getByText(tagA, { exact: true })).toBeVisible();
    await expect(page.getByText(tagB, { exact: true })).toBeVisible();
    await expect(page.getByText(cancelada, { exact: true })).toHaveCount(0);
    const respuestaEtiquetas = await request.get(`${API}/tags`);
    expect(respuestaEtiquetas.status()).toBe(200);
    const nombres = ((await respuestaEtiquetas.json()) as { name: string }[]).map((e) => e.name);
    // La presencia de tagA y tagB confirma que la lista cargó antes de comprobar la ausencia.
    expect(nombres).toEqual(expect.arrayContaining([tagA, tagB]));
    expect(nombres).not.toContain(cancelada);

    // 5. Navegar a /quotes con carga completa y localizar la tarjeta propia.
    await page.goto('/quotes');
    const tarjeta = page.getByTestId('quotes-grid').locator(':scope > *').filter({ hasText: marca });
    const etiquetasTarjeta = tarjeta.locator('[data-slot="card-footer"]');
    await expect(etiquetasTarjeta.getByText(tagA, { exact: true })).toBeVisible();
    await expect(etiquetasTarjeta.getByText(tagB, { exact: true })).toBeVisible();

    // 6. Limpieza en afterEach: frase, las tres etiquetas posibles y personaje.
  });
});
