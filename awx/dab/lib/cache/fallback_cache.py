import logging
import multiprocessing
import random
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from django.core import cache as django_cache
from django.core.cache.backends.base import BaseCache

from awx.dab.lib.utils.settings import get_setting

logger = logging.getLogger('awx.dab.cache.fallback_cache')

DEFAULT_TIMEOUT = None
PRIMARY_CACHE = 'primary'
FALLBACK_CACHE = 'fallback'


class DABCacheWithFallback(BaseCache):
    _instance = None
    _primary_cache = None
    _fallback_cache = None

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super(DABCacheWithFallback, cls).__new__(cls)
            cls.__initialized = False
        return cls._instance

    def __init__(self, location, params):
        if self.__initialized:
            return
        BaseCache.__init__(self, params)

        self._primary_cache = django_cache.caches.create_connection(PRIMARY_CACHE)
        self._fallback_cache = django_cache.caches.create_connection(FALLBACK_CACHE)
        self._temp_path = get_setting('ANSIBLE_BASE_FALLBACK_CACHE_FILE_PATH', tempfile.gettempdir())
        self._temp_file = Path().joinpath(self._temp_path, 'gw_primary_cache_failed')
        self.thread_pool = ThreadPoolExecutor()

        if self._temp_file.exists():
            self._temp_file.unlink()

        self.__initialized = True

    def get_active_cache(self):
        return FALLBACK_CACHE if self._temp_file.exists() else PRIMARY_CACHE

    # Main cache interface
    def add(self, key, value, timeout=DEFAULT_TIMEOUT, version=None):
        return self._op_with_fallback("add", key, value, timeout=timeout, version=version)

    def get(self, key, default=None, version=None):
        return self._op_with_fallback("get", key, default=default, version=version)

    def set(self, key, value, timeout=DEFAULT_TIMEOUT, version=None, client=None):
        return self._op_with_fallback("set", key, value, timeout=timeout)

    def delete(self, key, version=None):
        return self._op_with_fallback("delete", key, version=version)

    def clear(self):
        return self._op_with_fallback("clear")

    def _op_with_fallback(self, operation, *args, **kwargs):
        if self._temp_file.exists():
            response = getattr(self._fallback_cache, operation)(*args, **kwargs)
            self.start_recovery()
        else:
            try:
                response = getattr(self._primary_cache, operation)(*args, **kwargs)
                return response
            except Exception as e:
                logger.error(f"Failed to perform '{operation}' on primary cache: {e}")
                with multiprocessing.Lock():
                    # Attempt to ensure one thread/process goes first
                    # dynamic settings especially are read in a batch very quickly
                    time.sleep(random.uniform(10, 100) / 100.0)
                    if not self._temp_file.exists():
                        logger.error("Primary cache unavailable, switching to fallback cache.")
                    self.create_temp_file()
                    # _temp_file.touch()
                response = getattr(self._fallback_cache, operation)(*args, **kwargs)

        return response

    def start_recovery(self):
        with multiprocessing.Lock():
            # Set single process/thread to do the recovery, but time out in case it dies
            recoverer = self._fallback_cache.get_or_set('RECOVERY_THREAD_ID', id(self), timeout=60)
            if recoverer == id(self):
                rip = self._fallback_cache.get('RECOVERY_IN_PROGRESS', False)
                if not rip:
                    self._fallback_cache.set('RECOVERY_IN_PROGRESS', True, timeout=60)
                    self.thread_pool.submit(self.check_primary_cache)

    def check_primary_cache(self):
        try:
            self._primary_cache.get('up_test')
            with multiprocessing.Lock():
                if self._temp_file.exists():
                    logger.warning("Primary cache recovered, clearing and resuming use.")
                    # Clear the primary cache
                    self._primary_cache.clear()
                    # Clear the backup cache just incase we need to fall back again (don't want it out of sync)
                    self._fallback_cache.clear()
                    self._temp_file.unlink()
        except Exception:
            pass
        finally:
            self._fallback_cache.delete('RECOVERY_IN_PROGRESS')

    def create_temp_file(self):
        self._temp_file.touch()
        self._temp_file.chmod(mode=0o660)
