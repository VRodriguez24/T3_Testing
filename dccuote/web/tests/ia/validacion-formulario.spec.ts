// spec: tests/plan-final.md
// seed: tests/seed.spec.ts
//
// Flujo: enviar el formulario incompleto de tres formas, comprobar cada error, cancelar y
// reabrir, y confirmar por API que no se guardó ninguna frase.

import { test, expect } from '@playwright/test';

const API = 'http://127.0.0.1:5000';

type Frase = { id: string; quote: string; source: string };

// Marca de la ejecución en curso; se registra antes de intentar crear nada.
let marca: string;

test.describe('Suite IA', () => {
  test.beforeEach(() => {
    marca = `E2E-validacion-${crypto.randomUUID().slice(0, 8)}`;
  });

  // Limpieza garantizada: si alguna frase con la marca llegó a crearse, se elimina.
  // 'Marie Curie' es un dato preexistente y no se toca.
  test.afterEach(async ({ request }) => {
    const frases: Frase[] = await (await request.get(`${API}/quotes`)).json();
    for (const frase of frases.filter((f) => f.quote.includes(marca) || f.source.includes(marca))) {
      const respuesta = await request.delete(`${API}/quotes/delete/${frase.id}`);
      expect.soft([200, 404], `borrar frase ${frase.id}`).toContain(respuesta.status());
    }
  });

  test('formulario incompleto muestra errores y no crea la frase', { tag: ['@ia', '@claude'] }, async ({ page, request }) => {
    const texto = `${marca} frase`;
    const fuente = `${marca} fuente`;

    const botonNueva = page.getByRole('button', { name: 'Nueva frase' });
    const dialogo = page.getByRole('dialog', { name: 'Nueva frase' });
    const campoFrase = dialogo.getByRole('textbox', { name: 'Frase' });
    const campoFuente = dialogo.getByLabel('Fuente');
    const campoEtiquetas = dialogo.getByLabel('Etiquetas');
    const combobox = dialogo.getByRole('combobox');
    const botonAnadir = dialogo.getByRole('button', { name: 'Añadir' });
    const botonCancelar = dialogo.getByRole('button', { name: 'Cancelar' });
    const alerta = dialogo.getByRole('alert');
    const exito = page.getByText('Frase añadida exitosamente');

    // 1. Ir a /quotes, abrir 'Nueva frase' y pulsar 'Añadir' sin completar nada.
    await page.goto('/quotes');
    await botonNueva.click();
    await botonAnadir.click();
    await expect(alerta).toContainText('Error al añadir la frase.');
    await expect(alerta).toContainText('Faltan campos obligatorios.');
    await expect(dialogo).toBeVisible();

    // 2. Escribir la frase única, elegir 'Marie Curie' y dejar Fuente vacía. Pulsar 'Añadir'.
    await campoFrase.fill(texto);
    await combobox.click();
    await page.getByRole('option', { name: 'Marie Curie', exact: true }).click();
    await botonAnadir.click();
    await expect(alerta).toContainText('La fuente no es válida.');
    await expect(campoFrase).toHaveValue(texto);
    await expect(combobox).toHaveText('Marie Curie');

    // 3. Reemplazar la frase por solo espacios y completar Fuente con la marca. Pulsar 'Añadir'.
    await campoFrase.fill('    ');
    await campoFuente.fill(fuente);
    await botonAnadir.click();
    // La alerta con el nuevo error es la señal de que la respuesta llegó, antes de comprobar la ausencia.
    await expect(alerta).toContainText('El texto de la cita no es válido.');
    await expect(exito).toHaveCount(0);

    // 4. Pulsar 'Cancelar' y volver a abrir 'Nueva frase'.
    await botonCancelar.click();
    await expect(dialogo).toBeHidden();
    await botonNueva.click();
    await expect(campoFrase).toHaveValue('');
    await expect(campoFuente).toHaveValue('');
    await expect(campoEtiquetas).toHaveValue('');
    await expect(combobox).toHaveText('Selecciona o crea un personaje');
    await expect(alerta).toHaveCount(0);

    // 5. Cerrar el diálogo y consultar por API `GET /quotes`.
    await botonCancelar.click();
    await expect(dialogo).toBeHidden();
    const respuesta = await request.get(`${API}/quotes`);
    expect(respuesta.status()).toBe(200);
    const frases: Frase[] = await respuesta.json();
    expect(frases.filter((f) => f.quote.includes(marca) || f.source.includes(marca))).toEqual([]);

    // 6. Limpieza en afterEach: eliminar cualquier frase con la marca que haya llegado a crearse.
  });
});
