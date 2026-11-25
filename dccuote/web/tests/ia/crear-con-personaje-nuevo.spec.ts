// spec: tests/plan-final.md
// seed: tests/seed.spec.ts
//
// Flujo: crear una frase con un personaje nuevo desde la interfaz, comprobar la tarjeta,
// recargar, filtrar por ese personaje y limpiar los recursos creados.

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

  test('crear frase con personaje nuevo y encontrarla filtrando por ese personaje', { tag: ['@ia', '@claude'] }, async ({ page }) => {
    const marca = `E2E-crear-${crypto.randomUUID().slice(0, 8)}`;
    const frase = `${marca} frase`;
    const fuente = `${marca} fuente`;
    const personaje = `${marca} personaje`;
    const tagA = `${marca}-tagA`;
    const tagB = `${marca}-tagB`;

    recursos.frases.push(createHash('sha256').update(frase).digest('hex'));
    recursos.etiquetas.push(tagA, tagB);
    recursos.personajes.push(personaje);

    const dialogo = page.getByRole('dialog', { name: 'Nueva frase' });
    const tarjetas = page.getByTestId('quotes-grid').locator(':scope > *');
    const tarjeta = tarjetas.filter({ hasText: marca });
    const etiquetasTarjeta = tarjeta.locator('[data-slot="card-footer"] > *');

    // 1. Ir a /quotes y abrir 'Nueva frase'. En Personaje, escribir el nombre único y elegir 'Create "<nombre>"'.
    // Los personajes del formulario se cargan al montar la app: se espera antes de crear uno.
    const personajesCargados = page.waitForResponse(`${API}/characters`);
    await page.goto('/quotes');
    await personajesCargados;
    await page.getByRole('button', { name: 'Nueva frase' }).click();
    await dialogo.getByRole('combobox').click();
    await page.getByPlaceholder('Search or create new').fill(personaje);
    await page.getByText(`Create "${personaje}"`).first().click();
    await expect(dialogo.getByRole('combobox')).toHaveText(personaje);

    // 2. Completar Frase y Fuente y escribir en Etiquetas ' <tagA> , <tagB> ,, '. Pulsar 'Añadir'.
    await dialogo.getByRole('textbox', { name: 'Frase' }).fill(frase);
    await dialogo.getByLabel('Fuente').fill(fuente);
    await dialogo.getByLabel('Etiquetas').fill(` ${tagA} , ${tagB} ,, `);
    await dialogo.getByRole('button', { name: 'Añadir' }).click();
    await expect(page.getByText('Frase añadida exitosamente')).toBeVisible();
    await expect(dialogo).toBeHidden();
    await expect(tarjeta).toContainText(frase);
    await expect(tarjeta).toContainText(personaje);
    await expect(tarjeta).toContainText(fuente);
    // Exactamente dos etiquetas; las expresiones ancladas detectan espacios sobrantes.
    await expect(etiquetasTarjeta).toHaveCount(2);
    await expect(etiquetasTarjeta.filter({ hasText: new RegExp(`^${tagA}$`) })).toHaveCount(1);
    await expect(etiquetasTarjeta.filter({ hasText: new RegExp(`^${tagB}$`) })).toHaveCount(1);

    // 3. Recargar /quotes (el filtro solo carga personajes al montarse) y elegir el personaje nuevo en el filtro.
    await page.reload();
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: personaje, exact: true }).click();
    // El personaje es exclusivo del test, por lo que el conteo es sobre recursos propios.
    await expect(tarjetas).toHaveCount(1);
    await expect(tarjetas).toContainText(frase);
    await expect(tarjeta).toContainText(fuente);
    await expect(etiquetasTarjeta).toHaveCount(2);
    await expect(etiquetasTarjeta.filter({ hasText: new RegExp(`^${tagA}$`) })).toHaveCount(1);
    await expect(etiquetasTarjeta.filter({ hasText: new RegExp(`^${tagB}$`) })).toHaveCount(1);

    // 4. Limpieza en afterEach: frase, dos etiquetas y personaje.
  });
});
