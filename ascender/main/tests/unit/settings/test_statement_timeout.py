from ascender.settings.statement_timeout import DEFAULT_WEB_TIMEOUT_MS, set_statement_timeout

PG_ENGINE = "django.db.backends.postgresql"


def _make_databases(engine=PG_ENGINE, existing_options=None):
    databases = {"default": {"ENGINE": engine}}
    if existing_options:
        databases["default"]["OPTIONS"] = {"options": existing_options}
    return databases


def _options(databases):
    return databases["default"].get("OPTIONS", {}).get("options")


class TestSetStatementTimeout:
    def test_no_op_without_the_marker_or_the_setting(self):
        databases = _make_databases()
        set_statement_timeout(databases)
        assert _options(databases) is None

    def test_falls_back_to_setting(self):
        databases = _make_databases()
        set_statement_timeout(databases, 60000)
        assert _options(databases) == "-c statement_timeout=60000"

    def test_skips_empty_databases(self):
        databases = {}
        set_statement_timeout(databases, 60000)
        assert databases == {}

    def test_appends_to_existing_options(self):
        databases = _make_databases(existing_options="-c lock_timeout=5000")
        set_statement_timeout(databases, 60000)
        assert _options(databases) == "-c lock_timeout=5000 -c statement_timeout=60000"

    def test_preserves_other_options_keys(self):
        databases = _make_databases()
        databases["default"]["OPTIONS"] = {"sslmode": "require"}
        set_statement_timeout(databases, 60000)
        assert databases["default"]["OPTIONS"]["sslmode"] == "require"
        assert _options(databases) == "-c statement_timeout=60000"


class TestWebProcess:
    """A process that announces itself with AWX_WEB_PROCESS gets the cap."""

    def test_web_process_gets_the_default(self, monkeypatch):
        monkeypatch.setenv('AWX_WEB_PROCESS', '1')
        databases = {'default': {}}

        set_statement_timeout(databases)

        assert databases['default']['OPTIONS']['options'] == f'-c statement_timeout={DEFAULT_WEB_TIMEOUT_MS}'

    def test_web_process_prefers_the_setting(self, monkeypatch):
        monkeypatch.setenv('AWX_WEB_PROCESS', '1')
        databases = {'default': {}}

        set_statement_timeout(databases, DATABASE_STATEMENT_TIMEOUT=30000)

        assert databases['default']['OPTIONS']['options'] == '-c statement_timeout=30000'

    def test_a_task_process_is_left_alone(self, monkeypatch):
        monkeypatch.delenv('AWX_WEB_PROCESS', raising=False)
        databases = {'default': {}}

        set_statement_timeout(databases)

        assert 'OPTIONS' not in databases['default']
