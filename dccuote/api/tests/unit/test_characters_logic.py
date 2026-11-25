"""Tests unitarios de src/scripts/characters.py."""
import pytest

from src.models.models import Character, Quote
from src.scripts import characters
from tests.unit.helpers import db, executed, reset_db, result  # noqa: F401


@pytest.mark.parametrize("rows, expected", [
    ([], []),
    ([Character(id="1", name="Aang")], [{"id": "1", "name": "Aang"}]),
])
def test_characters_get(db, rows, expected):
    db.session.execute.return_value = result(all=rows)

    assert characters.characters_get(db) == expected


@pytest.mark.parametrize("found, expected", [(Character(id="1"), True), (None, False)])
def test_character_id_exists(db, found, expected):
    db.session.get.return_value = found

    assert characters.character_id_exists(db, "1") is expected
    db.session.get.assert_called_once_with(Character, "1")


@pytest.mark.parametrize("found, expected", [(Quote(id="q"), True), (None, False)])
def test_character_has_quotes_busca_frases_de_ese_personaje(db, found, expected):
    db.session.execute.return_value = result(first=found)

    assert characters.character_has_quotes(db, "c-1") is expected

    sql, params = executed(db)
    assert "WHERE quotes.character_id = " in sql
    assert list(params.values()) == ["c-1"]


def test_character_delete_borra_un_personaje_existente(db):
    character = Character(id="1", name="Aang")
    db.session.get.return_value = character

    characters.character_delete(db, "1")

    db.session.delete.assert_called_once_with(character)
    db.session.commit.assert_called_once_with()


def test_character_delete_no_hace_nada_si_no_existe(db):
    db.session.get.return_value = None

    characters.character_delete(db, "inexistente")

    db.session.delete.assert_not_called()
    db.session.commit.assert_not_called()
