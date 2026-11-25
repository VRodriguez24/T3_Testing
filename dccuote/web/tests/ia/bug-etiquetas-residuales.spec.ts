// spec: tests/plan-final.md
// seed: tests/seed.spec.ts
//
// Flujo: abrir el detalle de la frase A (con etiqueta), crear la frase B sin etiquetas desde esa
// vista, pulsar 'Ver' y comprobar que B no muestra la etiqueta de A.
//
// DEFECTO: al pasar de un detalle a otro sin recargar, la vista conserva las etiquetas mostradas
// anteriormente. El test afirma el comportamiento correcto, por lo que falla mientras exista.

import { createHash } from 'node:crypto';
import { test, expect } from '@playwright/test';

const API = 'http://127.0.0.1:5000';

// Recursos propios de la ejecución en curso; se registran ANTES de crearlos.
let recursos: { frases: string[]; etiquetas: string[]; personajes: string[] };

test.describe('Suite IA', () => {
  test.beforeEach(() => {
    recursos = { frases: [], etiquetas: [], personajes: [] };
  });

  // Limpieza garantizada (también cuando el test falla): frases, etiqueta y personaje (200 o 404).
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

  test('bug: el detalle de una frase nueva muestra las etiquetas de la frase anterior', { tag: ['@ia', '@claude'] }, async ({ page, request }) => {
    const marca = `E2E-residuales-${crypto.randomUUID().slice(0, 8)}`;
    const fraseA = `${marca} frase A`;
    const fraseB = `${marca} frase B`;
    const personaje = `${marca} personaje`;
    const tagA = `${marca}-tagA`;
    const idA = createHash('sha256').update(fraseA).digest('hex');
    const idB = createHash('sha256').update(fraseB).digest('hex');

    recursos.frases.push(idA, idB);
    recursos.etiquetas.push(tagA);
    recursos.personajes.push(personaje);

    const alta = await request.post(`${API}/quotes/add`, {
      data: { quote: fraseA, character: personaje, source: `${marca} fuente A`, tags: [tagA] },
    });
    expect(alta.status()).toBe(201);

    const titulo = page.getByRole('heading', { level: 1 });
    const etiquetaA = page.getByText(tagA, { exact: true });
    const dialogo = page.getByRole('dialog', { name: 'Nueva frase' });

    // 1. Ir a /quotes/{idA}.
    await page.goto(`/quotes/${idA}`);
    await expect(titulo).toHaveText(fraseA);
    await expect(etiquetaA).toBeVisible();

    // 2. Sin recargar ni salir de la vista, crear la frase B con el personaje de A, una fuente única y Etiquetas vacío.
    await page.getByRole('button', { name: 'Nueva frase' }).click();
    await dialogo.getByRole('textbox', { name: 'Frase' }).fill(fraseB);
    await dialogo.getByRole('combobox').click();
    await page.getByRole('option', { name: personaje, exact: true }).click();
    await dialogo.getByLabel('Fuente').fill(`${marca} fuente B`);
    await expect(dialogo.getByLabel('Etiquetas')).toHaveValue('');
    await dialogo.getByRole('button', { name: 'Añadir' }).click();
    await expect(page.getByText('Frase añadida exitosamente')).toBeVisible();
    const botonVer = page.getByRole('button', { name: 'Ver', exact: true });
    await expect(botonVer).toBeVisible();

    // 3. Pulsar 'Ver' (navegación interna, sin `page.goto` ni recarga).
    await botonVer.click();
    await expect(page).toHaveURL(new RegExp(`/quotes/${idB}$`));
    await expect(titulo).toHaveText(fraseB);
    // ASERCIÓN DEL BUG: B no tiene etiquetas, así que tagA no debe aparecer (hoy B la muestra).
    await expect(etiquetaA).toHaveCount(0);

    // 4. Limpieza en afterEach: frases A y B, tagA y personaje.
  });
});
