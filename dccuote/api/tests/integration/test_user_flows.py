"""
Tests de integración: flujos de usuario sobre la API de DCCuote.

Cada test es independiente: la fixture `reset_db` (conftest.py, autouse) deja la
base con los datos del seed antes de cada uno, y los datos que se crean usan un
sufijo único. Además de la respuesta HTTP, se revisa lo que quedó en la base.
"""
import uuid

import pytest
from sqlalchemy import func, select

import src.app as app_module
from src.models.models import Character, Quote, QuoteTag, Tag


# ----- Helpers -----

def unique(text):
    return f"{text} {uuid.uuid4().hex[:8]}"


def count(model, *conditions):
    """Cuenta filas directamente en la base de datos."""
    with app_module.app.app_context():
        stmt = select(func.count()).select_from(model).where(*conditions)
        return app_module.db.session.execute(stmt).scalar_one()


def snapshot():
    """Cantidad de filas por tabla, para detectar cambios no deseados."""
    return {m.__tablename__: count(m) for m in (Quote, Character, Tag, QuoteTag)}


def names(items):
    return sorted(item["name"] for item in items)


def ids(items):
    return {item["id"] for item in items}


@pytest.fixture()
def new_quote():
    """Datos de una frase que no existe en el seed, con personaje y tags nuevos."""
    return {
        "quote": unique("Frase de integración"),
        "character": unique("Personaje"),
        "source": unique("Fuente"),
        "tags": [unique("tag-a"), unique("tag-b")],
    }


# ----- Flujos -----

def test_explorar_desde_frase_diaria_hasta_filtrar_por_personaje_y_etiquetas(client):
    """
    El usuario ve la frase del día, abre su detalle, revisa los personajes y
    filtra las frases por personaje y por etiquetas. Es un flujo de solo lectura.
    """
    before = snapshot()

    daily_resp = client.get("/quotes/daily")
    assert daily_resp.status_code == 200
    daily = daily_resp.get_json()
    # Según el seed, la frase diaria es la de menor id.
    assert daily["id"] == "q0c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3"
    assert daily["character"]["name"] == "Uncle Iroh"

    detail_resp = client.get(f"/quotes/{daily['id']}")
    assert detail_resp.status_code == 200
    detail = detail_resp.get_json()
    assert detail["quote"] == daily["quote"]
    assert detail["source"] == daily["source"]
    assert detail["character"] == daily["character"]
    assert names(detail["tags"]) == ["fantasy", "inspiration", "life", "wisdom"]

    characters_resp = client.get("/characters")
    assert characters_resp.status_code == 200
    assert daily["character"] in characters_resp.get_json()

    by_character = client.get("/quotes", query_string={"character": "Uncle Iroh"})
    assert by_character.status_code == 200
    assert ids(by_character.get_json()) == {daily["id"], "q9b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2"}

    # Varias etiquetas se combinan con AND: cada resultado debe tenerlas todas.
    by_tags = client.get("/quotes", query_string={"tag": ["science", "inspiration"]})
    assert by_tags.status_code == 200
    assert len(by_tags.get_json()) == 3
    for quote in by_tags.get_json():
        assert {"science", "inspiration"} <= set(names(quote["tags"]))

    combined = client.get(
        "/quotes", query_string={"character": "Uncle Iroh", "tag": "science"}
    )
    assert combined.status_code == 200
    assert combined.get_json() == []

    assert snapshot() == before


