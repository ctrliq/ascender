import types
from unittest import mock

from awx.settings.statement_timeout import set_statement_timeout

PG_ENGINE = "django.db.backends.postgresql"
SQLITE_ENGINE = "django.db.backends.sqlite3"


def _make_databases(engine=PG_ENGINE, existing_options=None):
    databases = {"default": {"ENGINE": engine}}
    if existing_options:
        databases["default"]["OPTIONS"] = {"options": existing_options}
    return databases


def _options(databases):
    return databases["default"].get("OPTIONS", {}).get("options")


def _fake_uwsgi(harakiri):
    # Real uwsgi builds expose opt with str keys and bytes values
    mod = types.ModuleType('uwsgi')
    mod.opt = {'harakiri': str(harakiri).encode()}
    return mod


def _fake_uwsgi_bytes_keys(harakiri):
    # Some uwsgi versions/builds use bytes keys instead
    mod = types.ModuleType('uwsgi')
    mod.opt = {b'harakiri': str(harakiri).encode()}
    return mod


class TestSetStatementTimeout:
    def test_derives_from_uwsgi_harakiri(self):
        databases = _make_databases()
        with mock.patch.dict('sys.modules', {'uwsgi': _fake_uwsgi(115)}):
            set_statement_timeout(databases)
        assert _options(databases) == "-c statement_timeout=110000"

    def test_derives_from_uwsgi_harakiri_bytes_keys(self):
        databases = _make_databases()
        with mock.patch.dict('sys.modules', {'uwsgi': _fake_uwsgi_bytes_keys(115)}):
            set_statement_timeout(databases)
        assert _options(databases) == "-c statement_timeout=110000"

    def test_no_op_without_uwsgi_or_setting(self):
        databases = _make_databases()
        with mock.patch.dict('sys.modules', {'uwsgi': None}):
            set_statement_timeout(databases)
        assert _options(databases) is None

    def test_falls_back_to_setting(self):
        databases = _make_databases()
        with mock.patch.dict('sys.modules', {'uwsgi': None}):
            set_statement_timeout(databases, 60000)
        assert _options(databases) == "-c statement_timeout=60000"

    def test_uwsgi_takes_precedence_over_setting(self):
        databases = _make_databases()
        with mock.patch.dict('sys.modules', {'uwsgi': _fake_uwsgi(115)}):
            set_statement_timeout(databases, 60000)
        assert _options(databases) == "-c statement_timeout=110000"

    def test_harakiri_zero_falls_back_to_setting(self):
        databases = _make_databases()
        with mock.patch.dict('sys.modules', {'uwsgi': _fake_uwsgi(0)}):
            set_statement_timeout(databases, 90000)
        assert _options(databases) == "-c statement_timeout=90000"

    def test_harakiri_very_low_clamps_to_one_second(self):
        databases = _make_databases()
        with mock.patch.dict('sys.modules', {'uwsgi': _fake_uwsgi(1)}):
            set_statement_timeout(databases)
        assert _options(databases) == "-c statement_timeout=1000"

    def test_harakiri_midrange_uses_proportional_margin(self):
        databases = _make_databases()
        with mock.patch.dict('sys.modules', {'uwsgi': _fake_uwsgi(30)}):
            # margin = min(5, max(1, int(30*0.1))) = 3 → timeout = 27s
            set_statement_timeout(databases)
        assert _options(databases) == "-c statement_timeout=27000"

    def test_skips_sqlite(self):
        databases = _make_databases(engine=SQLITE_ENGINE)
        set_statement_timeout(databases, 60000)
        assert _options(databases) is None

    def test_skips_empty_databases(self):
        databases = {}
        set_statement_timeout(databases, 60000)
        assert databases == {}

    def test_appends_to_existing_options(self):
        databases = _make_databases(existing_options="-c lock_timeout=5000")
        with mock.patch.dict('sys.modules', {'uwsgi': None}):
            set_statement_timeout(databases, 60000)
        assert _options(databases) == "-c lock_timeout=5000 -c statement_timeout=60000"

    def test_preserves_other_options_keys(self):
        databases = _make_databases()
        databases["default"]["OPTIONS"] = {"sslmode": "require"}
        with mock.patch.dict('sys.modules', {'uwsgi': None}):
            set_statement_timeout(databases, 60000)
        assert databases["default"]["OPTIONS"]["sslmode"] == "require"
        assert _options(databases) == "-c statement_timeout=60000"
