"""
Tests unitarios de los controladores de src/app.py.

La lógica de src/scripts se reemplaza por mocks: cada test comprueba qué código
HTTP y qué cuerpo arma el controlador, y qué funciones llama (o evita llamar).
"""
import runpy
from unittest.mock import MagicMock, call

import flask
import pytest

import src.app as app_module
from tests.unit.helpers import reset_db  # noqa: F401


@pytest.fixture()
def fake(monkeypatch):
    """Reemplaza una función de lógica usada por app.py y devuelve su mock."""
    def _fake(name, **kwargs):
        mock = MagicMock(**kwargs)
        monkeypatch.setattr(app_module, name, mock)
        return mock
    return _fake


DB = app_module.db
QUOTE = {"id": "q-1", "quote": "Texto"}


# ----- Lecturas -----

@pytest.mark.parametrize("url, function, value", [
    ("/quotes/daily", "quote_daily", QUOTE),
    ("/quotes/daily", "quote_daily", {}),
    ("/tags", "tags_get", [{"id": "1", "name": "a"}]),
    ("/tags", "tags_get", []),
    ("/characters", "characters_get", [{"id": "1", "name": "Aang"}]),
    ("/characters", "characters_get", []),
])
def test_lecturas_devuelven_lo_que_entrega_la_logica(client, fake, url, function, value):
    logic = fake(function, return_value=value)

    resp = client.get(url)

    assert resp.status_code == 200
    assert resp.get_json() == value
    logic.assert_called_once_with(DB)


@pytest.mark.parametrize("query, character, tags", [
    ("", None, []),
    ("?character=Aang", "Aang", []),
    ("?tag=a&tag=b", None, ["a", "b"]),
    ("?character=Aang&tag=a", "Aang", ["a"]),
])
def test_get_quotes_traduce_los_parametros_a_filtros(client, fake, query, character, tags):
    quotes_get = fake("quotes_get", return_value=[QUOTE])

    resp = client.get(f"/quotes{query}")

    assert resp.status_code == 200
    assert resp.get_json() == [QUOTE]
    quotes_get.assert_called_once_with(DB, character, tags)


@pytest.mark.parametrize("found, status, body", [
    (QUOTE, 200, QUOTE),
    (None, 404, {"error": "Cita no encontrada"}),
])
def test_get_quote(client, fake, found, status, body):
    by_id = fake("quote_get_by_id", return_value=found)

    resp = client.get("/quotes/q-1")

    assert (resp.status_code, resp.get_json()) == (status, body)
    by_id.assert_called_once_with(DB, "q-1")


# ----- Crear frase -----

@pytest.mark.parametrize("valid, exists, status, body", [
    ({"is_valid": False, "error": "mal"}, False, 400, {"error": "mal"}),
    ({"is_valid": True}, True, 409, {"error": "La cita ya existe"}),
    ({"is_valid": True}, False, 201, QUOTE),
], ids=["invalida", "duplicada", "creada"])
def test_add_quote(client, fake, valid, exists, status, body):
    payload = {"quote": "Texto"}
    validate = fake("quote_validate", return_value=valid)
    quote_exists = fake("quote_exists", return_value=exists)
    quote_add = fake("quote_add", return_value=QUOTE)

    resp = client.post("/quotes/add", json=payload)

    assert (resp.status_code, resp.get_json()) == (status, body)
    validate.assert_called_once_with(payload)
    assert quote_exists.call_count == (1 if valid["is_valid"] else 0)
    assert quote_add.call_args_list == ([call(DB, payload)] if status == 201 else [])


# ----- Eliminar -----

