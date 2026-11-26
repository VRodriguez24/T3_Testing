// State Transition Testing
// Verifica la navegación al detalle, la persistencia al recargar y el regreso al listado

import { createHash } from 'node:crypto';
import { test, expect } from '@playwright/test';

const API = 'http://127.0.0.1:5000';

// Recursos propios de la ejecución en curso; se registran ANTES de crearlos.
let recursos: { frases: string[]; etiquetas: string[]; personajes: string[] };

test.describe('Suite manual', () => {
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

  test('navegar de la lista al detalle, recargar y volver', { tag: '@manual' }, async ({ page, request }) => {
    // ARRANGE
    const marca = `E2E-detalle-${crypto.randomUUID().slice(0, 8)}`;
    const frase = `${marca} frase`;
    const personaje = `${marca} personaje`;
    const fuente = `${marca} fuente`;
    const tag = `${marca}-tag`;
    const id = createHash('sha256').update(frase).digest('hex');

    recursos.frases.push(id);
    recursos.etiquetas.push(tag);
    recursos.personajes.push(personaje);

    const alta = await request.post(`${API}/quotes/add`, {
      data: { quote: frase, character: personaje, source: fuente, tags: [tag] },
    });
    expect(alta.status()).toBe(201);
    const idPersonaje = (await alta.json()).character.id;

    const tarjeta = page.getByTestId('quotes-grid').locator(':scope > *').filter({ hasText: marca });
    const titulo = page.getByRole('heading', { level: 1 });
    const autoria = page.getByTestId(idPersonaje);
    const etiqueta = page.getByText(tag, { exact: true });

    // ACT + ASSERT: S0 -> S1 (inicio a listado).
    await page.goto('/');
    await page.getByRole('link', { name: 'Frases' }).click();
    await expect(page).toHaveURL(/\/quotes$/);
    await expect(tarjeta).toBeVisible();

    // S1 -> S2 (listado a detalle).
    await tarjeta.getByText(frase, { exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/quotes/${id}$`));
    await expect(titulo).toHaveText(frase);
    await expect(autoria).toHaveText(`- ${personaje} (${fuente})`);
    await expect(etiqueta).toBeVisible();

    // S2 -> S2 (recarga del detalle).
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/quotes/${id}$`));
    await expect(titulo).toHaveText(frase);
    await expect(autoria).toHaveText(`- ${personaje} (${fuente})`);
    await expect(etiqueta).toBeVisible();

    // S2 -> S1 (atrás del navegador).
    await page.goBack();
    await expect(page).toHaveURL(/\/quotes$/);
    await expect(tarjeta).toBeVisible();

    // TEARDOWN: afterEach.
  });
});