def test_publicar_frase_con_personaje_y_etiquetas_nuevas_y_encontrarla(client, new_quote):
    """
    El usuario publica una frase con un personaje y etiquetas que no existían, y
    luego la encuentra en el detalle, los catálogos y la búsqueda filtrada.
    """
    before = snapshot()

    add_resp = client.post("/quotes/add", json=new_quote)
    assert add_resp.status_code == 201
    created = add_resp.get_json()
    assert created["quote"] == new_quote["quote"]
    assert created["source"] == new_quote["source"]
    assert created["character"]["name"] == new_quote["character"]
    assert names(created["tags"]) == sorted(new_quote["tags"])

    assert snapshot() == {
        "quotes": before["quotes"] + 1,
        "characters": before["characters"] + 1,
        "tags": before["tags"] + 2,
        "quote_tag": before["quote_tag"] + 2,
    }
    assert count(Quote, Quote.id == created["id"],
                 Quote.character_id == created["character"]["id"]) == 1

    detail_resp = client.get(f"/quotes/{created['id']}")
    assert detail_resp.status_code == 200
    detail = detail_resp.get_json()
    assert detail["quote"] == new_quote["quote"]
    assert detail["character"] == created["character"]
    assert ids(detail["tags"]) == ids(created["tags"])

    characters_resp = client.get("/characters")
    assert characters_resp.status_code == 200
    assert created["character"] in characters_resp.get_json()

    tags_resp = client.get("/tags")
    assert tags_resp.status_code == 200
    for tag in created["tags"]:
        assert tag in tags_resp.get_json()

    search = client.get("/quotes", query_string={
        "character": new_quote["character"], "tag": new_quote["tags"],
    })
    assert search.status_code == 200
    assert [q["id"] for q in search.get_json()] == [created["id"]]


def test_corregir_formulario_invalido_y_no_poder_duplicar_la_frase(client, new_quote):
    """
    El usuario envía datos inválidos, los corrige, publica la frase e intenta
    publicarla otra vez. Solo el envío válido debe modificar la base.
    """
    before = snapshot()

    initial = client.get("/quotes")
    assert initial.status_code == 200
    initial_total = len(initial.get_json())

    without_source = {k: v for k, v in new_quote.items() if k != "source"}
    invalid_cases = [
        (without_source, "Faltan campos obligatorios"),
        ({**new_quote, "quote": "   "}, "El texto de la cita no es válido"),
        ({**new_quote, "character": ""}, "El nombre del personaje no es válido"),
        ({**new_quote, "source": 123}, "La fuente no es válida"),
        ({**new_quote, "tags": "humor"}, "Los tags deben ser una lista"),
        ({**new_quote, "tags": ["ok", " "]}, "Los tags deben ser cadenas no vacías"),
    ]
    for payload, error in invalid_cases:
        resp = client.post("/quotes/add", json=payload)
        assert resp.status_code == 400, payload
        assert resp.get_json() == {"error": error}
    assert snapshot() == before

    add_resp = client.post("/quotes/add", json=new_quote)
    assert add_resp.status_code == 201
    quote_id = add_resp.get_json()["id"]
    after_add = snapshot()

    # Mismo texto con otro personaje y fuente: sigue siendo la misma frase.
    duplicate = client.post("/quotes/add", json={
        **new_quote, "character": unique("Otro"), "source": unique("Otra"),
    })
    assert duplicate.status_code == 409
    assert duplicate.get_json() == {"error": "La cita ya existe"}
    assert snapshot() == after_add

    final = client.get("/quotes")
    assert final.status_code == 200
    assert len(final.get_json()) == initial_total + 1

    detail = client.get(f"/quotes/{quote_id}")
    assert detail.status_code == 200
    assert detail.get_json()["character"]["name"] == new_quote["character"]
    assert detail.get_json()["source"] == new_quote["source"]


