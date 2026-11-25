"""Tests unitarios de src/scripts/quotes.py."""
import hashlib

import pytest

from src.models.models import Character, Quote, QuoteTag, Tag
from src.scripts import quotes
from tests.unit.helpers import db, executed, reset_db, result  # noqa: F401

AANG = Character(id="c-1", name="Aang")


def stored_quote():
    return Quote(id="q-1", quote="Texto", character_id="c-1", source="Serie")


def as_dict(qid, character, tags):
    """Forma en que `quotes_get_all` entrega una frase."""
    return {
        "id": qid,
        "character": {"id": character, "name": character},
        "tags": [{"id": t, "name": t} for t in tags],
    }


def added_objects(db, model):
    return [c.args[0] for c in db.session.add.call_args_list if isinstance(c.args[0], model)]


# ----- Lectura -----

def test_quote_daily_sin_frases_devuelve_diccionario_vacio(db):
    db.session.execute.return_value = result(first=None)

    assert quotes.quote_daily(db) == {}
    db.session.execute.assert_called_once()


def test_quote_daily_toma_la_primera_frase_ordenada_por_id(db):
    db.session.execute.side_effect = [
        result(first=stored_quote()),
        result(first=AANG),
        result(all=[Tag(id="t-1", name="life")]),
    ]

    assert quotes.quote_daily(db) == {
        "id": "q-1",
        "quote": "Texto",
        "character": {"id": "c-1", "name": "Aang"},
        "source": "Serie",
        "tags": [{"id": "t-1", "name": "life"}],
    }
    assert "ORDER BY quotes.id" in executed(db)[0]


@pytest.mark.parametrize("read", [
    quotes.quote_daily,
    lambda db: quotes.quote_get_by_id(db, "q-1"),
    lambda db: quotes.quotes_get_all(db)[0],
], ids=["daily", "by_id", "all"])
@pytest.mark.parametrize("character, expected", [
    (AANG, {"id": "c-1", "name": "Aang"}),
    (None, None),
], ids=["con_personaje", "sin_personaje"])
def test_lecturas_arman_la_frase_con_o_sin_personaje(db, read, character, expected):
    db.session.execute.side_effect = [
        # La primera consulta se lee con .first() o con .all() según la función.
        result(first=stored_quote(), all=[stored_quote()]),
        result(first=character),
        result(all=[]),
    ]

    quote = read(db)

    assert quote == {
        "id": "q-1", "quote": "Texto", "character": expected,
        "source": "Serie", "tags": [],
    }


def test_quote_get_by_id_inexistente_devuelve_none(db):
    db.session.execute.return_value = result(first=None)

    assert quotes.quote_get_by_id(db, "nada") is None
    db.session.execute.assert_called_once()


def test_quote_get_by_id_incluye_las_etiquetas(db):
    db.session.execute.side_effect = [
        result(first=stored_quote()),
        result(first=AANG),
        result(all=[Tag(id="t-1", name="a")]),
    ]

    assert quotes.quote_get_by_id(db, "q-1")["tags"] == [{"id": "t-1", "name": "a"}]
    assert list(executed(db)[1].values()) == ["q-1"]


def test_quotes_get_all_incluye_las_etiquetas_de_cada_frase(db):
    db.session.execute.side_effect = [
        result(all=[stored_quote()]),
        result(first=AANG),
        result(all=[Tag(id="t-1", name="a"), Tag(id="t-2", name="b")]),
    ]

    assert quotes.quotes_get_all(db)[0]["tags"] == [
        {"id": "t-1", "name": "a"}, {"id": "t-2", "name": "b"},
    ]


def test_quotes_get_all_sin_frases(db):
    db.session.execute.return_value = result(all=[])

    assert quotes.quotes_get_all(db) == []


# ----- Filtros -----

CATALOG = [
    as_dict("1", "Albert Einstein", ["science", "life"]),
    as_dict("2", "Isaac Newton", ["science"]),
    as_dict("3", "Uncle Iroh", []),
]


@pytest.mark.parametrize("character, tags, expected", [
    (None, [], ["1", "2", "3"]),
    ("", None, ["1", "2", "3"]),
    ("Newton", [], ["2"]),                      # coincidencia parcial
    ("newton", [], []),                         # distingue mayúsculas
    ("Nadie", [], []),
    (None, ["science"], ["1", "2"]),
    (None, ["science", "life"], ["1"]),         # AND entre etiquetas
    (None, ["inexistente"], []),
    ("Einstein", ["science"], ["1"]),
    ("Uncle", ["science"], []),
])
def test_quotes_get_filtra_por_personaje_y_etiquetas(
    monkeypatch, db, character, tags, expected
):
    monkeypatch.setattr(quotes, "quotes_get_all", lambda _db: list(CATALOG))

    assert [q["id"] for q in quotes.quotes_get(db, character, tags)] == expected


# ----- Validación -----

VALID = {"quote": "Texto", "character": "Aang", "source": "Serie"}


@pytest.mark.parametrize("payload", [
    VALID,
    {**VALID, "tags": []},
    {**VALID, "tags": ["a", "b"]},
    {**VALID, "extra": 1},
])
def test_quote_validate_acepta_frases_validas(payload):
    assert quotes.quote_validate(payload) == {"is_valid": True}


