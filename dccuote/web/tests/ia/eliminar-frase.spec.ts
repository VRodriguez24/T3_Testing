// spec: tests/plan-final.md
// seed: tests/seed.spec.ts
//
// Flujo: crear una frase por API, intentar eliminarla y cancelar, eliminarla confirmando,
// recargar y comprobar que no reaparece.

import { createHash } from 'node:crypto';
import { test, expect } from '@playwright/test';

const API = 'http://127.0.0.1:5000';

// Recursos propios de la ejecución en curso; se registran ANTES de crearlos.
let recursos: { frases: string[]; personajes: string[] };

test.describe('Suite IA', () => {
  test.beforeEach(() => {
    recursos = { frases: [], personajes: [] };
  });

  // Limpieza garantizada: frase (si el test falló antes) y personaje, en ese orden (200 o 404).
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

  test('eliminar una frase con confirmación y que no reaparezca', { tag: ['@ia', '@claude'] }, async ({ page, request }) => {
    const marca = `E2E-eliminar-${crypto.randomUUID().slice(0, 8)}`;
    const frase = `${marca} frase`;
    const personaje = `${marca} personaje`;
    const id = createHash('sha256').update(frase).digest('hex');

    recursos.frases.push(id);
    recursos.personajes.push(personaje);

    const alta = await request.post(`${API}/quotes/add`, {
      data: { quote: frase, character: personaje, source: `${marca} fuente` },
    });
    expect(alta.status()).toBe(201);

    const tarjetas = page.getByTestId('quotes-grid').locator(':scope > *');
    const tarjeta = tarjetas.filter({ hasText: marca });
    const confirmacion = page.getByRole('dialog', { name: '¿Deseas eliminar la frase?' });

    // 1. Ir a /quotes.
    await page.goto('/quotes');
    await expect(tarjeta).toBeVisible();
    await expect(tarjeta.getByRole('button')).toHaveCount(0);

    // 2. Activar el switch de Psycho Killer Mode y pulsar el botón de papelera de la tarjeta propia, y de ninguna otra.
    await page.getByRole('switch').click();
    await tarjeta.getByRole('button').click();
    await expect(confirmacion).toContainText(`La frase "${frase}" será eliminada permanentemente.`);
    await expect(page).toHaveURL(/\/quotes$/);

    // 3. Pulsar 'Cancelar'.
    await confirmacion.getByRole('button', { name: 'Cancelar' }).click();
    await expect(confirmacion).toBeHidden();
    await expect(tarjeta).toBeVisible();

    // 4. Volver a pulsar la papelera y confirmar con 'Eliminar'.
    await tarjeta.getByRole('button').click();
    // Antes de pulsar se comprueba que el diálogo cita la frase propia.
    await expect(confirmacion).toContainText(frase);
    await confirmacion.getByRole('button', { name: 'Eliminar' }).click();
    await expect(confirmacion).toBeHidden();
    await expect(tarjeta).toHaveCount(0);

    // 5. Registrar la espera de `GET /quotes`, recargar y esperarla. Comprobar que la lista cargó.
    const esperaLista = page.waitForResponse(
      (r) => r.url() === `${API}/quotes` && r.request().method() === 'GET',
    );
    await page.reload();
    const respuestaLista = await esperaLista;
    expect(respuestaLista.status()).toBe(200);
    const lista: { id: string }[] = await respuestaLista.json();
    // Señal positiva de carga antes de las aserciones de ausencia: otra tarjeta visible o respuesta vacía.
    if (lista.length > 0) {
      await expect(tarjetas.first()).toBeVisible();
    }
    expect(lista.map((f) => f.id)).not.toContain(id);
    await expect(tarjeta).toHaveCount(0);
    expect((await request.get(`${API}/quotes/${id}`)).status()).toBe(404);

    // 6. Limpieza en afterEach: frase (si el test falló antes) y personaje.
  });
});