@pytest.mark.parametrize("url, exists_fn, delete_fn, message, not_found", [
    ("/quotes/delete/x", "quote_id_exists", "quote_delete",
     "Cita eliminada con éxito", "Cita no encontrada"),
    ("/tags/delete/x", "tag_id_exists", "tag_delete",
     "Etiqueta eliminada con éxito", "Etiqueta no encontrada"),
], ids=["frase", "etiqueta"])
@pytest.mark.parametrize("exists", [True, False], ids=["existe", "no_existe"])
def test_eliminar_frase_o_etiqueta(
    client, fake, url, exists_fn, delete_fn, message, not_found, exists
):
    fake(exists_fn, return_value=exists)
    delete = fake(delete_fn)

    resp = client.delete(url)

    if exists:
        assert (resp.status_code, resp.get_json()) == (200, {"message": message})
        delete.assert_called_once_with(DB, "x")
    else:
        assert (resp.status_code, resp.get_json()) == (404, {"error": not_found})
        delete.assert_not_called()


@pytest.mark.parametrize("exists, has_quotes, status, body", [
    (False, False, 404, {"error": "Personaje no encontrado"}),
    (True, True, 400, {"error": "No se puede eliminar un personaje con citas asociadas"}),
    (True, False, 200, {"message": "Personaje eliminado con éxito"}),
], ids=["no_existe", "con_frases", "eliminado"])
def test_delete_character(client, fake, exists, has_quotes, status, body):
    fake("character_id_exists", return_value=exists)
    fake("character_has_quotes", return_value=has_quotes)
    delete = fake("character_delete")

    resp = client.delete("/characters/delete/c-1")

    assert (resp.status_code, resp.get_json()) == (status, body)
    assert delete.call_args_list == ([call(DB, "c-1")] if status == 200 else [])


# ----- Etiquetar frase -----

def test_add_tag_a_frase_inexistente(client, fake):
    fake("quote_id_exists", return_value=False)
    link = fake("quote_tag_add")

    resp = client.post("/quotes/nada/tags", json={"tags": ["a"]})

    assert (resp.status_code, resp.get_json()) == (404, {"error": "Cita no encontrada"})
    link.assert_not_called()


@pytest.mark.parametrize("payload, error", [
    ({}, "No se proporcionó ninguna etiqueta"),
    ({"tags": []}, "No se proporcionó ninguna etiqueta"),
    ({"tags": ""}, "No se proporcionó ninguna etiqueta"),
    ({"tags": "a"}, "El formato de las etiquetas es inválido"),
    ({"tags": {"a": 1}}, "El formato de las etiquetas es inválido"),
    ({"tags": [1]}, "El formato de las etiquetas es inválido"),
    ({"tags": ["a", None]}, "El formato de las etiquetas es inválido"),
])
def test_add_tag_rechaza_formatos_invalidos(client, fake, payload, error):
    fake("quote_id_exists", return_value=True)
    tag_add = fake("tag_add")
    link = fake("quote_tag_add")

    resp = client.post("/quotes/q-1/tags", json=payload)

    assert (resp.status_code, resp.get_json()) == (400, {"error": error})
    tag_add.assert_not_called()
    link.assert_not_called()


def test_add_tag_crea_las_nuevas_y_reutiliza_las_existentes(client, fake):
    fake("quote_id_exists", return_value=True)
    fake("tag_name_exists", side_effect=lambda _db, name: name == "vieja")
    tag_add = fake("tag_add", return_value="id-nueva")
    get_id = fake("tag_id_get_by_name", return_value="id-vieja")
    link = fake("quote_tag_add")

    resp = client.post("/quotes/q-1/tags", json={"tags": ["nueva", "vieja"]})

    assert resp.status_code == 201
    assert resp.get_json() == [
        {"id": "id-nueva", "name": "nueva"},
        {"id": "id-vieja", "name": "vieja"},
    ]
    tag_add.assert_called_once_with(DB, "nueva")
    get_id.assert_called_once_with(DB, "vieja")
    assert link.call_args_list == [call(DB, "q-1", "id-nueva"), call(DB, "q-1", "id-vieja")]


# ----- Punto de entrada -----

def test_ejecutar_app_py_como_script_inicia_el_servidor_en_modo_debug(monkeypatch):
    """Ejecuta el bloque `__main__` con `Flask.run` simulado: no se abre ningún puerto."""
    run = MagicMock()
    monkeypatch.setattr(flask.Flask, "run", run)

    runpy.run_path(app_module.__file__, run_name="__main__")

    run.assert_called_once_with(debug=True)
