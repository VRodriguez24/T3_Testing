// Equivalence Partitioning
// Verifica el rechazo de una frase duplicada y la conservación de los datos originales

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

  test('rechazar una frase duplicada sin crear una segunda copia', { tag: '@manual' }, async ({ page, request }) => {
    // ARRANGE
    const marca = `E2E-duplicada-${crypto.randomUUID().slice(0, 8)}`;
    const frase = `${marca} frase`;
    const personaje = `${marca} personaje`;
    const fuente = `${marca} fuente original`;
    const fuenteDuplicada = `${marca} fuente alternativa`;
    const id = createHash('sha256').update(frase).digest('hex');

    recursos.frases.push(id);
    recursos.personajes.push(personaje);

    const alta = await request.post(`${API}/quotes/add`, {
      data: { quote: frase, character: personaje, source: fuente },
    });
    expect(alta.status()).toBe(201);

    const tarjetas = page.getByTestId('quotes-grid').locator(':scope > *');
    const tarjeta = tarjetas.filter({ hasText: marca });
    const dialogo = page.getByRole('dialog', { name: 'Nueva frase' });
    const alerta = dialogo.getByRole('alert');

    await page.goto('/quotes');
    await expect(tarjeta).toHaveCount(1);
    await expect(tarjeta).toBeVisible();
    await expect(tarjeta).toContainText(personaje);
    await expect(tarjeta).toContainText(fuente);

    // ACT: intentar crear el mismo texto con otros datos.
    await page.getByRole('button', { name: 'Nueva frase' }).click();
    await dialogo.getByRole('textbox', { name: 'Frase' }).fill(frase);
    await dialogo.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Marie Curie', exact: true }).click();
    await dialogo.getByLabel('Fuente').fill(fuenteDuplicada);
    await dialogo.getByRole('button', { name: 'Añadir' }).click();

    // ASSERT: comprobar el rechazo.
    await expect(alerta).toContainText('Error al añadir la frase.');
    await expect(alerta).toContainText('La cita ya existe.');
    await expect(dialogo).toBeVisible();
    await expect(page.getByText('Frase añadida exitosamente')).toHaveCount(0);

    // ASSERT: recargar y comprobar que el registro original permanece intacto.
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialogo).toBeHidden();
    await page.reload();
    await expect(tarjeta).toHaveCount(1);
    await expect(tarjeta).toBeVisible();
    await expect(tarjeta).toContainText(frase);
    await expect(tarjeta).toContainText(personaje);
    await expect(tarjeta).toContainText(fuente);
    await expect(tarjeta).not.toContainText(fuenteDuplicada);
    await expect(tarjeta).not.toContainText('Marie Curie');

    // TEARDOWN: afterEach.
  });
});
