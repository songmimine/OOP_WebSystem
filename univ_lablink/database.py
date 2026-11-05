"""MySQL connection helpers for University LabLink."""

from datetime import date, datetime, time

import mysql.connector

from config import MYSQL_CONFIG


def _mysql_placeholders(statement):
    """Translate the existing parameterized query markers to Connector/Python syntax."""
    return statement.replace("?", "%s")


def _normalize(value):
    if isinstance(value, (datetime, date, time)):
        return value.isoformat(sep=" ") if isinstance(value, datetime) else value.isoformat()
    return value


class ResultCursor:
    def __init__(self, cursor):
        self._cursor = cursor

    def fetchone(self):
        row = self._cursor.fetchone()
        return {key: _normalize(value) for key, value in row.items()} if row else None

    def fetchall(self):
        return [
            {key: _normalize(value) for key, value in row.items()}
            for row in self._cursor.fetchall()
        ]

    @property
    def rowcount(self):
        return self._cursor.rowcount


class MySQLConnection:
    """Small cursor/transaction wrapper used by the existing route handlers."""

    def __init__(self, connection):
        self._connection = connection
        self._cursors = []

    def execute(self, statement, params=None):
        cursor = self._connection.cursor(dictionary=True, buffered=True)
        cursor.execute(_mysql_placeholders(statement), params or ())
        self._cursors.append(cursor)
        return ResultCursor(cursor)

    def executemany(self, statement, params):
        cursor = self._connection.cursor()
        cursor.executemany(_mysql_placeholders(statement), params)
        self._cursors.append(cursor)
        return ResultCursor(cursor)

    def commit(self):
        self._connection.commit()

    def rollback(self):
        self._connection.rollback()

    def __enter__(self):
        self._connection.commit()
        self._connection.start_transaction()
        return self

    def __exit__(self, error_type, error, _traceback):
        if error_type is None:
            self.commit()
        else:
            self.rollback()
        return False

    def close(self):
        for cursor in self._cursors:
            cursor.close()
        self._cursors.clear()
        self._connection.close()


def connect(config=None):
    """Open a direct mysql-connector connection using environment-backed settings."""
    settings = dict(config or MYSQL_CONFIG)
    if not settings.get("database"):
        raise RuntimeError("MYSQL_DATABASE must name the LabLink MySQL database.")
    return MySQLConnection(mysql.connector.connect(**settings))


def initialize(config=None):
    """Check that the configured MySQL database is reachable."""
    connection = connect(config)
    connection.close()
