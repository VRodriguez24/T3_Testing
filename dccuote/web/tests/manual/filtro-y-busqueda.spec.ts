// Decision Tables
// Verifica las cuatro combinaciones de coincidencia entre personaje y texto

import { createHash } from 'node:crypto';
import { test, expect } from '@playwright/test';

const API = 'http://127.0.0.1:5000';

// Recursos propios de la ejecución en curso; se registran ANTES de crearlos.
let recursos: { frases: string[]; personajes: string[] };

test.describe('Suite manual', () => {
  test.beforeEach(() => {
    recursos = { frases: [], personajes: [] };
  });

  // Limpieza de frases y personajes propios, en ese orden (200 o 404).
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

  test('filtrar por personaje y luego acotar con búsqueda sin distinguir mayúsculas', { tag: '@manual' }, async ({ page, request }) => {
    // ARRANGE
    const marca = `E2E-filtro-${crypto.randomUUID().slice(0, 8)}`;
    const personajeA = `${marca} personaje A`;
    const personajeB = `${marca} personaje B`;
    const fuente = `${marca} fuente`;
    const frase1 = `${marca} ALFA uno`;
    const frase2 = `${marca} BETA dos`;
    const frase3 = `${marca} ALFA tres`;

    recursos.personajes.push(personajeA, personajeB);
    recursos.frases.push(
      createHash('sha256').update(frase1).digest('hex'),
      createHash('sha256').update(frase2).digest('hex'),
      createHash('sha256').update(frase3).digest('hex'),
    );

    const datos = [
      { quote: frase1, character: personajeA, source: fuente },
      { quote: frase2, character: personajeA, source: fuente },
      { quote: frase3, character: personajeB, source: fuente },
    ];

    for (const dato of datos) {
      const alta = await request.post(`${API}/quotes/add`, { data: dato });
      expect(alta.status()).toBe(201);
    }

    const tarjetas = page.getByTestId('quotes-grid').locator(':scope > *');
    const propias = tarjetas.filter({ hasText: marca });
    const tarjeta1 = propias.filter({ hasText: frase1 });
    const tarjeta2 = propias.filter({ hasText: frase2 });
    const tarjeta3 = propias.filter({ hasText: frase3 });
    const filtro = page.locator('button[role="combobox"]');
    const buscador = page.getByPlaceholder('Buscar frases...');

    await page.goto('/quotes');
    await expect(propias).toHaveCount(3);
    await expect(tarjeta1).toBeVisible();
    await expect(tarjeta2).toBeVisible();
    await expect(tarjeta3).toBeVisible();

    // ACT + ASSERT: seleccionar primero el personaje A.
    await filtro.click();
    await page.getByRole('option', { name: personajeA, exact: true }).click();
    await expect(filtro).toHaveText(personajeA);
    await expect(tarjetas).toHaveCount(2);
    await expect(tarjeta1).toBeVisible();
    await expect(tarjeta2).toBeVisible();
    await expect(tarjeta3).toHaveCount(0);

    // Buscar alfa: R1, R2 y R3 de la tabla de decisión.
    await buscador.fill('alfa');
    await expect(tarjetas).toHaveCount(1);
    await expect(tarjeta1).toBeVisible();
    await expect(tarjeta2).toHaveCount(0);
    await expect(tarjeta3).toHaveCount(0);

    // Buscar beta: incorporar R4 sin crear un test ni una frase adicional.
    await buscador.fill('beta');
    await expect(tarjetas).toHaveCount(1);
    await expect(tarjeta2).toBeVisible();
    await expect(tarjeta1).toHaveCount(0);
    await expect(tarjeta3).toHaveCount(0);

    // Buscar texto inexistente, partiendo de una tarjeta visible.
    await buscador.fill(`${marca}-inexistente`);
    await expect(tarjetas).toHaveCount(0);

    // Borrar la búsqueda y comprobar que se conserva el filtro.
    await buscador.fill('');
    await expect(filtro).toHaveText(personajeA);
    await expect(tarjetas).toHaveCount(2);
    await expect(tarjeta1).toBeVisible();
    await expect(tarjeta2).toBeVisible();
    await expect(tarjeta3).toHaveCount(0);

    // TEARDOWN: afterEach.
  });
});
