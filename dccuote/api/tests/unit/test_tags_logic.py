"""Tests unitarios de src/scripts/tags.py."""
import hashlib

import pytest

from src.models.models import Tag
from src.scripts import tags
from tests.unit.helpers import db, executed, reset_db, result  # noqa: F401


def test_tag_add_guarda_la_etiqueta_con_id_sha256_y_hace_commit(db):
    expected_id = hashlib.sha256("humor".encode()).hexdigest()

    assert tags.tag_add(db, "humor") == expected_id

    added = db.session.add.call_args.args[0]
    assert isinstance(added, Tag)
    assert (added.id, added.name) == (expected_id, "humor")
    db.session.commit.assert_called_once_with()


@pytest.mark.parametrize("function, column", [
    (tags.tag_name_exists, "tags.name"),
    (tags.tag_id_exists, "tags.id"),
])
@pytest.mark.parametrize("found, expected", [(Tag(id="1", name="a"), True), (None, False)])
def test_existencia_de_etiqueta_filtra_por_la_columna_correcta(
    db, function, column, found, expected
):
    db.session.execute.return_value = result(first=found)

    assert function(db, "valor") is expected

    sql, params = executed(db)
    assert f"WHERE {column} = " in sql
    assert list(params.values()) == ["valor"]


def test_tag_delete_borra_solo_el_id_indicado(db):
    tags.tag_delete(db, "t-1")

    sql, params = executed(db)
    assert sql.startswith("DELETE FROM tags WHERE tags.id = ")
    assert list(params.values()) == ["t-1"]
    db.session.commit.assert_called_once_with()


@pytest.mark.parametrize("rows, expected", [
    ([], []),
    ([Tag(id="1", name="a"), Tag(id="2", name="b")],
     [{"id": "1", "name": "a"}, {"id": "2", "name": "b"}]),
])
def test_tags_get_convierte_las_filas_en_diccionarios(db, rows, expected):
    db.session.execute.return_value = result(all=rows)

    assert tags.tags_get(db) == expected


@pytest.mark.parametrize("found", ["t-1", None])
def test_tag_id_get_by_name_devuelve_el_id_o_none(db, found):
    db.session.execute.return_value = result(first=found)

    assert tags.tag_id_get_by_name(db, "humor") == found

    sql, params = executed(db)
    assert sql.startswith("SELECT tags.id")
    assert list(params.values()) == ["humor"]
