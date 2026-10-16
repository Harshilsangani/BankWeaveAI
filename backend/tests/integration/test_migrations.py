import tempfile
import unittest
from pathlib import Path

from backend.core import database as database


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.original = database.DB_PATH
        database.DB_PATH = Path(self.temp.name) / "fresh.sqlite3"

    def tearDown(self):
        database.DB_PATH = self.original
        self.temp.cleanup()

    def test_fresh_schema_without_seed_and_repeat_application(self):
        self.assertIn("001_initial", database.initialize())
        self.assertEqual(database.initialize(), [])
        with database.connect() as db:
            self.assertEqual(
                db.execute("SELECT COUNT(*) FROM datasets").fetchone()[0], 0
            )
            db.execute(
                "INSERT INTO workspace_sessions VALUES('persisted-session','{}','local-customer_operator')"
            )
        database.initialize()
        with database.connect() as db:
            self.assertEqual(
                db.execute("SELECT COUNT(*) FROM workspace_sessions").fetchone()[0], 1
            )

    def test_drift_and_failed_upgrade_rollback(self):
        folder = Path(self.temp.name) / "migrations"
        folder.mkdir()
        (folder / "001_initial.sql").write_text(
            "CREATE TABLE sample(id TEXT PRIMARY KEY);\n"
        )
        database.initialize(folder)
        (folder / "002_broken.sql").write_text(
            "CREATE TABLE must_rollback(id TEXT);\nINVALID SQL;\n"
        )
        with self.assertRaises(Exception):
            database.initialize(folder)
        with database.connect() as db:
            self.assertIsNone(
                db.execute(
                    "SELECT name FROM sqlite_master WHERE name='must_rollback'"
                ).fetchone()
            )
            self.assertEqual(
                db.execute("SELECT COUNT(*) FROM schema_migrations").fetchone()[0], 1
            )
        (folder / "001_initial.sql").write_text(
            "CREATE TABLE changed(id TEXT PRIMARY KEY);\n"
        )
        with self.assertRaisesRegex(ValueError, "modified"):
            database.initialize(folder)
