"""
Utilidades para los tests unitarios: la base de datos se reemplaza por mocks.
"""
from unittest.mock import MagicMock

import pytest


@pytest.fixture()
def reset_db():
    """
    Anula la fixture autouse `reset_db` de tests/conftest.py en los módulos que la
    importan: estos tests no tocan la base de datos, así que no hay nada que reiniciar.
    """


@pytest.fixture()
def db():
    """Doble de Flask-SQLAlchemy: solo registra lo que se le pide a la sesión."""
    return MagicMock()


def result(first=None, all=()):
    """Simula el valor de retorno de `db.session.execute(...)`."""
    mock = MagicMock()
    mock.scalars.return_value.first.return_value = first
    mock.scalars.return_value.all.return_value = list(all)
    return mock


def executed(db, index=0):
    """Sentencia SQL número `index` enviada a la sesión, con sus parámetros."""
    statement = db.session.execute.call_args_list[index].args[0]
    compiled = statement.compile()
    return str(compiled), compiled.params