def test_etiquetar_una_frase_buscar_por_la_etiqueta_y_eliminarla(client, new_quote):
    """
    El usuario agrega etiquetas (una nueva y una existente) a su frase, busca por
    ellas y elimina la nueva. La frase se conserva sin esa etiqueta.
    """
    new_quote["tags"] = []
    add_resp = client.post("/quotes/add", json=new_quote)
    assert add_resp.status_code == 201
    quote_id = add_resp.get_json()["id"]
    tags_before = count(Tag)

    # Envíos inválidos: no deben asociar nada.
    for payload, error in [
        ({"tags": []}, "No se proporcionó ninguna etiqueta"),
        ({"tags": "humor"}, "El formato de las etiquetas es inválido"),
        ({"tags": [1]}, "El formato de las etiquetas es inválido"),
    ]:
        resp = client.post(f"/quotes/{quote_id}/tags", json=payload)
        assert resp.status_code == 400, payload
        assert resp.get_json() == {"error": error}
    assert count(QuoteTag, QuoteTag.quote_id == quote_id) == 0

    tag_name = unique("etiqueta")
    tag_resp = client.post(f"/quotes/{quote_id}/tags", json={"tags": [tag_name, "wisdom"]})
    assert tag_resp.status_code == 201
    added = tag_resp.get_json()
    assert [t["name"] for t in added] == [tag_name, "wisdom"]
    new_tag_id = added[0]["id"]
    # Solo se crea la etiqueta nueva; "wisdom" se reutiliza.
    assert count(Tag) == tags_before + 1
    assert count(QuoteTag, QuoteTag.quote_id == quote_id) == 2

    # Repetir la operación no duplica la asociación en la base.
    again = client.post(f"/quotes/{quote_id}/tags", json={"tags": [tag_name]})
    assert again.status_code == 201
    assert count(Tag) == tags_before + 1
    assert count(QuoteTag, QuoteTag.quote_id == quote_id) == 2

    search = client.get("/quotes", query_string={"tag": tag_name})
    assert search.status_code == 200
    assert [q["id"] for q in search.get_json()] == [quote_id]

    delete_resp = client.delete(f"/tags/delete/{new_tag_id}")
    assert delete_resp.status_code == 200
    assert delete_resp.get_json() == {"message": "Etiqueta eliminada con éxito"}
    assert count(Tag, Tag.id == new_tag_id) == 0
    assert count(QuoteTag, QuoteTag.tag_id == new_tag_id) == 0

    tags_resp = client.get("/tags")
    assert tags_resp.status_code == 200
    assert new_tag_id not in ids(tags_resp.get_json())
    assert "wisdom" in names(tags_resp.get_json())

    detail = client.get(f"/quotes/{quote_id}")
    assert detail.status_code == 200
    assert names(detail.get_json()["tags"]) == ["wisdom"]

    repeated = client.delete(f"/tags/delete/{new_tag_id}")
    assert repeated.status_code == 404
    assert repeated.get_json() == {"error": "Etiqueta no encontrada"}


def test_eliminar_la_frase_antes_de_poder_eliminar_su_personaje(client, new_quote):
    """
    El usuario intenta borrar un personaje con frases (rechazado), borra la frase,
    luego el personaje, y comprueba que ambos dejaron de existir.
    """
    before = snapshot()

    add_resp = client.post("/quotes/add", json=new_quote)
    assert add_resp.status_code == 201
    quote_id = add_resp.get_json()["id"]
    character_id = add_resp.get_json()["character"]["id"]

    blocked = client.delete(f"/characters/delete/{character_id}")
    assert blocked.status_code == 400
    assert blocked.get_json() == {
        "error": "No se puede eliminar un personaje con citas asociadas"
    }
    assert count(Character, Character.id == character_id) == 1
    assert count(Quote, Quote.id == quote_id) == 1

    delete_quote = client.delete(f"/quotes/delete/{quote_id}")
    assert delete_quote.status_code == 200
    assert delete_quote.get_json() == {"message": "Cita eliminada con éxito"}
    assert count(Quote, Quote.id == quote_id) == 0
    assert count(QuoteTag, QuoteTag.quote_id == quote_id) == 0

    # La frase eliminada ya no se puede ver, etiquetar ni borrar.
    for resp in (
        client.get(f"/quotes/{quote_id}"),
        client.post(f"/quotes/{quote_id}/tags", json={"tags": ["life"]}),
        client.delete(f"/quotes/delete/{quote_id}"),
    ):
        assert resp.status_code == 404
        assert resp.get_json() == {"error": "Cita no encontrada"}

    delete_character = client.delete(f"/characters/delete/{character_id}")
    assert delete_character.status_code == 200
    assert delete_character.get_json() == {"message": "Personaje eliminado con éxito"}
    assert count(Character, Character.id == character_id) == 0

    characters_resp = client.get("/characters")
    assert characters_resp.status_code == 200
    assert character_id not in ids(characters_resp.get_json())

    repeated = client.delete(f"/characters/delete/{character_id}")
    assert repeated.status_code == 404
    assert repeated.get_json() == {"error": "Personaje no encontrado"}

    # Las etiquetas sobreviven a la frase; el resto vuelve al estado inicial.
    assert snapshot() == {**before, "tags": before["tags"] + 2}