@pytest.mark.parametrize("payload, error", [
    ({}, "Faltan campos obligatorios"),
    ({"character": "a", "source": "b"}, "Faltan campos obligatorios"),
    ({"quote": "a", "source": "b"}, "Faltan campos obligatorios"),
    ({"quote": "a", "character": "b"}, "Faltan campos obligatorios"),
    ({**VALID, "quote": ""}, "El texto de la cita no es válido"),
    ({**VALID, "quote": " \n "}, "El texto de la cita no es válido"),
    ({**VALID, "quote": None}, "El texto de la cita no es válido"),
    ({**VALID, "character": "  "}, "El nombre del personaje no es válido"),
    ({**VALID, "character": None}, "El nombre del personaje no es válido"),
    ({**VALID, "source": ""}, "La fuente no es válida"),
    ({**VALID, "source": 7}, "La fuente no es válida"),
    ({**VALID, "tags": "a,b"}, "Los tags deben ser una lista"),
    ({**VALID, "tags": None}, "Los tags deben ser una lista"),
    ({**VALID, "tags": [""]}, "Los tags deben ser cadenas no vacías"),
    ({**VALID, "tags": ["ok", "  "]}, "Los tags deben ser cadenas no vacías"),
    ({**VALID, "tags": [3]}, "Los tags deben ser cadenas no vacías"),
])
def test_quote_validate_rechaza_frases_invalidas(payload, error):
    assert quotes.quote_validate(payload) == {"is_valid": False, "error": error}


# ----- Creación -----

def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


def test_quote_add_crea_el_personaje_si_no_existe_y_omite_tags_ausentes(db):
    db.session.execute.return_value = result(first=None)

    created = quotes.quote_add(db, dict(VALID))

    assert created == {
        "id": sha("Texto"), "quote": "Texto",
        "character": {"id": sha("Aang"), "name": "Aang"},
        "source": "Serie", "tags": [],
    }
    [character] = added_objects(db, Character)
    assert (character.id, character.name) == (sha("Aang"), "Aang")
    [quote] = added_objects(db, Quote)
    assert (quote.id, quote.character_id, quote.source) == (sha("Texto"), sha("Aang"), "Serie")
    assert added_objects(db, QuoteTag) == []
    db.session.commit.assert_called_once_with()


def test_quote_add_reutiliza_personaje_y_etiqueta_existentes(db):
    db.session.execute.side_effect = [
        result(first=AANG),
        result(first=Tag(id="t-1", name="life")),
        result(first=None),                        # aún no están asociados
    ]

    created = quotes.quote_add(db, {**VALID, "tags": ["life"]})

    assert created["character"] == {"id": "c-1", "name": "Aang"}
    assert created["tags"] == [{"id": "t-1", "name": "life"}]
    assert added_objects(db, Character) == []
    [link] = added_objects(db, QuoteTag)
    assert (link.quote_id, link.tag_id) == (sha("Texto"), "t-1")


def test_quote_add_crea_la_etiqueta_que_no_existe(monkeypatch, db):
    tag_add = []
    monkeypatch.setattr(quotes, "tag_add", lambda _db, name: tag_add.append(name) or "t-new")
    db.session.execute.side_effect = [result(first=AANG), result(first=None), result(first=None)]

    created = quotes.quote_add(db, {**VALID, "tags": ["nueva"]})

    assert tag_add == ["nueva"]
    assert created["tags"] == [{"id": "t-new", "name": "nueva"}]
    assert [link.tag_id for link in added_objects(db, QuoteTag)] == ["t-new"]


def test_quote_add_no_repite_una_asociacion_ya_existente(db):
    db.session.execute.side_effect = [
        result(first=AANG),
        result(first=Tag(id="t-1", name="life")),
        result(first=QuoteTag(quote_id=sha("Texto"), tag_id="t-1")),
    ]

    quotes.quote_add(db, {**VALID, "tags": ["life"]})

    assert added_objects(db, QuoteTag) == []


# ----- Existencia, borrado y asociación de etiquetas -----

@pytest.mark.parametrize("call, column", [
    (lambda db: quotes.quote_exists(db, "valor"), "quotes.quote"),
    (lambda db: quotes.quote_id_exists(db, "valor"), "quotes.id"),
], ids=["por_texto", "por_id"])
@pytest.mark.parametrize("found, expected", [(Quote(id="q"), True), (None, False)])
def test_existencia_de_frase(db, call, column, found, expected):
    db.session.execute.return_value = result(first=found)

    assert call(db) is expected

    sql, params = executed(db)
    assert f"WHERE {column} = " in sql
    assert list(params.values()) == ["valor"]


def test_quote_delete_borra_una_frase_existente(db):
    quote = stored_quote()
    db.session.execute.return_value = result(first=quote)

    quotes.quote_delete(db, "q-1")

    db.session.delete.assert_called_once_with(quote)
    db.session.commit.assert_called_once_with()


def test_quote_delete_no_hace_nada_si_no_existe(db):
    db.session.execute.return_value = result(first=None)

    quotes.quote_delete(db, "nada")

    db.session.delete.assert_not_called()
    db.session.commit.assert_not_called()


@pytest.mark.parametrize("found, expected", [(QuoteTag(), True), (None, False)])
def test_quote_tag_exists_filtra_por_frase_y_etiqueta(db, found, expected):
    db.session.execute.return_value = result(first=found)

    assert quotes.quote_tag_exists(db, "q-1", "t-1") is expected
    assert sorted(executed(db)[1].values()) == ["q-1", "t-1"]


def test_quote_tag_add_asocia_solo_si_no_estaba(monkeypatch, db):
    monkeypatch.setattr(quotes, "quote_tag_exists", lambda *_: False)

    quotes.quote_tag_add(db, "q-1", "t-1")

    [link] = added_objects(db, QuoteTag)
    assert (link.quote_id, link.tag_id) == ("q-1", "t-1")
    db.session.commit.assert_called_once_with()


def test_quote_tag_add_ignora_una_asociacion_repetida(monkeypatch, db):
    monkeypatch.setattr(quotes, "quote_tag_exists", lambda *_: True)

    quotes.quote_tag_add(db, "q-1", "t-1")

    db.session.add.assert_not_called()
    db.session.commit.assert_not_called()
